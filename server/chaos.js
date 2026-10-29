'use strict';
// Chaos Machine (Chaos Goblin, em Lorencia): asas de nível 1 e 2 e a capa do Dark Lord.
// A chance é calculada e sorteada só no servidor. Cada combinação é uma transação no banco:
// o item principal, os materiais, o Zen, o item criado e o registro mudam juntos ou nada muda.
const db = require('./db');
const G = require('./gamedata');
const SET = require('./settings');

const RARITY_ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'ancestral'];
const CHAOS_WEAPONS = Object.keys(G.ITEM_BASES).filter((k) => G.ITEM_BASES[k].chaos);
const WINGS1 = Object.keys(G.ITEM_BASES).filter((k) => G.ITEM_BASES[k].cat === 'wings' && G.ITEM_BASES[k].tier === 1);
const WINGS2 = Object.keys(G.ITEM_BASES).filter((k) => G.ITEM_BASES[k].cat === 'wings' && G.ITEM_BASES[k].tier === 2);
const CAPES = Object.keys(G.ITEM_BASES).filter((k) => G.ITEM_BASES[k].cat === 'cape');
const MATERIALS = Object.keys(G.ITEM_BASES).filter((k) => G.ITEM_BASES[k].slot === 'material');
const EYES = [1, 2, 3, 4, 5, 6, 7].map((n) => 'devil_eye_' + n);
const INVS = [1, 2, 3, 4, 5, 6, 7].map((n) => 'devil_inv_' + n);
const EVOLVE = { ...G.WING_EVOLVE, cape_lord: 'cape_emperor' };
const ON_FAIL = ['lose_all', 'keep_main', 'keep_items'];
// itens que o administrador pode ajustar (requisitos, atributos e classes)
const TUNABLE = [...WINGS1, ...WINGS2, ...CAPES];

const DEFAULTS = {
  npcRequired: true,
  recipes: {
    wing1: {
      name: 'Criar Asa Nível 1', enabled: true, mode: 'random', pick: 'any', classes: [], weights: {}, rarityRoll: { enabled: false, weights: { common: 0, uncommon: 0, rare: 30, epic: 60, legendary: 9, ancestral: 1 } }, plusRoll: { enabled: false, weights: { 0: 80, 1: 15, 2: 4, 3: 1 } },
      main: { bases: CHAOS_WEAPONS, minPlus: 0, minRarity: 'common' },
      materials: [{ item: 'jewel_of_chaos', qty: 1 }], zen: 100000,
      rate: { base: 30, perPlus: 5, perRarity: 4, max: 75 }, onFail: 'lose_all', results: WINGS1,
    },
    wing2: {
      name: 'Criar Asa Nível 2', enabled: true, mode: 'random', pick: 'any', classes: [], weights: {}, rarityRoll: { enabled: false, weights: { common: 0, uncommon: 0, rare: 0, epic: 30, legendary: 60, ancestral: 10 } }, plusRoll: { enabled: false, weights: { 0: 80, 1: 15, 2: 4, 3: 1 } },
      main: { bases: WINGS1, minPlus: 0, minRarity: 'common' },
      materials: [{ item: 'jewel_of_chaos', qty: 1 }, { item: 'loch_feather', qty: 1 }], zen: 1000000,
      rate: { base: 35, perPlus: 5, perRarity: 0, max: 60 }, onFail: 'lose_all', results: WINGS2,
    },
    cape1: {
      name: 'Criar Capa do Dark Lord', enabled: true, mode: 'random', pick: 'any', classes: ['dark_lord'],
      main: { bases: CHAOS_WEAPONS, minPlus: 0, minRarity: 'common' },
      materials: [{ item: 'jewel_of_chaos', qty: 1 }], zen: 150000,
      rate: { base: 30, perPlus: 5, perRarity: 4, max: 75 }, onFail: 'lose_all', results: ['cape_lord'],
    },
    cape2: {
      name: 'Evoluir Capa do Dark Lord', enabled: true, mode: 'evolve', classes: ['dark_lord'],
      main: { bases: ['cape_lord'], minPlus: 0, minRarity: 'common' },
      materials: [{ item: 'jewel_of_chaos', qty: 1 }, { item: 'loch_feather', qty: 1 }], zen: 1500000,
      rate: { base: 30, perPlus: 5, perRarity: 0, max: 55 }, onFail: 'lose_all', results: ['cape_emperor'],
    },
    devil: {
      name: "Devil's Invitation", enabled: true, mode: 'pair', classes: [],
      main: { bases: EYES, minPlus: 0, minRarity: 'common' },
      materials: [{ item: 'jewel_of_chaos', qty: 1 }], zen: 100000,
      // base = chance dos convites +1 a +4; high = +5 a +7
      rate: { base: 80, high: 70, perPlus: 0, perRarity: 0, max: 100 }, onFail: 'lose_all', results: INVS,
    },
  },
  items: {},  // ajustes do administrador: { wings_satan: { req, def, wdmg, absorb, classes } }
};
const RECIPE_IDS = Object.keys(DEFAULTS.recipes);
// o que cada receita pode aceitar e produzir (o administrador escolhe dentro disto)
const ALLOWED = {
  wing1: { main: CHAOS_WEAPONS, results: WINGS1 },
  wing2: { main: WINGS1, results: WINGS2 },
  cape1: { main: CHAOS_WEAPONS, results: ['cape_lord'] },
  cape2: { main: ['cape_lord'], results: ['cape_emperor'] },
  devil: { main: EYES, results: INVS },
};
const ORIGINAL = {};
for (const k of TUNABLE) { const b = G.ITEM_BASES[k]; ORIGINAL[k] = { req: b.req, def: b.def, wdmg: b.wdmg, absorb: b.absorb, classes: [...b.classes] }; }

let H = null; // funções do mundo (publicItem, bagUsed)

function cfg() { return SET.get('chaos', DEFAULTS); }

function applyItemOverrides(c) {
  for (const k of TUNABLE) {
    const o = { ...ORIGINAL[k], ...((c.items || {})[k] || {}) };
    Object.assign(G.ITEM_BASES[k], { req: o.req, def: o.def, wdmg: o.wdmg, absorb: o.absorb, classes: o.classes });
  }
}

async function init(helpers) {
  H = helpers;
  const c = await SET.load('chaos', DEFAULTS);
  // uma vez: asas e capas passam a exigir nível 150 (ajustes antigos do painel abaixo disso sobem para 150)
  const mig = await SET.load('migr_wing150', { done: false });
  if (!mig.done) {
    let changed = false;
    for (const [k, o] of Object.entries(c.items || {})) if (o && o.req < 150) { o.req = 150; changed = true; }
    if (changed) await SET.save('chaos', c).catch(() => {});
    await SET.save('migr_wing150', { done: true }).catch(() => {});
  }
  // o modo de cada receita vem sempre do jogo (asas: sorteio entre todas, nunca pela classe)
  for (const id of RECIPE_IDS) {
    const r = c.recipes[id], d = DEFAULTS.recipes[id];
    if (!r) continue;
    r.mode = d.mode;
    if (d.mode === 'random') { r.pick = 'any'; r.weights = r.weights || {}; }
    if (d.rarityRoll) { r.rarityRoll = r.rarityRoll || d.rarityRoll; r.plusRoll = r.plusRoll || d.plusRoll; }
    if (id === 'wing2') { r.main.bases = r.main.bases.filter((b) => ALLOWED.wing2.main.includes(b)); if (!r.main.bases.length) r.main.bases = d.main.bases.slice(); }
  }
  applyItemOverrides(c);
}

const int = (v, a, b, name) => {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n < a || n > b) throw new Error(`${name}: use um número de ${a} a ${b}.`);
  return n;
};

function rollCfg(r, d, keys, label) {
  const src = r || d;
  const w = {};
  for (const k of keys) { const v = (src.weights || {})[k]; if (v !== undefined && v !== null && v !== '') w[k] = int(v, 0, 1000, `${label} ${k}`); }
  const enabled = !!src.enabled;
  if (enabled && !Object.values(w).some((v) => v > 0)) throw new Error(`${label}: coloque pelo menos um peso maior que 0.`);
  return { enabled, weights: w };
}
function weighted(map) {
  const e = Object.entries(map).filter(([, v]) => v > 0);
  const tot = e.reduce((a, [, v]) => a + v, 0);
  if (!tot) return null;
  let x = Math.random() * tot;
  for (const [k, v] of e) { x -= v; if (x < 0) return k; }
  return e[e.length - 1][0];
}

// valida tudo que vem do painel (nunca confia no navegador)
function sanitize(input) {
  const out = { npcRequired: input.npcRequired !== false, recipes: {}, items: {} };
  for (const id of RECIPE_IDS) {
    const r = (input.recipes || {})[id] || {};
    const d = DEFAULTS.recipes[id];
    const label = d.name;
    const main = r.main || {};
    const bases = (Array.isArray(main.bases) ? main.bases : d.main.bases).filter((b) => ALLOWED[id].main.includes(b));
    if (!bases.length) throw new Error(`${label}: escolha pelo menos um item principal.`);
    const results = (Array.isArray(r.results) ? r.results : d.results).filter((b) => ALLOWED[id].results.includes(b));
    if (!results.length) throw new Error(`${label}: escolha pelo menos um resultado.`);
    const mats = (Array.isArray(r.materials) ? r.materials : d.materials).map((m) => ({ item: String(m.item), qty: int(m.qty, 1, 99, `${label}: quantidade de material`) }));
    for (const m of mats) if (!MATERIALS.includes(m.item)) throw new Error(`${label}: material desconhecido (${m.item}).`);
    if (new Set(mats.map((m) => m.item)).size !== mats.length) throw new Error(`${label}: o mesmo material aparece duas vezes.`);
    const rate = r.rate || {};
    const max = int(rate.max ?? d.rate.max, 1, 100, `${label}: chance máxima`);
    const out_r = {
      name: d.name, enabled: r.enabled !== false, mode: d.mode,
      // asas: o resultado é sempre sorteado entre todas (a classe não escolhe nem muda a chance)
      pick: d.mode === 'random' ? 'any' : undefined,
      weights: d.mode === 'random' ? Object.fromEntries(results.map((b) => [b, int((r.weights || {})[b] ?? 1, 0, 1000, `${label}: peso de ${G.ITEM_BASES[b].name}`)])) : undefined,
      rarityRoll: d.rarityRoll ? rollCfg(r.rarityRoll, d.rarityRoll, RARITY_ORDER, `${label}: raridade`) : undefined,
      plusRoll: d.plusRoll ? rollCfg(r.plusRoll, d.plusRoll, ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'], `${label}: +`) : undefined,
      classes: (Array.isArray(r.classes) ? r.classes : d.classes).filter((c) => G.CLASSES[c]),
      main: { bases, minPlus: int(main.minPlus ?? d.main.minPlus, 0, 15, `${label}: + mínimo`), minRarity: RARITY_ORDER.includes(main.minRarity) ? main.minRarity : 'common' },
      materials: mats,
      zen: int(r.zen ?? d.zen, 0, 1e12, `${label}: Zen`),
      rate: { base: int(rate.base ?? d.rate.base, 0, 100, `${label}: chance base`), perPlus: int(rate.perPlus ?? d.rate.perPlus, 0, 50, `${label}: chance por +1`),
        perRarity: int(rate.perRarity ?? d.rate.perRarity, 0, 50, `${label}: chance por raridade`), max,
        ...(d.mode === 'pair' ? { high: int(rate.high ?? d.rate.high, 0, 100, `${label}: chance +5 a +7`) } : {}) },
      onFail: ON_FAIL.includes(r.onFail) ? r.onFail : d.onFail,
      results,
    };
    if (out_r.weights && !results.some((b) => out_r.weights[b] > 0)) throw new Error(`${label}: pelo menos uma asa precisa ter peso maior que 0.`);
    out.recipes[id] = out_r;
  }
  for (const k of TUNABLE) {
    const o = (input.items || {})[k];
    if (!o) continue;
    const name = G.ITEM_BASES[k].name;
    const classes = (Array.isArray(o.classes) ? o.classes : ORIGINAL[k].classes).filter((c) => G.CLASSES[c]);
    if (!classes.length) throw new Error(`${name}: escolha pelo menos uma classe.`);
    if (G.ITEM_BASES[k].cat === 'cape' && classes.some((c) => c !== 'dark_lord')) throw new Error(`${name}: capas são só do Dark Lord.`);
    out.items[k] = { req: int(o.req, 1, G.LIMITS.maxLevel, `${name}: nível`), def: int(o.def, 0, 5000, `${name}: defesa`),
      wdmg: int(o.wdmg, 0, 200, `${name}: dano %`), absorb: int(o.absorb, 0, 60, `${name}: absorção %`), classes };
  }
  return out;
}

async function saveConfig(input) {
  const clean = sanitize(input);
  await SET.save('chaos', clean);
  applyItemOverrides(clean);
  return clean;
}

const pairLevel = (base) => Number((G.ITEM_BASES[base] || {}).devil) || 0;
function chanceFor(r, it) {
  if (r.mode === 'pair') return Math.max(0, Math.min(100, pairLevel(it.base) <= 4 ? r.rate.base : r.rate.high));
  const ri = Math.max(0, RARITY_ORDER.indexOf(it.rarity));
  const c = r.rate.base + (it.plus || 0) * r.rate.perPlus + ri * r.rate.perRarity;
  return Math.max(1, Math.min(r.rate.max, 100, Math.round(c)));
}

// possíveis resultados para este jogador
function resultsFor(r, p, main) {
  if (r.mode === 'pair') {
    if (!main) return r.results.slice();
    const to = 'devil_inv_' + pairLevel(main.base);
    return r.results.includes(to) ? [to] : [];
  }
  if (r.mode === 'evolve') {
    if (!main) return r.results.slice();
    let to = EVOLVE[main.base];
    if (p.cls === 'magic_gladiator' && (main.base === 'wings_satan' || main.base === 'wings_heaven')) to = 'wings_darkness';
    return to && r.results.includes(to) ? [to] : [];
  }
  return r.results.filter((b) => !r.weights || (r.weights[b] ?? 1) > 0);
}

function mainProblem(r, it) {
  if (!it) return 'Escolha o item principal.';
  if (it.equipped) return 'Desequipe o item antes de usar na Chaos Machine.';
  if (!r.main.bases.includes(it.base)) return 'Este item não serve para esta receita.';
  if ((it.plus || 0) < r.main.minPlus) return `Precisa ser +${r.main.minPlus} ou mais.`;
  if (RARITY_ORDER.indexOf(it.rarity) < RARITY_ORDER.indexOf(r.main.minRarity)) return 'A raridade do item é baixa demais para esta receita.';
  return null;
}

function atNpc(p) { return !!(p.map && (p.map.def.npcs || []).some((n) => n.kind === 'chaos')); }

function matPlan(p, r, main) {
  const mats = r.mode === 'pair' && main ? [{ item: 'devil_key_' + pairLevel(main.base), qty: 1 }, ...r.materials] : r.materials;
  return mats.map((m) => {
    const stacks = p.items.filter((i) => i.base === m.item && !i.equipped).sort((a, b) => Number(a.id) - Number(b.id));
    const have = stacks.reduce((a, i) => a + (Number(i.qty) || 1), 0);
    return { ...m, stacks, have };
  });
}

// tudo que a janela da Chaos Machine mostra (as chances vêm daqui, iguais às do sorteio)
function info(p, sources) {
  const c = cfg();
  const recipes = RECIPE_IDS.map((id) => {
    const r = c.recipes[id];
    const mats = matPlan(p, r);
    const candidates = p.items.filter((i) => r.main.bases.includes(i.base) && !i.equipped).map((i) => {
      const why = mainProblem(r, i);
      const res = resultsFor(r, p, i);
      const c = { item: H.publicItem(i), ok: !why && res.length > 0, why: why || (res.length ? null : r.mode === 'pair' ? 'Este convite está desativado.' : 'Nenhum resultado permitido para esta asa.'), chance: chanceFor(r, i), result: r.mode !== 'random' ? res[0] || null : null };
      if (r.mode === 'pair') {
        c.mats = matPlan(p, r, i).map((m) => ({ item: m.item, name: G.ITEM_BASES[m.item].name, icon: G.ITEM_BASES[m.item].icon, ic: G.ITEM_BASES[m.item].ic, rarity: G.ITEM_BASES[m.item].rarity, qty: m.qty, have: m.have }));
        if (c.ok && c.mats[0].have < 1) { c.ok = false; c.why = `Falta ${c.mats[0].name}.`; }
      }
      return c;
    }).sort((a, b) => (b.ok - a.ok) || (r.mode === 'pair' ? pairLevel(b.item.base) - pairLevel(a.item.base) : b.chance - a.chance));
    const resB = resultsFor(r, p, null);
    const wTot = r.weights ? resB.reduce((a, b) => a + (r.weights[b] ?? 1), 0) : 0;
    const results = resB.map((b) => ({ base: b, name: G.ITEM_BASES[b].name, icon: G.ITEM_BASES[b].icon, ic: G.ITEM_BASES[b].ic, rarity: G.ITEM_BASES[b].rarity,
      pct: r.weights && wTot ? Math.round((r.weights[b] ?? 1) / wTot * 1000) / 10 : null, canEquip: !G.ITEM_BASES[b].classes || G.ITEM_BASES[b].classes.includes(p.cls) }));
    if (r.mode === 'pair') return { id, name: r.name, enabled: r.enabled, mode: r.mode, zen: r.zen, onFail: r.onFail, maxChance: Math.max(r.rate.base, r.rate.high), rates: { low: r.rate.base, high: r.rate.high },
      classes: r.classes, classOk: !r.classes.length || r.classes.includes(p.cls),
      main: { bases: r.main.bases.map((b) => ({ base: b, name: G.ITEM_BASES[b].name })), minPlus: 0, minRarity: 'common' },
      materials: [{ item: 'devil_key_1', name: "Devil's Key do mesmo nível", icon: 'key', ic: '#9ad8ff', rarity: 'rare', qty: 1, have: 0, pairKey: true }, ...mats.map((m) => ({ item: m.item, name: G.ITEM_BASES[m.item].name, icon: G.ITEM_BASES[m.item].icon, rarity: G.ITEM_BASES[m.item].rarity, qty: m.qty, have: m.have }))],
      candidates, results, noResults: false };
    const classOk = !r.classes.length || r.classes.includes(p.cls);
    return {
      id, name: r.name, enabled: r.enabled, mode: r.mode, zen: r.zen, onFail: r.onFail, maxChance: r.rate.max,
      classes: r.classes, classOk,
      main: { bases: r.main.bases.map((b) => ({ base: b, name: G.ITEM_BASES[b].name })), minPlus: r.main.minPlus, minRarity: r.main.minRarity },
      materials: mats.map((m) => ({ item: m.item, name: G.ITEM_BASES[m.item].name, icon: G.ITEM_BASES[m.item].icon, rarity: G.ITEM_BASES[m.item].rarity, qty: m.qty, have: m.have })),
      candidates, results,
      noResults: r.mode === 'random' && !results.length,
    };
  });
  return { type: 'chaosInfo', atNpc: atNpc(p), npcRequired: c.npcRequired, zen: p.zen, bagFree: G.INVENTORY_SIZE - H.bagUsed(p), recipes, sources };
}

async function craft(world, p, recipeId, mainId) {
  const reply = (ok, text, extra = {}) => p.send({ type: 'chaosResult', ok, text, ...extra });
  const c = cfg();
  const r = c.recipes[recipeId];
  if (!r) return reply(false, 'Receita desconhecida.');
  if (!r.enabled) return reply(false, 'Esta receita está desativada no momento.');
  if (p.crafting) return reply(false, 'Espere a combinação anterior terminar.');
  if (p.dead) return reply(false, 'Você está derrotado.');
  if (c.npcRequired && !atNpc(p)) return reply(false, 'Vá até o Chaos Goblin, em Lorencia, para usar a Chaos Machine.');
  if (r.classes.length && !r.classes.includes(p.cls)) return reply(false, r.classes.length === 1 && r.classes[0] === 'dark_lord' ? 'Só o Dark Lord pode fazer esta receita.' : 'Sua classe não pode fazer esta receita.');
  const main = p.items.find((i) => String(i.id) === String(mainId) && !i.equipped);
  if (!main && mainId) return reply(false, 'Este item não está mais na sua bolsa.');
  if (r.mode === 'pair') return craftPair(world, p, recipeId, r, main, reply);
  const why = mainProblem(r, main);
  if (why) return reply(false, why);
  const results = resultsFor(r, p, main);
  if (!results.length) return reply(false, r.mode === 'evolve' ? 'Esta asa não tem evolução permitida para você.' : 'Nenhuma asa disponível nesta receita.');
  const plan = matPlan(p, r);
  const missing = plan.filter((m) => m.have < m.qty);
  if (missing.length) return reply(false, `Faltam materiais: ${missing.map((m) => `${m.qty - m.have}× ${G.ITEM_BASES[m.item].name}`).join(', ')}.`);
  if (p.zen < r.zen) return reply(false, `Zen insuficiente: a combinação custa ${r.zen.toLocaleString('pt-BR')} Zen.`);

  // o que sai de cada pilha de material
  const takes = [];
  for (const m of plan) {
    let need = m.qty;
    for (const st of m.stacks) {
      if (need <= 0) break;
      const q = Number(st.qty) || 1;
      const t = Math.min(q, need);
      takes.push({ it: st, take: t, left: q - t });
      need -= t;
    }
  }
  // espaço na bolsa (no sucesso o item principal sai e o resultado entra)
  const freed = 1 + takes.filter((t) => t.left === 0).length;
  if (H.bagUsed(p) - freed + 1 > G.INVENTORY_SIZE) return reply(false, 'Bolsa sem espaço para o resultado.');

  const chance = chanceFor(r, main);
  const roll = Math.random() * 100;
  const success = roll < chance;
  // 1º sorteio: sucesso; 2º: qual asa (pelos pesos, igual para todas as classes); 3º opcional: raridade e +
  const resultBase = success ? (r.weights ? weighted(Object.fromEntries(results.map((b) => [b, r.weights[b] ?? 1]))) : results[Math.floor(Math.random() * results.length)]) : null;
  const resRarity = success ? ((r.rarityRoll && r.rarityRoll.enabled && weighted(r.rarityRoll.weights)) || G.ITEM_BASES[resultBase].rarity || 'epic') : null;
  const resPlus = success ? Number((r.plusRoll && r.plusRoll.enabled && weighted(r.plusRoll.weights)) || 0) : 0;
  const consumeMain = success || r.onFail === 'lose_all';
  const consumeMats = success || r.onFail !== 'keep_items';
  const inputs = { main: { id: String(main.id), base: main.base, plus: main.plus, rarity: main.rarity }, materials: takes.map((t) => ({ id: String(t.it.id), base: t.it.base, qty: t.take })) };
  const lost = [];
  if (!success) {
    if (consumeMain) lost.push(G.ITEM_BASES[main.base].name);
    if (consumeMats) for (const m of r.materials) lost.push(`${m.qty}× ${G.ITEM_BASES[m.item].name}`);
  }

  p.crafting = true;
  p.zen -= r.zen;
  let created = null;
  try {
    created = await db.tx(async (q) => {
      if (consumeMain) {
        const d = await q('DELETE FROM items WHERE id = $1 AND character_id = $2 AND equipped = FALSE AND base = $3 RETURNING id', [main.id, p.charId, main.base]);
        if (!d.rows[0]) throw new Error('O item principal não está mais na bolsa.');
      } else {
        const d = await q('SELECT id FROM items WHERE id = $1 AND character_id = $2 AND equipped = FALSE FOR UPDATE', [main.id, p.charId]);
        if (!d.rows[0]) throw new Error('O item principal não está mais na bolsa.');
      }
      if (consumeMats) {
        for (const t of takes) {
          const d = t.left > 0
            ? await q('UPDATE items SET qty = qty - $3 WHERE id = $1 AND character_id = $2 AND qty >= $4 RETURNING id', [t.it.id, p.charId, t.take, t.take + 1])
            : await q('DELETE FROM items WHERE id = $1 AND character_id = $2 AND qty = $3 RETURNING id', [t.it.id, p.charId, t.take]);
          if (!d.rows[0]) throw new Error('Os materiais mudaram. Tente de novo.');
        }
      }
      await q('UPDATE characters SET zen = $2 WHERE id = $1 RETURNING id', [p.charId, Math.round(p.zen)]);
      let row = null;
      if (success) {
        const b = G.ITEM_BASES[resultBase];
        row = (await q(`INSERT INTO items (character_id, base, rarity, plus) VALUES ($1, $2, $3, $4)
          RETURNING id, base, rarity, plus, equipped, qty`, [p.charId, resultBase, resRarity || b.rarity || 'epic', resPlus])).rows[0];
      }
      await q(`INSERT INTO chaos_log (character_id, char_name, recipe, inputs, zen, chance, success, result_item, result_base, lost)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
      [p.charId, p.name, recipeId, JSON.stringify(inputs), r.zen, chance, success, row ? row.id : null, resultBase, JSON.stringify(lost)]);
      return row;
    });
  } catch (e) {
    p.zen += r.zen;
    p.crafting = false;
    console.error('[chaos]', p.name, e.message);
    return reply(false, /bolsa|materiais/i.test(e.message) ? e.message : 'A combinação não foi feita (nada foi gasto). Tente de novo.');
  }
  p.crafting = false;
  // só depois de gravado: atualiza a memória
  if (consumeMain) p.items = p.items.filter((i) => i !== main);
  if (consumeMats) {
    for (const t of takes) {
      if (t.left > 0) t.it.qty = t.left;
      else p.items = p.items.filter((i) => i !== t.it);
    }
  }
  if (created) p.items.push(created);
  p.dirty = true;
  const name = success ? G.ITEM_BASES[resultBase].name : null;
  reply(true, success ? `Sucesso! Você criou ${name}.` : `A combinação falhou (${chance}% de chance).`, {
    success, chance, item: created ? H.publicItem(created) : null, lost, recipe: recipeId, kept: !consumeMain && !success,
  });
  p.send({ type: 'log', kind: success ? 'quest' : 'warn', text: success ? `Chaos Machine: você criou ${name}!` : `Chaos Machine: a combinação falhou. ${lost.length ? 'Perdeu: ' + lost.join(', ') + '.' : 'Seus itens foram preservados.'}` });
  p.send(p.charState());
  if (success && G.ITEM_BASES[resultBase].tier >= 2) world.system(`${p.name} criou ${name} na Chaos Machine!`);
  if (p.map) p.send(info(p, null));
  return undefined;
}

// Devil's Eye +N + Devil's Key +N + materiais + Zen = Devil's Invitation +N (os dois do mesmo nível)
async function craftPair(world, p, recipeId, r, eye, reply) {
  if (!eye || !r.main.bases.includes(eye.base)) return reply(false, "Escolha um Devil's Eye.");
  const n = pairLevel(eye.base);
  const resultBase = 'devil_inv_' + n;
  if (!r.results.includes(resultBase)) return reply(false, 'Este convite está desativado no momento.');
  const plan = [{ item: eye.base, qty: 1, stacks: [eye], have: Number(eye.qty) || 1 }, ...matPlan(p, r, eye)];
  const missing = plan.filter((m) => m.have < m.qty);
  if (missing.length) return reply(false, 'Você não possui os itens necessários para fabricar este convite.', { missing: missing.map((m) => `${m.qty - m.have}× ${G.ITEM_BASES[m.item].name}`) });
  if (p.zen < r.zen) return reply(false, `Zen insuficiente: a combinação custa ${r.zen.toLocaleString('pt-BR')} Zen.`);
  const takes = [];
  for (const m of plan) {
    let need = m.qty;
    for (const st of m.stacks) { if (need <= 0) break; const q = Number(st.qty) || 1; const t = Math.min(q, need); takes.push({ it: st, take: t, left: q - t, main: m.item === eye.base }); need -= t; }
  }
  const stackTo = p.items.find((i) => i.base === resultBase && !i.equipped && (Number(i.qty) || 1) < G.MAX_STACK);
  const freed = takes.filter((t) => t.left === 0).length;
  if (!stackTo && H.bagUsed(p) - freed + 1 > G.INVENTORY_SIZE) return reply(false, 'Bolsa sem espaço para o convite.');
  const chance = chanceFor(r, eye);
  const success = Math.random() * 100 < chance;
  // na falha: lose_all gasta tudo; keep_main guarda o Eye; keep_items guarda Eye, Key e joias (só o Zen vai)
  const used = takes.filter((t) => success || r.onFail === 'lose_all' || (r.onFail === 'keep_main' && !t.main));
  const lost = success ? [] : used.map((t) => `${t.take}× ${G.ITEM_BASES[t.it.base].name}`);
  const inputs = { main: { id: String(eye.id), base: eye.base }, materials: takes.map((t) => ({ id: String(t.it.id), base: t.it.base, qty: t.take })) };
  p.crafting = true;
  p.zen -= r.zen;
  let created = null;
  try {
    created = await db.tx(async (q) => {
      for (const t of used) {
        const d = t.left > 0
          ? await q('UPDATE items SET qty = qty - $3 WHERE id = $1 AND character_id = $2 AND qty = $4 AND vault_no IS NULL RETURNING id', [t.it.id, p.charId, t.take, t.take + t.left])
          : await q('DELETE FROM items WHERE id = $1 AND character_id = $2 AND qty = $3 AND vault_no IS NULL RETURNING id', [t.it.id, p.charId, t.take]);
        if (!d.rows[0]) throw new Error('Os materiais mudaram. Tente de novo.');
      }
      await q('UPDATE characters SET zen = $2 WHERE id = $1 RETURNING id', [p.charId, Math.round(p.zen)]);
      let row = null;
      if (success) {
        if (stackTo) row = (await q('UPDATE items SET qty = qty + 1 WHERE id = $1 AND character_id = $2 AND vault_no IS NULL RETURNING id, base, rarity, plus, equipped, qty', [stackTo.id, p.charId])).rows[0];
        if (!row) row = (await q(`INSERT INTO items (character_id, base, rarity, plus, qty) VALUES ($1, $2, $3, 0, 1) RETURNING id, base, rarity, plus, equipped, qty`, [p.charId, resultBase, G.ITEM_BASES[resultBase].rarity])).rows[0];
      }
      await q(`INSERT INTO chaos_log (character_id, char_name, recipe, inputs, zen, chance, success, result_item, result_base, lost)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
      [p.charId, p.name, recipeId, JSON.stringify(inputs), r.zen, chance, success, row ? row.id : null, success ? resultBase : null, JSON.stringify(lost)]);
      return row;
    });
  } catch (e) {
    p.zen += r.zen; p.crafting = false;
    console.error('[chaos]', p.name, e.message);
    return reply(false, /materiais/i.test(e.message) ? e.message : 'A combinação não foi feita (nada foi gasto). Tente de novo.');
  }
  p.crafting = false;
  for (const t of used) { if (t.left > 0) t.it.qty = t.left; else p.items = p.items.filter((i) => i !== t.it); }
  if (created) {
    const mem = p.items.find((i) => String(i.id) === String(created.id));
    if (mem) mem.qty = created.qty; else p.items.push(created);
  }
  p.dirty = true;
  const name = G.ITEM_BASES[resultBase].name;
  reply(true, success ? `Combinação realizada com sucesso! Você recebeu ${name}.` : `A combinação falhou (${chance}% de chance).`, {
    success, chance, item: created ? H.publicItem({ ...created, qty: 1 }) : null, lost, recipe: recipeId, kept: !success && r.onFail !== 'lose_all',
  });
  p.send({ type: 'log', kind: success ? 'quest' : 'warn', text: success ? `Combinação realizada com sucesso! Você recebeu ${name}.` : `A combinação falhou. ${lost.length ? 'Perdeu: ' + lost.join(', ') + '.' : 'Seus itens foram preservados.'} Chance era ${chance}%.` });
  p.send(p.charState());
  if (p.map) p.send(info(p, null));
  return undefined;
}

async function history(limit = 50, name = '') {
  const { rows } = await db.query(`SELECT id, char_name, recipe, inputs, zen, chance, success, result_base, lost, created_at FROM chaos_log
    WHERE ($1 = '' OR lower(char_name) = lower($1)) ORDER BY id DESC LIMIT $2`, [String(name || ''), Math.min(200, Math.max(1, limit))]);
  return rows;
}

function adminView() {
  return {
    config: cfg(), recipeIds: RECIPE_IDS, allowed: ALLOWED, onFail: ON_FAIL, materials: MATERIALS.map((k) => ({ id: k, name: G.ITEM_BASES[k].name })),
    items: TUNABLE.map((k) => ({ id: k, name: G.ITEM_BASES[k].name, cat: G.ITEM_BASES[k].cat, tier: G.ITEM_BASES[k].tier, ...ORIGINAL[k], ...(cfg().items[k] || {}) })),
    names: Object.fromEntries([...CHAOS_WEAPONS, ...TUNABLE, ...MATERIALS].map((k) => [k, G.ITEM_BASES[k].name])),
  };
}

module.exports = { init, info, craft, cfg, saveConfig, history, adminView, chanceFor, DEFAULTS, MATERIALS, CHAOS_WEAPONS, WINGS1, WINGS2, CAPES };
