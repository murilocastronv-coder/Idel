'use strict';
// Boss Mundial: aparece em horários fixos (Brasília), num mapa que muda a cada aparição, em todas as salas.
// - Anúncio 10 e 2 minutos antes; temporizador no calendário de eventos (Jornada → Eventos).
// - Usa o combate de boss que já existe (fúria abaixo de 50% e golpe em área com aviso), com área maior.
// - Recompensa proporcional à contribuição: dano + apoio (cura e buffs usados perto do boss).
// - Proteção AFK: só recebe quem agiu nos últimos 90 s antes da morte e tem pelo menos 0,5% da contribuição.
// - Se ninguém derrotar em 30 minutos, ele vai embora. Um registro por horário e sala: nada duplica depois de reinício.
const db = require('./db');
const G = require('./gamedata');
const SET = require('./settings');

const KEY = 'worldboss_config';
const DEFAULTS = {
  enabled: true,
  times: ['01:30', '05:30', '09:30', '13:30', '17:30', '21:30'],   // horário de Brasília
  durationMin: 30,
  // 3 faixas: a cada horário nasce um boss em cada faixa (girando entre os mapas dela) — todo nível tem um boss para caçar
  tiers: [
    ['vulcanus', 'dungeon', 'atlans', 'lost_tower', 'tarkan', 'icarus', 'aida', 'kalima', 'crywolf'],
    ['pantano_sombrio', 'desfiladeiro_brasa', 'kanturu_ruins', 'ruinas_celestes', 'mar_cristal', 'raklion'],
    ['deserto_escarlate', 'bastiao_gelido', 'acheron', 'torre_eclipse', 'floresta_petrificada', 'abismo_carmesim', 'trono_vazio', 'exile'],
  ],
  hpMult: 80, dmgMult: 2.2, defMult: 1.4, slamR: 110,
};
const TZ_OFFSET_MIN = -180;  // Brasília (UTC-3)
let W = null, PROG = null, RET = null;
const live = new Map();       // room -> { m, map, slot, logId, act: Map(charId -> último momento em que agiu), support: Map }
let warned = { 10: 0, 2: 0 };
const cfg = () => ({ ...DEFAULTS, ...SET.get(KEY, DEFAULTS) });

function slotsAround(t) {
  const out = [];
  for (let d = -1; d <= 1; d++) {
    const local = new Date(t + TZ_OFFSET_MIN * 60000 + d * 86400000);
    for (const hm of cfg().times) {
      const [h, mi] = hm.split(':').map(Number);
      out.push(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), h, mi) - TZ_OFFSET_MIN * 60000);
    }
  }
  return out.sort((a, b) => a - b);
}
const nextSlot = (t = Date.now()) => slotsAround(t).find((s) => s > t) || 0;
const currentSlot = (t = Date.now()) => slotsAround(t).filter((s) => s <= t && t < s + cfg().durationMin * 60000).pop() || 0;
// mapas da vez: um por faixa, girando pela lista (só mapas de caça que existem)
const okMap = (id) => G.WORLD[id] && !G.WORLD[id].safe && !G.WORLD[id].arena && G.WORLD[id].groups && G.WORLD[id].groups.length;
function mapsFor(slot) {
  const c = cfg(), tiers = c.maps ? [c.maps] : c.tiers;
  return tiers.map((list) => list.filter(okMap)).filter((l) => l.length).map((l) => l[Math.floor(slot / 3600000) % l.length]);
}
// o boss da faixa do herói (o de mapa mais alto que ele já pode entrar)
function mapFor(slot, level = Infinity) {
  const list = mapsFor(slot).sort((a, b) => G.WORLD[a].minLevel - G.WORLD[b].minLevel);
  return list.filter((id) => level >= (G.WORLD[id].minLevel || 1)).pop() || list[0] || null;
}
// molde: o monstro mais forte do mapa, muito mais resistente, com nome do tema da temporada
function template(mapId) {
  const def = G.WORLD[mapId], c = cfg();
  const base = def.groups.map((g) => G.MONSTERS[g.type]).filter(Boolean).sort((a, b) => (b.level || 0) - (a.level || 0))[0];
  const th = PROG ? PROG.theme(PROG.seasonOf()).replace('Temporada d', '').replace(/^[oae] /, '') : '';
  return {
    ...base, name: `Colosso ${th ? 'do ' + th : ''} · ${base.name}`.replace('do  ·', '·'), hp: Math.round(base.hp * c.hpMult), dmg: Math.round(base.dmg * c.dmgMult),
    def: Math.round((base.def || 0) * c.defMult), level: (base.level || def.minLevel) + 40, aggro: 160, boss: true, worldBoss: true, elite: false, drop: 0,
    scale: (base.scale || 1) * 2.1, tint: '#ff4a3a', slamR: c.slamR, respawnMs: 999999999, baseType: base === G.MONSTERS[base.id] ? base.id : null,
  };
}

async function spawn(slot) {
  const names = [];
  for (const mapId of mapsFor(slot)) { const n = await spawnIn(slot, mapId); if (n) names.push(n); }
  if (names.length) W.system(`🔥 BOSS MUNDIAL: ${names.join(' · ')} (todas as salas)! ${cfg().durationMin} minutos para derrotar — junte uma party!`, `🔥 WORLD BOSS: ${names.join(' · ')}!`);
}
async function spawnIn(slot, mapId) {
  const T = template(mapId);
  let spawned = 0;
  for (const inst of W.maps.values()) {
    if (inst.id !== mapId || inst.def.arena || live.has(`${inst.room}:${mapId}`)) continue;
    const ins = await db.query(`INSERT INTO worldboss_log (slot_at, room, map, boss) VALUES (to_timestamp($1 / 1000.0), $2, $3, $4)
      ON CONFLICT (slot_at, room, map) DO UPDATE SET slot_at = worldboss_log.slot_at RETURNING id, killed_at`, [slot, inst.room, mapId, T.name]);
    if (ins.rows[0].killed_at) continue;  // já derrotado nesta sala (reinício do servidor)
    const [x, y] = inst.def.spawn;
    const m = { id: 'wb' + inst.room + mapId.slice(0, 4) + (slot / 60000).toString(36), type: inst.def.groups[0].type, T, x: x + 120, y: y + 40, hx: x + 120, hy: y + 40, hp: T.hp, dead: false,
      respawnAt: Infinity, target: null, nextAtk: 0, wander: null, nextWander: 0, contrib: new Map(), flip: false, worldBoss: true };
    inst.monsters.push(m);
    const msg = { type: 'madd', m: { id: m.id, type: m.type, name: T.name, sprite: T.sprite, tint: T.tint, size: T.size, scale: T.scale, level: T.level, maxHp: T.hp,
      dmgMin: Math.floor(T.dmg * 0.85), dmgMax: Math.ceil(T.dmg * 1.15), defense: T.def, exp: 0, training: false, boss: true, elite: false, golden: null, worldBoss: true } };
    for (const o of inst.players.values()) o.send(msg);
    live.set(`${inst.room}:${mapId}`, { m, map: inst, room: inst.room, slot, logId: ins.rows[0].id, act: new Map(), support: new Map() });
    spawned++;
  }
  return spawned ? `${T.name} em ${G.WORLD[mapId].name}` : null;
}
function despawn(key, why) {
  const L = live.get(key); if (!L) return;
  live.delete(key); const room = L.room;
  const i = L.map.monsters.indexOf(L.m); if (i >= 0) L.map.monsters.splice(i, 1);
  for (const o of L.map.players.values()) o.send({ type: 'mdel', id: L.m.id });
  if (why) W.system(`O Boss Mundial ${L.m.T.name} foi embora da Sala ${room}: ${why}`);
}
// ações perto do boss: quem bate ou apoia fica marcado como ativo (proteção AFK)
function onHit(p, m) { const L = [...live.values()].find((x) => x.m === m); if (L) L.act.set(p.charId, Date.now()); }
function onSupport(p, amount) {
  const L = p.map && live.get(`${p.map.room}:${p.map.id}`); if (!L || L.map !== p.map || L.m.dead) return;
  if (Math.hypot(p.x - L.m.x, p.y - L.m.y) > 420) return;
  L.support.set(p.charId, (L.support.get(p.charId) || 0) + Math.max(0, amount));
  L.act.set(p.charId, Date.now());
}
const isWorldBoss = (m) => !!(m && m.worldBoss);

// morte: divide por contribuição (dano + apoio), com proteção AFK
async function onKill(world, m, map) {
  const L = [...live.entries()].find(([, x]) => x.m === m); if (!L) return;
  const [key, st] = L; live.delete(key); const room = st.room;
  const now = Date.now();
  const score = new Map();
  for (const [id, d] of m.contrib) score.set(id, (score.get(id) || 0) + d);
  for (const [id, s] of st.support) score.set(id, (score.get(id) || 0) + s * 1.5);
  const total0 = [...score.values()].reduce((a, b) => a + b, 0) || 1;
  const elig = [...score.entries()].map(([id, sc]) => ({ p: world.players.get(id), sc }))
    .filter((x) => x.p && x.p.map === map && !x.p.dead && now - (st.act.get(x.p.charId) || 0) < 90000 && x.sc / total0 >= 0.005)
    .sort((a, b) => b.sc - a.sc);
  const total = elig.reduce((a, x) => a + x.sc, 0) || 1;
  const T = m.T;
  const parts = [];
  for (const [i, { p, sc }] of elig.entries()) {
    const share = sc / total;
    const box = i === 0 ? 'kundun_5' : i < 3 ? 'kundun_4' : share >= 0.05 ? 'kundun_3' : 'kundun_2';
    const reward = { zen: Math.round(150000 * Math.max(0.05, share) + 20000), expPct: Math.min(0.2, 0.04 + share * 0.4), box,
      mats: share >= 0.05 || i < 3 ? [['jewel_of_soul', 1], ['jewel_of_bless', 1]] : [['jewel_of_bless', 1]] };
    p.run(async () => { await world.grant(p, reward, `Boss Mundial (${Math.round(share * 100)}% da contribuição${i === 0 ? ', MVP' : ''})`); world.persist(p).catch(() => {}); p.send(p.charState()); });
    p.bossesKilled = (p.bossesKilled || 0) + 1;
    world.quest(p, 'boss', 1); world.quest(p, 'elite', 1);
    if (RET) RET.event(p, 'worldboss');
    if (PROG) { PROG.addPoints(p, 'wboss', Math.max(0.3, share * 3)); if (i === 0) PROG.grantTitle(p, 'gigante'); }
    world.achieve(p);
    parts.push({ char: String(p.charId), name: p.name, share: Math.round(share * 1000) / 10 });
  }
  const afk = score.size - elig.length;
  await db.query('UPDATE worldboss_log SET killed_at = now(), mvp_name = $2, participants = $3 WHERE id = $1 RETURNING id', [st.logId, elig[0] ? elig[0].p.name : null, JSON.stringify(parts)]).catch(() => {});
  world.system(`🏆 ${T.name} foi derrotado na Sala ${room}! MVP: ${elig[0] ? elig[0].p.name : '—'} · ${elig.length} herói(s) recompensado(s)${afk > 0 ? ` (${afk} sem recompensa por inatividade)` : ''}.`,
    `🏆 ${T.name} was defeated! MVP: ${elig[0] ? elig[0].p.name : '-'}`);
}

async function tick() {
  const c = cfg(); if (!c.enabled || !W) return;
  const now = Date.now();
  const nx = nextSlot(now);
  for (const min of [10, 2]) {
    if (nx && nx - now <= min * 60000 && nx - now > (min - 1) * 60000 && warned[min] !== nx) {
      warned[min] = nx;
      const ms = mapsFor(nx).map((id) => G.WORLD[id].name);
      if (ms.length) W.system(`⚠ Boss Mundial em ${min} minutos: ${ms.join(', ')}! Prepare poções e chame sua party.`, `⚠ World Boss in ${min} minutes: ${ms.join(', ')}!`);
    }
  }
  const cur = currentSlot(now);
  if (cur && ![...live.values()].some((L) => L.slot === cur)) await spawn(cur);
  for (const [key, L] of [...live.entries()]) if (now >= L.slot + c.durationMin * 60000) despawn(key, 'o tempo acabou');
}
// calendário (Jornada → Eventos)
function calendarEntry(p) {
  const c = cfg(); if (!c.enabled) return null;
  const now = Date.now();
  const room = (p.map && p.map.room) || p.room || 1;
  const cur = [...live.values()].find((x) => x.room === room && x.map.id === mapFor(x.slot, p.level));
  const slot = cur ? cur.slot : nextSlot(now);
  const mapId = mapFor(slot, p.level); if (!mapId) return null;
  const L = cur && cur.map.id === mapId ? cur : null;
  return { id: 'worldboss', name: 'Boss Mundial', at: slot, endsAt: L ? L.slot + c.durationMin * 60000 : 0, state: L ? 'live' : 'next', can: p.level >= (G.WORLD[mapId].minLevel || 1),
    req: `${G.WORLD[mapId].name} (nível ${G.WORLD[mapId].minLevel}+) · contribuição por dano e apoio · inativos não recebem`, rewards: ['Box Kundun +2 a +5 pela contribuição', 'Jewel of Bless/Soul', 'EXP e Zen', 'Título "Matador de Gigantes" para o MVP'],
    where: G.WORLD[mapId].name };
}

// ---------- painel ADM ----------
function adminView() {
  const nx = nextSlot();
  return { ok: true, config: cfg(), defaults: DEFAULTS, next: nx, nextMaps: mapsFor(nx).map((id) => G.WORLD[id].name),
    live: [...live.values()].map((L) => ({ room: L.room, map: L.map.def.name, name: L.m.T.name, hp: L.m.hp, maxHp: L.m.T.hp, endsAt: L.slot + cfg().durationMin * 60000 })) };
}
async function saveConfig(input) {
  const c = cfg(), out = { ...c };
  if (input.enabled !== undefined) out.enabled = !!input.enabled;
  if (input.times !== undefined) {
    const t = String(input.times).split(/[,\s]+/).filter(Boolean);
    if (!t.length || t.length > 24 || t.some((x) => !/^([01]\d|2[0-3]):[0-5]\d$/.test(x))) throw new Error('Horários: use HH:MM separados por vírgula (ex.: 01:30, 13:30).');
    out.times = [...new Set(t)].sort();
  }
  const num = (k, lo, hi, label) => { if (input[k] === undefined) return; const v = Number(input[k]); if (!Number.isFinite(v) || v < lo || v > hi) throw new Error(`${label}: de ${lo} a ${hi}.`); out[k] = v; };
  num('durationMin', 5, 120, 'Duração (min)'); num('hpMult', 5, 1000, 'Vida (× monstro mais forte do mapa)'); num('dmgMult', 1, 10, 'Dano (×)'); num('defMult', 1, 10, 'Defesa (×)');
  delete out.maps;
  await SET.save(KEY, out);
  return adminView();
}
// aparece agora (horário atual vira um horário extra só desta vez)
async function spawnNow() {
  const slot = Math.floor(Date.now() / 60000) * 60000;
  await spawn(slot);
  return adminView();
}

function init(world, deps) {
  W = world; PROG = deps.PROG; RET = deps.RET;
  SET.load(KEY, DEFAULTS).catch(() => {});
  setInterval(() => { tick().catch((e) => console.error('[boss mundial]', e.message)); }, 5000).unref();
}
module.exports = { adminView, saveConfig, spawnNow, init, onKill, onHit, onSupport, isWorldBoss, calendarEntry, nextSlot, mapFor, DEFAULTS, live };
