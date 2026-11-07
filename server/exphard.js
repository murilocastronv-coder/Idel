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
const BASE_MIN = [[1,18.639],[10,9.663],[20,7.929],[30,7.063],[40,3.558],[50,4.031],[75,5.297],[100,6.607],[150,9.17],[200,11.449],[250,13.409],[300,16.83],[350,18.064],[400,19.205],[450,20.6],[500,22.158],[550,23.758],[600,25.382],[650,26.412],[700,27.035],[750,30.314],[800,33.739],[850,34.528],[900,33.562],[950,32.673],[1000,31.851]];

const DEFAULTS = {
  // [nível, multiplicador do EXP por abate]
  curve: [[1,8.66],[10,8.66],[20,7.224],[30,5.994],[40,2.62],[50,2.458],[75,2.147],[100,2.216],[150,2.116],[200,2.313],[250,2.244],[300,2.33],[350,1.976],[400,1.865],[450,1.739],[500,1.534],[550,1.299],[600,1.231],[650,1.09],[700,1.012],[750,1.004],[800,1.031],[850,0.975],[900,0.799],[950,0.641],[1000,0.589]],
  perReset: 0.05,          // cada reset deixa 5% mais difícil (igual ao sistema anterior)
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
function levelK(p) {
  const C = cfg();
  return curveAt(p.level || 1) / (1 + (p.resets || 0) * (Number(C.perReset) || 0));
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
function projection(curve) {
  const C = curve || cfg().curve;
  let h = 0;
  const out = {};
  for (let L = 1; L < 1000; L++) {
    h += interp(BASE_MIN, L) / interp(C, L) / 60;
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
  return { ok: true, config: c, defaults: DEFAULTS, target: TARGET, projection: projection(c.curve), live: liveStats() };
}

module.exports = { init, cfg, levelK, curveAt, partyBonus, projection, save, adminView, interp, record, onLevel, liveStats, TARGET, BASE_MIN, DEFAULTS };
