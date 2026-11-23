'use strict';
// WIPE TOTAL (servidor novo): todas as contas são apagadas e todo mundo cria conta de novo para jogar.
// Sai: contas, sessões, personagens, itens, baús, guildas, amigos, mercado, VIPs, afiliados, temporadas,
// rankings (nível, poder, bosses, PvP, temporada, Boss Mundial, eventos e guildas) e os registros de jogo.
// Fica: configurações do jogo (EXP, drops, eventos, preços), notícias, histórico de pagamentos e auditoria
// (sem a conta), e o histórico de jogadores online da página de status.
//
// Antes de apagar, as tabelas das contas são copiadas para o schema "<schema>_bkp_wipe2" (dá para consultar
// ou restaurar à mão). Se a cópia falhar, nada é apagado e o servidor liga normalmente (tenta de novo no
// próximo início).
//
// Roda uma vez ao ligar o servidor (marcado em game_settings). Durante o deploy a instância antiga ainda pode
// gravar registros de personagens que já saíram; por isso uma 2ª passada, 5 minutos depois, apaga o que
// sobrou apontando para personagens/contas que não existem mais (os ids não recomeçam do 1, então não há mistura).
const db = require('./db');

const KEY = 'wipe_total_2';
// não são de jogador: ficam como estão
const KEEP = new Set(['schema_migrations', 'game_settings', 'drop_rules', 'item_rules', 'drop_events', 'news',
  'invasions', 'stats_samples', 'payments', 'audit_log', 'admin_log']);
// copiadas antes do wipe (o resto são registros/logs de jogo)
const BACKUP = ['accounts', 'characters', 'items', 'vaults', 'vault_log', 'guilds', 'guild_members', 'friends',
  'market_listings', 'market_ledger', 'market_wallets', 'market_sellers', 'market_disputes', 'premium_orders',
  'referrals', 'class_evolutions', 'season_points', 'season_results'];

const ident = (s) => '"' + String(s).replace(/"/g, '""') + '"';

async function done() {
  return (await db.query('SELECT value FROM game_settings WHERE key = $1', [KEY])).rows[0];
}
async function mark(value) {
  await db.query(`INSERT INTO game_settings (key, value, updated_at) VALUES ($1, $2, now())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now() RETURNING key`, [KEY, JSON.stringify(value)]);
}

async function tablesOf(q, schema) {
  return (await q('SELECT tablename FROM pg_tables WHERE schemaname = $1 ORDER BY tablename', [schema])).rows.map((r) => r.tablename);
}

async function wipeAll() {
  const client = await db.pool.connect();
  try {
    const q = (t, p) => client.query(t, p);
    const schema = (await q('SELECT current_schema() AS s')).rows[0].s;
    const all = await tablesOf(q, schema);
    const bkp = `${schema}_bkp_wipe2`;
    const counts = {};
    for (const t of ['accounts', 'characters', 'items']) if (all.includes(t)) counts[t] = (await q(`SELECT count(*)::int AS n FROM ${ident(t)}`)).rows[0].n;

    await q('BEGIN');
    // 1) cópia de segurança
    await q(`CREATE SCHEMA IF NOT EXISTS ${ident(bkp)}`);
    for (const t of BACKUP) {
      if (!all.includes(t)) continue;
      await q(`DROP TABLE IF EXISTS ${ident(bkp)}.${ident(t)}`);
      await q(`CREATE TABLE ${ident(bkp)}.${ident(t)} AS TABLE ${ident(schema)}.${ident(t)}`);
    }
    // 2) tudo que é de jogador (sem recomeçar os ids)
    const wipe = all.filter((t) => !KEEP.has(t) && t !== 'accounts');
    if (wipe.length) await q(`TRUNCATE ${wipe.map((t) => `${ident(schema)}.${ident(t)}`).join(', ')}`);
    // contas por último: pagamentos e auditoria ficam, só perdem o vínculo (ON DELETE SET NULL)
    await q('DELETE FROM accounts');
    // 3) configurações ligadas a personagens
    await q(`UPDATE game_settings SET value = '{"names": []}'::jsonb, updated_at = now() WHERE key = 'gm_chars'`);
    await q(`INSERT INTO news (kind, title, body) VALUES ('update', 'Servidor novo: wipe total!',
      'Todas as contas foram apagadas e o ranking começou do zero. Crie sua conta nova, escolha a classe e deixe o herói caçando sozinho na tela idle. O visual do jogo também foi renovado: cenários novos em cada mapa, céu com dia e noite, iluminação e efeitos.')`);
    await q(`INSERT INTO game_settings (key, value, updated_at) VALUES ($1, $2, now())
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [KEY, JSON.stringify({ at: new Date().toISOString(), backup: bkp, ...counts })]);
    await q('COMMIT');
    return { bkp, counts };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally { client.release(); }
}

async function run() {
  const st = await done();
  if (!st) {
    try {
      const r = await wipeAll();
      console.log(`[wipe] WIPE TOTAL: ${r.counts.accounts || 0} contas, ${r.counts.characters || 0} personagens e ${r.counts.items || 0} itens apagados (cópia em ${r.bkp})`);
    } catch (e) {
      console.error('[wipe] WIPE TOTAL não foi feito (nada foi apagado; tenta de novo no próximo início):', e.message);
      return;
    }
  }
  const cur = await done();
  if (cur && cur.value && cur.value.sweep) return;
  // 2ª passada, depois que a instância antiga já saiu
  setTimeout(() => sweep().catch((e) => console.error('[wipe] 2ª passada:', e.message)), 5 * 60 * 1000).unref();
}

// apaga registros que a instância antiga gravou para personagens/contas apagados
async function sweep() {
  const st = await done();
  if (!st || (st.value && st.value.sweep)) return;
  const schema = (await db.query('SELECT current_schema() AS s')).rows[0].s;
  const cols = (await db.query(`SELECT table_name, column_name FROM information_schema.columns
    WHERE table_schema = $1 AND column_name IN ('character_id', 'account_id')`, [schema])).rows;
  let n = 0;
  for (const { table_name: t, column_name: c } of cols) {
    if (KEEP.has(t) || t === 'characters' || t === 'accounts') continue;
    const ref = c === 'character_id' ? 'characters' : 'accounts';
    const r = await db.query(`DELETE FROM ${ident(t)} x WHERE x.${ident(c)} IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM ${ref} r WHERE r.id = x.${ident(c)})`);
    n += r.rowCount || 0;
  }
  await mark({ ...st.value, sweep: new Date().toISOString(), sweepRows: n });
  if (n) console.log(`[wipe] 2ª passada: ${n} registros de contas apagadas foram removidos`);
}

// o wipe total não precisa conferir ninguém na entrada (todos os personagens são novos)
async function onJoin() { return false; }

module.exports = { run, sweep, onJoin };
