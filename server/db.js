'use strict';
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

function sslOption() {
  const url = process.env.DATABASE_URL || '';
  if (process.env.PGSSL === 'false') return false;
  if (process.env.PGSSL === 'true') return { rejectUnauthorized: false };
  // URL externa da Render exige SSL; a interna (sem domínio) não.
  if (/\.render\.com/.test(url)) return { rejectUnauthorized: false };
  return false;
}

if (!process.env.DATABASE_URL) {
  console.error('[db] DATABASE_URL não definida. Configure a variável de ambiente.');
  process.exit(1);
}

// Schema próprio do jogo: permite dividir um banco com outros projetos sem conflito.
const SCHEMA = process.env.PG_SCHEMA || 'public';
if (!/^[a-z_][a-z0-9_]{0,62}$/.test(SCHEMA)) {
  console.error('[db] PG_SCHEMA inválido. Use letras minúsculas, números e _.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: sslOption(),
  options: `-c search_path=${SCHEMA}`,
  max: Number(process.env.PG_POOL_MAX || 10),
  idleTimeoutMillis: 30000,
});

pool.on('error', (err) => console.error('[db] erro no pool:', err.message));

async function query(text, params) {
  return pool.query(text, params);
}

async function migrate() {
  if (SCHEMA !== 'public') await pool.query(`CREATE SCHEMA IF NOT EXISTS ${SCHEMA}`);
  console.log(`[db] usando o schema "${SCHEMA}"`);
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  const dir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  const { rows } = await pool.query('SELECT name FROM schema_migrations');
  const done = new Set(rows.map((r) => r.name));
  for (const file of files) {
    if (done.has(file)) continue;
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    const safeName = file.replace(/'/g, "''");
    console.log(`[db] aplicando migração ${file}`);
    await pool.query(`BEGIN;\n${sql}\nINSERT INTO schema_migrations (name) VALUES ('${safeName}');\nCOMMIT;`);
  }
}

module.exports = { pool, query, migrate };
