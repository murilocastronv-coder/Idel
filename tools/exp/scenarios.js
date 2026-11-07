'use strict';
// Relatório dos cenários do Extreme Hard (horas de jogo e dias até o nível 1000).
// Base: minutos por nível medidos com o AUTO (server/exphard.js BASE_MIN) e a curva calibrada.
// Os outros cenários aplicam os multiplicadores reais do servidor (VIP, party) ou a diferença medida na simulação
// (equipamento avançado, farm offline). Uso: node tools/exp/scenarios.js
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://sim@localhost/sim';
const EXH = require('../../server/exphard');
const VIP = require('../../server/vip');
const S = require('./sim');

const MARKS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950, 1000];
function hoursWith(rateK) {     // rateK(L): quanto mais rápido que o Free solo (1 = igual)
  let h = 0; const out = {};
  for (let L = 1; L < 1000; L++) { h += EXH.interp(EXH.BASE_MIN, L) / EXH.curveAt(L) / rateK(L) / 60; if (MARKS.includes(L + 1)) out[L + 1] = h; }
  return out;
}
const pct = VIP.PLANS ? { gold: 0.007 / 0.005, diamond: 0.008 / 0.005 } : { gold: 1.4, diamond: 1.6 };
const party3 = 1 + Number(EXH.cfg().party[3]);

// equipamento avançado: razão de velocidade da simulação (épico +9 contra comum), por nível
const simRatio = (() => {
  const b = S.run('fairy_elf', 'free').perLevel, a = S.run('fairy_elf', 'advanced').perLevel;
  return (L) => { const i = Math.min(b.length - 1, Math.max(0, L - 1)); return b[i] / a[i]; };
})();
// farm offline VIP: horas extras por dia de AUTO offline (Ouro 12 h, Diamante 24 h), com eficiência offline do servidor.
// O offline rende (vida ÷ dano + 2,5 s) / 0,6 por abate: comparado com o ritmo ativo medido, fica entre 50% e 110% (média ~65%).
const OFF_EFF = 0.65 * Number(EXH.cfg().offline);

const rows = [
  ['1. Free solo (referência)', hoursWith(() => 1)],
  ['2. Free em party de 3 ativos', hoursWith(() => party3)],
  ['3. VIP Ouro', hoursWith(() => pct.gold)],
  ['4. VIP Diamante', hoursWith(() => pct.diamond)],
  ['9. Equipamento básico (comum +0)', hoursWith(() => 1)],
  ['10. Equipamento avançado (épico +9)', hoursWith((L) => simRatio(L))],
];
const fmt = (x) => (x < 10 ? x.toFixed(1) : Math.round(x)).toString();
console.log('Horas de jogo ATIVO até cada nível');
console.log('cenário'.padEnd(40) + MARKS.map((m) => String(m).padStart(6)).join(''));
console.log('meta'.padEnd(40) + EXH.TARGET.slice(1).map(([, t]) => String(t).padStart(6)).join(''));
for (const [name, h] of rows) console.log(name.padEnd(40) + MARKS.map((m) => fmt(h[m]).padStart(6)).join(''));

const free = rows[0][1][1000];
console.log('\nDias até o nível 1000 (Free solo, só jogo ativo):');
for (const d of [1, 2, 3]) console.log(`  ${d === 1 ? '5' : d === 2 ? '6' : '7'}. ${d} h por dia: ${Math.round(free / d)} dias`);
console.log('\n8. Com eventos: Devil Square e Blood Castle rendem 1,5× o EXP por abate (3× ÷ 2) só durante a partida;');
console.log('   jogando 1 evento de 10 min por dia em 2 h diárias, o tempo cai cerca de ' + Math.round((1 - 1 / (1 + (10 / 120) * 0.5)) * 100) + '% (≈ ' + Math.round(free / 2 / (1 + (10 / 120) * 0.5)) + ' dias).');
for (const [plan, offH, mult] of [['VIP Ouro', 12, pct.gold], ['VIP Diamante', 24, pct.diamond]]) {
  const perDayActive = 2 * mult, perDayOff = offH * OFF_EFF * mult;   // "horas de Free solo" ganhas por dia
  console.log(`11. ${plan} com farm offline (${offH} h/dia) + 2 h ativas: ≈ ${Math.round(free / (perDayActive + perDayOff))} dias (sem offline: ${Math.round(free / perDayActive)} dias)`);
}
process.exit(0);
