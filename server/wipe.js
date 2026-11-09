'use strict';
// Servidor IDLE novo (wipe 1): todo mundo volta ao nível 1.
// Fica: contas, personagens (nome, classe, aparência), VIPs, saldo/compras do mercado em dinheiro real, pedidos da loja,
// amigos e guildas (sem os pontos), e os itens comprados com dinheiro real: conjuntos da loja (festive_*), Fenrir Dourado,
// Boxes Kundun +4 a +7 e o prêmio de afiliado. Sai: nível, EXP, resets, atributos (voltam ao base + 1.000 pontos), Zen,
// missões, contadores do ranking e os demais itens.
//
// Roda uma vez ao ligar o servidor (marcado em game_settings). Durante o deploy a instância antiga ainda pode gravar
// personagens que estavam online nela; por isso: (1) quem entra no jogo é conferido de novo (wipe_gen < 2) e
// (2) 5 minutos depois uma segunda passada refaz quem ainda estiver com nível alto.
const db = require('./db');
const G = require('./gamedata');

const KEY = 'wipe_idle_1';
const START_POINTS = 1000;
const KEEP_ITEM = `(i.base ~ '^festive_' OR i.base IN ('fenrir_gold','kundun_4','kundun_5','kundun_6','kundun_7')
  OR EXISTS (SELECT 1 FROM referrals r WHERE r.reward_char_id = i.character_id AND r.reward_item = i.base AND i.plus = 8))`;
// nível que ninguém alcança em poucos minutos depois do wipe: acima disso o personagem foi regravado pela instância antiga
const SAFE_LEVEL = 15;

// zera um conjunto de personagens (where = condição SQL sobre "c", args = parâmetros)
async function wipeChars(where, args = [], gen = 2) {
  const ids = (await db.query(`SELECT c.id FROM characters c WHERE ${where}`, args)).rows.map((r) => r.id);
  if (!ids.length) return 0;
  const list = ids.join(',');
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    for (const [cls, def] of Object.entries(G.CLASSES)) {
      const b = def.base || {};
      const power = ((b.str || 0) + (b.agi || 0) + (b.vit || 0) + (b.ene || 0) + (b.cmd || 0)) * 10;
      await client.query(`UPDATE characters SET level = 1, exp = 0, resets = 0, master_resets = 0, bonus_points = 0,
          str = $2, agi = $3, vit = $4, ene = $5, cmd = $6, free_points = ${START_POINTS}, points_fix = 1, combat_power = $7,
          zen = 1000, map = 'lorencia', pos_x = 0, pos_y = 0, hp = 0, mp = 0, pot_hp = 0, pot_mp = 0,
          kills = 0, deaths = 0, bosses_killed = 0, pvp_kills = 0, pvp_deaths = 0, duel_wins = 0, duel_losses = 0, pk_count = 0,
          quests = '{}'::jsonb, last_farm_map = NULL, auto_on = FALSE, starter_given = FALSE, evo = 0, class_quest = NULL,
          free_stat_reset_used = FALSE, settings = jsonb_set(COALESCE(settings, '{}'::jsonb), '{pvpOn}', 'false'::jsonb, true),
          last_seen_at = now(), wipe_gen = ${gen === 1 ? 1 : 2}
        WHERE class = $1 AND id = ANY(string_to_array($8, ',')::bigint[])`,
      [cls, b.str || 0, b.agi || 0, b.vit || 0, b.ene || 0, b.cmd || 0, power, list]);
    }
    await client.query(`DELETE FROM items i WHERE i.character_id = ANY(string_to_array($1, ',')::bigint[]) AND NOT ${KEEP_ITEM}`, [list]);
    // os itens que ficam vão para a bolsa (o nível exigido volta a valer)
    await client.query('UPDATE items SET equipped = FALSE, eq_slot = NULL WHERE character_id = ANY(string_to_array($1, \',\')::bigint[]) AND equipped', [list]);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally { client.release(); }
  return ids.length;
}

async function done() {
  return (await db.query('SELECT value FROM game_settings WHERE key = $1', [KEY])).rows[0];
}
async function mark(value) {
  await db.query(`INSERT INTO game_settings (key, value, updated_at) VALUES ($1, $2, now())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now() RETURNING key`, [KEY, JSON.stringify(value)]);
}

// 1ª passada: todo mundo + rankings
async function run(world) {
  const st = await done();
  if (st && st.value && st.value.sweep) return;
  if (!st) {
    const n = await wipeChars('TRUE', [], 1);
    await db.query('DELETE FROM season_points');
    await db.query('DELETE FROM event_log');
    await db.query('UPDATE guilds SET points = 0, wins = 0, losses = 0, draws = 0, zen_fund = 0');
    await db.query("UPDATE guild_members SET contribution = 0, zen_donated = 0, missions = '{}'::jsonb");
    // anúncios do mercado em Zen: o item já saiu no wipe e o Zen não é pago (os do mercado em dinheiro real continuam)
    await db.query("UPDATE market_listings SET status = CASE WHEN status = 'active' THEN 'cancelled' ELSE status END, collected = TRUE, closed_at = COALESCE(closed_at, now()) WHERE COALESCE(currency, 'zen') = 'zen' AND (status = 'active' OR NOT collected)");
    await mark({ at: new Date().toISOString(), chars: n });
    console.log(`[wipe] servidor idle: ${n} personagens voltaram ao nível 1 (VIPs e itens da loja mantidos)`);
  }
  // 2ª passada, depois que a instância antiga já saiu
  setTimeout(() => sweep(typeof world === 'function' ? world() : world).catch((e) => console.error('[wipe] 2ª passada:', e.message)), 5 * 60 * 1000).unref();
}

async function sweep(world) {
  const st = await done();
  if (!st || (st.value && st.value.sweep)) return;
  const online = world ? [...world.players.keys()].join(',') : '';
  const n = await wipeChars(`(c.level > ${SAFE_LEVEL} OR c.resets > 0 OR c.master_resets > 0) AND NOT (c.id = ANY(string_to_array($1, ',')::bigint[]))`, [online]);
  await mark({ ...st.value, sweep: new Date().toISOString(), sweepChars: n });
  if (n) console.log(`[wipe] 2ª passada: ${n} personagens regravados pela instância antiga voltaram ao nível 1`);
}

// conferência na entrada do jogo (antes de carregar a ficha): personagem ainda não conferido e com progresso de antes do wipe
async function onJoin(charId) {
  const row = (await db.query('SELECT id, level, resets, master_resets, wipe_gen FROM characters WHERE id = $1', [charId])).rows[0];
  if (!row || Number(row.wipe_gen) >= 2) return false;
  const st = await done();
  if (!st) return false;
  const old = Number(row.level) > SAFE_LEVEL || Number(row.resets) > 0 || Number(row.master_resets) > 0;
  if (old) await wipeChars('c.id = $1', [row.id]);
  else await db.query('UPDATE characters SET wipe_gen = 2 WHERE id = $1 RETURNING id', [row.id]);
  return old;
}

module.exports = { run, sweep, onJoin, wipeChars };
