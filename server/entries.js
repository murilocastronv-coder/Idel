'use strict';
// Fabricação de entradas na Chaos Machine de Noria: Blood Castle e Devil Square +1 a +7.
// Receita progressiva: +N = (N+1) do material principal + N do par + N Jewel of Chaos + Zen.
// Os materiais podem ser de qualquer nível (+1 a +7); são gastos primeiro os de nível mais baixo.
// Tudo é validado e feito no servidor, numa única transação: materiais, Zen, entrada e registro.
const db = require('./db');
const G = require('./gamedata');

const MAX_LV = 7;
const LEVELS = [1, 2, 3, 4, 5, 6, 7];
// custo em Zen por nível da entrada (igual para Blood Castle e Devil Square); +8/+9 ficam prontos para quando existirem
const ZEN_COST = { 1: 5000, 2: 20000, 3: 40000, 4: 70000, 5: 110000, 6: 160000, 7: 210000, 8: 255000, 9: 300000 };
const KINDS = {
  blood: { name: 'Blood Castle', main: 'scroll_of_archangel_', mainName: "Archangel's Scroll", key: 'blood_bone_', keyName: 'Blood Bone', out: 'cloak_inv_' },
  devil: { name: 'Devil Square', main: 'devil_eye_', mainName: "Devil's Eye", key: 'devil_key_', keyName: "Devil's Key", out: 'devil_inv_' },
};
const CHAOS = 'jewel_of_chaos';

let H = null;
function init(helpers) { H = helpers; }

const recipe = (n) => ({ main: n + 1, key: n, chaos: n, zen: ZEN_COST[n] });
const atNoria = (p) => !!(p.map && (p.map.id || (p.map.def && p.map.def.id)) === 'noria');
// grupos de material: todos os níveis contam; ordem de gasto = nível mais baixo, depois o item mais antigo
function stacksOf(p, prefix) {
  const bases = prefix === CHAOS ? [CHAOS] : LEVELS.map((l) => prefix + l);
  return p.items.filter((i) => bases.includes(i.base) && !i.equipped)
    .sort((a, b) => (bases.indexOf(a.base) - bases.indexOf(b.base)) || (Number(a.id) - Number(b.id)));
}
const qtyOf = (st) => st.reduce((a, i) => a + (Number(i.qty) || 1), 0);

function plan(p, kind, n) {
  const K = KINDS[kind], R = recipe(n);
  return [
    { group: K.main, name: K.mainName, need: R.main, icon: (G.ITEM_BASES[K.main + 1] || {}).icon, ic: (G.ITEM_BASES[K.main + 1] || {}).ic },
    { group: K.key, name: K.keyName, need: R.key, icon: (G.ITEM_BASES[K.key + 1] || {}).icon, ic: (G.ITEM_BASES[K.key + 1] || {}).ic },
    { group: CHAOS, name: G.ITEM_BASES[CHAOS].name, need: R.chaos, icon: G.ITEM_BASES[CHAOS].icon, ic: G.ITEM_BASES[CHAOS].ic, rarity: G.ITEM_BASES[CHAOS].rarity },
  ].map((m) => { const stacks = stacksOf(p, m.group); return { ...m, stacks, have: qtyOf(stacks) }; });
}

function info(p) {
  const kinds = {};
  for (const [kind, K] of Object.entries(KINDS)) {
    kinds[kind] = {
      name: K.name, mainName: K.mainName, keyName: K.keyName,
      levels: LEVELS.map((n) => {
        const out = K.out + n, b = G.ITEM_BASES[out];
        const mats = plan(p, kind, n).map(({ stacks, ...m }) => ({ ...m, missing: Math.max(0, m.need - m.have) }));
        return { n, zen: recipe(n).zen, result: { base: out, name: b.name, icon: b.icon, ic: b.ic, rarity: b.rarity, desc: b.desc, title: `${K.name} +${n}` },
          mats, ready: mats.every((m) => !m.missing) };
      }),
    };
  }
  return { type: 'entryInfo', atNoria: atNoria(p), zen: p.zen, bagFree: G.INVENTORY_SIZE - H.bagUsed(p), maxLevel: MAX_LV, kinds };
}

async function craft(world, p, kind, n) {
  const reply = (ok, text, extra = {}) => p.send({ type: 'chaosResult', ok, text, entry: true, ...extra });
  const K = KINDS[kind];
  n = Math.floor(Number(n));
  if (!K) return reply(false, 'Entrada desconhecida.');
  if (!(n >= 1 && n <= MAX_LV)) return reply(false, `Escolha uma entrada de +1 a +${MAX_LV}.`);
  if (p.crafting) return reply(false, 'Espere a combinação anterior terminar.');
  if (p.dead) return reply(false, 'Você está derrotado.');
  if (!atNoria(p)) return reply(false, 'As entradas só podem ser fabricadas na Chaos Machine de Noria.');
  const R = recipe(n), mats = plan(p, kind, n);
  const missing = mats.filter((m) => m.have < m.need);
  if (missing.length) return reply(false, 'Faltam materiais para fabricar esta entrada.', { missing: missing.map((m) => `${m.need - m.have}× ${m.name}`) });
  if (p.zen < R.zen) return reply(false, `Zen insuficiente: a fabricação custa ${R.zen.toLocaleString('pt-BR')} Zen.`, { missing: [`${(R.zen - p.zen).toLocaleString('pt-BR')} Zen`] });
  const takes = [];
  for (const m of mats) {
    let need = m.need;
    for (const st of m.stacks) { if (need <= 0) break; const q = Number(st.qty) || 1; const t = Math.min(q, need); takes.push({ it: st, take: t, left: q - t }); need -= t; }
  }
  const resultBase = K.out + n;
  const stackTo = p.items.find((i) => i.base === resultBase && !i.equipped && (Number(i.qty) || 1) < G.MAX_STACK);
  const freed = takes.filter((t) => t.left === 0).length;
  if (!stackTo && H.bagUsed(p) - freed + 1 > G.INVENTORY_SIZE) return reply(false, 'Inventário cheio: libere um espaço para receber a entrada.');
  const inputs = { level: n, materials: takes.map((t) => ({ id: String(t.it.id), base: t.it.base, qty: t.take })) };
  p.crafting = true;
  const zenBefore = p.zen;
  let created = null;
  try {
    created = await db.tx(async (q) => {
      for (const t of takes) {
        const d = t.left > 0
          ? await q('UPDATE items SET qty = qty - $3 WHERE id = $1 AND character_id = $2 AND qty = $4 AND vault_no IS NULL AND NOT equipped RETURNING id', [t.it.id, p.charId, t.take, t.take + t.left])
          : await q('DELETE FROM items WHERE id = $1 AND character_id = $2 AND qty = $3 AND vault_no IS NULL AND NOT equipped RETURNING id', [t.it.id, p.charId, t.take]);
        if (!d.rows[0]) throw new Error('Os materiais mudaram. Tente de novo.');
      }
      await q('UPDATE characters SET zen = $2 WHERE id = $1 RETURNING id', [p.charId, Math.round(zenBefore - R.zen)]);
      let row = null;
      if (stackTo) row = (await q('UPDATE items SET qty = qty + 1 WHERE id = $1 AND character_id = $2 AND vault_no IS NULL RETURNING id, base, rarity, plus, equipped, qty', [stackTo.id, p.charId])).rows[0];
      if (!row) row = (await q('INSERT INTO items (character_id, base, rarity, plus, qty) VALUES ($1, $2, $3, 0, 1) RETURNING id, base, rarity, plus, equipped, qty', [p.charId, resultBase, G.ITEM_BASES[resultBase].rarity])).rows[0];
      await q(`INSERT INTO chaos_log (character_id, char_name, recipe, inputs, zen, chance, success, result_item, result_base, lost)
        VALUES ($1, $2, $3, $4, $5, 100, TRUE, $6, $7, '[]'::jsonb) RETURNING id`,
      [p.charId, p.name, 'entry_' + kind, JSON.stringify(inputs), R.zen, row.id, resultBase]);
      return row;
    });
  } catch (e) {
    p.crafting = false;
    console.error('[entries]', p.name, e.message);
    return reply(false, /materiais/i.test(e.message) ? e.message : 'A fabricação não foi feita (nada foi gasto). Tente de novo.');
  }
  // só depois da transação confirmada a memória do jogo muda
  p.crafting = false;
  p.zen = zenBefore - R.zen;
  for (const t of takes) { if (t.left > 0) t.it.qty = t.left; else p.items = p.items.filter((i) => i !== t.it); }
  const mem = p.items.find((i) => String(i.id) === String(created.id));
  if (mem) mem.qty = created.qty; else p.items.push(created);
  p.dirty = true;
  const title = `${K.name} +${n}`;
  const used = takes.map((t) => `${t.take}× ${G.ITEM_BASES[t.it.base].name}`);
  reply(true, `Entrada fabricada com sucesso! Você recebeu ${G.ITEM_BASES[resultBase].name} (${title}).`, {
    success: true, chance: 100, item: H.publicItem({ ...created, qty: 1 }), lost: [], used, title, recipe: 'entry_' + kind,
  });
  p.send({ type: 'log', kind: 'quest', text: `Chaos Machine: você fabricou ${title}. Usou ${used.join(', ')} e ${R.zen.toLocaleString('pt-BR')} Zen.` });
  p.send(p.charState());
  p.send(info(p));
  return undefined;
}

module.exports = { init, info, craft, recipe, KINDS, LEVELS, MAX_LV };
