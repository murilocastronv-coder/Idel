'use strict';
// Simulação da evolução do nível 1 ao 1000 (Extreme Hard), usando o código do servidor:
// atributos (distribuição automática + pontos de boas-vindas), dano, equipamentos, monstros de cada mapa e a EXP por abate.
// O tempo de cada abate segue a mesma conta do farm offline: vida do monstro ÷ dano por segundo + 2,5 s de deslocamento.
//
// Uso: node tools/exp/sim.js [classe] [cenário]
//   cenário: free | gold | diamond | party | advanced | offline (padrão: free)
// Mostra o tempo acumulado nos marcos (50, 100, 200 ... 1000) comparado com a meta.
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://sim@localhost/sim';
const G = require('../../server/gamedata');
const W = require('../../server/world');

const TARGET = [[1, 0], [50, 1], [100, 3], [200, 10], [300, 20], [400, 35], [500, 55], [600, 85], [700, 125], [800, 175], [900, 235], [950, 275], [1000, 320]];
const START_POINTS = 10000;

function gear(cls, level, tier) {
  // equipamento que um jogador Free costuma ter: o melhor item comum (básico) ou épico +9 (avançado) que o nível permite usar
  const rarity = tier === 'advanced' ? 'epic' : 'common', plus = tier === 'advanced' ? 9 : 0;
  const kinds = G.CLASS_WEAPONS[cls] || [];
  const ok = (b) => !b.special && !b.seasonal && !b.chaos && (b.req || 1) <= level;
  const items = [];
  const best = (filter, score) => Object.entries(G.ITEM_BASES).filter(([, b]) => ok(b) && filter(b)).sort((a, b) => score(b[1]) - score(a[1]))[0];
  const w = best((b) => b.slot === 'weapon' && kinds.includes(b.kind), (b) => (b.dmg ? b.dmg[0] + b.dmg[1] : 0));
  if (w) items.push({ base: w[0], rarity, plus, equipped: true });
  for (const slot of ['helm', 'armor', 'pants', 'gloves', 'boots']) {
    const a = best((b) => b.slot === slot && !b.classes, (b) => b.def || 0);
    if (a) items.push({ base: a[0], rarity, plus, equipped: true });
  }
  return items;
}

function player(cls, level, tier, vip) {
  const b = G.CLASSES[cls].base;
  const pts = START_POINTS + (level - 1) * (G.POINTS_PER_LEVEL[cls] || 5);
  const p = Object.create(W.Player.prototype);
  Object.assign(p, { cls, level, resets: 0, stats: { ...b }, free: pts, items: gear(cls, level, tier), buffs: {}, settings: { skills: {} },
    vipRow: vip === 'gold' ? { vip1_until: new Date(Date.now() + 864e5) } : vip === 'diamond' ? { vip2_until: new Date(Date.now() + 864e5) } : {} });
  const plan = G.AUTO_STATS[cls];
  while (p.free > 0) for (const [k, n] of Object.entries(plan)) { const q = Math.min(p.free, n); p.stats[k] += q; p.free -= q; if (!p.free) break; }
  p.recalc();
  return p;
}

// mapas de caça (inclui os de PvP) e as áreas de treino das cidades (Noria, Devias)
const MAPS = Object.values(G.WORLD).filter((d) => d.groups && d.groups.length && !d.arena && (!d.safe || d.training));

// melhor mapa para o nível: o de mais EXP por segundo entre os que o herói consegue enfrentar
function bestFarm(p, opts) {
  const pk = p.perks();
  let best = null;
  for (const def of MAPS) {
    if ((def.minLevel || 1) > p.level) continue;
    const types = def.groups.map((g) => ({ T: G.MONSTERS[g.type], n: g.count })).filter((t) => t.T && !t.T.boss);
    if (!types.length) continue;
    const N = types.reduce((a, t) => a + t.n, 0), avg = (f) => types.reduce((a, t) => a + f(t.T) * t.n, 0) / N;
    const dps = ((p.dmgMin + p.dmgMax) / 2) * 1.25 / (p.atkMs / 1000);
    const killTime = avg((T) => T.hp) / dps + 2.5;
    const incoming = Math.max(1, avg((T) => T.dmg) - p.def / 2) / 1.4 * 0.6;
    if (incoming * killTime > p.maxHp * 1.6) continue;               // morre demais: não é um mapa adequado
    // área de treino: monstro muito abaixo do herói rende menos (mesma regra do servidor)
    const trainK = (T) => { if (!T.training) return 1; const g = p.level - T.level; return g <= 2 ? 1 : g <= 8 ? 0.7 : g <= 15 ? 0.35 : 0.15; };
    const exp = avg((T) => W.killExp(p, T, def, pk) * trainK(T)) * (opts.party || 1);
    const rate = exp / killTime;
    if (!best || rate > best.rate) best = { def, rate, killTime, exp };
  }
  return best;
}

function run(cls, scen) {
  const tier = scen === 'advanced' ? 'advanced' : 'basic';
  const vip = scen === 'gold' ? 'gold' : scen === 'diamond' ? 'diamond' : null;
  const opts = { party: scen === 'party' ? W.PARTY_BONUS ? 1 + (W.PARTY_BONUS[3] || 0) : 1.12 : 1 };
  let hours = 0;
  const marks = {}, perLevel = [], maps = {};
  for (let L = 1; L < 1000; L++) {
    const p = player(cls, L, tier, vip);
    const f = bestFarm(p, opts);
    if (!f) { marks.stuck = L; break; }
    const secs = W.expToNext(L) / f.rate;
    hours += secs / 3600;
    perLevel.push(secs / 60);
    maps[f.def.name] = (maps[f.def.name] || 0) + 1;
    if (TARGET.some(([l]) => l === L + 1)) marks[L + 1] = hours;
  }
  return { hours, marks, perLevel, maps };
}

if (require.main === module) {
  const cls = process.argv[2] || 'dark_knight', scen = process.argv[3] || 'free';
  const r = run(cls, scen);
  console.log(`${cls} · ${scen}`);
  for (const [l, t] of TARGET.slice(1)) console.log(`  nível ${String(l).padStart(4)}: ${(r.marks[l] || 0).toFixed(1).padStart(7)} h  (meta ${t} h)`);
  if (r.marks.stuck) console.log('  travou no nível', r.marks.stuck);
  console.log('  minutos por nível em 100/500/900/999:', [99, 499, 899, 998].map((i) => (r.perLevel[i] || 0).toFixed(1)).join(' / '));
  process.exit(0);
}
module.exports = { run, player, bestFarm, TARGET };
