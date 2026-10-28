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
const game = require('./gamedata');
const { WSServer } = require('./ws');
const { World } = require('./world');

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
    "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src https://fonts.gstatic.com", "img-src 'self' data:", "connect-src 'self' ws: wss:",
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
  const { rows } = await db.query(`SELECT a.id, a.username, a.email, a.created_at, a.last_login_at, a.is_admin
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

route('GET', '/api/gamedata', async () => ({
  classes: game.CLASSES, maps: game.MAPS, rarities: game.RARITIES, items: game.ITEMS, limits: game.LIMITS,
  world: Object.entries(game.WORLD).map(([id, w]) => ({ id, name: w.name, theme: w.theme, minLevel: w.minLevel, safe: !!w.safe,
    monsters: [...w.groups.map((g) => game.MONSTERS[g.type].name), ...(w.boss ? [game.MONSTERS[w.boss.type].name + ' (boss)'] : [])] })),
  shop: game.SHOP, sets: game.SETS,
}));

route('GET', '/api/news', async () => {
  const { rows } = await db.query('SELECT id, kind, title, body, published_at FROM news ORDER BY published_at DESC LIMIT 10');
  return { news: rows };
});

route('GET', '/api/ranking', async (req, url) => {
  const orders = {
    level: 'level DESC, exp DESC, resets DESC',
    resets: 'resets DESC, level DESC, exp DESC',
    power: 'combat_power DESC, level DESC',
    bosses: 'bosses_killed DESC, level DESC',
  };
  const by = orders[url.searchParams.get('by')] ? url.searchParams.get('by') : 'resets';
  const { rows } = await db.query(`SELECT name, class, level, resets, combat_power, bosses_killed
    FROM characters ORDER BY ${orders[by]}, id ASC LIMIT 50`);
  return { by, ranking: rows };
});

route('GET', '/api/me', async (req) => {
  const acc = await sessionAccount(req);
  if (!acc) return { account: null, characters: [] };
  const { rows } = await db.query(`SELECT id, name, class, appearance, level, resets, zen, str, agi, vit, ene, cmd,
    free_points, map, combat_power, created_at FROM characters WHERE account_id = $1 ORDER BY id`, [acc.id]);
  return { account: { username: acc.username, email: maskEmail(acc.email), createdAt: acc.created_at, lastLoginAt: acc.last_login_at }, characters: rows };
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
  await db.query('DELETE FROM characters WHERE id = $1 AND account_id = $2 RETURNING id', [id, acc.id]);
  await audit(acc.id, 'character_deleted', req, { name: rows[0].name });
  await refreshCounts(); pushStats();
  return { ok: true };
});

// ---------------- arquivos estáticos ----------------
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json', '.txt': 'text/plain; charset=utf-8',
};
function serveStatic(req, res, pathname) {
  let rel;
  try { rel = decodeURIComponent(pathname); } catch (_) { rel = '/'; }
  if (rel === '/' || rel === '') rel = '/index.html';
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
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': st.size,
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
    return serveStatic(req, res, url.pathname);
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
  world = new World();
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
