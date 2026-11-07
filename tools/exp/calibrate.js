'use strict';
// Calibra a curva Extreme Hard a partir das medições reais do AUTO (tools/exp/measure.js).
// Entrada: arquivo com linhas "nível mapa {json da medição}" (saída de measure_all.sh).
// Saída: BASE_MIN (minutos por nível sem a curva) e as âncoras da curva para bater a tabela de horas-alvo.
// Uso: node tools/exp/calibrate.js medições.log [--write]   (--write grava em server/exphard.js)
const fs = require('fs');
const path = require('path');
const TARGET = [[1, 0], [50, 1], [100, 3], [200, 10], [300, 20], [400, 35], [500, 55], [600, 85], [700, 125], [800, 175], [900, 235], [950, 275], [1000, 320]];
const expToNext = (L) => Math.floor(100 * Math.pow(L, 2.1) + 200);
const oldProg = (L) => 1 / (1 + L / 600);   // redutor que estava ligado durante a medição

// pontos medidos: minutos por nível SEM curva (EXP/s medido ÷ redutor antigo)
const pts = [];
for (const line of fs.readFileSync(process.argv[2], 'utf8').split('\n')) {
  const m = /^(\d+) (\S+) (\{.*\})$/.exec(line.trim());
  if (!m) continue;
  const L = Number(m[1]), r = JSON.parse(m[3]);
  if (!(r.exp > 0 && r.secs > 0)) continue;
  const rate = r.exp / r.secs / oldProg(L);                  // EXP por segundo com multiplicador 1
  pts.push([L, expToNext(L) / rate / 60]);
}
pts.sort((a, b) => a[0] - b[0]);
if (pts.length < 3) throw new Error('poucas medições');
// interpolação log-log; antes da 1ª medição segue a inclinação dos dois primeiros pontos
const lerpLog = (P, L) => {
  const seg = (a, b) => { const t = (Math.log(L) - Math.log(a[0])) / (Math.log(b[0]) - Math.log(a[0])); return Math.exp(Math.log(a[1]) + t * (Math.log(b[1]) - Math.log(a[1]))); };
  if (L <= P[0][0]) return seg(P[0], P[1]);
  for (let i = 0; i < P.length - 1; i++) if (L <= P[i + 1][0]) return seg(P[i], P[i + 1]);
  return seg(P[P.length - 2], P[P.length - 1]);
};
const baseMin = (L) => lerpLog(pts, L);

// meta: minutos por nível = derivada da tabela acumulada (interpolação monótona suave, PCHIP)
function pchip(X, Y) {
  const n = X.length, h = [], d = [], m = new Array(n);
  for (let i = 0; i < n - 1; i++) { h[i] = X[i + 1] - X[i]; d[i] = (Y[i + 1] - Y[i]) / h[i]; }
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (3 * (h[i - 1] + h[i])) / ((2 * h[i] + h[i - 1]) / d[i - 1] + (h[i] + 2 * h[i - 1]) / d[i]);
  return (x) => {
    let i = 0; while (i < n - 2 && x > X[i + 1]) i++;
    const t = (x - X[i]) / h[i], t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * Y[i] + (t3 - 2 * t2 + t) * h[i] * m[i] + (-2 * t3 + 3 * t2) * Y[i + 1] + (t3 - t2) * h[i] * m[i + 1];
  };
}
const cum = pchip(TARGET.map((x) => x[0]), TARGET.map((x) => x[1]));
const targetMin = (L) => Math.max(0.01, (cum(L + 1) - cum(L)) * 60);

// multiplicador por nível e âncoras (a curva do servidor interpola em log entre elas)
const ANCH = [1, 10, 20, 30, 40, 50, 75, 100, 150, 200, 250, 300, 350, 400, 450, 500, 550, 600, 650, 700, 750, 800, 850, 900, 950, 1000];
const multAt = (L) => baseMin(L) / targetMin(Math.min(999, L));
// começo plano até o nível 10 (os primeiros níveis passam em segundos; evita degrau no início)
const curve = ANCH.map((L) => [L, Math.round(multAt(Math.max(10, L)) * 1000) / 1000]);
const BASE = ANCH.map((L) => [L, Math.round(baseMin(L) * 1000) / 1000]);

// conferência: horas com a curva (mesma conta do ADM)
const interp = (P, L) => lerpLog(P, L);
let hrs = 0; const marks = {};
for (let L = 1; L < 1000; L++) { hrs += interp(BASE, L) / interp(curve, L) / 60; if (TARGET.some(([l]) => l === L + 1)) marks[L + 1] = hrs; }
console.log('medições (nível → min/nível sem curva):', pts.map(([l, v]) => `${l}:${v.toFixed(1)}`).join(' '));
console.log('curva:', JSON.stringify(curve));
for (const [l, t] of TARGET.slice(1)) console.log(`  nível ${String(l).padStart(4)}: ${marks[l].toFixed(1).padStart(6)} h  (meta ${t} h)`);

if (process.argv.includes('--write')) {
  const f = path.join(__dirname, '..', '..', 'server', 'exphard.js');
  let s = fs.readFileSync(f, 'utf8');
  s = s.replace(/const BASE_MIN = \[.*?\];/s, `const BASE_MIN = ${JSON.stringify(BASE)};`);
  s = s.replace(/  curve: \[\[.*?\]\],/s, `  curve: ${JSON.stringify(curve)},`);
  fs.writeFileSync(f, s);
  console.log('gravado em server/exphard.js');
}
