'use strict';
try { require('fs').readFileSync('.env', 'utf8').split('\n').forEach((l) => { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, ''); }); } catch (_) {}
const db = require('./db');
db.migrate().then(() => { console.log('Migrações aplicadas.'); return db.pool.end(); })
  .catch((e) => { console.error(e); process.exit(1); });
