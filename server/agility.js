'use strict';
// Agilidade total → chance de crítico, intervalo de ataque e defesa (inspirado no MU Online).
// Agilidade total = pontos distribuídos + agilidade dos itens equipados (campo "agi" dos itens/opções).
// As curvas são progressivas: crescem sempre com a agilidade, sem trava fixa de 50%.
// Até o "joelho" de cada curva o valor é igual à fórmula antiga (ninguém perde nada);
// depois dele o ganho continua, mais devagar, até um limite de segurança configurável pelo ADM.
const SET = require('./settings');

const CLASSES = ['dark_knight', 'dark_wizard', 'fairy_elf', 'magic_gladiator', 'dark_lord', 'summoner'];
const DEFAULTS = {
  crit: { base: 5, perPoint: 0.05, knee: 900, extra: 35, curve: 1400, cap: 90 },   // valores em %
  speed: { baseMs: 1100, perPoint: 3, knee: 250, minMs: 200, curve: 1000 },         // intervalo entre ataques
  defense: { divisor: 4, knee: 1500, divisorAfter: 8 },                              // defesa vinda da agilidade
  // multiplicador da agilidade em cada cálculo, por classe (1 = padrão)
  classes: Object.fromEntries(CLASSES.map((c) => [c, { crit: 1, speed: 1, defense: 1 }])),
};
const KEY = 'agility_formula';
const cfg = () => SET.get(KEY, DEFAULTS);
async function init() { await SET.load(KEY, DEFAULTS); }
const clsK = (cls, k) => { const c = cfg().classes[cls]; const v = c && Number(c[k]); return Number.isFinite(v) && v > 0 ? v : 1; };

// chance de crítico (0..1). itemCrit em % (opções Excellent)
function crit(agi, cls, itemCrit = 0) {
  const C = cfg().crit, A = Math.max(0, agi) * clsK(cls, 'crit');
  const kneeVal = C.base + C.knee * C.perPoint;
  const fromAgi = A <= C.knee ? C.base + A * C.perPoint : kneeVal + C.extra * (1 - Math.exp(-(A - C.knee) / C.curve));
  return Math.min(C.cap, fromAgi + Math.max(0, itemCrit)) / 100;
}
// intervalo entre ataques em ms. itemSpeed = opção "Velocidade de ataque" dos itens
function atkMs(agi, cls, itemSpeed = 0) {
  const S = cfg().speed, A = Math.max(0, agi) * clsK(cls, 'speed');
  const kneeMs = S.baseMs - S.knee * S.perPoint;
  const ms = A <= S.knee ? S.baseMs - A * S.perPoint : kneeMs - (kneeMs - S.minMs) * (1 - Math.exp(-(A - S.knee) / S.curve));
  return Math.max(S.minMs, Math.round(ms - Math.max(0, itemSpeed)));
}
// defesa vinda da agilidade
function defense(agi, cls) {
  const D = cfg().defense, A = Math.max(0, agi) * clsK(cls, 'defense');
  return A <= D.knee ? A / D.divisor : D.knee / D.divisor + (A - D.knee) / D.divisorAfter;
}

function clean(input) {
  const n = (v, lo, hi, label) => { const x = Number(v); if (!Number.isFinite(x) || x < lo || x > hi) throw new Error(`${label}: escolha um valor entre ${lo} e ${hi}.`); return x; };
  const d = DEFAULTS, i = input || {};
  const c = i.crit || {}, s = i.speed || {}, f = i.defense || {};
  const out = {
    crit: { base: n(c.base ?? d.crit.base, 0, 50, 'Crítico base (%)'), perPoint: n(c.perPoint ?? d.crit.perPoint, 0, 1, 'Crítico por ponto (%)'),
      knee: n(c.knee ?? d.crit.knee, 0, 100000, 'Crítico: agilidade do joelho'), extra: n(c.extra ?? d.crit.extra, 0, 100, 'Crítico extra depois do joelho (%)'),
      curve: n(c.curve ?? d.crit.curve, 50, 100000, 'Crítico: suavidade da curva'), cap: n(c.cap ?? d.crit.cap, 1, 100, 'Crítico máximo de segurança (%)') },
    speed: { baseMs: n(s.baseMs ?? d.speed.baseMs, 300, 5000, 'Intervalo base (ms)'), perPoint: n(s.perPoint ?? d.speed.perPoint, 0, 50, 'ms por ponto'),
      knee: n(s.knee ?? d.speed.knee, 0, 100000, 'Velocidade: agilidade do joelho'), minMs: n(s.minMs ?? d.speed.minMs, 150, 2000, 'Intervalo mínimo técnico (ms)'),
      curve: n(s.curve ?? d.speed.curve, 50, 100000, 'Velocidade: suavidade da curva') },
    defense: { divisor: n(f.divisor ?? d.defense.divisor, 1, 100, 'Defesa: agilidade por ponto de defesa'), knee: n(f.knee ?? d.defense.knee, 0, 100000, 'Defesa: agilidade do joelho'),
      divisorAfter: n(f.divisorAfter ?? d.defense.divisorAfter, 1, 200, 'Defesa: agilidade por ponto depois do joelho') },
    classes: {},
  };
  if (out.speed.baseMs - out.speed.knee * out.speed.perPoint < out.speed.minMs) throw new Error('Velocidade: no joelho o intervalo ficaria abaixo do mínimo técnico. Diminua o joelho ou os ms por ponto.');
  for (const k of CLASSES) {
    const x = (i.classes || {})[k] || {};
    out.classes[k] = { crit: n(x.crit ?? 1, 0.1, 5, `${k} crítico`), speed: n(x.speed ?? 1, 0.1, 5, `${k} velocidade`), defense: n(x.defense ?? 1, 0.1, 5, `${k} defesa`) };
  }
  return out;
}
// tabela de conferência: o que cada classe ganha com 500…2000 de agilidade (sem itens)
function preview() {
  const pts = [100, 250, 500, 800, 1000, 1260, 1580, 2000, 3000];
  return Object.fromEntries(CLASSES.map((c) => [c, pts.map((a) => ({ agi: a, crit: Math.round(crit(a, c) * 1000) / 10, atkMs: atkMs(a, c), def: Math.round(defense(a, c)) }))]));
}
async function save(input) { const v = clean(input); await SET.save(KEY, v); return v; }
function adminView() { return { ok: true, config: cfg(), defaults: DEFAULTS, preview: preview() }; }

module.exports = { init, crit, atkMs, defense, save, adminView, preview, DEFAULTS };
