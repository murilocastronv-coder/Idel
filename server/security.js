'use strict';
const crypto = require('crypto');

// ---- Senhas: scrypt (memória-intensivo) com sal aleatório ----
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

function scryptAsync(password, salt, opts) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, opts.keylen, { N: opts.N, r: opts.r, p: opts.p, maxmem: 64 * 1024 * 1024 },
      (err, key) => (err ? reject(err) : resolve(key)));
  });
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scryptAsync(password.normalize('NFKC'), salt, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${key.toString('base64')}`;
}

async function verifyPassword(password, stored) {
  if (!stored || typeof stored !== 'string') return false;
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, N, r, p, saltB64, keyB64] = parts;
  const expected = Buffer.from(keyB64, 'base64');
  const key = await scryptAsync(password.normalize('NFKC'), Buffer.from(saltB64, 'base64'),
    { N: Number(N), r: Number(r), p: Number(p), keylen: expected.length });
  return key.length === expected.length && crypto.timingSafeEqual(key, expected);
}

// Hash fixo usado para gastar o mesmo tempo quando a conta não existe.
let dummyHash = null;
async function burnTime(password) {
  if (!dummyHash) dummyHash = await hashPassword('dummy-password-for-timing');
  await verifyPassword(password || 'x', dummyHash);
}

// ---- Tokens ----
function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}
function sha256(s) {
  return crypto.createHash('sha256').update(String(s)).digest('hex');
}
// Código de recuperação legível: XXXX-XXXX-XXXX-XXXX (sem caracteres ambíguos)
function recoveryCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(16);
  let out = '';
  for (let i = 0; i < 16; i++) {
    out += alphabet[bytes[i] % alphabet.length];
    if (i % 4 === 3 && i < 15) out += '-';
  }
  return out;
}
function normalizeRecoveryCode(code) {
  const c = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return c.length === 16 ? c.match(/.{4}/g).join('-') : null;
}

// ---- Rate limiting em memória (janela deslizante simples) ----
const buckets = new Map();
function rateLimit(key, max, windowMs) {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || now > b.reset) {
    b = { count: 0, reset: now + windowMs };
    buckets.set(key, b);
  }
  b.count++;
  return { ok: b.count <= max, retryAfter: Math.ceil((b.reset - now) / 1000) };
}
setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets) if (now > b.reset) buckets.delete(k);
}, 60_000).unref();

// ---- Validação ----
const USERNAME_RE = /^[A-Za-z0-9_]{4,16}$/;
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;
const CHARNAME_RE = /^[A-Za-z0-9]{3,12}$/;

function validatePassword(pw) {
  if (typeof pw !== 'string') return 'Senha inválida.';
  if (pw.length < 8) return 'A senha precisa ter pelo menos 8 caracteres.';
  if (pw.length > 128) return 'A senha pode ter no máximo 128 caracteres.';
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) return 'Use letras e números na senha.';
  return null;
}

module.exports = {
  hashPassword, verifyPassword, burnTime, randomToken, sha256,
  recoveryCode, normalizeRecoveryCode, rateLimit,
  USERNAME_RE, EMAIL_RE, CHARNAME_RE, validatePassword,
};
