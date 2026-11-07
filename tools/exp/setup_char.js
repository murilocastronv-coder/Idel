'use strict';
// Prepara um personagem de teste (banco local) com os atributos da simulação: nível, pontos distribuídos, mapa e AUTO ligado.
// Uso: DATABASE_URL=... PG_SCHEMA=... node tools/exp/setup_char.js <charId> <nível> <mapa>
const S = require('./sim');
const db = require('../../server/db');
(async () => {
  const [id, lv, map] = process.argv.slice(2);
  const { rows } = await db.query('SELECT class FROM characters WHERE id = $1', [id]);
  const p = S.player(rows[0].class, Number(lv), 'basic', null);
  await db.query(`UPDATE characters SET level = $2, exp = 0, str = $3, agi = $4, vit = $5, ene = $6, cmd = $7, free_points = 0,
    map = $8, last_farm_map = $8, pos_x = 0, pos_y = 0, auto_on = true, pot_hp = 500, pot_mp = 500 WHERE id = $1`,
  [id, lv, p.stats.str, p.stats.agi, p.stats.vit, p.stats.ene, p.stats.cmd, map]);
  console.log(JSON.stringify({ cls: rows[0].class, level: Number(lv), stats: p.stats, simDmg: [p.dmgMin, p.dmgMax], simAtkMs: p.atkMs }));
  process.exit(0);
})();
