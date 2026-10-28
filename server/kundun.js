'use strict';
// KundunBoxSystem — caixas da Invasão Dourada. O conteúdo é sorteado só no servidor, na hora de abrir;
// a animação do navegador só mostra o que o servidor já decidiu. A caixa só sai da bolsa junto com a
// entrega do prêmio (mesma transação); com a bolsa cheia ela continua lá.
const db = require('./db');
const G = require('./gamedata');
const SET = require('./settings');

const BOXES = ['kundun_bronze', 'kundun_prata', 'kundun_ouro'];
const RARITY_ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'ancestral'];
const KINDS = ['zen', 'pot', 'item', 'material', 'chaosweapon', 'wing1', 'wing2', 'cape'];
const HIGH = ['legendary', 'ancestral'];

// w = peso (a chance é w ÷ soma dos pesos da caixa)
const DEFAULTS = {
  kundun_bronze: [
    { kind: 'zen', w: 30, min: 5000, max: 25000 },
    { kind: 'pot', w: 18, pot: 'hp', min: 20, max: 60 },
    { kind: 'pot', w: 10, pot: 'mp', min: 20, max: 60 },
    { kind: 'item', w: 24, rarity: 'common', plusMin: 0, plusMax: 1 },
    { kind: 'item', w: 12, rarity: 'uncommon', plusMin: 0, plusMax: 2 },
    { kind: 'material', w: 5, item: 'jewel_of_chaos', min: 1, max: 1 },
    { kind: 'item', w: 1, rarity: 'rare', plusMin: 0, plusMax: 2 },
  ],
  kundun_prata: [
    { kind: 'zen', w: 20, min: 30000, max: 120000 },
    { kind: 'item', w: 28, rarity: 'rare', plusMin: 0, plusMax: 3 },
    { kind: 'item', w: 14, rarity: 'uncommon', plusMin: 1, plusMax: 3 },
    { kind: 'material', w: 16, item: 'jewel_of_chaos', min: 1, max: 3 },
    { kind: 'material', w: 5, item: 'loch_feather', min: 1, max: 1 },
    { kind: 'chaosweapon', w: 7, rarity: 'uncommon', plusMin: 0, plusMax: 2 },
    { kind: 'item', w: 8, rarity: 'epic', plusMin: 0, plusMax: 3 },
    { kind: 'pot', w: 2, pot: 'hp', min: 100, max: 200 },
  ],
  kundun_ouro: [
    { kind: 'zen', w: 18, min: 200000, max: 600000 },
    { kind: 'item', w: 22, rarity: 'rare', plusMin: 2, plusMax: 5 },
    { kind: 'item', w: 26, rarity: 'epic', plusMin: 2, plusMax: 5 },
    { kind: 'item', w: 6, rarity: 'legendary', plusMin: 2, plusMax: 5 },
    { kind: 'item', w: 1, rarity: 'ancestral', plusMin: 3, plusMax: 7 },
    { kind: 'material', w: 12, item: 'jewel_of_chaos', min: 3, max: 6 },
    { kind: 'material', w: 9, item: 'loch_feather', min: 1, max: 2 },
    { kind: 'chaosweapon', w: 4, rarity: 'rare', plusMin: 1, plusMax: 4 },
    { kind: 'wing1', w: 1.5 },
    { kind: 'wing2', w: 0.2 },
    { kind: 'cape', w: 0.3 },
  ],
};

let H = null;
function cfg() { return SET.get('kundun', DEFAULTS); }
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

// sorteia o conteúdo (sem entregar)
function roll(box, p) {
  const list = cfg()[box];
  const e = pick(list);
  const plus = () => Math.min(15, randi(e.plusMin || 0, Math.max(e.plusMin || 0, e.plusMax || 0)));
  switch (e.kind) {
    case 'zen': return { kind: 'zen', qty: randi(e.min, e.max) };
    case 'pot': return { kind: 'pot', pot: e.pot === 'mp' ? 'mp' : 'hp', qty: randi(e.min, e.max) };
    case 'material': return { kind: 'material', base: e.item, qty: randi(e.min, e.max) };
    case 'item': return { kind: 'item', base: equipFor(p.level), rarity: e.rarity, plus: plus() };
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
  return `${b.name}${r.plus ? ' +' + r.plus : ''}`;
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
        out = (await q(`INSERT INTO items (character_id, base, rarity, plus) VALUES ($1,$2,$3,$4) RETURNING id, base, rarity, plus, equipped, qty`,
          [p.charId, r.base, r.rarity, r.plus])).rows[0];
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
  reply(true, text, { box: box.base, reward: { ...r, text }, item, high: !!(row && HIGH.includes(row.rarity)) });
  p.send(p.charState());
  if (row && (HIGH.includes(row.rarity) || G.ITEM_BASES[row.base].slot === 'wings')) world.system(`${p.name} abriu uma ${G.ITEM_BASES[box.base].name} e ganhou ${text}!`);
  return undefined;
}

// o que a janela da caixa mostra (tipos de prêmio, sem as chances)
const KIND_PT = { zen: 'Zen', pot: 'Poções', material: 'Materiais', chaosweapon: 'Armas do Caos', wing1: 'Asas de nível 1', wing2: 'Asas de nível 2', cape: 'Capas do Dark Lord' };
const RAR_PT = { common: 'comuns', uncommon: 'incomuns', rare: 'raros', epic: 'épicos', legendary: 'lendários', ancestral: 'ancestrais' };
function contents(box) {
  const out = [];
  for (const e of cfg()[box] || []) {
    let t;
    if (e.kind === 'item') t = `Equipamentos ${RAR_PT[e.rarity] || e.rarity}${e.plusMax ? ` (até +${e.plusMax})` : ''}`;
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
        o.rarity = e.rarity; o.plusMin = n(e.plusMin || 0, 0, 15, '+ mínimo'); o.plusMax = n(e.plusMax || 0, o.plusMin, 15, '+ máximo');
      }
      return o;
    });
    // itens lendários/ancestrais precisam ser mais raros que os comuns e raros
    const high = clean.filter((e) => (e.kind === 'item' || e.kind === 'chaosweapon') && HIGH.includes(e.rarity)).reduce((a, e) => a + e.w, 0);
    const low = clean.filter((e) => (e.kind === 'item' || e.kind === 'chaosweapon') && ['common', 'uncommon', 'rare'].includes(e.rarity)).reduce((a, e) => a + e.w, 0);
    const total = clean.reduce((a, e) => a + e.w, 0);
    if (high && (low ? high >= low : high >= total * 0.2)) throw new Error(`${name}: a chance de itens lendários e ancestrais precisa ser menor que a de itens comuns, incomuns e raros.`);
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
    else { const b = G.ITEM_BASES[r.base]; k = b.slot === 'wings' ? b.name : `Equipamentos ${RAR_PT[r.rarity] || r.rarity}`; }
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
