'use strict';
// Progressão de longo prazo: títulos (cosméticos), livro de coleções e temporadas de 30 dias.
// Tudo fica no servidor. Títulos e coleções vão no JSON de missões do herói (p.quests), salvo junto com o personagem.
// Temporada: pontos por atividade (com teto diário por tipo, contra farm/abuso), ranking sazonal e títulos no fim.
// A temporada nunca mexe em nível, resets, itens ou inventário: só zera os pontos/ranking sazonais.
const db = require('./db');
const G = require('./gamedata');

let W = null;
const TZ = process.env.GAME_TZ || 'America/Sao_Paulo';
const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const today = () => dayFmt.format(new Date());

// ---------------- títulos ----------------
const TITLES = {
  exterminador: { name: 'Exterminador', color: '#ff9c52', how: 'Derrote 10.000 monstros' },
  cacador: { name: 'Caçador de Bosses', color: '#ff6a5a', how: 'Derrote 10 bosses' },
  ferreiro: { name: 'Ferreiro Lendário', color: '#ffd36b', how: 'Tenha um equipamento +15' },
  alado: { name: 'Alado', color: '#9fd8ff', how: 'Conquiste sua primeira asa ou capa' },
  irmao: { name: 'Irmão de Guilda', color: '#55a5ff', how: 'Entre numa guilda' },
  veterano: { name: 'Veterano de Eventos', color: '#c9a2ff', how: 'Participe de 10 eventos' },
  explorador: { name: 'Explorador', color: '#8fdc6f', how: 'Cace em 10 mapas diferentes' },
  col_asas: { name: 'Colecionador de Asas', color: '#bfe8ff', how: 'Descubra 5 asas ou capas diferentes' },
  col_sets: { name: 'Colecionador de Conjuntos', color: '#e8c87a', how: 'Descubra 8 conjuntos diferentes' },
  gigante: { name: 'Matador de Gigantes', color: '#ff4a3a', how: 'Seja o maior dano (MVP) de um Boss Mundial' },
  gigantes10: { name: 'Caçador de Gigantes', color: '#ff8a5a', how: 'Ajude a derrotar 10 Bosses Mundiais' },
};
// títulos de temporada são criados por número: s{N}_1, s{N}_3, s{N}_10, s{N}_go (completou as missões da temporada)
function titleDef(id) {
  if (TITLES[id]) return TITLES[id];
  const m = /^s(\d+)_(1|3|10|go)$/.exec(id || '');
  if (!m) return null;
  const n = Number(m[1]), th = theme(n);
  return { 1: { name: `Campeão · ${th}`, color: '#ffd700' }, 3: { name: `Elite · ${th}`, color: '#e8e8ff' }, 10: { name: `Destaque · ${th}`, color: '#ffb47a' },
    go: { name: `Desbravador · ${th}`, color: '#9affd0' } }[m[2]];
}
function titles(p) { p.quests.titles = p.quests.titles || { owned: [], on: null }; return p.quests.titles; }
function grantTitle(p, id, silent) {
  const t = titles(p);
  if (!titleDef(id) || t.owned.includes(id)) return false;
  t.owned.push(id);
  if (!t.on) t.on = id;
  p.questsDirty = true; p.dirty = true;
  if (!silent) {
    p.send({ type: 'log', kind: 'quest', text: `🏷 Novo título: ${titleDef(id).name}! Escolha qual usar em Jornada → Coleções.` });
    if (W) refreshLook(p);
  }
  return true;
}
function setTitle(p, id) {
  const t = titles(p);
  if (id && !t.owned.includes(id)) return;
  t.on = id || null; p.dirty = true;
  refreshLook(p);
  p.send(view(p));
}
function titleOf(p) { const id = p.quests && p.quests.titles && p.quests.titles.on; const d = titleDef(id); return d ? { title: d.name, titleColor: d.color } : {}; }
function refreshLook(p) { if (p.map) for (const o of p.map.players.values()) o.send({ type: 'pj', ...W.pinfo(p) }); }

// ---------------- coleções ----------------
const COL_CATS = {
  sets: { name: 'Conjuntos', list: () => Object.keys(G.SETS).map((k) => ({ id: k, name: G.SETS[k].name || k })) },
  wings: { name: 'Asas e capas', list: () => Object.entries(G.ITEM_BASES).filter(([, b]) => b.slot === 'wings').map(([k, b]) => ({ id: k, name: b.name })) },
  mounts: { name: 'Montarias e pets', list: () => Object.entries(G.ITEM_BASES).filter(([, b]) => b.slot === 'pet').map(([k, b]) => ({ id: k, name: b.name })) },
  maps: { name: 'Mapas explorados', list: () => Object.entries(G.WORLD).filter(([, d]) => !d.arena).map(([k, d]) => ({ id: k, name: d.name })) },
  bosses: { name: 'Bosses derrotados', list: () => Object.entries(G.MONSTERS).filter(([, m]) => m.boss).map(([k, m]) => ({ id: k, name: m.name })) },
};
function col(p) {
  p.quests.col = p.quests.col || {};
  for (const k of Object.keys(COL_CATS)) p.quests.col[k] = p.quests.col[k] || [];
  return p.quests.col;
}
function discover(p, cat, id, silent) {
  if (!p || !p.quests || !id) return false;
  const c = col(p);
  if (c[cat].includes(id)) return false;
  if (!COL_CATS[cat].list().some((x) => x.id === id)) return false;
  c[cat].push(id); p.dirty = true; p.questsDirty = true;
  if (!silent) {
    const name = (COL_CATS[cat].list().find((x) => x.id === id) || {}).name || id;
    p.send({ type: 'log', kind: 'quest', text: `📖 Coleção: ${name} registrado no livro (${COL_CATS[cat].name}).` });
  }
  checkTitles(p);
  return true;
}
// itens novos / equipados entram no livro
function onItem(p, base, silent) {
  const b = G.ITEM_BASES[base]; if (!b) return;
  if (b.set) discover(p, 'sets', b.set, silent);
  if (b.slot === 'wings') discover(p, 'wings', base, silent);
  if (b.slot === 'pet') discover(p, 'mounts', base, silent);
}
// ao entrar: registra o que o herói já tem (sem mensagens)
function backfill(p) {
  col(p);
  for (const it of p.items || []) onItem(p, it.base, true);
  if (p.map && !p.map.def.arena) discover(p, 'maps', p.map.id, true);
  const life = p.quests.life || {};
  if (p.guild) life.guild = 1;
  for (const it of p.items || []) if ((it.plus || 0) > (life.maxPlus || 0)) life.maxPlus = it.plus || 0;
  p.quests.life = life;
  checkTitles(p, true);
}
function checkTitles(p, silent) {
  const c = col(p), life = p.quests.life || {};
  if (c.wings.length >= 1) grantTitle(p, 'alado', silent);
  if (c.wings.length >= 5) grantTitle(p, 'col_asas', silent);
  if (c.sets.length >= 8) grantTitle(p, 'col_sets', silent);
  if (c.maps.length >= 10) grantTitle(p, 'explorador', silent);
  if ((life.maxPlus || 0) >= 15) grantTitle(p, 'ferreiro', silent);
  if (life.guild) grantTitle(p, 'irmao', silent);
  if ((life.events || 0) >= 10) grantTitle(p, 'veterano', silent);
  if ((life.wboss || 0) >= 10) grantTitle(p, 'gigantes10', silent);
  if ((p.kills || 0) >= 10000) grantTitle(p, 'exterminador', silent);
  if ((p.bossesKilled || 0) >= 10) grantTitle(p, 'cacador', silent);
}

// ---------------- temporadas ----------------
const SEASON_DAYS = 30;
const EPOCH = Date.UTC(2026, 10, 1, 3, 0, 0);       // 1º de novembro de 2026, 00h de Brasília
const THEMES = ['Temporada do Dragão', 'Temporada do Gelo', 'Temporada do Abismo', 'Temporada da Fênix', 'Temporada do Trovão', 'Temporada das Sombras'];
function seasonOf(t = Date.now()) { return Math.max(1, Math.floor((t - EPOCH) / (SEASON_DAYS * 86400000)) + 1); }
function seasonRange(n) { const start = EPOCH + (n - 1) * SEASON_DAYS * 86400000; return { start, end: start + SEASON_DAYS * 86400000 }; }
function theme(n) { return THEMES[(n - 1) % THEMES.length]; }
// pontos por atividade e teto por dia (o que passar do teto não conta naquele dia)
const PTS = { kill: [1, 1500], elite: [5, 600], boss: [60, 900], wboss: [150, 600], event: [40, 400], daily: [15, 90], weekly: [80, 400] };
const MISSIONS = [
  { id: 'kills', text: 'Derrote 15.000 monstros na temporada', goal: 15000, reward: { zen: 50000, mats: [['jewel_of_bless', 2]] } },
  { id: 'bosses', text: 'Derrote 15 bosses na temporada', goal: 15, reward: { zen: 60000, mats: [['jewel_of_soul', 2]] } },
  { id: 'wboss', text: 'Ajude a derrotar 4 Bosses Mundiais', goal: 4, reward: { zen: 80000, box: 'kundun_3' } },
  { id: 'events', text: 'Participe de 10 eventos', goal: 10, reward: { zen: 60000, mats: [['jewel_of_chaos', 3]] } },
  { id: 'missions', text: 'Pegue o prêmio de 12 missões semanais', goal: 12, reward: { zen: 80000, box: 'kundun_4' } },
];
const pending = new Map();   // charId -> { season, name, cls, acc, d: {points,kills,...} }
function sstate(p) {
  const n = seasonOf();
  let s = p.quests.season;
  if (!s || s.n !== n) s = p.quests.season = { n, pts: 0, day: today(), today: {}, m: {}, got: [] };
  if (s.day !== today()) { s.day = today(); s.today = {}; }
  return s;
}
// soma pontos de temporada (kind: kill, elite, boss, wboss, event, daily, weekly). Missões sazonais andam junto.
const wdFmt = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short' });
const isWeekend = () => ['Sat', 'Sun'].includes(wdFmt.format(new Date()));
// fim de semana: Caçada de Elites (elites e chefes valem o dobro de pontos de temporada)
function weekendEntry() {
  if (!isWeekend()) return null;
  return { id: 'elitehunt', name: 'Caçada de Elites (fim de semana)', at: Date.now(), endsAt: 0, state: 'live', can: true,
    req: 'Todos os níveis · sábado e domingo', rewards: ['Elites e chefes dão o dobro de pontos de temporada'], where: 'Todos os mapas' };
}
function addPoints(p, kind, mult = 1) {
  if (!p || !p.quests || p.disguised) return;
  const def = PTS[kind]; if (!def) return;
  if ((kind === 'elite' || kind === 'boss') && isWeekend()) mult *= 2;
  const s = sstate(p);
  const room = def[1] - (s.today[kind] || 0);
  const gain = Math.max(0, Math.min(room, Math.round(def[0] * mult)));
  const mk = { kill: 'kills', elite: 'kills', boss: 'bosses', wboss: 'wboss', event: 'events', weekly: 'missions' }[kind];
  if (mk) s.m[mk] = (s.m[mk] || 0) + 1;
  if (kind === 'event') { p.quests.life = p.quests.life || {}; p.quests.life.events = (p.quests.life.events || 0) + 1; checkTitles(p); }
  if (kind === 'wboss') { p.quests.life = p.quests.life || {}; p.quests.life.wboss = (p.quests.life.wboss || 0) + 1; checkTitles(p); }
  if (gain > 0) { s.today[kind] = (s.today[kind] || 0) + gain; s.pts += gain; }
  const e = pending.get(p.charId) || { season: s.n, name: p.name, cls: p.cls, acc: p.accountId, d: { points: 0, kills: 0, bosses: 0, wboss: 0, events: 0, missions: 0 } };
  e.d.points += gain; if (mk) e.d[mk] += 1;
  pending.set(p.charId, e);
  if (gain > 0 || mk) p.dirty = true;
  if (kind !== 'kill' || s.pts % 50 === 0) p.questsDirty = true;
  // completou todas as missões da temporada → título
  if (MISSIONS.every((mi) => (s.m[mi.id] || 0) >= mi.goal)) grantTitle(p, `s${s.n}_go`);
}
async function flush() {
  if (!pending.size) return;
  const list = [...pending.entries()]; pending.clear();
  for (const [charId, e] of list) {
    const d = e.d;
    await db.query(`INSERT INTO season_points (season, character_id, account_id, name, class, points, kills, bosses, wboss, events, missions)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      ON CONFLICT (season, character_id) DO UPDATE SET points = season_points.points + EXCLUDED.points, kills = season_points.kills + EXCLUDED.kills,
        bosses = season_points.bosses + EXCLUDED.bosses, wboss = season_points.wboss + EXCLUDED.wboss, events = season_points.events + EXCLUDED.events,
        missions = season_points.missions + EXCLUDED.missions, name = EXCLUDED.name, class = EXCLUDED.class, updated_at = now() RETURNING season`,
    [e.season, charId, e.acc, e.name, e.cls, d.points, d.kills, d.bosses, d.wboss, d.events, d.missions]).catch((err) => console.error('[temporada] salvar', err.message));
  }
}
async function claimMission(p, id) {
  const s = sstate(p);
  const mi = MISSIONS.find((x) => x.id === id);
  if (!mi || s.got.includes(id) || (s.m[id] || 0) < mi.goal) return;
  s.got.push(id);
  await W.grant(p, mi.reward, `Missão da temporada`);
  p.dirty = true; p.send(view(p));
}
// fim de temporada: os 10 primeiros ganham títulos (uma vez só, mesmo com reinício)
async function finalize() {
  const n = seasonOf() - 1;
  if (n < 1) return;
  const done = (await db.query('SELECT 1 FROM season_results WHERE season = $1', [n])).rows[0];
  if (done) return;
  const top = (await db.query('SELECT character_id, name, class, points FROM season_points WHERE season = $1 AND points > 0 ORDER BY points DESC, updated_at ASC LIMIT 10', [n])).rows;
  const ins = await db.query("INSERT INTO season_results (season, top) VALUES ($1, $2) ON CONFLICT (season) DO NOTHING RETURNING season", [n, JSON.stringify(top)]);
  if (!ins.rows[0]) return;
  for (const [i, r] of top.entries()) {
    const id = i === 0 ? `s${n}_1` : i < 3 ? `s${n}_3` : `s${n}_10`;
    await W.editChar(String(r.character_id), async (c) => { c.quests = c.quests || {}; grantTitle(c, id, true); c.dirty = true; return true; }).catch((e) => console.error('[temporada] título', r.name, e.message));
  }
  if (top.length) W.system(`🏆 Fim da ${theme(n)}! Campeão: ${top[0].name} (${top[0].points.toLocaleString('pt-BR')} pontos). Começou a ${theme(n + 1)}!`, `🏆 ${theme(n)} ended! Champion: ${top[0].name}.`);
}
async function seasonRanking(n = seasonOf(), limit = 50) {
  await flush();
  return (await db.query('SELECT name, class, points, kills, bosses, wboss, events FROM season_points WHERE season = $1 AND points > 0 ORDER BY points DESC, updated_at ASC LIMIT $2', [n, limit])).rows;
}
async function myRank(p) {
  const n = seasonOf();
  const r = (await db.query('SELECT points, (SELECT count(*) FROM season_points x WHERE x.season = $1 AND x.points > s.points)::int + 1 AS pos FROM season_points s WHERE season = $1 AND character_id = $2', [n, p.charId])).rows[0];
  return r ? r.pos : null;
}

// ---------------- tela (Jornada → Temporada / Coleções) ----------------
function view(p) {
  const s = sstate(p), n = s.n, r = seasonRange(n);
  const t = titles(p), c = col(p);
  return {
    type: 'progress',
    season: { n, theme: theme(n), endsIn: r.end - Date.now(), pts: s.pts, todayCaps: Object.fromEntries(Object.entries(PTS).map(([k, v]) => [k, { got: s.today[k] || 0, max: v[1], each: v[0] }])),
      missions: MISSIONS.map((m) => ({ id: m.id, text: m.text, goal: m.goal, prog: Math.min(m.goal, s.m[m.id] || 0), got: s.got.includes(m.id), reward: require('./quests').rewardText(m.reward) })),
      titleGo: titleDef(`s${n}_go`).name },
    titles: { on: t.on, owned: t.owned.map((id) => ({ id, ...titleDef(id) })).filter((x) => x.name),
      all: Object.entries(TITLES).map(([id, d]) => ({ id, name: d.name, color: d.color, how: d.how, owned: t.owned.includes(id) })) },
    collection: Object.fromEntries(Object.entries(COL_CATS).map(([k, cat]) => { const list = cat.list(); return [k, { name: cat.name, total: list.length, found: list.filter((x) => c[k].includes(x.id)).map((x) => x.name) }]; })),
  };
}
async function act(p, msg) {
  if (msg.action === 'title') return setTitle(p, msg.id ? String(msg.id) : null);
  if (msg.action === 'claim') return claimMission(p, String(msg.id || ''));
  const v = view(p); v.season.rank = await myRank(p).catch(() => null);
  p.send(v);
}

function init(world) {
  W = world;
  setInterval(() => { flush().catch(() => {}); }, 20000).unref();
  setInterval(() => { finalize().catch((e) => console.error('[temporada] fim', e.message)); }, 5 * 60000).unref();
  setTimeout(() => finalize().catch(() => {}), 20000).unref();
}

module.exports = { weekendEntry, init, act, view, flush, addPoints, grantTitle, titleOf, discover, onItem, backfill, checkTitles, seasonOf, seasonRange, theme, seasonRanking, TITLES };
