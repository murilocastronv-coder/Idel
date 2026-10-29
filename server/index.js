'use strict';
// MU Idle Legends — servidor HTTP + WebSocket (Node.js, sem framework)

// Carrega .env local (em produção a Render injeta as variáveis)
try {
  require('fs').readFileSync(require('path').join(__dirname, '..', '.env'), 'utf8').split('\n').forEach((l) => {
    const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
  });
} catch (_) { /* sem .env */ }

const http = require('http');
const fs = require('fs');
const path = require('path');
const db = require('./db');
const sec = require('./security');
const mail = require('./mail');
const VIP = require('./vip');
const ADMIN = require('./admin');
const game = require('./gamedata');
const { WSServer } = require('./ws');
const { World } = require('./world');
const CHAOS = require('./chaos');
const DROPS = require('./drops');
const CMDS = require('./commands');
const KUNDUN = require('./kundun');
const EQUIP = require('./equip');
const VAULT = require('./vault');
const CLS = require('./classes');

const PORT = Number(process.env.PORT || 3000);
const IS_PROD = process.env.NODE_ENV === 'production' || !!process.env.RENDER;
const BEHIND_PROXY = !!process.env.RENDER || process.env.TRUST_PROXY === '1';
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const COOKIE = 'mui_sid';
const SESSION_SHORT_MS = 24 * 3600 * 1000;      // sem "lembrar-me"
const SESSION_LONG_MS = 30 * 24 * 3600 * 1000;  // com "lembrar-me"
const RESET_TTL_MS = 60 * 60 * 1000;

// ---------------- utilidades HTTP ----------------
function clientIp(req) {
  if (BEHIND_PROXY && req.headers['x-forwarded-for']) return String(req.headers['x-forwarded-for']).split(',')[0].trim();
  return req.socket.remoteAddress || '';
}
function isHttps(req) {
  return BEHIND_PROXY ? req.headers['x-forwarded-proto'] === 'https' : !!req.socket.encrypted;
}
function parseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach((p) => {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}
function securityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline'",
    "font-src 'self'", "media-src 'self'", "img-src 'self' data:", "connect-src 'self' ws: wss:",
    "frame-ancestors 'none'", "base-uri 'self'", "form-action 'self'",
  ].join('; '));
  if (IS_PROD) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
}
function sendJson(res, status, obj, extraHeaders = {}) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extraHeaders });
  res.end(body);
}
class HttpError extends Error {
  constructor(status, message, extra) { super(message); this.status = status; this.extra = extra; }
}
function readJson(req, limit = 10 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new HttpError(413, 'Requisição muito grande.')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        const v = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        resolve(v && typeof v === 'object' && !Array.isArray(v) ? v : {});
      } catch (_) { reject(new HttpError(400, 'JSON inválido.')); }
    });
    req.on('error', reject);
  });
}
function str(v, max = 200) { return typeof v === 'string' ? v.trim().slice(0, max) : ''; }
function limit(req, name, max, windowMs, key = clientIp(req)) {
  const r = sec.rateLimit(`${name}:${key}`, max, windowMs);
  if (!r.ok) throw new HttpError(429, `Muitas tentativas. Tente de novo em ${r.retryAfter}s.`, { retryAfter: r.retryAfter });
}
function publicUrl(req) {
  const base = process.env.APP_URL || process.env.RENDER_EXTERNAL_URL;
  if (base) return base.replace(/\/$/, '');
  return `${isHttps(req) ? 'https' : 'http'}://${req.headers.host}`;
}
async function audit(accountId, action, req, meta = {}) {
  try {
    await db.query('INSERT INTO audit_log (account_id, action, ip, meta) VALUES ($1,$2,$3,$4)',
      [accountId, action, req ? clientIp(req) : null, JSON.stringify(meta)]);
  } catch (e) { console.error('[audit]', e.message); }
}

// ---------------- sessões ----------------
async function createSession(res, req, accountId, remember) {
  const token = sec.randomToken(32);
  const ttl = remember ? SESSION_LONG_MS : SESSION_SHORT_MS;
  await db.query(`INSERT INTO sessions (token_hash, account_id, expires_at, ip, user_agent)
    VALUES ($1,$2, now() + ($3::int * interval '1 second'), $4, $5)`,
  [sec.sha256(token), accountId, Math.floor(ttl / 1000), clientIp(req), str(req.headers['user-agent'], 300)]);
  const parts = [`${COOKIE}=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Lax'];
  if (remember) parts.push(`Max-Age=${Math.floor(ttl / 1000)}`);
  if (isHttps(req)) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}
function clearCookie(res, req) {
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${isHttps(req) ? '; Secure' : ''}`);
}
async function sessionAccount(req) {
  const token = parseCookies(req)[COOKIE];
  if (!token || token.length > 100) return null;
  const { rows } = await db.query(`SELECT a.id, a.username, a.email, a.created_at, a.last_login_at, a.is_admin, a.vip1_until, a.vip2_until
    FROM sessions s JOIN accounts a ON a.id = s.account_id
    WHERE s.token_hash = $1 AND s.expires_at > now()`, [sec.sha256(token)]);
  return rows[0] || null;
}
async function requireAccount(req) {
  const acc = await sessionAccount(req);
  if (!acc) throw new HttpError(401, 'Faça login para continuar.');
  return acc;
}

// ---------------- estatísticas ao vivo ----------------
let accountsCount = 0, charactersCount = 0;
async function refreshCounts() {
  const { rows } = await db.query('SELECT (SELECT count(*) FROM accounts) AS a, (SELECT count(*) FROM characters) AS c');
  accountsCount = Number(rows[0].a); charactersCount = Number(rows[0].c);
}
let ws; // definido ao iniciar
let world = null;
function liveStats() {
  const players = new Set();
  let visitors = 0;
  if (ws) for (const c of ws.clients) { visitors++; if (c.meta.accountId) players.add(c.meta.accountId); }
  return { online: players.size, inWorld: world ? world.online() : 0, visitors, accounts: accountsCount, characters: charactersCount, serverTime: Date.now() };
}
let statsTimer = null;
function pushStats() {
  if (statsTimer) return;
  statsTimer = setTimeout(() => { statsTimer = null; if (ws) ws.broadcast({ type: 'stats', ...liveStats() }); }, 300);
}

// ---------------- rotas da API ----------------
const routes = [];
function route(method, pattern, handler) {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
  routes.push({ method, re, keys, handler });
}

route('GET', '/api/health', async () => {
  await db.query('SELECT 1');
  return { ok: true };
});

route('GET', '/api/stats', async () => liveStats());
route('GET', '/api/rooms', async () => ({ rooms: world ? world.roomCounts() : [1, 2, 3, 4].map((room) => ({ room, players: 0 })) }));

// ---------------- página /status: crescimento do jogo ----------------
const STARTED_AT = Date.now();
const TZ = process.env.GAME_TZ || 'America/Sao_Paulo';
let peakOnline = 0;
async function sampleStats() {
  const s = liveStats();
  peakOnline = Math.max(peakOnline, s.online);
  const ids = new Set();
  if (ws) for (const c of ws.clients) if (c.meta.accountId) ids.add(Number(c.meta.accountId));
  await db.query('INSERT INTO stats_samples (online, in_world, visitors) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING RETURNING ts', [s.online, s.inWorld, s.visitors]);
  await markActive([...ids]);
  await db.query("DELETE FROM stats_samples WHERE ts < now() - interval '120 days' RETURNING ts");
}
async function markActive(ids) {
  const list = ids.filter((n) => Number.isInteger(n) && n > 0);
  if (!list.length) return;
  await db.query(`INSERT INTO activity_days (day, account_id)
    SELECT (now() AT TIME ZONE $1)::date, a FROM unnest(ARRAY[${list.join(',')}]::int[]) AS a
    ON CONFLICT DO NOTHING RETURNING account_id`, [TZ]);
}

let statusCache = null, statusAt = 0;
async function buildStatus() {
  const q = async (sql, params = [TZ]) => (await db.query(sql, params)).rows;
  const [totals] = await q(`SELECT
      (SELECT count(*) FROM accounts)::int AS accounts,
      (SELECT count(*) FROM characters)::int AS characters,
      (SELECT count(*) FROM accounts WHERE (created_at AT TIME ZONE $1)::date = (now() AT TIME ZONE $1)::date)::int AS accounts_today,
      (SELECT count(*) FROM accounts WHERE created_at > now() - interval '7 days')::int AS accounts_7d,
      (SELECT count(*) FROM accounts WHERE created_at > now() - interval '30 days')::int AS accounts_30d,
      (SELECT count(*) FROM accounts WHERE created_at > now() - interval '14 days' AND created_at <= now() - interval '7 days')::int AS accounts_prev7d,
      (SELECT count(*) FROM activity_days WHERE day = (now() AT TIME ZONE $1)::date)::int AS active_today,
      (SELECT count(DISTINCT account_id) FROM activity_days WHERE day > (now() AT TIME ZONE $1)::date - 7)::int AS active_7d,
      (SELECT count(DISTINCT account_id) FROM activity_days WHERE day > (now() AT TIME ZONE $1)::date - 30)::int AS active_30d,
      (SELECT count(DISTINCT account_id) FROM activity_days WHERE day > (now() AT TIME ZONE $1)::date - 14 AND day <= (now() AT TIME ZONE $1)::date - 7)::int AS active_prev7d,
      (SELECT coalesce(max(online), 0) FROM stats_samples)::int AS peak_online,
      (SELECT coalesce(max(online), 0) FROM stats_samples WHERE ts > now() - interval '24 hours')::int AS peak_24h,
      (SELECT coalesce(max(level), 0) FROM characters)::int AS top_level,
      (SELECT coalesce(sum(kills), 0) FROM characters)::bigint AS monsters_killed,
      (SELECT coalesce(sum(bosses_killed), 0) FROM characters)::int AS bosses_killed,
      (SELECT coalesce(sum(pvp_kills), 0) FROM characters)::int AS pvp_kills,
      (SELECT coalesce(sum(duel_wins), 0) FROM characters)::int AS duels,
      (SELECT min(created_at) FROM accounts) AS first_account`);
  const daily = await q(`WITH days AS (
      SELECT generate_series((now() AT TIME ZONE $1)::date - 29, (now() AT TIME ZONE $1)::date, interval '1 day')::date AS day)
    SELECT to_char(d.day, 'YYYY-MM-DD') AS day,
      (SELECT count(*) FROM accounts a WHERE (a.created_at AT TIME ZONE $1)::date = d.day)::int AS new_accounts,
      (SELECT count(*) FROM characters c WHERE (c.created_at AT TIME ZONE $1)::date = d.day)::int AS new_characters,
      (SELECT count(*) FROM activity_days x WHERE x.day = d.day)::int AS active,
      (SELECT coalesce(max(s.online), 0) FROM stats_samples s WHERE (s.ts AT TIME ZONE $1)::date = d.day)::int AS peak_online,
      (SELECT count(*) FROM accounts a WHERE (a.created_at AT TIME ZONE $1)::date <= d.day)::int AS total_accounts
    FROM days d ORDER BY d.day`);
  const hourly = await q(`SELECT to_char(date_trunc('hour', ts AT TIME ZONE $1), 'YYYY-MM-DD"T"HH24') AS hour,
      max(online)::int AS online, max(in_world)::int AS in_world
    FROM stats_samples WHERE ts > now() - interval '48 hours' GROUP BY 1 ORDER BY 1`);
  const classes = await q('SELECT class, count(*)::int AS n FROM characters GROUP BY class ORDER BY n DESC', []);
  const levels = await q(`SELECT CASE WHEN level < 10 THEN '1–9' WHEN level < 25 THEN '10–24' WHEN level < 50 THEN '25–49'
      WHEN level < 100 THEN '50–99' ELSE '100+' END AS band, min(level)::int AS lo, count(*)::int AS n
    FROM characters GROUP BY 1 ORDER BY lo`, []);
  const maps = [];
  if (world) for (const m of world.maps.values()) if (m.players.size) maps.push({ id: `${m.room}:${m.id}`, name: `${m.def.name} · Sala ${m.room}`, players: m.players.size });
  maps.sort((a, b) => b.players - a.players);
  return {
    live: { ...liveStats(), peakSinceBoot: peakOnline, uptimeSec: Math.round((Date.now() - STARTED_AT) / 1000) },
    totals, daily, hourly, classes, levels, maps, tz: TZ, generatedAt: Date.now(),
  };
}
// só as contas desta lista veem o /status (STATUS_USERS=nome1,nome2 no Render para mudar)
const STATUS_USERS = (process.env.STATUS_USERS || 'murilonv').split(',').map((u) => u.trim().toLowerCase()).filter(Boolean);
const canSeeStatus = (acc) => !!acc && STATUS_USERS.includes(String(acc.username).toLowerCase());
route('GET', '/api/status', async (req) => {
  const acc = await sessionAccount(req);
  if (!acc) throw new HttpError(401, 'Faça login para continuar.');
  if (!canSeeStatus(acc)) throw new HttpError(403, 'Acesso restrito.');
  if (!statusCache || Date.now() - statusAt > 30000) { statusCache = await buildStatus(); statusAt = Date.now(); }
  return { ...statusCache, live: { ...statusCache.live, ...liveStats(), peakSinceBoot: peakOnline, uptimeSec: Math.round((Date.now() - STARTED_AT) / 1000) } };
});

route('GET', '/api/gamedata', async () => ({
  classes: game.CLASSES, maps: game.MAPS, rarities: game.RARITIES, items: game.ITEMS, limits: game.LIMITS,
  world: Object.entries(game.WORLD).map(([id, w]) => ({ id, name: w.name, theme: w.theme, minLevel: w.minLevel, safe: !!w.safe, pvp: !!w.pvp,
    monsters: [...w.groups.map((g) => game.MONSTERS[g.type].name), ...(w.boss ? [game.MONSTERS[w.boss.type].name + ' (boss)'] : [])] })),
  shop: game.SHOP, sets: game.SETS, classRules: CLS.publicRules(),
  vip: { plans: VIP.publicPlans(), days: VIP.DAYS, currency: VIP.CURRENCY, enabled: VIP.enabled() },
}));

// ---------------- VIP (compra) e administração ----------------
route('POST', '/api/vip/checkout', async (req) => {
  const acc = await requireAccount(req);
  limit(req, 'vip-checkout', 10, 60 * 1000);
  const body = await readJson(req);
  const days = Number(body.days);
  let r;
  try { r = await VIP.createCheckout({ account: acc, planId: String(body.plan || ''), days, baseUrl: publicUrl(req), back: body.back }); }
  catch (e) { throw new HttpError(e.status || 500, e.message); }
  await audit(acc.id, 'vip_checkout', req, { plan: body.plan, days });
  return { ok: true, url: r.url };
});

async function requireAdmin(req) {
  const acc = await requireAccount(req);
  if (!ADMIN.isAdmin(acc)) throw new HttpError(403, 'Acesso restrito.');
  return acc;
}
async function adminTarget(name) {
  const c = await world.adminChar(name);
  if (!c) throw new HttpError(404, 'Personagem não encontrado.');
  return c;
}
route('GET', '/api/admin/overview', async (req) => {
  await requireAdmin(req);
  const vips = (await db.query(`SELECT username, vip1_until, vip2_until FROM accounts
    WHERE vip1_until > now() OR vip2_until > now() ORDER BY GREATEST(COALESCE(vip2_until, 'epoch'), COALESCE(vip1_until, 'epoch')) DESC LIMIT 100`)).rows
    .map((r) => ({ username: r.username, ...VIP.status(r) }));
  const pays = (await db.query(`SELECT p.provider, p.plan, p.days, p.amount_cents, p.currency, p.note, p.created_at, a.username
    FROM payments p LEFT JOIN accounts a ON a.id = p.account_id ORDER BY p.id DESC LIMIT 30`)).rows;
  const sum = (await db.query(`SELECT COALESCE(sum(amount_cents), 0)::bigint AS total, count(*)::int AS n FROM payments WHERE provider = 'stripe'`)).rows[0];
  return {
    plans: VIP.publicPlans(), days: VIP.DAYS,
    stripe: { key: !!process.env.STRIPE_SECRET_KEY, webhook: !!process.env.STRIPE_WEBHOOK_SECRET, url: `${publicUrl(req)}/api/stripe-webhook`,
      mode: /^(sk|rk)_test_/.test(process.env.STRIPE_SECRET_KEY || '') ? 'teste' : process.env.STRIPE_SECRET_KEY ? 'real' : 'desligado' },
    vips, payments: pays, revenue: { cents: Number(sum.total), count: sum.n },
    items: Object.entries(game.ITEM_BASES).map(([id, b]) => ({ id, name: b.name, slot: b.slot, kind: b.kind || null, req: b.req })),
    rarities: ['common', 'uncommon', 'rare', 'epic', 'legendary', 'ancestral'], maxLevel: game.LIMITS.maxLevel,
  };
});
route('POST', '/api/admin/char', async (req) => {
  await requireAdmin(req);
  const body = await readJson(req);
  return { ok: true, char: await adminTarget(body.name) };
});
route('POST', '/api/admin/action', async (req) => {
  const acc = await requireAdmin(req);
  limit(req, 'admin', 120, 60 * 1000);
  const body = await readJson(req, 20 * 1024);
  const c = await adminTarget(body.name);
  const a = String(body.action || '');
  let msg;
  try {
    if (a === 'item') {
      const qty = Math.max(1, Math.min(10, Math.round(Number(body.qty) || 1)));
      const list = Array.from({ length: qty }, () => ({ base: String(body.base), rarity: String(body.rarity), plus: body.plus }));
      const got = await world.adminGiveItems(c.id, list);
      msg = `${got.length}× ${got[0].name} enviado(s) para ${c.name}.`;
    } else if (a === 'kit') {
      const got = await world.adminGiveItems(c.id, world.bestKit(c.cls));
      msg = `Melhor equipamento (${got.length} itens ancestrais +15) enviado para ${c.name}.`;
    } else if (a === 'level') {
      const lv = await world.adminSetLevel(c.id, body.level === 'max' ? game.LIMITS.maxLevel : body.level);
      msg = `${c.name} agora está no nível ${lv || body.level}.`;
    } else if (a === 'maxstats') {
      await world.adminMaxStats(c.id);
      msg = `Atributos de ${c.name} no máximo.`;
    } else if (a === 'points' || a === 'zen') {
      await world.adminAdd(c.id, a, body.n);
      msg = a === 'zen' ? `Zen de ${c.name} ajustado.` : `Pontos de ${c.name} ajustados.`;
    } else throw new Error('Ação desconhecida.');
  } catch (e) { if (e instanceof HttpError) throw e; throw new HttpError(400, e.message); }
  await audit(acc.id, 'admin_' + a, req, { char: c.name, base: body.base, rarity: body.rarity, level: body.level, n: body.n });
  CMDS.log({ accountId: acc.id, name: acc.username, role: 'superadmin' }, 'panel:' + a, { id: c.id, name: c.name }, { base: body.base, rarity: body.rarity, level: body.level, n: body.n, qty: body.qty }, null, null, 'ok', msg, null);
  return { ok: true, message: msg, char: await adminTarget(c.name) };
});
// ---- Chaos Machine, drops e regras de administração (só o Super ADM) ----
const bad = (fn) => async (...a) => { try { return await fn(...a); } catch (e) { if (e instanceof HttpError) throw e; throw new HttpError(400, e.message); } };
route('GET', '/api/admin/chaos', async (req, url) => {
  await requireAdmin(req);
  return { ...CHAOS.adminView(), history: await CHAOS.history(60, url.searchParams.get('name') || '') };
});
route('POST', '/api/admin/chaos', bad(async (req) => {
  const acc = await requireAdmin(req);
  const body = await readJson(req, 64 * 1024);
  const config = await CHAOS.saveConfig(body.config || {});
  CMDS.log({ accountId: acc.id, name: acc.username, role: 'superadmin' }, 'panel:chaos', null, {}, null, config, 'ok', 'Receitas da Chaos Machine salvas', null);
  return { ok: true, message: 'Chaos Machine salva.', ...CHAOS.adminView() };
}));
route('GET', '/api/admin/drops', async (req) => {
  await requireAdmin(req);
  return DROPS.adminView();
});
route('GET', '/api/admin/drops/log', async (req, url) => {
  await requireAdmin(req);
  return { log: await DROPS.history(150, url.searchParams.get('name') || '') };
});
route('POST', '/api/admin/drops', bad(async (req) => {
  const acc = await requireAdmin(req);
  const body = await readJson(req, 32 * 1024);
  const who = { accountId: acc.id, name: acc.username, role: 'superadmin' };
  let message = 'Salvo.';
  switch (body.op) {
    case 'config': await DROPS.saveConfig(body.config || {}); message = 'Configuração de drop salva.'; break;
    case 'rule': await DROPS.saveRule(body.rule || {}); message = body.rule && body.rule.id ? 'Regra atualizada.' : 'Regra criada.'; break;
    case 'deleteRule': await DROPS.deleteRule(body.id); message = 'Regra removida.'; break;
    case 'event': await DROPS.saveEvent(body.event || {}); message = 'Evento iniciado.'; break;
    case 'stopEvent': await DROPS.stopEvent(body.id); message = 'Evento encerrado.'; break;
    case 'simulate': return { ok: true, sim: DROPS.simulate(String(body.monster), String(body.map || ''), body.n, body.level, !!body.events) };
    default: throw new HttpError(400, 'Operação inválida.');
  }
  CMDS.log(who, 'panel:drops:' + body.op, null, body, null, null, 'ok', message, null);
  return { ok: true, message, ...DROPS.adminView() };
}));
// ---- Invasão Dourada e Box Kundun (Super ADM) ----
async function invasionView() {
  const INV = world.invasion;
  return { ...INV.adminView(), boxes: KUNDUN.cfg(), boxIds: KUNDUN.BOXES, boxNames: Object.fromEntries(KUNDUN.BOXES.map((b) => [b, game.ITEM_BASES[b].name])),
    kinds: KUNDUN.KINDS, materials: Object.keys(game.ITEM_BASES).filter((k) => game.ITEM_BASES[k].slot === 'material').map((k) => ({ id: k, name: game.ITEM_BASES[k].name })),
    history: await INV.history(20), opens: await KUNDUN.history(40) };
}
route('GET', '/api/admin/invasion', async (req) => { await requireAdmin(req); return invasionView(); });
route('POST', '/api/admin/invasion', bad(async (req) => {
  const acc = await requireAdmin(req);
  const body = await readJson(req, 64 * 1024);
  const INV = world.invasion;
  const who = { accountId: acc.id, name: acc.username, role: 'superadmin' };
  let message = 'Salvo.';
  switch (body.op) {
    case 'config': await INV.saveConfig(body.config || {}); message = 'Invasão Dourada salva.'; break;
    case 'boxes': await KUNDUN.saveConfig(body.boxes || {}); message = 'Caixas salvas.'; break;
    case 'start': if (!(await INV.start('admin'))) throw new HttpError(400, 'Já existe uma invasão em andamento.'); message = 'Invasão iniciada.'; break;
    case 'stop': if (!(await INV.end('admin'))) throw new HttpError(400, 'Não há invasão em andamento.'); message = 'Invasão encerrada.'; break;
    case 'remove': message = `${INV.removeAll()} monstro(s) removido(s).`; break;
    case 'next': await INV.setNext(body.minutes); message = `Próxima invasão em ${Math.round(Number(body.minutes))} min.`; break;
    case 'spawn': message = `${INV.spawnManual(String(body.map), body.n, Number(body.room) || 0)} monstro(s) dourado(s) criado(s).`; break;
    case 'simulate': return { ok: true, sim: KUNDUN.simulate(String(body.box), body.n, body.level, String(body.cls || 'dark_knight')) };
    default: throw new HttpError(400, 'Operação inválida.');
  }
  CMDS.log(who, 'panel:invasao:' + body.op, null, body.op === 'config' || body.op === 'boxes' ? {} : body, null, null, 'ok', message, null);
  return { ok: true, message, ...(await invasionView()) };
}));
// ---- Equipamentos por classe e evolução de classe (Super ADM) ----
route('GET', '/api/admin/equip', async (req) => {
  await requireAdmin(req);
  return { ...EQUIP.adminView(), denials: await EQUIP.denials(80), classes2: CLS.cfg(), questItems: CLS.QUEST_ITEMS.map((k) => ({ id: k, name: game.ITEM_BASES[k].name })), evolutionsLog: await CLS.history(40) };
});
route('POST', '/api/admin/equip', bad(async (req) => {
  const acc = await requireAdmin(req);
  const body = await readJson(req, 128 * 1024);
  const who = { accountId: acc.id, name: acc.username, role: 'superadmin' };
  let message = 'Salvo.';
  switch (body.op) {
    case 'save': await EQUIP.saveRule(String(body.base), body.rule || {}); message = 'Regra do item salva.'; break;
    case 'reset': await EQUIP.resetRule(String(body.base)); message = 'Regra voltou ao padrão.'; break;
    case 'import': message = `${await EQUIP.importRules(body.rules)} regra(s) importada(s).`; break;
    case 'test': return { ok: true, test: EQUIP.test(String(body.base), String(body.cls), body.evo, body.level, body.stats || {}) };
    case 'classes': await CLS.saveConfig(body.config || {}); message = 'Evolução de classe salva.'; break;
    default: throw new HttpError(400, 'Operação inválida.');
  }
  CMDS.log(who, 'panel:equip:' + body.op, null, { base: body.base, n: Array.isArray(body.rules) ? body.rules.length : undefined }, null, null, 'ok', message, null);
  return { ok: true, message, ...EQUIP.adminView(), denials: await EQUIP.denials(80), classes2: CLS.cfg(), questItems: CLS.QUEST_ITEMS.map((k) => ({ id: k, name: game.ITEM_BASES[k].name })), evolutionsLog: await CLS.history(40) };
}));
// ---- Baú Pessoal (Super ADM) ----
route('GET', '/api/admin/vault', async (req, url) => {
  await requireAdmin(req);
  return { ok: true, ...(await VAULT.adminView(url.searchParams.get('name') || '')) };
});
route('POST', '/api/admin/vault', bad(async (req) => {
  const acc = await requireAdmin(req);
  const body = await readJson(req, 32 * 1024);
  const who = { accountId: acc.id, name: acc.username, role: 'superadmin' };
  let message = 'Salvo.';
  switch (body.op) {
    case 'config': await VAULT.saveConfig(body.config || {}); message = 'Baú Pessoal salvo. O NPC aparece/some quando o jogador entra de novo no mapa.'; break;
    case 'capacity': await VAULT.setCapacity(String(body.owner), body.capacity); message = 'Capacidade atualizada.'; break;
    default: throw new HttpError(400, 'Operação inválida.');
  }
  VAULT.log({ accountId: acc.id, charId: null, name: acc.username }, body.owner || null, null, 'admin', { detail: body.op === 'capacity' ? `capacidade ${body.owner} = ${body.capacity}` : 'configuração alterada' });
  CMDS.log(who, 'panel:vault:' + body.op, null, body.op === 'capacity' ? body : {}, null, null, 'ok', message, null);
  return { ok: true, message, ...(await VAULT.adminView(body.name || '')) };
}));
route('GET', '/api/admin/rules', async (req, url) => {
  await requireAdmin(req);
  return { rules: CMDS.cfg(), help: CMDS.help(), roles: CMDS.ROLES, log: await CMDS.history(120, url.searchParams.get('name') || '') };
});
route('POST', '/api/admin/rules', bad(async (req) => {
  const acc = await requireAdmin(req);
  const body = await readJson(req, 16 * 1024);
  const rules = await CMDS.saveConfig(body.rules || {});
  CMDS.log({ accountId: acc.id, name: acc.username, role: 'superadmin' }, 'panel:rules', null, {}, null, rules, 'ok', 'Regras de reset e limites salvas', null);
  return { ok: true, message: 'Regras salvas.', rules };
}));
route('POST', '/api/admin/vip', async (req) => {
  const acc = await requireAdmin(req);
  const body = await readJson(req);
  const { rows } = await db.query('SELECT id, username FROM accounts WHERE lower(username) = lower($1)', [String(body.username || '').trim()]);
  if (!rows[0]) throw new HttpError(404, 'Conta não encontrada.');
  const days = Math.round(Number(body.days) || 0);
  if (days > 3650 || days < 0) throw new HttpError(400, 'Dias inválidos.');
  let r;
  try { r = await VIP.grant(rows[0].id, String(body.plan), days); } catch (e) { throw new HttpError(400, e.message); }
  if (days > 0) {
    await db.query(`INSERT INTO payments (provider, account_id, plan, days, amount_cents, note) VALUES ('admin', $1, $2, $3, 0, $4) RETURNING id`,
      [rows[0].id, String(body.plan), days, `dado por ${acc.username}`]);
  }
  await audit(acc.id, 'admin_vip', req, { to: rows[0].username, plan: body.plan, days });
  world.refreshVip(rows[0].id).catch(() => {});
  const st = VIP.status(r);
  return { ok: true, message: days > 0 ? `${VIP.PLANS[body.plan].name}: +${days} dias para ${rows[0].username}.` : `${VIP.PLANS[body.plan].name} removido de ${rows[0].username}.`, vip: st };
});
route('POST', '/api/admin/vip-prices', async (req) => {
  const acc = await requireAdmin(req);
  const body = await readJson(req);
  let plans;
  try { plans = await VIP.savePrices(body.prices); } catch (e) { throw new HttpError(400, e.message); }
  await audit(acc.id, 'admin_vip_prices', req, body.prices);
  return { ok: true, message: 'Preços dos VIPs salvos.', plans };
});

route('GET', '/api/news', async () => {
  const { rows } = await db.query('SELECT id, kind, title, body, published_at FROM news ORDER BY published_at DESC LIMIT 10');
  return { news: rows };
});

route('GET', '/api/ranking', async (req, url) => {
  const orders = {
    level: 'level DESC, exp DESC, resets DESC',
    resets: 'master_resets DESC, resets DESC, level DESC, exp DESC',
    power: 'combat_power DESC, level DESC',
    bosses: 'bosses_killed DESC, level DESC',
    pvp: 'pvp_kills DESC, duel_wins DESC, level DESC',
  };
  const by = orders[url.searchParams.get('by')] ? url.searchParams.get('by') : 'resets';
  const { rows } = await db.query(`SELECT name, class, level, resets, master_resets, combat_power, bosses_killed, pvp_kills, duel_wins
    FROM characters ORDER BY ${orders[by]}, id ASC LIMIT 50`);
  return { by, ranking: rows };
});

route('GET', '/api/me', async (req) => {
  const acc = await sessionAccount(req);
  if (!acc) return { account: null, characters: [] };
  const statusAccess = canSeeStatus(acc);
  const { rows } = await db.query(`SELECT id, name, class, appearance, level, resets, zen, str, agi, vit, ene, cmd,
    free_points, map, combat_power, created_at, last_seen_at FROM characters WHERE account_id = $1 ORDER BY last_seen_at DESC NULLS LAST, id`, [acc.id]);
  return { account: { username: acc.username, email: maskEmail(acc.email), createdAt: acc.created_at, lastLoginAt: acc.last_login_at, statusAccess, admin: ADMIN.isAdmin(acc), vip: VIP.status(acc) }, characters: rows };
});

function maskEmail(e) {
  const [u, d] = String(e).split('@');
  return `${u.slice(0, 2)}${'*'.repeat(Math.max(1, u.length - 2))}@${d}`;
}

route('POST', '/api/register', async (req, url, res) => {
  limit(req, 'register', 5, 60 * 60 * 1000);
  const body = await readJson(req);
  const username = str(body.username, 32), email = str(body.email, 254).toLowerCase(), password = typeof body.password === 'string' ? body.password : '';
  if (!sec.USERNAME_RE.test(username)) throw new HttpError(400, 'Usuário deve ter 4 a 16 caracteres: letras, números ou _.');
  if (!sec.EMAIL_RE.test(email)) throw new HttpError(400, 'Informe um e-mail válido.');
  const pwErr = sec.validatePassword(password);
  if (pwErr) throw new HttpError(400, pwErr);
  if (password.toLowerCase().includes(username.toLowerCase())) throw new HttpError(400, 'A senha não pode conter o nome de usuário.');

  const code = sec.recoveryCode();
  const [pwHash, codeHash] = await Promise.all([sec.hashPassword(password), sec.hashPassword(code)]);
  let account;
  try {
    const { rows } = await db.query(`INSERT INTO accounts (username, email, password_hash, recovery_hash, last_login_at)
      VALUES ($1,$2,$3,$4, now()) RETURNING id, username`, [username, email, pwHash, codeHash]);
    account = rows[0];
  } catch (e) {
    if (e.code === '23505') {
      throw new HttpError(409, /email/.test(e.constraint || e.message) ? 'Este e-mail já está em uso.' : 'Este nome de usuário já existe.');
    }
    throw e;
  }
  await createSession(res, req, account.id, true);
  await audit(account.id, 'register', req);
  await refreshCounts(); pushStats();
  return { ok: true, username: account.username, recoveryCode: code };
});

route('POST', '/api/login', async (req, url, res) => {
  limit(req, 'login', 15, 15 * 60 * 1000);
  const body = await readJson(req);
  const login = str(body.login, 254), password = typeof body.password === 'string' ? body.password.slice(0, 200) : '';
  if (!login || !password) throw new HttpError(400, 'Informe usuário/e-mail e senha.');
  limit(req, 'login-acc', 8, 15 * 60 * 1000, login.toLowerCase());
  const { rows } = await db.query(`SELECT id, username, password_hash FROM accounts
    WHERE lower(username) = lower($1) OR lower(email) = lower($1) LIMIT 1`, [login]);
  const acc = rows[0];
  if (!acc) { await sec.burnTime(password); throw new HttpError(401, 'Usuário ou senha incorretos.'); }
  if (!(await sec.verifyPassword(password, acc.password_hash))) {
    await audit(acc.id, 'login_failed', req);
    throw new HttpError(401, 'Usuário ou senha incorretos.');
  }
  await db.query('UPDATE accounts SET last_login_at = now() WHERE id = $1 RETURNING id', [acc.id]);
  markActive([Number(acc.id)]).catch(() => {});
  await createSession(res, req, acc.id, !!body.remember);
  await audit(acc.id, 'login', req);
  return { ok: true, username: acc.username };
});

route('POST', '/api/logout', async (req, url, res) => {
  const token = parseCookies(req)[COOKIE];
  if (token) {
    const { rows } = await db.query('DELETE FROM sessions WHERE token_hash = $1 RETURNING account_id', [sec.sha256(token)]);
    if (rows[0]) await audit(rows[0].account_id, 'logout', req);
  }
  clearCookie(res, req);
  return { ok: true };
});

route('POST', '/api/forgot', async (req) => {
  limit(req, 'forgot', 5, 60 * 60 * 1000);
  const body = await readJson(req);
  const email = str(body.email, 254).toLowerCase();
  if (!sec.EMAIL_RE.test(email)) throw new HttpError(400, 'Informe um e-mail válido.');
  limit(req, 'forgot-mail', 3, 60 * 60 * 1000, email);
  const generic = { ok: true, message: 'Se existir uma conta com este e-mail, enviamos um link de redefinição válido por 1 hora.' };
  const { rows } = await db.query('SELECT id, username, email FROM accounts WHERE lower(email) = $1', [email]);
  const acc = rows[0];
  if (!acc) return generic;
  const token = sec.randomToken(32);
  await db.query(`INSERT INTO password_resets (token_hash, account_id, expires_at)
    VALUES ($1,$2, now() + ($3::int * interval '1 second'))`, [sec.sha256(token), acc.id, RESET_TTL_MS / 1000]);
  const link = `${publicUrl(req)}/#reset=${token}`;
  const m = mail.resetEmail(acc.username, link);
  const r = await mail.sendMail({ to: acc.email, ...m });
  await audit(acc.id, 'password_reset_requested', req, { emailed: r.delivered });
  // Em desenvolvimento local sem serviço de e-mail, devolve o link para testes.
  if (!r.delivered && !IS_PROD) return { ...generic, devResetLink: link };
  return generic;
});

route('POST', '/api/reset', async (req) => {
  limit(req, 'reset', 10, 60 * 60 * 1000);
  const body = await readJson(req);
  const token = str(body.token, 100), password = typeof body.password === 'string' ? body.password : '';
  if (!token) throw new HttpError(400, 'Link de redefinição inválido.');
  const pwErr = sec.validatePassword(password);
  if (pwErr) throw new HttpError(400, pwErr);
  const pwHash = await sec.hashPassword(password);
  // Consome o token de forma atômica (uso único)
  const { rows } = await db.query(`UPDATE password_resets SET used_at = now()
    WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now() RETURNING account_id`, [sec.sha256(token)]);
  if (!rows[0]) throw new HttpError(400, 'Link inválido ou expirado. Peça um novo.');
  const accountId = rows[0].account_id;
  await db.query('UPDATE accounts SET password_hash = $1, password_changed_at = now() WHERE id = $2 RETURNING id', [pwHash, accountId]);
  await db.query('DELETE FROM sessions WHERE account_id = $1 RETURNING account_id', [accountId]);
  await db.query('UPDATE password_resets SET used_at = now() WHERE account_id = $1 AND used_at IS NULL RETURNING account_id', [accountId]);
  await audit(accountId, 'password_reset', req);
  return { ok: true, message: 'Senha alterada. Entre com a nova senha.' };
});

route('POST', '/api/recover-code', async (req) => {
  limit(req, 'recover-code', 5, 60 * 60 * 1000);
  const body = await readJson(req);
  const username = str(body.username, 32);
  const code = sec.normalizeRecoveryCode(body.code);
  const password = typeof body.password === 'string' ? body.password : '';
  if (!username || !code) throw new HttpError(400, 'Informe o usuário e o código de recuperação (16 caracteres).');
  limit(req, 'recover-code-acc', 5, 60 * 60 * 1000, username.toLowerCase());
  const pwErr = sec.validatePassword(password);
  if (pwErr) throw new HttpError(400, pwErr);
  const { rows } = await db.query('SELECT id, recovery_hash FROM accounts WHERE lower(username) = lower($1)', [username]);
  const acc = rows[0];
  const ok = acc ? await sec.verifyPassword(code, acc.recovery_hash) : (await sec.burnTime(code), false);
  if (!ok) {
    if (acc) await audit(acc.id, 'recovery_code_failed', req);
    throw new HttpError(400, 'Usuário ou código de recuperação incorretos.');
  }
  const newCode = sec.recoveryCode();
  const [pwHash, codeHash] = await Promise.all([sec.hashPassword(password), sec.hashPassword(newCode)]);
  await db.query(`UPDATE accounts SET password_hash = $1, recovery_hash = $2, password_changed_at = now()
    WHERE id = $3 RETURNING id`, [pwHash, codeHash, acc.id]);
  await db.query('DELETE FROM sessions WHERE account_id = $1 RETURNING account_id', [acc.id]);
  await audit(acc.id, 'password_reset_by_code', req);
  return { ok: true, message: 'Senha alterada. Guarde o novo código de recuperação — o antigo deixou de valer.', recoveryCode: newCode };
});

route('POST', '/api/change-password', async (req, url, res) => {
  const acc = await requireAccount(req);
  limit(req, 'change-pw', 5, 15 * 60 * 1000, String(acc.id));
  const body = await readJson(req);
  const { rows } = await db.query('SELECT password_hash FROM accounts WHERE id = $1', [acc.id]);
  if (!(await sec.verifyPassword(String(body.current || ''), rows[0].password_hash))) throw new HttpError(400, 'Senha atual incorreta.');
  const pwErr = sec.validatePassword(body.password);
  if (pwErr) throw new HttpError(400, pwErr);
  const pwHash = await sec.hashPassword(body.password);
  await db.query('UPDATE accounts SET password_hash = $1, password_changed_at = now() WHERE id = $2 RETURNING id', [pwHash, acc.id]);
  await db.query('DELETE FROM sessions WHERE account_id = $1 RETURNING account_id', [acc.id]);
  await createSession(res, req, acc.id, true);
  await audit(acc.id, 'password_changed', req);
  return { ok: true, message: 'Senha alterada. Outras sessões foram encerradas.' };
});

route('POST', '/api/recovery-code', async (req) => {
  const acc = await requireAccount(req);
  limit(req, 'regen-code', 5, 60 * 60 * 1000, String(acc.id));
  const body = await readJson(req);
  const { rows } = await db.query('SELECT password_hash FROM accounts WHERE id = $1', [acc.id]);
  if (!(await sec.verifyPassword(String(body.password || ''), rows[0].password_hash))) throw new HttpError(400, 'Senha incorreta.');
  const code = sec.recoveryCode();
  await db.query('UPDATE accounts SET recovery_hash = $1 WHERE id = $2 RETURNING id', [await sec.hashPassword(code), acc.id]);
  await audit(acc.id, 'recovery_code_regenerated', req);
  return { ok: true, recoveryCode: code };
});

const HAIR_COLORS = 7, SKIN_TONES = 4;
route('POST', '/api/characters', async (req) => {
  const acc = await requireAccount(req);
  limit(req, 'char-create', 10, 60 * 60 * 1000, String(acc.id));
  const body = await readJson(req);
  const name = str(body.name, 20);
  const cls = game.CLASSES[body.class] ? body.class : null;
  if (!sec.CHARNAME_RE.test(name)) throw new HttpError(400, 'Nome do personagem: 3 a 12 letras ou números, sem espaços.');
  if (!cls) throw new HttpError(400, 'Escolha uma classe válida.');
  const locked = await CLS.creationCheck(acc.id, cls);
  if (locked) throw new HttpError(403, locked);
  const ap = body.appearance && typeof body.appearance === 'object' ? body.appearance : {};
  const appearance = {
    hair: Number.isInteger(ap.hair) && ap.hair >= 0 && ap.hair < HAIR_COLORS ? ap.hair : 0,
    skin: Number.isInteger(ap.skin) && ap.skin >= 0 && ap.skin < SKIN_TONES ? ap.skin : 0,
  };
  const b = game.CLASSES[cls].base;
  const power = (b.str + b.agi + b.vit + b.ene + b.cmd) * 10;
  // Limite por conta verificado e aplicado na mesma instrução
  let rows;
  try {
    ({ rows } = await db.query(`INSERT INTO characters (account_id, name, class, appearance, str, agi, vit, ene, cmd, combat_power, zen)
      SELECT $1::bigint, $2::text, $3::text, $4::jsonb, $5::int, $6::int, $7::int, $8::int, $9::int, $10::int, 1000
      WHERE (SELECT count(*) FROM characters WHERE account_id = $1::bigint) < $11::int
      RETURNING id, name, class, level`,
    [acc.id, name, cls, JSON.stringify(appearance), b.str, b.agi, b.vit, b.ene, b.cmd, power, game.LIMITS.maxCharactersPerAccount]));
  } catch (e) {
    if (e.code === '23505') throw new HttpError(409, 'Já existe um personagem com este nome.');
    throw e;
  }
  if (!rows[0]) throw new HttpError(400, `Limite de ${game.LIMITS.maxCharactersPerAccount} personagens por conta.`);
  await audit(acc.id, 'character_created', req, { name, class: cls });
  await refreshCounts(); pushStats();
  return { ok: true, character: rows[0] };
});

route('DELETE', '/api/characters/:id', async (req, url, res, params) => {
  const acc = await requireAccount(req);
  const body = await readJson(req);
  const id = Number(params.id);
  if (!Number.isSafeInteger(id)) throw new HttpError(400, 'Personagem inválido.');
  const { rows } = await db.query('SELECT name FROM characters WHERE id = $1 AND account_id = $2', [id, acc.id]);
  if (!rows[0]) throw new HttpError(404, 'Personagem não encontrado.');
  if (str(body.confirmName, 20).toLowerCase() !== rows[0].name.toLowerCase()) throw new HttpError(400, 'Digite o nome do personagem para confirmar.');
  // itens do baú compartilhado da conta não somem com o personagem: passam para outro herói da conta
  await db.query(`UPDATE items SET character_id = (SELECT id FROM characters WHERE account_id = $2 AND id <> $1 ORDER BY level DESC LIMIT 1)
    WHERE character_id = $1 AND vault_owner = $3 AND EXISTS (SELECT 1 FROM characters WHERE account_id = $2 AND id <> $1) RETURNING id`, [id, acc.id, 'a:' + acc.id]);
  await db.query('DELETE FROM characters WHERE id = $1 AND account_id = $2 RETURNING id', [id, acc.id]);
  await audit(acc.id, 'character_deleted', req, { name: rows[0].name });
  await refreshCounts(); pushStats();
  return { ok: true };
});

// ---------------- arquivos estáticos ----------------
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json', '.apk': 'application/vnd.android.package-archive', '.woff': 'font/woff', '.woff2': 'font/woff2', '.mp4': 'video/mp4', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.txt': 'text/plain; charset=utf-8',
};
function serveStatic(req, res, pathname) {
  let rel;
  try { rel = decodeURIComponent(pathname); } catch (_) { rel = '/'; }
  if (rel === '/' || rel === '') rel = '/index.html';
  if (rel === '/status' || rel === '/status/') rel = '/status.html';
  if (rel === '/app' || rel === '/app/') rel = '/app.html';
  if (rel === '/download' || rel === '/download/' || rel === '/apk') rel = '/download/mu-idle-legends.apk';
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) { res.writeHead(403); return res.end(); }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end('<h1>404</h1><p><a href="/">Voltar ao MU Idle Legends</a></p>');
    }
    const ext = path.extname(file);
    // Sempre revalida com o servidor: depois de um deploy, o navegador pega a versão nova na hora
    const etag = `"${st.size.toString(36)}-${Math.floor(st.mtimeMs).toString(36)}"`;
    if (req.headers['if-none-match'] === etag) { res.writeHead(304, { ETag: etag, 'Cache-Control': 'no-cache' }); return res.end(); }
    const type = MIME[ext] || 'application/octet-stream';
    if (ext === '.apk') res.setHeader('Content-Disposition', 'attachment; filename="MU-Idle-Legends.apk"');
    // pedaços do arquivo (Range): necessário para vídeo no iPhone e no app Android
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
    if (range && st.size > 0) {
      let start = range[1] === '' ? Math.max(0, st.size - Number(range[2])) : Number(range[1]);
      let end = range[1] !== '' && range[2] !== '' ? Math.min(Number(range[2]), st.size - 1) : st.size - 1;
      if (start > end || start >= st.size) { res.writeHead(416, { 'Content-Range': `bytes */${st.size}` }); return res.end(); }
      res.writeHead(206, { 'Content-Type': type, 'Content-Length': end - start + 1, 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache', ETag: etag });
      if (req.method === 'HEAD') return res.end();
      return fs.createReadStream(file, { start, end }).pipe(res);
    }
    res.writeHead(200, {
      'Content-Type': type,
      'Content-Length': st.size,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-cache',
      ETag: etag,
    });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  });
}

// ---------------- servidor ----------------
function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try { return new URL(origin).host === req.headers.host; } catch (_) { return false; }
}

const server = http.createServer(async (req, res) => {
  securityHeaders(res);
  const url = new URL(req.url, 'http://localhost');
  if (!url.pathname.startsWith('/api/')) {
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
    if (/^\/status(\.html|\/)?$/.test(url.pathname)) {
      let ok = false;
      try { ok = canSeeStatus(await sessionAccount(req)); } catch (_) { ok = false; }
      if (!ok) {
        res.writeHead(403, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
        return res.end(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Acesso restrito</title><link rel="stylesheet" href="/css/fonts.css"><link rel="stylesheet" href="/css/style.css"></head>
<body style="display:grid;place-items:center;min-height:100vh;text-align:center;padding:16px"><div><h1 style="font-family:var(--display);color:var(--gold)">Acesso restrito</h1>
<p>Esta página é só para a administração do MU Idle Legends.</p><p><a class="btn btn-gold" href="/">Voltar ao início</a></p></div>
<script src="/js/i18n-en.js"></script><script src="/js/i18n.js"></script></body></html>`);
      }
      res.setHeader('Cache-Control', 'no-store');
    }
    return serveStatic(req, res, url.pathname);
  }
  if (req.method === 'POST' && url.pathname === '/api/stripe-webhook') {
    try {
      const raw = await new Promise((ok, bad) => {
        const ch = []; let n = 0;
        req.on('data', (d) => { n += d.length; if (n > 512 * 1024) { bad(new Error('grande')); req.destroy(); } else ch.push(d); });
        req.on('end', () => ok(Buffer.concat(ch))); req.on('error', bad);
      });
      const r = await VIP.webhook(raw, req.headers['stripe-signature'], (accId) => { if (world) world.refreshVip(accId).catch(() => {}); });
      return sendJson(res, r.code, r.body);
    } catch (e) {
      console.error('[vip] webhook:', e.message);
      return sendJson(res, 500, { error: 'server' }); // 500: o Stripe tenta de novo
    }
  }
  // alguém abriu um endereço /api/... direto no navegador: leva para a página inicial em vez de mostrar JSON
  if (req.method === 'GET' && req.headers['sec-fetch-mode'] === 'navigate' && req.headers['sec-fetch-dest'] === 'document') {
    console.warn(`[api nav] ${url.pathname}${url.search} ref=${req.headers.referer || '-'} ua=${(req.headers['user-agent'] || '').slice(0, 90)}`);
    res.writeHead(302, { Location: '/', 'Cache-Control': 'no-store' });
    return res.end();
  }
  try {
    if (req.method !== 'GET') {
      // Proteção CSRF: só aceita chamadas do próprio site com cabeçalho customizado
      if (!sameOrigin(req) || req.headers['x-requested-with'] !== 'mui') throw new HttpError(403, 'Origem não permitida.');
      limit(req, 'api-write', 120, 60 * 1000);
    } else {
      limit(req, 'api-read', 300, 60 * 1000);
    }
    for (const r of routes) {
      if (r.method !== req.method) continue;
      const m = url.pathname.match(r.re);
      if (!m) continue;
      const params = {};
      r.keys.forEach((k, i) => { params[k] = m[i + 1]; });
      const out = await r.handler(req, url, res, params);
      return sendJson(res, 200, out);
    }
    // abas antigas do jogo anterior deste domínio ainda chamam /api/wow/*: não polui o log
    if (!url.pathname.startsWith('/api/wow/')) console.warn(`[api 404] ${req.method} ${url.pathname} ref=${req.headers.referer || '-'}`);
    throw new HttpError(404, 'Rota não encontrada.');
  } catch (e) {
    if (e instanceof HttpError) {
      const headers = e.extra && e.extra.retryAfter ? { 'Retry-After': String(e.extra.retryAfter) } : {};
      return sendJson(res, e.status, { ok: false, error: e.message }, headers);
    }
    console.error(`[api] ${req.method} ${url.pathname}:`, e);
    return sendJson(res, 500, { ok: false, error: 'Erro interno. Tente novamente.' });
  }
});

ws = new WSServer(server, {
  path: '/ws',
  allowedOrigin: (origin, req) => { try { return new URL(origin).host === req.headers.host; } catch (_) { return false; } },
  authenticate: async (req) => {
    const acc = await sessionAccount(req).catch(() => null);
    return { accountId: acc ? String(acc.id) : null, username: acc ? acc.username : null };
  },
});
ws.on('connection', (client) => {
  client.send({ type: 'hello', username: client.meta.username, ...liveStats() });
  // limite de mensagens por conexão (anti-abuso)
  client.rate = { n: 0, reset: Date.now() + 1000 };
  client.on('message', (msg) => {
    if (msg === '{"type":"ping"}') return client.send({ type: 'pong', t: Date.now() });
    const now = Date.now();
    if (now > client.rate.reset) client.rate = { n: 0, reset: now + 1000 };
    if (++client.rate.n > 25) return;
    let data;
    try { data = JSON.parse(msg); } catch (_) { return; }
    if (!data || typeof data.type !== 'string' || !world) return;
    world.handle(client, data).catch((e) => {
      console.error('[world] erro:', e);
      client.send({ type: 'log', kind: 'warn', text: 'Erro no servidor ao processar a ação.' });
    });
    if (data.type === 'join' || data.type === 'leave') pushStats();
    if (data.type === 'join' && client.meta.accountId) markActive([Number(client.meta.accountId)]).catch(() => {});
  });
  pushStats();
});
ws.on('disconnect', (client) => { if (world) world.disconnect(client); pushStats(); });

// Limpeza periódica de sessões e tokens expirados
setInterval(() => {
  db.query('DELETE FROM sessions WHERE expires_at < now() RETURNING account_id').catch(() => {});
  db.query("DELETE FROM password_resets WHERE expires_at < now() - interval '1 day' RETURNING account_id").catch(() => {});
}, 60 * 60 * 1000).unref();

(async () => {
  await db.migrate();
  await refreshCounts();
  await VIP.loadPrices();
  world = new World();
  await world.init();
  // amostra a cada 5 minutos (e logo após iniciar)
  setTimeout(() => sampleStats().catch((e) => console.error('[status]', e.message)), 20000).unref();
  setInterval(() => sampleStats().catch((e) => console.error('[status]', e.message)), 5 * 60 * 1000).unref();
  server.listen(PORT, () => console.log(`[server] MU Idle Legends ouvindo na porta ${PORT}`));
})().catch((e) => { console.error('[server] falha ao iniciar:', e); process.exit(1); });

function shutdown() {
  console.log('[server] encerrando...');
  const done = () => db.pool.end().then(() => process.exit(0));
  (world ? world.shutdown() : Promise.resolve()).catch(() => {}).then(() => server.close(done));
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
