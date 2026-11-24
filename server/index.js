'use strict';
// Servidor do jogo (Render): serve o build do Phaser, multiplayer em tempo real
// (WebSocket /room/:id) e contas/salvamento na nuvem usando o PostgreSQL existente.
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { WSServer } = require('./ws');
const sec = require('./security');
const crypto = require('crypto');
const { wingShop, premium, expandItem } = require('../scripts/game-data');

const PORT = Number(process.env.PORT || 3000);
const ROOT = path.join(__dirname, '..', 'game', 'website', 'out');
const DOWNLOADS = path.join(__dirname, '..', 'public', 'download');
const SITE = path.join(__dirname, '..', 'site');
const db = process.env.DATABASE_URL ? require('./db') : null;
if (!db) console.warn('[db] DATABASE_URL ausente: contas e salvamento na nuvem desativados.');

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff': 'font/woff',
  '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg',
  '.wav': 'audio/wav', '.mp4': 'video/mp4', '.webm': 'video/webm', '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8', '.webmanifest': 'application/manifest+json', '.apk': 'application/vnd.android.package-archive',
};
const COMPRESSIBLE = new Set(['.html', '.js', '.css', '.json', '.svg', '.txt', '.webmanifest']);
const gzCache = new Map();

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'X-Content-Type-Options': 'nosniff', ...headers });
  res.end(body);
}
function json(res, status, obj) {
  send(res, status, JSON.stringify(obj), { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
}

function serveFile(req, res, file, cache) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, 'not found', { 'Content-Type': 'text/plain' });
    const ext = path.extname(file).toLowerCase();
    const headers = { 'Content-Type': TYPES[ext] || 'application/octet-stream', 'Cache-Control': cache, 'Vary': 'Accept-Encoding' };
    const etag = `"${st.size.toString(36)}-${Math.floor(st.mtimeMs).toString(36)}"`;
    headers.ETag = etag;
    if (req.headers['if-none-match'] === etag) return send(res, 304, null, headers);
    const gzip = COMPRESSIBLE.has(ext) && /\bgzip\b/.test(req.headers['accept-encoding'] || '') && st.size > 1024;
    if (gzip) {
      const key = file + etag;
      let buf = gzCache.get(key);
      if (!buf) { buf = zlib.gzipSync(fs.readFileSync(file), { level: 6 }); if (buf.length < 4e6) gzCache.set(key, buf); }
      headers['Content-Encoding'] = 'gzip'; headers['Content-Length'] = buf.length;
      return send(res, 200, req.method === 'HEAD' ? null : buf, headers);
    }
    headers['Content-Length'] = st.size;
    res.writeHead(200, headers);
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  });
}

function safeJoin(root, urlPath) {
  let p;
  try { p = decodeURIComponent(urlPath); } catch { return null; }
  if (p.includes('\0')) return null;
  const full = path.normalize(path.join(root, p));
  return full.startsWith(root + path.sep) || full === root ? full : null;
}

// ---------------- Contas + salvamento na nuvem ----------------
const TOKEN_TTL_MS = 60 * 24 * 3600 * 1000;
async function migrate() {
  if (!db) return;
  const schema = process.env.PG_SCHEMA || 'public';
  if (schema !== 'public') await db.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`);
  // Reaproveita a tabela de contas que já existe no banco; cria se for um banco novo.
  await db.query(`CREATE TABLE IF NOT EXISTS accounts (
    id BIGSERIAL PRIMARY KEY, username TEXT NOT NULL, email TEXT NOT NULL, password_hash TEXT NOT NULL,
    recovery_hash TEXT, is_admin BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_login_at TIMESTAMPTZ, password_changed_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  await db.query('CREATE UNIQUE INDEX IF NOT EXISTS accounts_username_lower ON accounts (lower(username))');
  await db.query('CREATE UNIQUE INDEX IF NOT EXISTS accounts_email_lower ON accounts (lower(email))');
  await db.query(`CREATE TABLE IF NOT EXISTS aether_tokens (
    token_hash TEXT PRIMARY KEY, account_id BIGINT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL)`);
  await db.query(`CREATE TABLE IF NOT EXISTS aether_saves (
    account_id BIGINT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
    data JSONB NOT NULL, level INT NOT NULL DEFAULT 1, updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  await db.query('ALTER TABLE accounts ADD COLUMN IF NOT EXISTS vip1_until TIMESTAMPTZ');
  await db.query('ALTER TABLE accounts ADD COLUMN IF NOT EXISTS vip2_until TIMESTAMPTZ');
  await db.query(`CREATE TABLE IF NOT EXISTS aether_purchases (
    id BIGSERIAL PRIMARY KEY, account_id BIGINT REFERENCES accounts(id) ON DELETE CASCADE,
    item TEXT NOT NULL, ref TEXT UNIQUE NOT NULL, amount_cents INT NOT NULL, currency TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  await db.query('CREATE INDEX IF NOT EXISTS aether_purchases_account ON aether_purchases (account_id)');
  await db.query(`CREATE TABLE IF NOT EXISTS aether_meta (key TEXT PRIMARY KEY, at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  await resetAccountsOnce();
  await db.query('DELETE FROM aether_tokens WHERE expires_at < now()');
  console.log(`[db] pronto (schema "${schema}")`);
}

// RESET DE CONTAS (pedido do dono do jogo, 24/11/2026): todo mundo cria conta de novo.
// Roda uma única vez. Antes de apagar, copia contas e heróis para tabelas *_backup_20261124.
const RESET_KEY = 'reset-contas-20261124';
async function resetAccountsOnce() {
  const done = await db.query('SELECT 1 FROM aether_meta WHERE key = $1', [RESET_KEY]);
  if (done.rows[0]) return;
  await db.tx(async (q) => {
    await q('CREATE TABLE IF NOT EXISTS accounts_backup_20261124 AS SELECT * FROM accounts');
    await q('CREATE TABLE IF NOT EXISTS aether_saves_backup_20261124 AS SELECT * FROM aether_saves');
    const r = await q('DELETE FROM accounts');
    await q('INSERT INTO aether_meta (key) VALUES ($1)', [RESET_KEY]);
    console.log(`[reset] ${r.rowCount} contas apagadas (backup em accounts_backup_20261124). Todos criam conta de novo.`);
  });
}

function clientIp(req) {
  return String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
}
function readJson(req, max = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > max) { reject(Object.assign(new Error('Dados grandes demais.'), { status: 413 })); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch { reject(Object.assign(new Error('JSON inválido.'), { status: 400 })); } });
    req.on('error', reject);
  });
}
function fail(status, message) { return Object.assign(new Error(message), { status }); }
function limit(req, name, max, windowMs, extra = '') {
  const r = sec.rateLimit(`${name}:${clientIp(req)}:${extra}`, max, windowMs);
  if (!r.ok) throw fail(429, `Muitas tentativas. Tente novamente em ${r.retryAfter}s.`);
}
async function issueToken(accountId) {
  const token = sec.randomToken(32);
  await db.query(`INSERT INTO aether_tokens (token_hash, account_id, expires_at) VALUES ($1,$2, now() + ($3::bigint * interval '1 millisecond'))`,
    [sec.sha256(token), accountId, TOKEN_TTL_MS]);
  return token;
}
async function auth(req) {
  const m = /^Bearer\s+([A-Za-z0-9_-]{20,100})$/.exec(req.headers.authorization || '');
  if (!m) throw fail(401, 'Faça login.');
  const { rows } = await db.query(`SELECT a.id, a.username FROM aether_tokens t JOIN accounts a ON a.id = t.account_id
    WHERE t.token_hash = $1 AND t.expires_at > now()`, [sec.sha256(m[1])]);
  if (!rows[0]) throw fail(401, 'Sessão expirada. Entre novamente.');
  return rows[0];
}
// VIP do banco antigo: vip2 = Diamante, vip1 = Ouro (o maior vale). No modo HARD o EXP é baixo para os dois.
async function vipInfo(accountId) {
  const { rows } = await db.query(`SELECT vip1_until, vip2_until FROM accounts WHERE id = $1`, [accountId]);
  const r = rows[0] || {}, now = Date.now();
  const d = r.vip2_until && new Date(r.vip2_until).getTime() > now ? r.vip2_until : null;
  const o = r.vip1_until && new Date(r.vip1_until).getTime() > now ? r.vip1_until : null;
  return { vip: d ? 'diamante' : o ? 'ouro' : null, vipUntil: d || o || null, ouroUntil: o, diamanteUntil: d };
}
async function vipOf(accountId) { return (await vipInfo(accountId)).vip; }
async function purchasedItems(accountId) {
  const { rows } = await db.query(`SELECT DISTINCT item FROM aether_purchases WHERE account_id = $1 AND item NOT LIKE 'vip:%'`, [accountId]);
  return rows.map((r) => r.item);
}
async function purchasedWings(accountId) {
  return (await purchasedItems(accountId)).filter((i) => i.startsWith('wing:')).map((i) => i.slice(5));
}
/** O que a conta comprou + VIP, para mandar ao jogo. */
async function premiumState(accountId) {
  const items = await purchasedItems(accountId);
  return { ...(await vipInfo(accountId)), items, wings: items.filter((i) => i.startsWith('wing:')).map((i) => i.slice(5)) };
}

// ---------------- Loja de asas com dinheiro real (Stripe Checkout) ----------------
// Mesmas variáveis do jogo antigo, no painel da Render: STRIPE_SECRET_KEY e STRIPE_WEBHOOK_SECRET.
// Webhook no Stripe: https://muonlineclaude.com/api/stripe-webhook (evento checkout.session.completed).
const STRIPE_KEY = () => process.env.STRIPE_SECRET_KEY || '';
const STRIPE_WHSEC = () => process.env.STRIPE_WEBHOOK_SECRET || '';
const payEnabled = () => !!STRIPE_KEY() && !!STRIPE_WHSEC();
const SHOP = wingShop();
const PREMIUM = premium();
/** Produto pelo código: asa, conjunto ou VIP. O preço sempre vem daqui (nunca do navegador). */
function productFor(item) {
  if (typeof item !== 'string') return null;
  if (item.startsWith('wing:')) {
    const w = SHOP.find((x) => x.id === item.slice(5) && !x.free);
    return w && { item, cents: w.cents, name: `Asa ${w.family} Nv.${w.level}`, desc: 'asa cosmética permanente', once: true };
  }
  const pack = PREMIUM.packs.find((x) => x.id === item);
  if (pack) return { item, cents: pack.cents, name: pack.name, desc: pack.desc, once: true };
  const vip = PREMIUM.vip.find((x) => x.id === item);
  if (vip) return { item, cents: vip.cents, name: `${vip.name} — ${vip.days} dias`, desc: (PREMIUM.perks[vip.plan] || []).join(', '), once: false, vip };
  return null;
}
function publicUrl(req) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '');
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || 'localhost');
  const proto = String(req.headers['x-forwarded-proto'] || (req.socket.encrypted ? 'https' : 'http')).split(',')[0];
  return `${proto}://${host}`;
}
function verifyStripeSig(raw, header) {
  const secret = STRIPE_WHSEC();
  if (!secret || typeof header !== 'string') return false;
  const parts = header.split(',').map((x) => x.trim().split('='));
  const t = (parts.find((x) => x[0] === 't') || [])[1];
  const v1 = parts.filter((x) => x[0] === 'v1').map((x) => x[1]);
  if (!t || !v1.length || Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;
  const exp = crypto.createHmac('sha256', secret).update(Buffer.concat([Buffer.from(`${t}.`), raw])).digest('hex');
  return v1.some((x) => x.length === exp.length && crypto.timingSafeEqual(Buffer.from(x), Buffer.from(exp)));
}
function readRaw(req, max = 512 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > max) { reject(fail(413, 'grande demais')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function str(v, max) { return typeof v === 'string' ? v.trim().slice(0, max) : ''; }

async function handleApi(req, res, url) {
  const p = url.pathname;
  if (p === '/api/health') return json(res, 200, { ok: true, db: !!db, online: players() });
  if (p === '/api/stats') return json(res, 200, { ok: true, online: players(), ...(await accountStats()) });
  if (!db) throw fail(503, 'Banco de dados indisponível.');

  if (p === '/api/register' && req.method === 'POST') {
    limit(req, 'register', 6, 60 * 60 * 1000);
    const body = await readJson(req);
    const username = str(body.username, 32), email = str(body.email, 254).toLowerCase(), password = typeof body.password === 'string' ? body.password : '';
    if (!sec.USERNAME_RE.test(username)) throw fail(400, 'Usuário: 4 a 16 letras, números ou _.');
    if (!sec.EMAIL_RE.test(email)) throw fail(400, 'Informe um e-mail válido.');
    const pwErr = sec.validatePassword(password); if (pwErr) throw fail(400, pwErr);
    let acc;
    try {
      const { rows } = await db.query(`INSERT INTO accounts (username, email, password_hash) VALUES ($1,$2,$3) RETURNING id, username`,
        [username, email, await sec.hashPassword(password)]);
      acc = rows[0];
    } catch (e) {
      if (e.code === '23505') throw fail(409, /email/.test(e.constraint || e.message) ? 'Este e-mail já está em uso.' : 'Este nome de usuário já existe.');
      throw e;
    }
    return json(res, 200, { ok: true, username: acc.username, token: await issueToken(acc.id), save: null, vip: null });
  }

  if (p === '/api/login' && req.method === 'POST') {
    limit(req, 'login', 15, 15 * 60 * 1000);
    const body = await readJson(req);
    const login = str(body.login, 254), password = typeof body.password === 'string' ? body.password.slice(0, 200) : '';
    if (!login || !password) throw fail(400, 'Informe usuário/e-mail e senha.');
    limit(req, 'login-acc', 8, 15 * 60 * 1000, login.toLowerCase());
    const { rows } = await db.query(`SELECT id, username, password_hash FROM accounts
      WHERE lower(username) = lower($1) OR lower(email) = lower($1) LIMIT 1`, [login]);
    const acc = rows[0];
    if (!acc) { await sec.burnTime(password); throw fail(401, 'Usuário ou senha incorretos.'); }
    if (!(await sec.verifyPassword(password, acc.password_hash))) throw fail(401, 'Usuário ou senha incorretos.');
    await db.query('UPDATE accounts SET last_login_at = now() WHERE id = $1', [acc.id]);
    const save = await db.query('SELECT data FROM aether_saves WHERE account_id = $1', [acc.id]);
    return json(res, 200, { ok: true, username: acc.username, token: await issueToken(acc.id), save: save.rows[0]?.data ?? null, ...(await premiumState(acc.id)) });
  }

  if (p === '/api/logout' && req.method === 'POST') {
    const m = /^Bearer\s+(\S+)$/.exec(req.headers.authorization || '');
    if (m) await db.query('DELETE FROM aether_tokens WHERE token_hash = $1', [sec.sha256(m[1])]);
    return json(res, 200, { ok: true });
  }

  if (p === '/api/save') {
    const acc = await auth(req);
    if (req.method === 'GET') {
      const { rows } = await db.query('SELECT data FROM aether_saves WHERE account_id = $1', [acc.id]);
      return json(res, 200, { ok: true, username: acc.username, save: rows[0]?.data ?? null, ...(await premiumState(acc.id)) });
    }
    if (req.method === 'PUT' || req.method === 'POST') {
      limit(req, 'save', 40, 60 * 1000, String(acc.id));
      const body = await readJson(req, 48 * 1024);
      const save = body && typeof body.save === 'object' && !Array.isArray(body.save) ? body.save : null;
      if (!save) throw fail(400, 'Save inválido.');
      // Asas pagas com dinheiro real nunca somem, mesmo que o aparelho mande um save antigo.
      for (const it of await purchasedItems(acc.id)) {
        for (const [key, ids] of Object.entries(expandItem(it))) {
          const cur = Array.isArray(save[key]) ? save[key].filter((x) => typeof x === 'string').slice(0, 128) : [];
          save[key] = [...new Set([...cur, ...ids])];
        }
      }
      const level = Number(save.level);
      if (!Number.isInteger(level) || level < 1 || level > 100000) throw fail(400, 'Nível inválido.');
      await db.query(`INSERT INTO aether_saves (account_id, data, level, updated_at) VALUES ($1,$2,$3, now())
        ON CONFLICT (account_id) DO UPDATE SET data = EXCLUDED.data, level = EXCLUDED.level, updated_at = now()`,
        [acc.id, JSON.stringify(save), level]);
      return json(res, 200, { ok: true });
    }
  }

  if (p === '/api/shop/wings' && req.method === 'GET') {
    return json(res, 200, { ok: true, enabled: payEnabled(), currency: 'brl', wings: SHOP.filter((w) => !w.free).map((w) => ({ id: w.id, cents: w.cents })), vip: PREMIUM.vip, packs: PREMIUM.packs });
  }

  if (p === '/api/shop/checkout' && req.method === 'POST') {
    const acc = await auth(req);
    limit(req, 'checkout', 10, 10 * 60 * 1000, String(acc.id));
    if (!payEnabled()) throw fail(503, 'Pagamento com dinheiro real ainda não está ativado no servidor.');
    const body = await readJson(req);
    const product = productFor(typeof body.item === 'string' ? body.item : body.wingId ? `wing:${body.wingId}` : null);
    if (!product) throw fail(400, 'Produto inválido.');
    if (product.once && (await purchasedItems(acc.id)).includes(product.item)) throw fail(409, 'Você já comprou este item.');
    const { rows } = await db.query('SELECT email FROM accounts WHERE id = $1', [acc.id]);
    const base = publicUrl(req);
    const f = new URLSearchParams();
    f.set('mode', 'payment');
    f.set('success_url', `${base}/jogar/?compra=ok`);
    f.set('cancel_url', `${base}/jogar/?compra=cancelado`);
    f.set('client_reference_id', String(acc.id));
    if (rows[0]?.email) f.set('customer_email', rows[0].email);
    f.set('locale', 'pt-BR');
    f.set('line_items[0][quantity]', '1');
    f.set('line_items[0][price_data][currency]', 'brl');
    f.set('line_items[0][price_data][unit_amount]', String(product.cents)); // preço sempre calculado aqui
    f.set('line_items[0][price_data][product_data][name]', product.name);
    f.set('line_items[0][price_data][product_data][description]', `MU Online Claude · conta ${acc.username} · ${product.desc}`.slice(0, 480));
    for (const pre of ['metadata', 'payment_intent_data[metadata]']) {
      f.set(`${pre}[game]`, 'aether-shop');
      f.set(`${pre}[acc]`, String(acc.id));
      f.set(`${pre}[item]`, product.item);
      f.set(`${pre}[amt]`, String(product.cents));
    }
    const r = await fetch((process.env.STRIPE_API || 'https://api.stripe.com') + '/v1/checkout/sessions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${STRIPE_KEY()}`, 'Content-Type': 'application/x-www-form-urlencoded', 'Idempotency-Key': crypto.randomUUID() },
      body: f,
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.url) { console.error('[loja] stripe checkout', r.status, j && j.error && j.error.message); throw fail(502, 'Não foi possível abrir o pagamento. Tente de novo.'); }
    return json(res, 200, { ok: true, url: j.url });
  }

  if (p === '/api/stripe-webhook' && req.method === 'POST') {
    const raw = await readRaw(req);
    if (!verifyStripeSig(raw, req.headers['stripe-signature'])) return json(res, 400, { error: 'assinatura inválida' });
    let ev; try { ev = JSON.parse(raw.toString('utf8')); } catch { return json(res, 400, { error: 'json' }); }
    const o = ev.data && ev.data.object;
    if ((ev.type === 'checkout.session.completed' || ev.type === 'checkout.session.async_payment_succeeded') && o && o.payment_status === 'paid') {
      const md = o.metadata || {};
      if (md.game !== 'aether-shop' && md.game !== 'aether-wing') return json(res, 200, { received: true, result: 'outro-produto' });
      const product = productFor(md.game === 'aether-wing' ? `wing:${md.wing}` : md.item);
      const accId = Number(md.acc);
      if (!product || !accId) return json(res, 200, { received: true, result: 'metadados-invalidos' });
      if (String(o.currency).toLowerCase() !== 'brl' || o.amount_total !== product.cents) {
        console.error(`[loja] valor diferente na sessão ${o.id}: ${o.amount_total} ${o.currency}. Nada entregue.`);
        return json(res, 200, { received: true, result: 'valor-diferente' });
      }
      const exists = await db.query('SELECT 1 FROM accounts WHERE id = $1', [accId]);
      if (!exists.rows[0]) return json(res, 200, { received: true, result: 'conta-inexistente' });
      const delivered = await db.tx(async (q) => {
        const ins = await q(`INSERT INTO aether_purchases (account_id, item, ref, amount_cents, currency)
          VALUES ($1, $2, $3, $4, 'brl') ON CONFLICT (ref) DO NOTHING RETURNING id`, [accId, product.item, o.id, o.amount_total]);
        if (!ins.rows[0]) return false;
        if (product.vip) {
          // VIP soma dias: começa do fim do VIP atual (se ainda ativo) ou de agora.
          const col = product.vip.plan === 'diamante' ? 'vip2_until' : 'vip1_until';
          await q(`UPDATE accounts SET ${col} = GREATEST(COALESCE(${col}, now()), now()) + ($2::int * interval '1 day') WHERE id = $1`, [accId, product.vip.days]);
        }
        return true;
      });
      if (delivered) console.log(`[loja] ${product.name} entregue para a conta #${accId} (sessão ${o.id})`);
      return json(res, 200, { received: true, result: delivered ? 'entregue' : 'ja-entregue' });
    }
    return json(res, 200, { received: true });
  }

  if (p === '/api/ranking' && req.method === 'GET') {
    const { rows } = await db.query(`SELECT a.username, s.level, s.data->>'hero' AS hero FROM aether_saves s
      JOIN accounts a ON a.id = s.account_id ORDER BY s.level DESC, s.updated_at ASC LIMIT 20`);
    return json(res, 200, { ok: true, ranking: rows });
  }
  throw fail(404, 'not found');
}

// Números do site (contas criadas / heróis salvos), com cache curto para não pesar no banco.
let statsCache = { at: 0, data: { accounts: null, heroes: null } };
async function accountStats() {
  if (!db) return statsCache.data;
  if (Date.now() - statsCache.at < 30_000) return statsCache.data;
  try {
    const { rows } = await db.query(`SELECT (SELECT count(*) FROM accounts)::int AS accounts,
      (SELECT count(*) FROM aether_saves)::int AS heroes`);
    statsCache = { at: Date.now(), data: rows[0] };
  } catch (e) { console.error('[stats]', e.message); }
  return statsCache.data;
}

// ---------------- Multiplayer: uma sala por mapa ----------------
const rooms = new Map(); // roomId -> Set<client>
const players = () => { let n = 0; for (const r of rooms.values()) n += r.size; return n; };
function parsePosition(text) {
  if (typeof text !== 'string' || text.length > 128) return null;
  let raw; try { raw = JSON.parse(text); } catch { return null; }
  if (!raw || typeof raw !== 'object') return null;
  const { x, y } = raw;
  if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  const c = (v) => Math.max(-1e6, Math.min(1e6, Math.round(v)));
  return { x: c(x), y: c(y) };
}

const server = http.createServer(async (req, res) => {
  let url;
  try { url = new URL(req.url, 'http://local'); } catch { return send(res, 400, 'bad request'); }
  const p = url.pathname;
  try {
    if (p.startsWith('/api/')) return await handleApi(req, res, url);
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'method not allowed');
    if (p === '/health') return json(res, 200, { ok: true });
    // Links antigos (app Android abre /app) caem no jogo novo.
    if (p === '/app' || p === '/game.html' || p === '/app.html' || p === '/jogar' || p === '/jogo') return send(res, 302, null, { Location: '/jogar/' + url.search });
    if (p.startsWith('/download/')) {
      const f = safeJoin(DOWNLOADS, p.slice('/download'.length));
      return f ? serveFile(req, res, f, 'public, max-age=3600') : send(res, 404, 'not found');
    }
    // Jogo em /jogar/
    if (p === '/jogar/' || p === '/jogar/index.html') return serveFile(req, res, path.join(ROOT, 'index.html'), 'no-cache');
    if (p.startsWith('/jogar/')) {
      const sub = p.slice('/jogar'.length);
      const f = safeJoin(ROOT, sub);
      if (!f) return send(res, 404, 'not found');
      const hashed = /^\/assets\/index-[A-Za-z0-9_-]+\.(js|css)$/.test(sub);
      return serveFile(req, res, f, hashed ? 'public, max-age=31536000, immutable' : 'public, max-age=3600');
    }
    // Site em /
    if (p === '/' || p === '/index.html') return serveFile(req, res, path.join(SITE, 'index.html'), 'no-cache');
    const f = safeJoin(SITE, p);
    if (!f) return send(res, 404, 'not found');
    return serveFile(req, res, f, 'no-cache');
  } catch (e) {
    const status = e.status || 500;
    if (status >= 500) console.error('[erro]', req.method, p, e);
    if (!res.headersSent) json(res, status, { ok: false, error: status >= 500 && status !== 503 ? 'Erro no servidor.' : e.message });
  }
});

// O WSServer antigo aceita um caminho fixo; aqui cada sala é /room/<id>.
const wss = new WSServer(server, {
  path: null,
  authenticate: async (req) => {
    const m = /^\/room\/([^/?#]{1,80})$/.exec(new URL(req.url, 'http://x').pathname);
    if (!m) throw new Error('sala inválida');
    return { room: decodeURIComponent(m[1]).slice(0, 80), id: sec.randomToken(9), pos: null, win: { start: 0, n: 0 } };
  },
});
wss.on('connection', (client) => {
  const meta = client.meta;
  let room = rooms.get(meta.room);
  if (!room) rooms.set(meta.room, (room = new Set()));
  const others = [...room].filter((c) => c.meta.pos).map((c) => ({ id: c.meta.id, pos: c.meta.pos }));
  room.add(client);
  client.send({ type: 'snapshot', you: meta.id, players: others });
  client.on('message', (text) => {
    const now = Date.now();
    if (now - meta.win.start >= 1000) { meta.win.start = now; meta.win.n = 0; }
    if (++meta.win.n > 30) return;
    const pos = parsePosition(text);
    if (!pos) return;
    meta.pos = pos;
    const out = Buffer.from(JSON.stringify({ type: 'move', id: meta.id, pos }));
    for (const peer of room) if (peer !== client) peer._send(0x1, out);
  });
  client.on('close', () => {
    room.delete(client);
    const out = Buffer.from(JSON.stringify({ type: 'leave', id: meta.id }));
    for (const peer of room) peer._send(0x1, out);
    if (!room.size) rooms.delete(meta.room);
  });
});

migrate()
  .catch((e) => console.error('[db] falha na migração (o jogo continua sem nuvem):', e.message))
  .finally(() => {
    if (!fs.existsSync(path.join(ROOT, 'index.html'))) console.error('[jogo] build não encontrado em', ROOT, '— rode npm run build');
    server.listen(PORT, () => {
      console.log(`[servidor] Aether Reborn na porta ${PORT}`);
      console.log(`[loja] pagamento com dinheiro real: ${payEnabled() ? (/^(sk|rk)_test_/.test(STRIPE_KEY()) ? 'ATIVO (modo teste)' : 'ATIVO') : 'DESLIGADO — falta STRIPE_SECRET_KEY e/ou STRIPE_WEBHOOK_SECRET na Render'}`);
    });
  });
