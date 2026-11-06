'use strict';
// Fabricação do Fenrir Vermelho na Chaos Machine (qualquer Chaos Goblin), em 3 etapas:
//  1) 20 Splinter of Armor + 10 Bless of Guardian + 1 Jewel of Chaos + 100.000 Zen → Fragment of Horn (70%)
//  2) 5 Fragment of Horn + 3 Claw of Beast + 1 Jewel of Chaos + 500.000 Zen → Broken Horn (50%)
//  3) 1 Broken Horn + 1 Jewel of Chaos + 1.000.000 Zen → Fenrir Vermelho (30%)
// Na falha, os materiais e o Zen são consumidos. Tudo numa transação: nada é perdido se o servidor falhar no meio.
const db = require('./db');
const G = require('./gamedata');

const STEPS = [
  { n: 1, title: 'Fragment of Horn', mats: [['splinter_of_armor', 20], ['bless_of_guardian', 10], ['jewel_of_chaos', 1]], zen: 100000, chance: 70, out: 'fragment_of_horn' },
  { n: 2, title: 'Broken Horn', mats: [['fragment_of_horn', 5], ['claw_of_beast', 3], ['jewel_of_chaos', 1]], zen: 500000, chance: 50, out: 'broken_horn' },
  { n: 3, title: 'Fenrir Vermelho', mats: [['broken_horn', 1], ['jewel_of_chaos', 1]], zen: 1000000, chance: 30, out: 'fenrir_red' },
];
let H = null;
function init(helpers) { H = helpers; }
const atChaos = (p) => !!(p.map && (p.map.def.npcs || []).some((n) => n.kind === 'chaos'));
const stacksOf = (p, base) => p.items.filter((i) => i.base === base && !i.equipped).sort((a, b) => Number(a.id) - Number(b.id));
const qty = (st) => st.reduce((a, i) => a + (Number(i.qty) || 1), 0);
const pub = (base) => { const b = G.ITEM_BASES[base]; return { base, name: b.name, icon: b.icon, ic: b.ic, rarity: b.rarity, desc: b.desc }; };

function info(p) {
  return {
    type: 'fenrirInfo', atChaos: atChaos(p), zen: p.zen, bagFree: G.INVENTORY_SIZE - H.bagUsed(p),
    sources: 'Acheron (mapa até o nível 800): 0,50% · Blood Castle: 0,55% — por material e por monstro',
    steps: STEPS.map((s) => {
      const mats = s.mats.map(([base, need]) => { const have = qty(stacksOf(p, base)); return { ...pub(base), need, have, missing: Math.max(0, need - have) }; });
      return { n: s.n, title: s.title, zen: s.zen, chance: s.chance, result: pub(s.out), mats, ready: mats.every((m) => !m.missing) && p.zen >= s.zen };
    }),
  };
}

async function craft(world, p, n) {
  const reply = (ok, text, extra = {}) => p.send({ type: 'chaosResult', ok, text, entry: true, ...extra });
  const S = STEPS.find((s) => s.n === Math.floor(Number(n)));
  if (!S) return reply(false, 'Etapa inválida.');
  if (p.crafting) return reply(false, 'Espere a combinação anterior terminar.');
  if (p.dead) return reply(false, 'Você está derrotado.');
  if (!atChaos(p)) return reply(false, 'Vá até a Chaos Machine (Chaos Goblin em Lorencia ou Noria).');
  const takes = [], missing = [];
  for (const [base, need] of S.mats) {
    const st = stacksOf(p, base), have = qty(st);
    if (have < need) { missing.push(`${need - have}× ${G.ITEM_BASES[base].name}`); continue; }
    let left = need;
    for (const it of st) { if (left <= 0) break; const q = Number(it.qty) || 1, t = Math.min(q, left); takes.push({ it, take: t, rest: q - t }); left -= t; }
  }
  if (missing.length) return reply(false, 'Faltam materiais para esta etapa.', { missing });
  if (p.zen < S.zen) return reply(false, `Zen insuficiente: esta etapa custa ${S.zen.toLocaleString('pt-BR')} Zen.`, { missing: [`${(S.zen - p.zen).toLocaleString('pt-BR')} Zen`] });
  const outB = G.ITEM_BASES[S.out];
  const stackTo = outB.stack ? p.items.find((i) => i.base === S.out && !i.equipped && (Number(i.qty) || 1) < G.MAX_STACK) : null;
  const freed = takes.filter((t) => t.rest === 0).length;
  if (!stackTo && H.bagUsed(p) - freed + 1 > G.INVENTORY_SIZE) return reply(false, 'Inventário cheio: libere um espaço antes de combinar.');
  const success = Math.random() * 100 < S.chance;
  const zen0 = p.zen;
  p.crafting = true;
  let row = null;
  try {
    row = await db.tx(async (q) => {
      for (const t of takes) {
        const d = t.rest > 0
          ? await q('UPDATE items SET qty = qty - $3 WHERE id = $1 AND character_id = $2 AND qty = $4 AND vault_no IS NULL AND NOT equipped RETURNING id', [t.it.id, p.charId, t.take, t.take + t.rest])
          : await q('DELETE FROM items WHERE id = $1 AND character_id = $2 AND qty = $3 AND vault_no IS NULL AND NOT equipped RETURNING id', [t.it.id, p.charId, t.take]);
        if (!d.rows[0]) throw new Error('Os materiais mudaram. Tente de novo.');
      }
      await q('UPDATE characters SET zen = $2 WHERE id = $1 RETURNING id', [p.charId, Math.round(zen0 - S.zen)]);
      let r = null;
      if (success) {
        if (stackTo) r = (await q('UPDATE items SET qty = qty + 1 WHERE id = $1 AND character_id = $2 AND vault_no IS NULL RETURNING id, base, rarity, plus, equipped, qty', [stackTo.id, p.charId])).rows[0];
        if (!r) r = (await q('INSERT INTO items (character_id, base, rarity, plus, qty) VALUES ($1, $2, $3, 0, 1) RETURNING id, base, rarity, plus, equipped, qty', [p.charId, S.out, outB.rarity])).rows[0];
      }
      await q(`INSERT INTO chaos_log (character_id, char_name, recipe, inputs, zen, chance, success, result_item, result_base, lost)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, '[]'::jsonb) RETURNING id`,
      [p.charId, p.name, 'fenrir_' + S.n, JSON.stringify(takes.map((t) => ({ id: String(t.it.id), base: t.it.base, qty: t.take }))), S.zen, S.chance, success, r ? r.id : null, success ? S.out : null]);
      return r;
    });
  } catch (e) {
    p.crafting = false;
    console.error('[fenrir]', p.name, e.message);
    return reply(false, /materiais/i.test(e.message) ? e.message : 'A combinação não foi feita (nada foi gasto). Tente de novo.');
  }
  p.crafting = false;
  p.zen = zen0 - S.zen;
  for (const t of takes) { if (t.rest > 0) t.it.qty = t.rest; else p.items = p.items.filter((i) => i !== t.it); }
  if (row) { const mem = p.items.find((i) => String(i.id) === String(row.id)); if (mem) mem.qty = row.qty; else p.items.push(row); }
  p.dirty = true;
  if (success) {
    reply(true, `Sucesso! Você criou ${outB.name}.`, { success: true, chance: S.chance, item: H.publicItem({ ...row, qty: 1 }), title: `Fenrir · etapa ${S.n}`, used: takes.map((t) => `${t.take}× ${G.ITEM_BASES[t.it.base].name}`) });
    if (S.n === 3) world.system(`🐺 ${p.name} criou um Fenrir Vermelho na Chaos Machine!`, `🐺 ${p.name} crafted a Red Fenrir in the Chaos Machine!`);
  } else {
    reply(true, `A combinação falhou (${S.chance}% de chance). Os materiais e o Zen da etapa ${S.n} foram consumidos.`, { success: false, chance: S.chance, lost: takes.map((t) => `${t.take}× ${G.ITEM_BASES[t.it.base].name}`), title: `Fenrir · etapa ${S.n}` });
  }
  p.send(p.charState());
  p.send(info(p));
  return undefined;
}

module.exports = { init, info, craft, STEPS };
