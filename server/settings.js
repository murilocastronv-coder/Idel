'use strict';
// Configurações editáveis pelo painel de administração (tabela game_settings), com cache em memória.
const db = require('./db');

const cache = new Map();

function merge(def, val) {
  if (Array.isArray(def) || typeof def !== 'object' || def === null) return val === undefined ? def : val;
  const out = { ...def };
  if (val && typeof val === 'object' && !Array.isArray(val)) for (const k of Object.keys(val)) out[k] = merge(def[k], val[k]);
  return out;
}

// lê do banco uma vez; os valores salvos são mesclados com os padrões (campos novos ganham o valor padrão)
async function load(key, defaults) {
  try {
    const { rows } = await db.query('SELECT value FROM game_settings WHERE key = $1', [key]);
    cache.set(key, merge(defaults, rows[0] ? rows[0].value : undefined));
  } catch (e) {
    console.error('[settings]', key, e.message);
    cache.set(key, merge(defaults, undefined));
  }
  return cache.get(key);
}

function get(key, defaults) {
  if (!cache.has(key)) cache.set(key, merge(defaults, undefined));
  return cache.get(key);
}

async function save(key, value) {
  await db.query(`INSERT INTO game_settings (key, value, updated_at) VALUES ($1, $2, now())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now() RETURNING key`, [key, JSON.stringify(value)]);
  cache.set(key, value);
  return value;
}

module.exports = { load, get, save, merge };
