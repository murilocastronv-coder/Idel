'use strict';
// Painel de retenção do ADM: números reais tirados do banco (contas, dias ativos, sessões, eventos, guildas, VIP).
// Retenção por coorte de cadastro: das contas criadas no dia C, quantas jogaram no dia C+1 (D1), C+7 (D7) e C+30 (D30).
// "Jogou" = esteve dentro do mundo naquele dia (game_activity_days, amostrado a cada minuto pelo servidor).
const db = require('./db');
const SET = require('./settings');

const TZ = process.env.GAME_TZ || 'America/Sao_Paulo';
const GOALS_KEY = 'retention_goals';
const GOALS_DEFAULT = { d1: 35, d7: 15, d30: 7 };
const goals = () => SET.get(GOALS_KEY, GOALS_DEFAULT);

async function init() { await SET.load(GOALS_KEY, GOALS_DEFAULT); }

// ---------- sessões e eventos (chamados pelo mundo) ----------
async function sessionStart(p) {
  try {
    const r = await db.query('INSERT INTO play_sessions (account_id, character_id) VALUES ($1, $2) RETURNING id', [p.accountId, p.charId]);
    p.sessionId = r.rows[0].id;
  } catch (e) { console.error('[retenção] sessão', e.message); }
}
function sessionEnd(p) {
  if (!p.sessionId) return;
  const id = p.sessionId; p.sessionId = null;
  db.query('UPDATE play_sessions SET ended_at = now() WHERE id = $1 AND ended_at IS NULL RETURNING id', [id]).catch(() => {});
}
// fecha sessões que ficaram abertas por um reinício do servidor (conta até a última amostra de atividade)
async function closeStale() {
  await db.query(`UPDATE play_sessions SET ended_at = LEAST(now(), started_at + interval '12 hours')
    WHERE ended_at IS NULL AND started_at < now() - interval '1 minute' RETURNING id`).catch(() => {});
}
let hook = null;
function setHook(fn) { hook = fn; }
function event(p, name) {
  if (!p || !p.charId) return;
  if (hook) { try { hook(p, name); } catch (e) { console.error('[retenção] gancho', e.message); } }
  db.query('INSERT INTO event_log (event, account_id, character_id) VALUES ($1, $2, $3) RETURNING id', [name, p.accountId || null, p.charId]).catch(() => {});
}

// ---------- números do painel ----------
const pct = (a, b) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);
async function view(world) {
  const q = async (sql, params = [TZ]) => (await db.query(sql, params)).rows;
  const [t] = await q(`SELECT
      (SELECT count(*) FROM accounts)::int AS accounts,
      (SELECT count(*) FROM accounts WHERE (created_at AT TIME ZONE $1)::date = (now() AT TIME ZONE $1)::date)::int AS accounts_today,
      (SELECT count(*) FROM accounts WHERE created_at > now() - interval '7 days')::int AS accounts_7d,
      (SELECT count(*) FROM accounts WHERE created_at > now() - interval '30 days')::int AS accounts_30d,
      (SELECT count(*) FROM game_activity_days WHERE day = (now() AT TIME ZONE $1)::date)::int AS dau,
      (SELECT count(DISTINCT account_id) FROM game_activity_days WHERE day > (now() AT TIME ZONE $1)::date - 7)::int AS wau,
      (SELECT count(DISTINCT account_id) FROM game_activity_days WHERE day > (now() AT TIME ZONE $1)::date - 30)::int AS mau,
      (SELECT count(*) FROM accounts WHERE vip1_until > now() OR vip2_until > now())::int AS vip_paid,
      (SELECT count(*) FROM accounts WHERE vip0_until > now() AND NOT (vip1_until > now() OR vip2_until > now()))::int AS vip_free,
      (SELECT count(DISTINCT account_id) FROM payments WHERE provider = 'stripe' AND status = 'paid' AND account_id IS NOT NULL)::int AS payers_vip,
      (SELECT count(DISTINCT account_id) FROM premium_orders WHERE amount_cents > 0)::int AS payers_shop,
      (SELECT count(DISTINCT account_id) FROM (SELECT account_id FROM payments WHERE provider = 'stripe' AND status = 'paid' AND account_id IS NOT NULL
         UNION SELECT account_id FROM premium_orders WHERE amount_cents > 0) x)::int AS payers_any`);
  // sessões dos últimos 7 dias (minutos)
  const [s] = await q(`SELECT count(*)::int AS n,
      coalesce(avg(EXTRACT(EPOCH FROM (COALESCE(ended_at, now()) - started_at)) / 60), 0)::float AS avg_min,
      coalesce(percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (COALESCE(ended_at, now()) - started_at)) / 60), 0)::float AS med_min
    FROM play_sessions WHERE started_at > now() - interval '7 days' AND COALESCE(ended_at, now()) - started_at > interval '10 seconds'`, []);
  // voltaram: jogaram nos últimos 7 dias, ficaram 7+ dias sem jogar antes disso e já tinham jogado antes
  const [ret] = await q(`WITH recent AS (SELECT account_id, min(day) AS back FROM game_activity_days WHERE day > (now() AT TIME ZONE $1)::date - 7 GROUP BY account_id)
    SELECT count(*)::int AS returned FROM recent r
    WHERE EXISTS (SELECT 1 FROM game_activity_days g WHERE g.account_id = r.account_id AND g.day < r.back)
      AND NOT EXISTS (SELECT 1 FROM game_activity_days g WHERE g.account_id = r.account_id AND g.day < r.back AND g.day >= r.back - 7)`);
  // abandonaram: jogaram entre 8 e 37 dias atrás e não jogaram mais nos últimos 7 dias
  const [ab] = await q(`SELECT count(DISTINCT account_id)::int AS gone FROM game_activity_days g
    WHERE g.day <= (now() AT TIME ZONE $1)::date - 7 AND g.day > (now() AT TIME ZONE $1)::date - 37
      AND NOT EXISTS (SELECT 1 FROM game_activity_days x WHERE x.account_id = g.account_id AND x.day > (now() AT TIME ZONE $1)::date - 7)`);
  // retenção por coorte (últimos 45 dias de cadastro); só conta coortes que já passaram do dia medido
  const cohorts = await q(`WITH c AS (
      SELECT id, (created_at AT TIME ZONE $1)::date AS day FROM accounts WHERE created_at > now() - interval '45 days')
    SELECT to_char(c.day, 'YYYY-MM-DD') AS day, count(*)::int AS size,
      count(*) FILTER (WHERE EXISTS (SELECT 1 FROM game_activity_days g WHERE g.account_id = c.id AND g.day = c.day + 1))::int AS d1,
      count(*) FILTER (WHERE EXISTS (SELECT 1 FROM game_activity_days g WHERE g.account_id = c.id AND g.day = c.day + 7))::int AS d7,
      count(*) FILTER (WHERE EXISTS (SELECT 1 FROM game_activity_days g WHERE g.account_id = c.id AND g.day = c.day + 30))::int AS d30,
      ((now() AT TIME ZONE $1)::date - c.day)::int AS age
    FROM c GROUP BY c.day ORDER BY c.day DESC`);
  const agg = (n) => { const ok = cohorts.filter((c) => c.age > n); const size = ok.reduce((a, c) => a + c.size, 0); return { pct: pct(ok.reduce((a, c) => a + c['d' + n], 0), size), base: size }; };
  const daily = await q(`WITH days AS (SELECT generate_series((now() AT TIME ZONE $1)::date - 29, (now() AT TIME ZONE $1)::date, interval '1 day')::date AS day)
    SELECT to_char(d.day, 'MM-DD') AS day,
      (SELECT count(*) FROM game_activity_days x WHERE x.day = d.day)::int AS dau,
      (SELECT count(*) FROM accounts a WHERE (a.created_at AT TIME ZONE $1)::date = d.day)::int AS new,
      (SELECT count(DISTINCT e.character_id) FROM event_log e WHERE (e.created_at AT TIME ZONE $1)::date = d.day)::int AS events
    FROM days d ORDER BY d.day`);
  const events = await q(`SELECT event, count(*)::int AS n, count(DISTINCT character_id)::int AS players FROM event_log
    WHERE created_at > now() - interval '7 days' GROUP BY event ORDER BY n DESC`, []);
  const [g] = await q(`SELECT count(*)::int AS total,
      count(*) FILTER (WHERE EXISTS (SELECT 1 FROM guild_members m JOIN characters c ON c.id = m.character_id
        WHERE m.guild_id = g.id AND c.last_seen_at > now() - interval '7 days'))::int AS active
    FROM guilds g`, []);
  return {
    ok: true, generatedAt: Date.now(), tz: TZ, goals: goals(),
    accounts: { total: t.accounts, today: t.accounts_today, d7: t.accounts_7d, d30: t.accounts_30d },
    online: world ? world.players.size : 0,
    active: { dau: t.dau, wau: t.wau, mau: t.mau, stickiness: pct(t.dau, t.mau) },
    retention: { d1: agg(1), d7: agg(7), d30: agg(30) },
    cohorts: cohorts.slice(0, 21),
    sessions: { count: s.n, avgMin: Math.round(s.avg_min * 10) / 10, medianMin: Math.round(s.med_min * 10) / 10 },
    returned: ret.returned, abandoned: ab.gone,
    events, guilds: { total: g.total, active: g.active },
    vip: { paid: t.vip_paid, free: t.vip_free, payersVip: t.payers_vip, payersShop: t.payers_shop, payersAny: t.payers_any, conversion: pct(t.payers_any, t.accounts) },
    daily,
  };
}
async function saveGoals(input) {
  const n = (v, label) => { const x = Number(v); if (!Number.isFinite(x) || x < 0 || x > 100) throw new Error(`${label}: use de 0 a 100.`); return Math.round(x * 10) / 10; };
  const v = { d1: n(input.d1, 'Meta D1'), d7: n(input.d7, 'Meta D7'), d30: n(input.d30, 'Meta D30') };
  await SET.save(GOALS_KEY, v);
  return v;
}

module.exports = { init, sessionStart, sessionEnd, closeStale, event, setHook, view, saveGoals };
