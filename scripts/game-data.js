'use strict';
// Lê listas de dados direto dos arquivos .ts do jogo (objetos literais simples), para o site e o
// servidor usarem exatamente os mesmos dados do jogo, sem duplicar.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = path.join(__dirname, '..', 'game', 'website', 'src', 'gameplay');

function literal(file, name) {
  const text = fs.readFileSync(path.join(SRC, file), 'utf8');
  const start = text.indexOf(`export const ${name}`);
  if (start < 0) throw new Error(`${name} não encontrado em ${file}`);
  const eq = text.indexOf('=', start);
  const open = text.slice(eq).search(/[[{]/) + eq;
  let depth = 0, inStr = null, i = open;
  for (; i < text.length; i++) {
    const c = text[i];
    if (inStr) { if (c === '\\') i++; else if (c === inStr) inStr = null; continue; }
    if (c === '"' || c === "'" || c === '`') { inStr = c; continue; }
    if (c === '[' || c === '{') depth++;
    else if (c === ']' || c === '}') { depth--; if (depth === 0) break; }
  }
  return vm.runInNewContext(`(${text.slice(open, i + 1)})`, {});
}

function stringConst(file, name) {
  const m = new RegExp(`${name}\\s*=\\s*"([^"]+)"`).exec(fs.readFileSync(path.join(SRC, file), 'utf8'));
  return m ? m[1] : null;
}

function wingShop() {
  const wings = literal('WingCatalog.ts', 'WING_CATALOG');
  const levelPrice = literal('WingCatalog.ts', 'WING_LEVEL_PRICE');
  const familyPrice = literal('WingCatalog.ts', 'WING_FAMILY_PRICE');
  const realCents = literal('WingCatalog.ts', 'WING_REAL_PRICE_CENTS');
  const free = stringConst('WingCatalog.ts', 'FREE_WING_ID');
  return wings.map((w) => ({
    ...w,
    free: w.id === free,
    gold: w.id === free ? 0 : Math.round(levelPrice[w.level] * (familyPrice[w.family] || 1) / 50) * 50,
    cents: w.id === free ? 0 : realCents[w.level],
  }));
}

module.exports = { SRC, literal, stringConst, wingShop };
