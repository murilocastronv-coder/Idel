'use strict';
// KundunBoxSystem — caixas da Invasão Dourada. O conteúdo é sorteado só no servidor, na hora de abrir;
// a animação do navegador só mostra o que o servidor já decidiu. A caixa só sai da bolsa junto com a
// entrega do prêmio (mesma transação); com a bolsa cheia ela continua lá.
const db = require('./db');
const G = require('./gamedata');
const EXCELLENT = require('./excellent');
const SET = require('./settings');
const EQUIP = require('./equip');

const BOXES = ['kundun_bronze', 'kundun_prata', 'kundun_ouro', 'kundun_promo'];
const RARITY_ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'ancestral'];
const KINDS = ['zen', 'pot', 'item', 'material', 'chaosweapon', 'wing1', 'wing2', 'cape'];
const HIGH = ['legendary', 'ancestral'];

// w = peso (a chance é w ÷ soma dos pesos da caixa)
const DEFAULTS = {
  // Comum/Raro = equipamento sem opções excelentes; Excelente = Épico com opções excelentes; Lendário = com opções excelentes.
  // Pesos somam 100 em cada caixa (peso = % de chance). Ancestral só na Ouro.
  kundun_bronze: [
    { kind: 'zen', w: 30.95, min: 5000, max: 25000 },
    { kind: 'item', w: 30, rarity: 'common', plusMin: 0, plusMax: 1, reqMin: 1, reqMax: 40, low: true, exc: false },
    { kind: 'item', w: 16, rarity: 'rare', plusMin: 0, plusMax: 2, reqMin: 1, reqMax: 40, low: true, exc: false },
    { kind: 'item', w: 4, rarity: 'epic', plusMin: 0, plusMax: 2, reqMin: 1, reqMax: 40, low: true, exc: true },
    { kind: 'item', w: 0.05, rarity: 'legendary', plusMin: 0, plusMax: 2, reqMin: 1, reqMax: 40, low: true, exc: true },
    { kind: 'material', w: 8, item: 'jewel_of_chaos', min: 1, max: 1 },
    { kind: 'material', w: 5, item: 'jewel_of_bless', min: 1, max: 1 },
    { kind: 'material', w: 4, item: 'jewel_of_soul', min: 1, max: 1 },
    { kind: 'material', w: 2, item: 'jewel_of_creation', min: 1, max: 1 },
  ],
  kundun_prata: [
    { kind: 'zen', w: 26, min: 50000, max: 150000 },
    { kind: 'item', w: 14, rarity: 'common', plusMin: 0, plusMax: 2, reqMin: 30, reqMax: 80, exc: false },
    { kind: 'item', w: 24, rarity: 'rare', plusMin: 1, plusMax: 3, reqMin: 30, reqMax: 80, exc: false },
    { kind: 'item', w: 8, rarity: 'epic', plusMin: 1, plusMax: 3, reqMin: 30, reqMax: 80, exc: true },
    { kind: 'material', w: 10, item: 'jewel_of_chaos', min: 1, max: 2 },
    { kind: 'material', w: 8, item: 'jewel_of_bless', min: 1, max: 2 },
    { kind: 'material', w: 6, item: 'jewel_of_soul', min: 1, max: 2 },
    { kind: 'material', w: 4, item: 'jewel_of_creation', min: 1, max: 1 },
  ],
  // Ouro: as únicas taxas especiais do jogo — Ancestral 0,50% e Lendário 1,50% (só nesta caixa)
  kundun_ouro: [
    { kind: 'zen', w: 7, min: 60000, max: 150000 }, // Zen bem menor e mais raro (antes 21% · 300k-800k)
    { kind: 'item', w: 24, rarity: 'rare', plusMin: 2, plusMax: 4, reqMin: 60, reqMax: 120, exc: false },
    { kind: 'item', w: 30, rarity: 'epic', plusMin: 2, plusMax: 5, reqMin: 60, reqMax: 120, exc: true },
    { kind: 'item', w: 1.5, rarity: 'legendary', plusMin: 3, plusMax: 5, reqMin: 60, reqMax: 120, exc: true }, // exatamente 1,50%
    { kind: 'item', w: 0.5, rarity: 'ancestral', plusMin: 3, plusMax: 5, reqMin: 60, reqMax: 120, exc: true }, // exatamente 0,50%
    { kind: 'material', w: 12, item: 'jewel_of_chaos', min: 2, max: 4 },
    { kind: 'material', w: 10, item: 'jewel_of_bless', min: 2, max: 3 },
    { kind: 'material', w: 9, item: 'jewel_of_soul', min: 2, max: 3 },
    { kind: 'material', w: 6, item: 'jewel_of_creation', min: 1, max: 2 },
  ],
  // Caixa semi-full de loja: só raros/épicos e adicionais moderados; sem drops full.
  kundun_promo: [
    { kind: 'item', w: 58, rarity: 'rare', plusMin: 3, plusMax: 5 },
    { kind: 'item', w: 32, rarity: 'epic', plusMin: 4, plusMax: 5 },
    { kind: 'material', w: 7, item: 'jewel_of_chaos', min: 1, max: 3 },
    { kind: 'zen', w: 3, min: 25000, max: 100000 },
  ],
};

// nenhum item que sai de caixa/drop passa de +5 (vale também para configurações antigas salvas no painel)
const DROP_PLUS_MAX = 5;
let H = null;
// teto do Zen da Box Ouro: mesmo uma configuração antiga salva no painel não passa destes valores (só pode ser menor)
const OURO_ZEN_CAP = { w: 7, min: 60000, max: 150000 };
function capOuroZen(list) {
  if (!Array.isArray(list)) return list;
  return list.map((e) => (e && e.kind === 'zen' ? { ...e, w: Math.min(e.w, OURO_ZEN_CAP.w), min: Math.min(e.min, OURO_ZEN_CAP.min), max: Math.min(e.max, OURO_ZEN_CAP.max) } : e));
}
function cfg() { const c = { ...DEFAULTS, ...(SET.get('kundun', DEFAULTS) || {}) }; c.kundun_ouro = capOuroZen(c.kundun_ouro); return c; }
async function init(helpers) { H = helpers; await SET.load('kundun', DEFAULTS); }

const randi = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

function pick(list) {
  const tot = list.reduce((a, e) => a + e.w, 0);
  let r = Math.random() * tot;
  for (const e of list) { r -= e.w; if (r <= 0) return e; }
  return list[list.length - 1];
}

// equipamento perto do nível do jogador (nunca acima de nível + 3, nunca acima dos limites do jogo)
function equipFor(level, kinds) {
  const pool = Object.entries(G.ITEM_BASES).filter(([, b]) => !b.special && b.slot !== 'material' && b.req <= level + 3 && b.req >= Math.max(1, level - 20) && (!kinds || kinds(b)));
  const all = pool.length ? pool : Object.entries(G.ITEM_BASES).filter(([, b]) => !b.special && b.slot !== 'material' && b.req <= Math.max(1, level + 3));
  return all[Math.floor(Math.random() * all.length)][0];
}

// Box Prata e Ouro: todo equipamento sai com 2 a 4 atributos (opções excelentes) sem repetir.
// [quantidade, peso %]; a Ouro tem distribuição mais difícil que a Prata. A Bronze não usa este sistema.
const ATTR_DIST = {
  kundun_prata: [[2, 65], [3, 28], [4, 7]],
  kundun_ouro: [[2, 76], [3, 20.5], [4, 3.5]],
};
const ATTR_TIER = { 2: 'Especial', 3: 'Superior', 4: 'Lendária especial' };
function attrCount(box) {
  const d = ATTR_DIST[box]; if (!d) return 0;
  let r = Math.random() * d.reduce((a, x) => a + x[1], 0);
  for (const [n, w] of d) { r -= w; if (r <= 0) return n; }
  return d[0][0];
}

// equipamento da faixa de nível da caixa que a classe de quem abre pode usar.
// Fica no máximo 10 níveis acima do personagem (dentro da faixa); low = prefere os de nível mais baixo.
function gearFor(p, reqMin, reqMax, low, needAttrs) {
  const cap = Math.max(reqMin, Math.min(reqMax, (p.level || 1) + 10));
  const ok = (k, b, lo, hi) => {
    if (b.special || b.seasonal || b.slot === 'material' || b.slot === 'wings' || b.stack || !EQUIP.equipable(b)) return false;
    if (needAttrs && !EXCELLENT.hasPool(k)) return false; // só peças que aceitam atributos
    const r = EQUIP.rule(k);
    return r.enabled && r.level >= lo && r.level <= hi && r.classes.includes(p.cls) && (r.minEvo || 0) <= (p.evo || 0);
  };
  let pool = Object.entries(G.ITEM_BASES).filter(([k, b]) => ok(k, b, reqMin, cap));
  if (!pool.length) pool = Object.entries(G.ITEM_BASES).filter(([k, b]) => ok(k, b, reqMin, reqMax));
  if (!pool.length) return null;
  pool.sort((a, b) => EQUIP.rule(a[0]).level - EQUIP.rule(b[0]).level);
  const r = low ? Math.random() * Math.random() : Math.random();
  return pool[Math.min(pool.length - 1, Math.floor(r * pool.length))][0];
}

// sorteia o conteúdo (sem entregar)
function roll(box, p) {
  // (box é usado também para o número de atributos)
  const list = cfg()[box] || DEFAULTS[box];
  const e = pick(list);
  const pMin = Math.min(DROP_PLUS_MAX, e.plusMin || 0), pMax = Math.min(DROP_PLUS_MAX, Math.max(pMin, e.plusMax || 0));
  const plus = () => randi(pMin, pMax);
  switch (e.kind) {
    case 'zen': return { kind: 'zen', qty: randi(e.min, e.max) };
    case 'pot': return { kind: 'pot', pot: e.pot === 'mp' ? 'mp' : 'hp', qty: randi(e.min, e.max) };
    case 'material': return { kind: 'material', base: e.item, qty: randi(e.min, e.max) };
    case 'item': {
      const attrs = attrCount(box);
      const base = (e.reqMin || e.reqMax) ? gearFor(p, e.reqMin || 1, e.reqMax || G.LIMITS.maxLevel, !!e.low, attrs > 0) : null;
      return { kind: 'item', base: base || equipFor(p.level), rarity: e.rarity, plus: plus(), exc: attrs > 0 || e.exc !== false, attrs: attrs || undefined };
    }
    case 'chaosweapon': {
      const list2 = Object.keys(G.ITEM_BASES).filter((k) => G.ITEM_BASES[k].chaos);
      return { kind: 'item', base: list2[Math.floor(Math.random() * list2.length)], rarity: e.rarity || 'common', plus: plus() };
    }
    case 'wing1': case 'wing2': case 'cape': {
      const tier = e.kind === 'wing2' ? 2 : 1;
      let list2 = Object.keys(G.ITEM_BASES).filter((k) => G.ITEM_BASES[k].slot === 'wings' && G.ITEM_BASES[k].tier === tier && (e.kind === 'cape' ? G.ITEM_BASES[k].cat === 'cape' : G.ITEM_BASES[k].cat === 'wings'));
      const mine = list2.filter((k) => (G.ITEM_BASES[k].classes || []).includes(p.cls));
      // a caixa prefere o que serve para a classe de quem abre (o Dark Lord recebe capa no lugar de asa)
      if (mine.length) list2 = mine;
      else if (p.cls === 'dark_lord' && e.kind !== 'cape') list2 = Object.keys(G.ITEM_BASES).filter((k) => G.ITEM_BASES[k].cat === 'cape' && G.ITEM_BASES[k].tier === tier);
      const base = list2[Math.floor(Math.random() * list2.length)];
      return { kind: 'item', base, rarity: G.ITEM_BASES[base].rarity || 'epic', plus: 0 };
    }
    default: return { kind: 'zen', qty: 1000 };
  }
}

function describe(r) {
  if (r.kind === 'zen') return `${r.qty.toLocaleString('pt-BR')} Zen`;
  if (r.kind === 'pot') return `${r.qty} ${r.pot === 'mp' ? 'poções de mana' : 'poções de vida'}`;
  const b = G.ITEM_BASES[r.base];
  if (r.kind === 'material') return `${r.qty}× ${b.name}`;
  const tags = [];
  if (r.kind === 'item' && r.rarity === 'ancestral') tags.push('Ancestral');
  else if (r.kind === 'item' && r.rarity === 'legendary') tags.push('Lendário');
  else if (r.kind === 'item' && r.exc && r.rarity === 'epic') tags.push('Excelente');
  if (r.attrs) tags.push(`${r.attrs} atributos · ${ATTR_TIER[r.attrs]}`);
  return `${b.name}${r.plus ? ' +' + r.plus : ''}${tags.length ? ` (${tags.join(' · ')})` : ''}`;
}

// abre uma caixa: precisa ser do jogador, estar na bolsa e caber o prêmio
async function open(world, p, itemId) {
  const reply = (ok, text, extra = {}) => p.send({ type: 'boxResult', ok, text, ...extra });
  if (p.opening) return reply(false, 'Espere a caixa anterior abrir.');
  const box = p.items.find((i) => String(i.id) === String(itemId) && !i.equipped);
  if (!box || !BOXES.includes(box.base)) return reply(false, 'Esta caixa não está mais na sua bolsa.');
  const r = roll(box.base, p);
  const qty = Number(box.qty) || 1;
  const free = G.INVENTORY_SIZE - H.bagUsed(p) + (qty === 1 ? 1 : 0);
  let stackTo = null;
  if (r.kind === 'material') stackTo = p.items.find((i) => i.base === r.base && !i.equipped && (Number(i.qty) || 1) + r.qty <= G.MAX_STACK) || null;
  if ((r.kind === 'item' || (r.kind === 'material' && !stackTo)) && free < 1) return reply(false, 'Bolsa cheia: libere um lugar para abrir a caixa. A caixa continua na sua bolsa.');
  p.opening = true;
  let row = null;
  try {
    row = await db.tx(async (q) => {
      const d = qty > 1
        ? await q('UPDATE items SET qty = qty - 1 WHERE id = $1 AND character_id = $2 AND qty = $3 RETURNING id', [box.id, p.charId, qty])
        : await q('DELETE FROM items WHERE id = $1 AND character_id = $2 AND qty = 1 RETURNING id', [box.id, p.charId]);
      if (!d.rows[0]) throw new Error('A caixa mudou. Tente de novo.');
      let out = null;
      if (r.kind === 'item') {
        const opts = r.attrs ? EXCELLENT.roll(r.base, r.attrs) : r.exc === false ? [] : EXCELLENT.roll(r.base);
        out = (await q(`INSERT INTO items (character_id, base, rarity, plus, excellent_options) VALUES ($1,$2,$3,$4,$5) RETURNING id, base, rarity, plus, equipped, qty, excellent_options`,
          [p.charId, r.base, r.rarity, r.plus, JSON.stringify(opts)])).rows[0];
      } else if (r.kind === 'material') {
        out = stackTo
          ? (await q('UPDATE items SET qty = qty + $3 WHERE id = $1 AND character_id = $2 AND qty + $3 <= $4 RETURNING id, base, rarity, plus, equipped, qty', [stackTo.id, p.charId, r.qty, G.MAX_STACK])).rows[0]
          : (await q(`INSERT INTO items (character_id, base, rarity, plus, qty) VALUES ($1,$2,$3,0,$4) RETURNING id, base, rarity, plus, equipped, qty`,
            [p.charId, r.base, G.ITEM_BASES[r.base].rarity || 'common', r.qty])).rows[0];
        if (!out) throw new Error('A bolsa mudou. Tente de novo.');
      } else if (r.kind === 'zen') {
        await q('UPDATE characters SET zen = $2 WHERE id = $1 RETURNING id', [p.charId, Math.round(p.zen + r.qty)]);
      } else {
        await q(`UPDATE characters SET ${r.pot === 'mp' ? 'pot_mp' : 'pot_hp'} = $2 WHERE id = $1 RETURNING id`, [p.charId, p.pots[r.pot] + r.qty]);
      }
      await q('INSERT INTO box_opens (character_id, char_name, box, reward) VALUES ($1,$2,$3,$4) RETURNING id', [p.charId, p.name, box.base, JSON.stringify({ ...r, text: describe(r) })]);
      return out;
    });
  } catch (e) {
    p.opening = false;
    console.error('[kundun]', p.name, e.message);
    return reply(false, /mudou/.test(e.message) ? e.message : 'A caixa não abriu (nada foi gasto). Tente de novo.');
  }
  p.opening = false;
  // memória só depois de gravar
  if (qty > 1) box.qty = qty - 1; else p.items = p.items.filter((i) => i !== box);
  if (r.kind === 'zen') p.zen += r.qty;
  else if (r.kind === 'pot') p.pots[r.pot] += r.qty;
  else if (r.kind === 'material' && stackTo) stackTo.qty = Number(row.qty);
  else if (row) p.items.push(row);
  p.dirty = true;
  const item = row ? H.publicItem(r.kind === 'material' ? row : row) : null;
  const text = describe(r);
  reply(true, text, { box: box.base, reward: { ...r, text }, item, high: !!(row && (HIGH.includes(row.rarity) || r.attrs === 4)) });
  p.send(p.charState());
  if (row && (HIGH.includes(row.rarity) || r.attrs === 4 || G.ITEM_BASES[row.base].slot === 'wings')) world.system(`${p.name} abriu uma ${G.ITEM_BASES[box.base].name} e ganhou ${text}!`);
  return undefined;
}

// o que a janela da caixa mostra (tipos de prêmio, sem as chances)
const KIND_PT = { zen: 'Zen', pot: 'Poções', material: 'Materiais', chaosweapon: 'Armas do Caos', wing1: 'Asas de nível 1', wing2: 'Asas de nível 2', cape: 'Capas do Dark Lord' };
const RAR_PT = { common: 'comuns', uncommon: 'incomuns', rare: 'raros', epic: 'épicos', legendary: 'lendários', ancestral: 'ancestrais' };
function contents(box) {
  const out = [];
  for (const e of (cfg()[box] || DEFAULTS[box] || [])) {
    let t;
    if (e.kind === 'item' && ATTR_DIST[box]) t = `Equipamentos ${e.rarity === 'legendary' ? 'lendários' : e.exc && e.rarity === 'epic' ? 'excelentes' : RAR_PT[e.rarity] || e.rarity}${e.reqMax ? ` nível ${e.reqMin || 1}–${e.reqMax}` : ''} com 2 a 4 atributos`;
    else if (e.kind === 'item') t = `Equipamentos ${e.exc && e.rarity === 'epic' ? 'excelentes' : RAR_PT[e.rarity] || e.rarity}${e.reqMax ? ` nível ${e.reqMin || 1}–${e.reqMax}` : ''}${e.plusMax ? ` (até +${Math.min(DROP_PLUS_MAX, e.plusMax)})` : ''}`;
    else if (e.kind === 'material') t = G.ITEM_BASES[e.item] ? G.ITEM_BASES[e.item].name : e.item;
    else if (e.kind === 'pot') t = e.pot === 'mp' ? 'Poções de mana' : 'Poções de vida';
    else t = KIND_PT[e.kind] || e.kind;
    if (!out.includes(t)) out.push(t);
  }
  return out;
}

function sanitize(input) {
  const out = {};
  for (const box of BOXES) {
    const name = G.ITEM_BASES[box].name;
    const list = Array.isArray(input[box]) ? input[box] : [];
    if (!list.length) throw new Error(`${name}: coloque pelo menos um prêmio.`);
    if (list.length > 40) throw new Error(`${name}: no máximo 40 prêmios.`);
    const clean = list.map((e, i) => {
      const lbl = `${name}, prêmio ${i + 1}`;
      if (!KINDS.includes(e.kind)) throw new Error(`${lbl}: tipo inválido.`);
      const w = Number(e.w);
      if (!(w > 0 && w <= 10000)) throw new Error(`${lbl}: peso precisa ser maior que 0.`);
      const o = { kind: e.kind, w: Math.round(w * 1000) / 1000 };
      const n = (v, a, b, f) => { const x = Math.round(Number(v)); if (!(x >= a && x <= b)) throw new Error(`${lbl}: ${f} de ${a} a ${b}.`); return x; };
      if (e.kind === 'zen') { o.min = n(e.min, 1, 1e10, 'Zen mínimo'); o.max = n(e.max, o.min, 1e10, 'Zen máximo'); }
      if (e.kind === 'pot') { o.pot = e.pot === 'mp' ? 'mp' : 'hp'; o.min = n(e.min, 1, 5000, 'mínimo'); o.max = n(e.max, o.min, 5000, 'máximo'); }
      if (e.kind === 'material') {
        if (!(G.ITEM_BASES[e.item] && G.ITEM_BASES[e.item].stack && G.ITEM_BASES[e.item].slot === 'material')) throw new Error(`${lbl}: material inválido.`);
        o.item = e.item; o.min = n(e.min, 1, 99, 'mínimo'); o.max = n(e.max, o.min, 99, 'máximo');
      }
      if (e.kind === 'item' || e.kind === 'chaosweapon') {
        if (!RARITY_ORDER.includes(e.rarity)) throw new Error(`${lbl}: raridade inválida.`);
        if (box === 'kundun_promo' && !['rare', 'epic'].includes(e.rarity)) throw new Error(`${lbl}: a caixa promocional aceita apenas itens raros ou épicos.`);
        if (!['kundun_promo', 'kundun_ouro'].includes(box) && e.rarity === 'ancestral') throw new Error(`${lbl}: só a Box Kundun Ouro entrega itens Ancestrais.`);
        o.rarity = e.rarity; o.plusMin = n(e.plusMin || 0, 0, DROP_PLUS_MAX, '+ mínimo (máximo 5)'); o.plusMax = n(e.plusMax || 0, o.plusMin, DROP_PLUS_MAX, '+ máximo (máximo 5)');
        if (e.kind === 'item' && (e.reqMin || e.reqMax)) { o.reqMin = n(e.reqMin || 1, 1, G.LIMITS.maxLevel, 'nível mínimo'); o.reqMax = n(e.reqMax || o.reqMin, o.reqMin, G.LIMITS.maxLevel, 'nível máximo'); }
        if (e.kind === 'item' && typeof e.exc === 'boolean') o.exc = e.exc;
        if (e.kind === 'item' && e.low) o.low = true;
      }
      return o;
    });
    // itens lendários/ancestrais precisam ser mais raros que os comuns e raros
    const high = clean.filter((e) => (e.kind === 'item' || e.kind === 'chaosweapon') && HIGH.includes(e.rarity)).reduce((a, e) => a + e.w, 0);
    const low = clean.filter((e) => (e.kind === 'item' || e.kind === 'chaosweapon') && ['common', 'uncommon', 'rare'].includes(e.rarity)).reduce((a, e) => a + e.w, 0);
    const total = clean.reduce((a, e) => a + e.w, 0);
    if (high && (low ? high >= low : high >= total * 0.2)) throw new Error(`${name}: a chance de itens lendários e ancestrais precisa ser menor que a de itens comuns, incomuns e raros.`);
    if (box === 'kundun_ouro') {
      const sum = (r) => clean.filter((e) => e.kind !== 'material' && e.rarity === r).reduce((a, e) => a + e.w, 0);
      if (sum('legendary') / total > 0.015 + 1e-9) throw new Error(`${name}: a chance de equipamento Lendário não pode passar de 1,50%.`);
      if (sum('ancestral') / total > 0.005 + 1e-9) throw new Error(`${name}: a chance de equipamento Ancestral não pode passar de 0,50%.`);
    }
    out[box] = clean;
  }
  return out;
}

async function saveConfig(input) { const c = sanitize(input); await SET.save('kundun', c); return c; }

// simulação (nada é entregue)
function simulate(box, n, level, cls) {
  if (!BOXES.includes(box)) throw new Error('Caixa inválida.');
  n = Math.max(1, Math.min(100000, Math.round(Number(n) || 1000)));
  const fake = { level: Math.max(1, Math.min(G.LIMITS.maxLevel, Math.round(Number(level) || 50))), cls: G.CLASSES[cls] ? cls : 'dark_knight' };
  const tot = {};
  let zen = 0;
  for (let i = 0; i < n; i++) {
    const r = roll(box, fake);
    let k;
    if (r.kind === 'zen') { zen += r.qty; k = 'Zen'; }
    else if (r.kind === 'pot') k = r.pot === 'mp' ? 'Poções de mana' : 'Poções de vida';
    else if (r.kind === 'material') k = G.ITEM_BASES[r.base].name;
    else { const b = G.ITEM_BASES[r.base]; k = b.slot === 'wings' ? b.name : `Equipamentos ${RAR_PT[r.rarity] || r.rarity}${r.attrs ? ` · ${r.attrs} atributos` : ''}`; }
    tot[k] = (tot[k] || 0) + 1;
  }
  return { box: G.ITEM_BASES[box].name, opens: n, level: fake.level, zenAvg: Math.round(zen / n),
    results: Object.entries(tot).sort((a, b) => b[1] - a[1]).map(([k, c]) => ({ name: k, count: c, pct: Math.round(c / n * 10000) / 100 })) };
}

async function history(limit = 60, name = '') {
  const { rows } = await db.query(`SELECT char_name, box, reward, created_at FROM box_opens WHERE ($1 = '' OR lower(char_name) = lower($1)) ORDER BY id DESC LIMIT $2`,
    [String(name || ''), Math.min(300, Math.max(1, limit))]);
  return rows;
}

module.exports = { init, open, roll, contents, cfg, saveConfig, simulate, history, BOXES, KINDS, DEFAULTS, describe };
