'use strict';
// Testes do Extreme Hard (sem banco): node tools/exp/test.js
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://test@localhost/test';
const assert = require('assert');
const G = require('../../server/gamedata');
const W = require('../../server/world');
const EXH = require('../../server/exphard');
const S = require('./sim');

let ok = 0;
const t = (name, fn) => { fn(); ok++; console.log('ok -', name); };

t('curva contínua: de um nível para o outro o EXP por abate muda pouco (menos de 3% depois do nível 50)', () => {
  for (let L = 1; L < 1000; L++) {
    const a = EXH.curveAt(L), b = EXH.curveAt(L + 1), lim = L < 50 ? 0.12 : 0.03;
    assert(Math.abs(b / a - 1) < lim, `salto entre ${L} e ${L + 1}: ${a} → ${b}`);
  }
});

t('barra por monstro do nível: 0,2% no nível 1, caindo até 0,08% no 1000 (igual em todos os mapas)', () => {
  assert(Math.abs(EXH.killFrac({ level: 1 }) - 0.002) < 1e-12);
  assert(Math.abs(EXH.killFrac({ level: 1000 }) - 0.0008) < 1e-12);
  const p = S.player('dark_knight', 300, 'basic', null), T = { hp: W.refHp(300) };
  const a = W.killExp(p, T, Object.values(G.WORLD).find((d) => d.minLevel === 300), p.perks());
  const b = W.killExp(p, T, Object.values(G.WORLD).find((d) => d.minLevel === 45), p.perks());
  assert.strictEqual(a, b, 'mesmo monstro rende igual em qualquer mapa');
});

t('VIP: Ouro = 1,2× e Diamante = 1,25× o Free (reset em ~25 e ~24 dias)', () => {
  const T = G.MONSTERS[Object.keys(G.MONSTERS).find((k) => !G.MONSTERS[k].boss && G.MONSTERS[k].level >= 300)];
  const def = Object.values(G.WORLD).find((d) => d.minLevel === 300);
  const free = W.killExp(S.player('dark_knight', 400, 'basic', null), T, def, S.player('dark_knight', 400, 'basic', null).perks());
  const pg = S.player('dark_knight', 400, 'basic', 'gold'), pd = S.player('dark_knight', 400, 'basic', 'diamond');
  const gold = W.killExp(pg, T, def, pg.perks()), dia = W.killExp(pd, T, def, pd.perks());
  assert(Math.abs(gold / free - 1.2) < 0.01, `ouro ${gold / free}`);
  assert(Math.abs(dia / free - 1.25) < 0.01, `diamante ${dia / free}`);
});

t('reset deixa 5% mais difícil por reset (sem mexer no nível)', () => {
  const a = EXH.levelK({ level: 500, resets: 0 }), b = EXH.levelK({ level: 500, resets: 2 });
  assert(Math.abs(a / b - 1.1) < 1e-9);
});

t('party: bônus só para membros ativos, no mesmo mapa e perto', () => {
  const map = {}, now = Date.now();
  const mk = (id, x, active) => ({ charId: id, map, x, y: 0, lastKillAt: active ? now : 0 });
  const a = mk('1', 0, true), b = mk('2', 100, true), c = mk('3', 100, false), d = mk('4', 5000, true);
  const players = new Map([a, b, c, d].map((p) => [p.charId, p]));
  assert.strictEqual(EXH.partyBonus(a, { members: new Set(['1']) }, players), 0, 'sozinho');
  assert.strictEqual(EXH.partyBonus(a, { members: new Set(['1', '2']) }, players), 0.10, 'dois ativos');
  assert.strictEqual(EXH.partyBonus(a, { members: new Set(['1', '2', '3']) }, players), 0.10, 'AFK não conta');
  assert.strictEqual(EXH.partyBonus(a, { members: new Set(['1', '2', '4']) }, players), 0.10, 'longe não conta');
  const e = mk('5', 50, true), f = mk('6', 60, true), g = mk('7', 70, true);
  players.set('5', e); players.set('6', f); players.set('7', g);
  assert.strictEqual(EXH.partyBonus(a, { members: new Set(['1', '2', '5', '6', '7']) }, players), 0.20, 'cinco ativos');
});

t('monstro fraco de mapa baixo rende menos EXP por segundo que o mapa do nível', () => {
  const p = S.player('dark_knight', 500, 'basic', null), pk = p.perks();
  const low = Object.values(G.WORLD).find((d) => d.minLevel === 45), mine = Object.values(G.WORLD).find((d) => d.minLevel === 500);
  const rate = (def) => { const T = G.MONSTERS[def.groups[0].type]; const dps = ((p.dmgMin + p.dmgMax) / 2) * 1.25 / (p.atkMs / 1000); return W.killExp(p, T, def, pk) / (T.hp / dps + 2.5); };
  assert(rate(low) < rate(mine), `mapa baixo ${rate(low)} vs mapa do nível ${rate(mine)}`);
});

t('corte progressivo: 0% no nível 1, metade no 500, valor cheio no 1000', () => {
  const c = EXH.cfg().levelCut;
  assert.strictEqual(EXH.cutAt(1, c), 1);
  assert(Math.abs(EXH.cutAt(1000, c) - (1 - c)) < 1e-9);
  assert(Math.abs(EXH.cutAt(500.5, c) - (1 - c / 2)) < 1e-9);
});

t('nível máximo continua 1000', () => assert.strictEqual(G.LIMITS.maxLevel, 1000));

console.log(`\n${ok} testes passaram`);
process.exit(0);
