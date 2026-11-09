'use strict';
// MU Extreme Hard: quanto EXP cada monstro rende em cada nível, calibrado para ~320 horas de jogo ativo até o nível 1000
// (jogador Free, sozinho, no mapa do seu nível). Nada aqui mexe em personagens: só no EXP que os próximos abates rendem.
//
// EXP por abate = barra do nível × % do plano (Free 0,5% · Ouro 0,7% · Diamante 0,8%) × vida do monstro × bônus do mapa
//               × corte geral × CURVA(nível) ÷ (1 + resets × perReset)
// CURVA(nível): multiplicadores em níveis-âncora (configuráveis no ADM), interpolados suavemente entre si (escala log),
// sem saltos entre faixas. A barra de EXP de cada nível (EXP necessária) continua a mesma: quem já tem EXP guardada não perde nada.
const SET = require('./settings');

const KEY = 'exp_hard';
// tempo-alvo acumulado (horas de jogo ativo, Free solo) — a meta do Extreme Hard
const TARGET = [[1, 0], [50, 1], [100, 3], [200, 10], [300, 20], [400, 35], [500, 55], [600, 85], [700, 125], [800, 175], [900, 235], [950, 275], [1000, 320]];

// minutos por nível SEM a curva (multiplicador 1), medidos com o AUTO no servidor (personagem Free, atributos padrão,
// mapa indicado para o nível). Serve para mostrar no ADM quanto tempo a curva escolhida dá. Preenchido por tools/exp/calibrate.js.
const BASE_MIN = [[1,8.832],[10,11.535],[20,12.5],[30,13.102],[40,15.289],[50,20.063],[75,34.556],[100,52.311],[150,78.142],[200,105.225],[250,134.844],[300,138.89],[350,163.54],[400,188.401],[450,194.085],[500,187.676],[550,228.723],[600,316.949],[650,344.63],[700,324.077],[750,233.963],[800,172.497],[850,149.688],[900,143.804],[950,138.451],[1000,133.557]];

const DEFAULTS = {
  // [nível, multiplicador do EXP por abate]
  curve: [[1,10.338],[10,10.338],[20,11.387],[30,11.118],[40,11.259],[50,12.236],[75,14.006],[100,17.543],[150,18.033],[200,21.256],[250,22.564],[300,19.229],[350,17.885],[400,18.298],[450,16.38],[500,12.991],[550,12.507],[600,15.376],[650,14.229],[700,12.135],[750,7.752],[800,5.27],[850,4.227],[900,3.424],[950,2.717],[1000,2.47]],
  perReset: 0.05,          // cada reset deixa 5% mais difícil (igual ao sistema anterior)
  globalMult: 0.814,       // multiplicador geral do EXP: calibrado para 1 reset por mês (~720 h de AUTO até o nível 1000)
  levelCut: 0.6,           // corte progressivo: 0% no nível 1 subindo até este valor no nível 1000 (0,6 = −60%)
  offline: 1,              // multiplicador extra do EXP no farm offline (1 = igual ao online calculado)
  party: { 2: 0.10, 3: 0.12, 4: 0.15, 5: 0.20 },   // bônus por membros ativos e perto
  partyRange: 700,         // distância máxima (pixels do mapa) para contar como "perto"
  partyActiveS: 45,        // precisa ter matado algo nesse tempo para contar como ativo (evita AFK)
};
const cfg = () => SET.get(KEY, DEFAULTS);
async function init() { await SET.load(KEY, DEFAULTS); }

// interpolação em escala log entre as âncoras (contínua, sem degraus)
function interp(points, L) {
  const P = points;
  if (L <= P[0][0]) return P[0][1];
  for (let i = 0; i < P.length - 1; i++) {
    const [l0, v0] = P[i], [l1, v1] = P[i + 1];
    if (L <= l1) {
      const t = (Math.log(L) - Math.log(l0)) / (Math.log(l1) - Math.log(l0) || 1);
      return Math.exp(Math.log(v0) + t * (Math.log(v1) - Math.log(v0)));
    }
  }
  return P[P.length - 1][1];
}
const curveAt = (L) => interp(cfg().curve, Math.max(1, Math.min(1000, L)));
// multiplicador de EXP do herói (nível + resets)
// corte progressivo por nível: o EXP vai caindo cada vez mais conforme o herói sobe (0% no nível 1 → levelCut no 1000)
const cutAt = (L, cut) => 1 - Math.min(0.95, Math.max(0, Number(cut) || 0)) * (Math.max(1, Math.min(1000, L)) - 1) / 999;
function levelK(p) {
  const C = cfg();
  const g = Number(C.globalMult); return curveAt(p.level || 1) * cutAt(p.level || 1, C.levelCut) * (g > 0 ? g : 1) / (1 + (p.resets || 0) * (Number(C.perReset) || 0));
}

// prêmios fixos de EXP (missões, Boss Mundial, eventos): mesmo corte geral e progressivo do farm (sem a curva,
// que só compensa o tempo de abate). Antes eles davam a % cheia da barra e escapavam do servidor hard.
function rewardK(p) {
  const C = cfg(), g = Number(C.globalMult);
  return (g > 0 ? g : 1) * cutAt((p && p.level) || 1, C.levelCut);
}

// bônus de party: só membros da mesma party, no mesmo mapa e sala, perto e que mataram algo nos últimos segundos.
// Não soma de novo para quem não está participando (AFK, conta parada longe).
function partyBonus(p, party, players) {
  if (!party || !party.members || party.members.size < 2) return 0;
  const C = cfg(), now = Date.now();
  let n = 0;
  for (const id of party.members) {
    const o = players.get(String(id));
    if (!o || o.map !== p.map) continue;
    if (o !== p && Math.hypot((o.x || 0) - (p.x || 0), (o.y || 0) - (p.y || 0)) > C.partyRange) continue;
    if (o !== p && !(o.lastKillAt && now - o.lastKillAt < C.partyActiveS * 1000)) continue;
    n++;
  }
  if (n < 2) return 0;
  return Number(C.party[Math.min(5, n)]) || 0;
}

// ---------- números reais (memória, desde que o servidor ligou): EXP por hora ativa, por mapa, monstro, boss, evento e offline ----------
const ST = { since: Date.now(), tiers: {}, maps: {}, mons: {}, bosses: {}, events: {}, offline: { exp: 0, secs: 0, n: 0 } };
const TIER_NAME = { 0: 'Free', 1: 'VIP Ouro', 2: 'VIP Diamante' };
function bump(obj, key, exp) { const o = obj[key] || (obj[key] = { exp: 0, n: 0 }); o.exp += exp; o.n++; }
// source: monster | boss | event | offline. Tempo ativo = intervalos curtos (até 90 s) entre ganhos de EXP de cada herói.
function record(p, source, exp, info = {}) {
  if (!p || !(exp > 0)) return;
  if (source === 'offline') { ST.offline.exp += exp; ST.offline.secs += info.secs || 0; ST.offline.n++; return; }
  const tier = (p.vip && p.vip().tier) || 0, now = Date.now();
  const t = ST.tiers[tier] || (ST.tiers[tier] = { exp: 0, secs: 0, levels: 0, players: new Set() });
  t.exp += exp; t.players.add(p.charId);
  if (p._expSeen && now - p._expSeen < 90000) t.secs += (now - p._expSeen) / 1000;
  p._expSeen = now;
  if (source === 'monster') { if (info.map) bump(ST.maps, info.map, exp); if (info.mon) bump(ST.mons, info.mon, exp); }
  else if (source === 'boss') bump(ST.bosses, info.name || 'Boss', exp);
  else if (source === 'event') bump(ST.events, info.kind || 'evento', exp);
}
function onLevel(p) { const tier = (p.vip && p.vip().tier) || 0; const t = ST.tiers[tier]; if (t) t.levels++; }
const top = (obj, n = 15) => Object.entries(obj).sort((a, b) => b[1].exp - a[1].exp).slice(0, n).map(([k, v]) => ({ name: k, exp: Math.round(v.exp), n: v.n }));
function liveStats() {
  const tiers = Object.entries(ST.tiers).map(([k, t]) => ({ tier: TIER_NAME[k] || k, players: t.players.size, exp: Math.round(t.exp), activeH: Math.round(t.secs / 36) / 100,
    expPerH: t.secs > 60 ? Math.round(t.exp / (t.secs / 3600)) : 0, levels: t.levels, minPerLevel: t.levels ? Math.round(t.secs / 60 / t.levels * 10) / 10 : null }));
  return { since: ST.since, tiers, maps: top(ST.maps), monsters: top(ST.mons), bosses: top(ST.bosses), events: top(ST.events),
    offline: { exp: Math.round(ST.offline.exp), hours: Math.round(ST.offline.secs / 36) / 100, reports: ST.offline.n } };
}

// horas estimadas até cada marco com a curva atual (Free solo, sem eventos/missões)
function projection(curve, levelCut, globalMult) {
  const C = curve || cfg().curve, cut = levelCut === undefined ? cfg().levelCut : levelCut;
  const gm = globalMult === undefined ? (Number(cfg().globalMult) || 1) : globalMult;
  let h = 0;
  const out = {};
  for (let L = 1; L < 1000; L++) {
    h += interp(BASE_MIN, L) / (interp(C, L) * cutAt(L, cut) * gm) / 60;
    if ([50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950].includes(L + 1)) out[L + 1] = h;
  }
  out[1000] = h;
  return out;
}

function clean(input) {
  const C = cfg(), out = { ...C };
  if (Array.isArray(input.curve)) {
    const pts = input.curve.map((x) => [Math.round(Number(x[0])), Number(x[1])])
      .filter(([l, v]) => l >= 1 && l <= 1000 && v > 0 && v < 1000).sort((a, b) => a[0] - b[0]);
    if (pts.length < 2 || pts[0][0] !== 1 || pts[pts.length - 1][0] !== 1000) throw new Error('A curva precisa de âncoras no nível 1 e no 1000 (multiplicadores maiores que 0).');
    out.curve = pts;
  }
  if (input.perReset !== undefined) { const v = Number(input.perReset); if (!(v >= 0 && v <= 1)) throw new Error('Dificuldade por reset: 0 a 1.'); out.perReset = v; }
  if (input.globalMult !== undefined) { const v = Number(input.globalMult); if (!(v > 0 && v <= 5)) throw new Error('Multiplicador geral: maior que 0 e até 5.'); out.globalMult = v; }
  if (input.levelCut !== undefined) { const v = Number(input.levelCut); if (!(v >= 0 && v <= 0.95)) throw new Error('Corte progressivo: 0 a 0,95.'); out.levelCut = v; }
  if (input.offline !== undefined) { const v = Number(input.offline); if (!(v >= 0 && v <= 2)) throw new Error('EXP offline: 0 a 2.'); out.offline = v; }
  if (input.party) {
    const pt = {};
    for (const n of [2, 3, 4, 5]) { const v = Number(input.party[n]); if (!(v >= 0 && v <= 1)) throw new Error('Bônus de party: 0 a 1 (0,10 = +10%).'); pt[n] = v; }
    out.party = pt;
  }
  return out;
}
async function save(input) { const v = clean(input || {}); await SET.save(KEY, v); return v; }
function adminView() {
  const c = cfg();
  return { ok: true, config: c, defaults: DEFAULTS, target: TARGET, projection: projection(c.curve, c.levelCut, Number(c.globalMult) || 1), live: liveStats() };
}

module.exports = { init, cfg, levelK, rewardK, curveAt, cutAt, partyBonus, projection, save, adminView, interp, record, onLevel, liveStats, TARGET, BASE_MIN, DEFAULTS };
