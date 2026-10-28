'use strict';
// Invasão Dourada — evento mundial automático a cada 40 minutos.
//  • GoldenInvasionManager: temporizador, início/fim, estado salvo (sem eventos duplicados após reiniciar)
//  • GoldenMonsterFactory: versão dourada de cada monstro do próprio mapa (mesma aparência e IA, atributos maiores)
//  • GoldenSpawnManager: mapas habilitados, pontos válidos, intervalo e limite de vivos por mapa
//  • GoldenRewardService: EXP/Zen por contribuição e Box Kundun pelo modo escolhido (individual, último golpe, contribuição)
//  • GoldenInvasionNotifications: avisos globais configuráveis (pt/en)
const db = require('./db');
const G = require('./gamedata');
const SET = require('./settings');
const DROPS = require('./drops');

const TIERS = ['bronze', 'prata', 'ouro'];
const MODES = ['contribution', 'individual', 'lasthit'];

const DEFAULTS = {
  enabled: true,
  intervalMin: 40,          // uma invasão começa a cada 40 minutos
  durationMin: 10,          // quanto tempo os monstros dourados ficam no mundo
  rewardMode: 'contribution',
  minShare: 10,             // % do dano para participar da recompensa
  thresholds: { prata: 30, ouro: 90 },   // nível do monstro original (elites sobem uma categoria)
  tiers: {
    bronze: { hp: 3, dmg: 1.5, def: 1.5, exp: 3, zen: 3, box: 'kundun_bronze', scale: 1.15 },
    prata: { hp: 5, dmg: 2, def: 2, exp: 5, zen: 5, box: 'kundun_prata', scale: 1.25 },
    ouro: { hp: 8, dmg: 2.5, def: 3, exp: 8, zen: 8, box: 'kundun_ouro', scale: 1.35 },
  },
  announceKills: ['prata', 'ouro'],
  mapDefaults: { count: 6, maxAlive: 3, intervalSec: 20 },
  maps: {},                 // por mapa: { enabled, count, maxAlive, intervalSec, recLevel, monsters: { tipo: 'auto'|'off'|'bronze'|'prata'|'ouro' } }
  messages: {
    start: { pt: '⚔ INVASÃO DOURADA INICIADA! Monstros dourados invadiram os mapas do reino. Prepare-se para a batalha!', en: '⚔ GOLDEN INVASION STARTED! Golden monsters have invaded the kingdom. Get ready for battle!' },
    spawn: { pt: 'Monstro dourado avistado em {mapa}: {monstro}!', en: 'Golden monster spotted in {mapa}: {monstro}!' },
    kill: { pt: '{jogador} derrotou {monstro} e recebeu {caixa}!', en: '{jogador} defeated {monstro} and received {caixa}!' },
    end: { pt: 'A Invasão Dourada terminou. Os monstros restantes desapareceram. A próxima invasão acontecerá em {minutos} minutos!', en: 'The Golden Invasion is over. The remaining monsters vanished. The next invasion starts in {minutos} minutes!' },
  },
};

let W = null;
let H = null;
let active = null;     // { id, startedAt, endsAt, spawned, killed, perMap: Map }
let nextAt = 0;
let lastStart = 0;
let gseq = 0;
let starting = false;
const problems = new Map();  // mapa -> motivo (registrado uma vez)
const announceQueue = [];

function cfg() { return SET.get('invasion', DEFAULTS); }

// ---------------- GoldenMonsterFactory ----------------
function tierOf(type, override) {
  if (TIERS.includes(override)) return override;
  const T = G.MONSTERS[type];
  const th = cfg().thresholds;
  let i = T.level >= th.ouro ? 2 : T.level >= th.prata ? 1 : 0;
  if (T.elite) i = Math.min(2, i + 1);   // a dificuldade conta, não só o nome do mapa
  return TIERS[i];
}

function goldenName(name) {
  const first = name.split(' ')[0].toLowerCase();
  return `${name} ${/a$/.test(first) ? 'Dourada' : 'Dourado'}`;
}

function goldenTemplate(type, tier) {
  const T0 = G.MONSTERS[type];
  const t = cfg().tiers[tier];
  return {
    ...T0, name: goldenName(T0.name), hp: Math.round(T0.hp * t.hp), dmg: Math.round(T0.dmg * t.dmg), def: Math.round(T0.def * t.def),
    exp: Math.round(T0.exp * t.exp), zen: [Math.round(T0.zen[0] * t.zen), Math.round(T0.zen[1] * t.zen)],
    aggro: Math.max(T0.aggro || 0, 130), drop: 0, boss: false, elite: true, golden: tier, baseType: type,
    scale: (T0.scale || 1) * t.scale, tint: '#ffc83a',
  };
}

// ---------------- GoldenSpawnManager ----------------
function mapCfg(mapId) {
  const c = cfg(), def = G.WORLD[mapId];
  const m = c.maps[mapId] || {};
  const d = c.mapDefaults;
  return {
    enabled: m.enabled !== undefined ? !!m.enabled : !def.safe,
    count: m.count ?? d.count, maxAlive: m.maxAlive ?? d.maxAlive, intervalSec: m.intervalSec ?? d.intervalSec,
    recLevel: m.recLevel ?? def.minLevel, monsters: m.monsters || {},
  };
}

// monstros elegíveis do mapa (os que já vivem nele; bosses ficam de fora)
function eligible(mapId) {
  const def = G.WORLD[mapId];
  const mc = mapCfg(mapId);
  const types = [...new Set(def.groups.map((g) => g.type))].filter((tp) => !G.MONSTERS[tp].boss);
  return types.filter((tp) => mc.monsters[tp] !== 'off').map((tp) => ({ type: tp, tier: tierOf(tp, mc.monsters[tp]) }));
}

function spawnPoint(def) {
  for (let k = 0; k < 30; k++) {
    const x = 80 + Math.random() * (def.w - 140), y = 80 + Math.random() * (def.h - 140);
    if (Math.hypot(x - def.spawn[0], y - def.spawn[1]) < 220) continue;   // longe da entrada do mapa
    if (x < 20 || y < 20 || x > def.w - 20 || y > def.h - 20) continue;
    return [x, y];
  }
  return null;
}

function problem(mapId, why) {
  if (problems.get(mapId) === why) return;
  problems.set(mapId, why);
  console.warn(`[invasão] ${mapId}: ${why}`);
}

function monInfo(mo) {
  return { id: mo.id, type: mo.type, name: mo.T.name, sprite: mo.T.sprite, tint: mo.T.tint || null, size: mo.T.size, scale: mo.T.scale || 1,
    level: mo.T.level, maxHp: mo.T.hp, boss: !!mo.T.boss, elite: !!mo.T.elite, golden: mo.T.golden || null };
}

function spawnOne(map, type, tier, invId) {
  const def = map.def;
  const pos = spawnPoint(def);
  if (!pos) { problem(map.id, 'sem ponto válido para nascer'); return null; }
  const T = goldenTemplate(type, tier);
  const m = { id: 'g' + (++gseq).toString(36), type, T, x: pos[0], y: pos[1], hx: pos[0], hy: pos[1], hp: T.hp, dead: false, respawnAt: Infinity, target: null,
    nextAtk: 0, wander: null, nextWander: 0, contrib: new Map(), flip: false, golden: tier, invasion: invId };
  map.monsters.push(m);
  const msg = { type: 'madd', m: monInfo(m) };
  for (const o of map.players.values()) o.send(msg);
  return m;
}

function removeMonster(map, m) {
  const i = map.monsters.indexOf(m);
  if (i < 0) return;
  map.monsters.splice(i, 1);
  for (const o of map.players.values()) o.send({ type: 'mdel', id: m.id });
  if (map.boss === m) map.boss = null;
}

function removeAll() {
  let n = 0;
  for (const map of W.maps.values()) for (const m of [...map.monsters]) if (m.golden) { removeMonster(map, m); n++; }
  return n;
}

// ---------------- GoldenInvasionNotifications ----------------
function fill(t, vars) { return String(t || '').replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined ? vars[k] : `{${k}}`)); }
// texto em inglês só quando o administrador personalizou a mensagem; senão o dicionário de tradução do jogo traduz
// (assim nomes como "Goblin Dourado" também viram "Golden Goblin")
function msgOf(kind, vars) {
  const m = cfg().messages[kind] || {}, d = DEFAULTS.messages[kind] || {};
  const custom = m.pt !== d.pt || (m.en && m.en !== d.en);
  return { pt: fill(m.pt, vars), en: custom ? fill(m.en || m.pt, vars) : null };
}
function broadcast(kind, vars, banner = true) {
  const t = msgOf(kind, vars);
  W.system(t.pt, t.en || undefined);
  if (banner) for (const p of W.players.values()) p.send({ type: 'invasion', phase: kind, text: t.pt, textEn: t.en, ...status() });
}
// avisos de aparição: no máximo um a cada 3 s, um por mapa por invasão
setInterval(() => { const a = announceQueue.shift(); if (a && active) broadcast('spawn', a, false); }, 3000).unref();

// ---------------- GoldenInvasionManager ----------------
function status() {
  return { active: !!active, endsAt: active ? active.endsAt : 0, nextAt, now: Date.now(), enabled: cfg().enabled };
}
function pushStatus() { const s = { type: 'invasion', phase: 'status', ...status() }; for (const p of W.players.values()) p.send(s); }

async function saveState() {
  await SET.save('invasion_state', { active: active ? { id: active.id, startedAt: active.startedAt, endsAt: active.endsAt } : null, nextAt, lastStart });
}

async function start(trigger = 'timer') {
  if (active || starting) return false;   // nunca duas ao mesmo tempo
  starting = true;
  try {
    const now = Date.now();
    const c = cfg();
    const endsAt = now + c.durationMin * 60000;
    const { rows } = await db.query('INSERT INTO invasions (started_at, ends_at, trigger) VALUES (to_timestamp($1 / 1000.0), to_timestamp($2 / 1000.0), $3) RETURNING id', [now, endsAt, trigger]);
    active = { id: String(rows[0].id), startedAt: now, endsAt, spawned: 0, killed: 0, perMap: new Map(), announced: new Set() };
    lastStart = now;
    nextAt = now + c.intervalMin * 60000;
    problems.clear();
    await saveState();
    broadcast('start', {});
    return true;
  } finally { starting = false; }
}

async function end(reason = 'tempo') {
  if (!active) return false;
  const a = active;
  active = null;
  announceQueue.length = 0;
  removeAll();
  await db.query('UPDATE invasions SET ended_at = now(), spawned = $2, killed = $3, end_reason = $4 WHERE id = $1 RETURNING id', [a.id, a.spawned, a.killed, reason]).catch((e) => console.error('[invasão]', e.message));
  await saveState();
  broadcast('end', { minutos: Math.max(1, Math.round((nextAt - Date.now()) / 60000)) });
  return true;
}

function spawnTick(now) {
  for (const map of W.maps.values()) {
    if (map.def.safe) continue;
    const mc = mapCfg(map.id);
    if (!mc.enabled) continue;
    const el = eligible(map.id);
    if (!el.length) { problem(map.id, 'nenhum monstro compatível'); continue; }
    const key = `${map.room}:${map.id}`;
    let st = active.perMap.get(key);
    if (!st) { st = { spawned: 0, next: now + Math.random() * 4000 }; active.perMap.set(key, st); }
    if (st.spawned >= mc.count || now < st.next) continue;
    const alive = map.monsters.filter((m) => m.golden && !m.dead).length;
    if (alive >= mc.maxAlive) continue;
    const pick = el[Math.floor(Math.random() * el.length)];
    const m = spawnOne(map, pick.type, pick.tier, active.id);
    st.next = now + mc.intervalSec * 1000;
    if (!m) { st.spawned = mc.count; continue; }  // mapa sem ponto válido: ignora sem parar a invasão
    st.spawned++; active.spawned++;
    if (!active.announced.has(map.id)) { active.announced.add(map.id); announceQueue.push({ monstro: m.T.name, mapa: map.def.name }); }
  }
}

async function tick() {
  const now = Date.now();
  try {
    if (active) {
      if (now >= active.endsAt) return end('tempo');
      spawnTick(now);
    } else if (cfg().enabled && nextAt && now >= nextAt) {
      await start('timer');
    }
  } catch (e) { console.error('[invasão]', e.message); }
  return undefined;
}

// após reiniciar: continua a invasão em andamento (mesmo id) ou fecha a que passou do tempo; nunca cria duas
async function restore() {
  const st = await SET.load('invasion_state', { active: null, nextAt: 0, lastStart: 0 });
  const now = Date.now();
  lastStart = st.lastStart || 0;
  nextAt = st.nextAt || now + cfg().intervalMin * 60000;
  if (st.active && st.active.endsAt > now + 30000) {
    active = { id: String(st.active.id), startedAt: st.active.startedAt, endsAt: st.active.endsAt, spawned: 0, killed: 0, perMap: new Map(), announced: new Set() };
    // conta só o tempo que resta (proporcional) para não recriar a invasão inteira
    const left = (st.active.endsAt - now) / Math.max(1, st.active.endsAt - st.active.startedAt);
    for (const map of W.maps.values()) {
      const mc = mapCfg(map.id);
      active.perMap.set(`${map.room}:${map.id}`, { spawned: Math.floor(mc.count * (1 - left)), next: now + 5000 });
    }
    await db.query("UPDATE invasions SET trigger = trigger || '+resume' WHERE id = $1 RETURNING id", [active.id]).catch(() => {});
    console.log(`[invasão] retomada #${active.id}, termina em ${Math.round((active.endsAt - now) / 1000)} s`);
  } else if (st.active) {
    await db.query("UPDATE invasions SET ended_at = COALESCE(ended_at, to_timestamp($2 / 1000.0)), end_reason = COALESCE(end_reason, 'reinício') WHERE id = $1 RETURNING id", [st.active.id, st.active.endsAt]).catch(() => {});
  }
  // se o horário passou enquanto o servidor estava fora, a próxima começa 1 minuto depois de ligar
  if (!active && nextAt < now + 60000) nextAt = now + 60000;
  await saveState();
}

async function init(world, helpers) {
  W = world; H = helpers;
  await SET.load('invasion', DEFAULTS);
  try { await restore(); } catch (e) { console.error('[invasão] estado:', e.message); nextAt = Date.now() + cfg().intervalMin * 60000; }
  setInterval(() => { tick(); }, 1000).unref();
}

// ---------------- GoldenRewardService ----------------
// chamado uma vez por morte (killMonster já marcou m.dead)
async function onKill(world, m, map, killer) {
  if (m.rewarded) return;
  m.rewarded = true;
  const c = cfg();
  const tier = c.tiers[m.golden];
  const box = tier.box;
  const total = [...m.contrib.values()].reduce((a, b) => a + b, 0) || 1;
  const ranked = [...m.contrib.entries()].map(([cid, dmg]) => ({ p: world.players.get(cid), share: dmg / total })).filter((x) => x.p && x.p.map === map);
  if (!ranked.some((x) => x.p === killer)) ranked.push({ p: killer, share: 0 });
  // EXP e Zen pela contribuição (mínimo de 10% para quem participou)
  for (const x of ranked) world.grantShare(x.p, m, Math.max(0.1, Math.min(1, x.share || 0.1)));
  // quem ganha a caixa
  const minShare = c.minShare / 100;
  const elig = ranked.filter((x) => x.share >= minShare || x.p === killer);
  let winners;
  if (c.rewardMode === 'lasthit') winners = [killer];
  else if (c.rewardMode === 'individual') winners = elig.map((x) => x.p);
  else {
    // compartilhada: uma caixa só, sorteada pelo dano de cada um
    const tot = elig.reduce((a, x) => a + Math.max(0.01, x.share), 0);
    let r = Math.random() * tot;
    winners = [elig.find((x) => (r -= Math.max(0.01, x.share)) <= 0) || elig[0]].map((x) => x.p);
  }
  winners = [...new Set(winners)];
  const ctx = { source: m.T.name, mapId: map.id, tier: 'golden', x: m.x, y: m.y };
  for (const p of winners) p.run(() => DROPS.deliver(world, p, { rule: { delivery: 'bag' }, item: box, qty: 1 }, ctx));
  DROPS.onKill(world, killer, m, map);
  if (active && m.invasion === active.id) active.killed++;
  const rewards = winners.map((p) => ({ char: p.charId, name: p.name, box, share: Math.round((ranked.find((x) => x.p === p) || {}).share * 100) || 0 }));
  db.query('INSERT INTO invasion_kills (invasion_id, monster, monster_name, tier, map, room, killer_name, rewards) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',
    [m.invasion || null, m.type, m.T.name, m.golden, map.id, map.room, killer.name, JSON.stringify(rewards)]).catch((e) => console.error('[invasão] kill:', e.message));
  if (c.announceKills.includes(m.golden)) {
    const names = winners.map((p) => p.name).join(', ');
    broadcast('kill', { jogador: names, monstro: m.T.name, caixa: G.ITEM_BASES[box].name, mapa: map.def.name }, false);
  }
  map.emit({ k: 'gold', t: m.id, x: Math.round(m.x), y: Math.round(m.y), tier: m.golden });
  m.contrib.clear();
  setTimeout(() => removeMonster(map, m), 1600);
}

// ---------------- administração ----------------
function spawnManual(mapId, n, room) {
  const def = G.WORLD[mapId];
  if (!def) throw new Error('Mapa desconhecido.');
  if (def.safe) throw new Error('Não há monstros em cidades.');
  const el = eligible(mapId);
  if (!el.length) throw new Error('Este mapa não tem monstros compatíveis (ou todos estão desligados).');
  n = Math.max(1, Math.min(30, Math.round(Number(n) || 1)));
  let made = 0;
  for (const map of W.maps.values()) {
    if (map.id !== mapId || (room && map.room !== room)) continue;
    for (let i = 0; i < n; i++) { const pk = el[Math.floor(Math.random() * el.length)]; if (spawnOne(map, pk.type, pk.tier, active ? active.id : null)) made++; }
  }
  if (active) active.spawned += made;
  return made;
}

function aliveCount() { let n = 0; for (const map of W.maps.values()) for (const m of map.monsters) if (m.golden && !m.dead) n++; return n; }

function statusText() {
  const now = Date.now();
  const mm = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}min ${String(s % 60).padStart(2, '0')}s`; };
  const L = [];
  if (active) L.push(`Invasão #${active.id} EM ANDAMENTO · termina em ${mm(active.endsAt - now)} · ${active.spawned} criados · ${active.killed} derrotados · ${aliveCount()} vivos agora`);
  else L.push(`Nenhuma invasão agora · próxima em ${mm(nextAt - now)}${cfg().enabled ? '' : ' (temporizador DESLIGADO no painel)'}`);
  if (problems.size) L.push('Mapas ignorados: ' + [...problems].map(([k, v]) => `${k} (${v})`).join(', '));
  return L;
}

function sanitize(i) {
  const c = cfg();
  const n = (v, a, b, f) => { const x = Number(v); if (!(x >= a && x <= b)) throw new Error(`${f}: de ${a} a ${b}.`); return x; };
  const out = {
    enabled: i.enabled !== false,
    intervalMin: Math.round(n(i.intervalMin, 5, 24 * 60, 'Intervalo (min)')),
    durationMin: Math.round(n(i.durationMin, 1, 120, 'Duração (min)')),
    rewardMode: MODES.includes(i.rewardMode) ? i.rewardMode : 'contribution',
    minShare: Math.round(n(i.minShare, 0, 100, 'Participação mínima (%)')),
    thresholds: { prata: Math.round(n(i.thresholds.prata, 1, 1000, 'Nível para Prata')), ouro: Math.round(n(i.thresholds.ouro, 1, 1000, 'Nível para Ouro')) },
    tiers: {}, announceKills: (i.announceKills || []).filter((t) => TIERS.includes(t)),
    mapDefaults: { count: Math.round(n(i.mapDefaults.count, 0, 50, 'Quantidade padrão')), maxAlive: Math.round(n(i.mapDefaults.maxAlive, 1, 30, 'Vivos ao mesmo tempo')), intervalSec: Math.round(n(i.mapDefaults.intervalSec, 1, 600, 'Intervalo entre nascimentos')) },
    maps: {}, messages: {},
  };
  if (out.durationMin >= out.intervalMin) throw new Error('A duração precisa ser menor que o intervalo entre invasões.');
  if (out.thresholds.ouro <= out.thresholds.prata) throw new Error('O nível para Ouro precisa ser maior que o de Prata.');
  for (const t of TIERS) {
    const x = (i.tiers || {})[t] || c.tiers[t];
    out.tiers[t] = { hp: n(x.hp, 1, 100, `${t}: vida`), dmg: n(x.dmg, 1, 50, `${t}: dano`), def: n(x.def, 1, 50, `${t}: defesa`), exp: n(x.exp, 1, 100, `${t}: EXP`), zen: n(x.zen, 1, 100, `${t}: Zen`),
      box: ['kundun_bronze', 'kundun_prata', 'kundun_ouro'].includes(x.box) ? x.box : c.tiers[t].box, scale: n(x.scale, 1, 2, `${t}: tamanho`) };
  }
  for (const [mid, m] of Object.entries(i.maps || {})) {
    if (!G.WORLD[mid] || G.WORLD[mid].safe) continue;
    const mon = {};
    for (const [tp, v] of Object.entries(m.monsters || {})) if (G.MONSTERS[tp] && ['auto', 'off', ...TIERS].includes(v) && v !== 'auto') mon[tp] = v;
    out.maps[mid] = { enabled: !!m.enabled, count: Math.round(n(m.count, 0, 50, `${mid}: quantidade`)), maxAlive: Math.round(n(m.maxAlive, 1, 30, `${mid}: vivos`)),
      intervalSec: Math.round(n(m.intervalSec, 1, 600, `${mid}: intervalo`)), recLevel: Math.round(n(m.recLevel, 1, G.LIMITS.maxLevel, `${mid}: nível recomendado`)), monsters: mon };
  }
  for (const k of Object.keys(DEFAULTS.messages)) {
    const m = (i.messages || {})[k] || {};
    const pt = String(m.pt || '').trim().slice(0, 240), en = String(m.en || '').trim().slice(0, 240);
    if (!pt) throw new Error(`Mensagem "${k}": escreva o texto em português.`);
    out.messages[k] = { pt, en: en || pt };
  }
  return out;
}

async function saveConfig(i) {
  const old = cfg();
  const c = sanitize(i);
  await SET.save('invasion', c);
  // intervalo mudou: recalcula a próxima a partir da última
  if (c.intervalMin !== old.intervalMin && !active) { nextAt = Math.max(Date.now() + 60000, (lastStart || Date.now()) + c.intervalMin * 60000); await saveState(); }
  pushStatus();
  return c;
}

async function setNext(minutes) {
  if (active) throw new Error('Há uma invasão em andamento.');
  nextAt = Date.now() + Math.max(1, Math.min(24 * 60, Math.round(Number(minutes)))) * 60000;
  await saveState(); pushStatus();
}

function adminView() {
  return {
    config: cfg(), status: status(), statusText: statusText(), tiers: TIERS, modes: MODES,
    maps: Object.entries(G.WORLD).filter(([, d]) => !d.safe).map(([id, d]) => ({ id, name: d.name, minLevel: d.minLevel, cfg: mapCfg(id),
      monsters: [...new Set(d.groups.map((g) => g.type))].filter((tp) => !G.MONSTERS[tp].boss).map((tp) => ({ type: tp, name: G.MONSTERS[tp].name, level: G.MONSTERS[tp].level, elite: !!G.MONSTERS[tp].elite, auto: tierOf(tp) })) })),
  };
}

async function history(limit = 30) {
  const inv = (await db.query('SELECT id, started_at, ends_at, ended_at, trigger, spawned, killed, end_reason FROM invasions ORDER BY id DESC LIMIT $1', [Math.min(100, limit)])).rows;
  const kills = (await db.query('SELECT invasion_id, monster_name, tier, map, room, killer_name, rewards, created_at FROM invasion_kills ORDER BY id DESC LIMIT 60')).rows;
  return { invasions: inv, kills };
}

module.exports = { init, start, end, status, statusText, onKill, monInfo, spawnManual, removeAll, cfg, saveConfig, setNext, adminView, history, aliveCount, DEFAULTS, TIERS, tierOf, goldenTemplate, isActive: () => !!active };
