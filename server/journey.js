'use strict';
// "Minha Jornada" e calendário de eventos. Tudo calculado no servidor com os dados reais do herói:
// nível, classe, equipamentos, missões, mapas liberados, bosses e horários dos eventos.
// Nunca recomenda mapa bloqueado nem evento fora da categoria/nível do herói.
const G = require('./gamedata');
const Q = require('./quests');

let W = null, ARENA = null, INV = null, GM = null;
const extra = [];          // outros módulos (Boss Mundial, Castle Siege…) registram eventos aqui
function init(world, deps) { W = world; ARENA = deps.ARENA; INV = deps.INV; GM = deps.GM; }
function addProvider(fn) { extra.push(fn); }

const MAIN_SLOTS = ['helm', 'armor', 'pants', 'gloves', 'boots', 'weapon'];
const SLOT_PT = { helm: 'elmo', armor: 'armadura', pants: 'calça', gloves: 'luvas', boots: 'botas', weapon: 'arma', wings: 'asa' };
const eqSlot = (it) => it.eq_slot || (G.ITEM_BASES[it.base] || {}).slot;
const fmtIn = (ms) => { const m = Math.max(0, Math.round(ms / 60000)); return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}min` : `${m} min`; };

function worldMaps() {
  return Object.entries(G.WORLD).filter(([, d]) => !d.arena && d.groups && d.groups.length && !d.safe)
    .map(([id, d]) => ({ id, d })).sort((a, b) => a.d.minLevel - b.d.minLevel);
}
// mapa recomendado: o mais alto já liberado onde os monstros ainda dão EXP para o herói
function recommendMap(p) {
  const cap = (d) => require('./world').mapExpCap(d);
  const open = worldMaps().filter((x) => p.level >= (x.d.minLevel || 1));
  const good = open.filter((x) => p.level <= cap(x.d));
  let best = good[good.length - 1] || open[open.length - 1] || null;
  // antes do primeiro mapa de caça: área de treino de Noria
  if (!best && G.WORLD.noria) best = { id: 'noria', d: { ...G.WORLD.noria, name: `${G.WORLD.noria.name} (área de treino)` } };
  const next = worldMaps().find((x) => (x.d.minLevel || 1) > p.level) || null;
  const here = p.map && !p.map.def.arena ? p.map.def : null;
  const overHere = here && !here.safe && Number.isFinite(cap(here)) && p.level > cap(here);
  return { best: best && { id: best.id, name: best.d.name, minLevel: best.d.minLevel }, next: next && { id: next.id, name: next.d.name, minLevel: next.d.minLevel },
    here: here ? { name: here.name, over: !!overHere, isBest: !!(best && p.map.id === best.id) } : null };
}
// o que dá para melhorar no equipamento (vazio > muito abaixo do nível > pouco aprimorado)
function gearAdvice(p) {
  const on = p.items.filter((i) => i.equipped);
  const bySlot = Object.fromEntries(on.map((i) => [eqSlot(i), i]));
  const slots = MAIN_SLOTS.filter((s) => !(s === 'helm' && p.cls === 'magic_gladiator'));
  const empty = slots.filter((s) => !bySlot[s]);
  if (empty.length) return { kind: 'empty', text: `Equipe ${empty.map((s) => SLOT_PT[s]).join(', ')}: a Loja e os drops dos mapas têm peças do seu nível.`, slots: empty };
  const old = on.filter((i) => MAIN_SLOTS.includes(eqSlot(i)) && ((G.ITEM_BASES[i.base] || {}).req || 1) + 120 < p.level)
    .sort((a, b) => ((G.ITEM_BASES[a.base] || {}).req || 1) - ((G.ITEM_BASES[b.base] || {}).req || 1))[0];
  if (old) return { kind: 'old', text: `Seu(sua) ${(G.ITEM_BASES[old.base] || {}).name} é para o nível ${(G.ITEM_BASES[old.base] || {}).req || 1}: procure uma peça mais forte nos drops, Box Kundun ou Mercado.`, item: old.base };
  const low = on.filter((i) => MAIN_SLOTS.includes(eqSlot(i)) && (i.plus || 0) < 9).sort((a, b) => (a.plus || 0) - (b.plus || 0))[0];
  if (low) return { kind: 'plus', text: `Melhore ${(G.ITEM_BASES[low.base] || {}).name} de +${low.plus || 0} para +${(low.plus || 0) + 1} (Jewel of Bless/Soul ou Ferreiro).`, item: low.base };
  if (!bySlot.wings && p.level >= 150) return { kind: 'wings', text: 'Conquiste uma asa ou capa: crie na Chaos Machine (Noria) com Jewel of Chaos.' };
  return { kind: 'ok', text: 'Seu equipamento está forte para o nível. Busque opções Excellent e +10 a +15.' };
}
function nextBoss(p) {
  const room = (p.map && p.map.room) || p.room || 1;
  const list = Object.entries(G.WORLD).filter(([, d]) => d.boss && !d.arena && p.level >= (d.minLevel || 1))
    .map(([id, d]) => ({ id, d, T: G.MONSTERS[d.boss.type] })).filter((x) => x.T)
    .sort((a, b) => b.d.minLevel - a.d.minLevel);
  const b = list.find((x) => (x.T.level || 0) <= p.level + 60) || list[list.length - 1];
  if (!b) return null;
  const inst = W.maps.get(`${room}:${b.id}`); const m = inst && inst.boss;
  return { name: b.T.name, map: b.d.name, level: b.T.level, room, alive: !!(m && !m.dead), respawnIn: m && m.dead ? Math.max(0, m.respawnAt - Date.now()) : 0 };
}

// ---------- calendário ----------
function calendar(p) {
  const now = Date.now();
  const out = [];
  for (const kind of ARENA.KINDS) {
    let i; try { i = ARENA.info(p, kind); } catch (_) { continue; }
    if (!i.enabled) continue;
    const cat = i.myCat >= 0 ? i.categories[i.myCat] : null;
    const running = i.categories.some((c) => c.running);
    out.push({ id: kind, name: i.name, at: i.slot, openAt: i.openAt, endsAt: running ? i.slot + i.durationMin * 60000 : 0, durationMin: i.durationMin,
      state: running ? 'live' : now >= i.openAt && now < i.slot ? 'open' : 'next', can: !!cat,
      req: cat ? `${cat.name} (nível ${cat.minLevel}–${cat.maxLevel}${cat.minResets ? `, ${cat.minResets} resets` : ''}) · entrada: ${cat.entry.name}${cat.entry.have ? ` (você tem ${cat.entry.have})` : ''}`
        : `Fora das categorias: ${i.categories.map((c) => `${c.minLevel}–${c.maxLevel}`).join(', ')}`,
      rewards: i.rewards ? [...new Set(Object.values(i.rewards).flat())].slice(0, 5) : [], where: kind === 'blood' ? 'NPC em Devias' : kind === 'devil' ? 'NPC em Noria' : 'NPC em Lorencia' });
  }
  try {
    const s = INV.status();
    if (s.enabled) out.push({ id: 'invasion', name: 'Invasão Dourada', at: s.active ? now : s.nextAt, endsAt: s.active ? s.endsAt : 0, state: s.active ? 'live' : 'next', can: true,
      req: 'Todos os níveis · monstros dourados aparecem nos mapas', rewards: ['Box Kundun (por participação)', 'EXP e Zen dividida por dano'], where: 'Vários mapas' });
  } catch (_) { /* invasão desligada */ }
  try {
    const g = GM.eventsStatus ? GM.eventsStatus() : [];
    for (const e of g) out.push({ id: 'gm_' + e.kind, name: e.name, at: now, endsAt: e.until, state: 'live', can: true, req: 'Todos os jogadores', rewards: [e.desc], where: 'Todos os mapas' });
  } catch (_) { /* sem eventos do GM */ }
  for (const fn of extra) { try { const r = fn(p); if (r) out.push(...[].concat(r)); } catch (e) { console.error('[jornada] evento', e.message); } }
  const rank = { live: 0, open: 1, next: 2 };
  out.sort((a, b) => rank[a.state] - rank[b.state] || (a.at || Infinity) - (b.at || Infinity));
  return out;
}

// ---------- Minha Jornada ----------
function journey(p) {
  const qs = Q.state(p);
  const map = recommendMap(p);
  const gear = gearAdvice(p);
  const boss = nextBoss(p);
  const events = calendar(p);
  const canEvents = events.filter((e) => e.can);
  const soon = canEvents.find((e) => e.state !== 'next' || (e.at && e.at - Date.now() < 20 * 60000));
  const weeklyDone = qs.weekly.filter((m) => m.prog >= m.goal).length;
  const ach = qs.ach.filter((a) => a.state === 'open').map((a) => ({ ...a, pct: a.prog / Math.max(1, a.goal) })).sort((a, b) => b.pct - a.pct).slice(0, 3);
  const openDaily = qs.daily.filter((m) => !m.claimed && m.prog < m.goal);
  // próximo objetivo: o mais útil agora
  let goal;
  if (qs.claimable > 0) goal = { text: `Você tem ${qs.claimable} prêmio(s) para pegar em Missões.`, go: 'missions' };
  else if (qs.comeback && !qs.comeback.claimed) goal = { text: `Bem-vindo de volta! Complete as missões de retorno: ${qs.comeback.list.map((m) => m.text).join(', ')}.`, go: 'missions' };
  else if (soon) goal = { text: `${soon.name} ${soon.state === 'live' ? 'está acontecendo agora' : soon.state === 'open' ? 'está com inscrições abertas' : `começa em ${fmtIn(soon.at - Date.now())}`}. ${soon.where}.`, go: 'events' };
  else if (map.here && map.here.over && map.best) goal = { text: `Você está no nível ${p.level} e os monstros daqui não dão mais EXP. Vá para ${map.best.name}.`, go: 'maps', map: map.best.id };
  else if (gear.kind === 'empty') goal = { text: gear.text, go: 'bag' };
  else if (map.best && map.here && !map.here.isBest && !map.here.over && map.best.minLevel > ((G.WORLD[p.map.id] || {}).minLevel || 0)) goal = { text: `Você está no nível ${p.level}: ${map.best.name} já está liberado e dá mais EXP.`, go: 'maps', map: map.best.id };
  else if (openDaily[0]) goal = { text: `Missão diária: ${openDaily[0].text} (${openDaily[0].prog}/${openDaily[0].goal}).`, go: 'missions' };
  else if (boss && boss.alive) goal = { text: `${boss.name} está vivo em ${boss.map} (Sala ${boss.room}). Chame uma party!`, go: 'maps' };
  else if (gear.kind !== 'ok') goal = { text: gear.text, go: 'smith' };
  else goal = { text: map.next ? `Suba até o nível ${map.next.minLevel} para liberar ${map.next.name}.` : 'Você chegou ao último mapa: busque resets, Master Reset e itens Excellent +15.', go: 'maps' };
  return {
    type: 'journey', level: p.level, resets: p.resets || 0, cls: p.cls, goal, map, gear, boss,
    missions: { daily: qs.daily.length, dailyDone: qs.daily.filter((m) => m.prog >= m.goal).length, weekly: qs.weekly.length, weeklyDone, claimable: qs.claimable, weekIn: qs.weekIn },
    events: events.slice(0, 8), achievements: ach,
  };
}

module.exports = { init, addProvider, calendar, journey };
