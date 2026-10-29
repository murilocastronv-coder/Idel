'use strict';
// Aprimoramento de equipamentos (estilo MU):
//  • Direto (joia em cima do item): Jewel of Bless de +0 a +6, Jewel of Soul de +6 a +9
//  • Ferreiro Mestre (NPC): de +9 a +15, com tabela própria de chances e custo em joias e Zen
// Tudo é sorteado e validado aqui no servidor; cada tentativa é uma transação (joias, Zen, nível do item e registro mudam juntos).
const db = require('./db');
const G = require('./gamedata');
const SET = require('./settings');

const SLOT_CAT = { weapon: 'weapon', shield: 'shield', helm: 'armor', armor: 'armor', pants: 'armor', gloves: 'armor', boots: 'armor', wings: 'wings', ring: 'accessory', necklace: 'accessory' };
const CATS = ['weapon', 'shield', 'armor', 'wings', 'accessory'];
const FAIL = ['keep', 'minus1', 'reset'];
const BLESS = 'jewel_of_bless', SOUL = 'jewel_of_soul', CREATION = 'jewel_of_creation', CHAOS = 'jewel_of_chaos';
const pct = (arr) => arr;
const DEFAULTS = {
  directEnabled: true,
  maxLevel: 15,
  // chance (%) para subir de N para N+1 com joia direta (índice = nível atual)
  direct: [90, 80, 70, 60, 50, 40, 35, 25, 15],
  directFail: 'keep',
  smith: {
    enabled: true,
    maps: { lorencia: true, noria: false, devias: false },
    // índice 0 = +9 → +10 ... índice 5 = +14 → +15
    steps: [
      { chance: 60, bless: 3, soul: 3, chaos: 1, creation: 1, zen: 1000000 },
      { chance: 50, bless: 4, soul: 4, chaos: 1, creation: 1, zen: 2000000 },
      { chance: 40, bless: 5, soul: 5, chaos: 1, creation: 2, zen: 5000000 },
      { chance: 30, bless: 6, soul: 6, chaos: 2, creation: 2, zen: 10000000 },
      { chance: 20, bless: 8, soul: 8, chaos: 2, creation: 3, zen: 20000000 },
      { chance: 10, bless: 10, soul: 10, chaos: 3, creation: 5, zen: 50000000 },
    ],
    fail: 'keep',
  },
  cats: { weapon: true, shield: true, armor: true, wings: true, accessory: false },
  // bônus total (%) sobre o dano/defesa/vida base em cada nível, por categoria (índice = nível)
  bonus: {
    weapon: pct([0, 6, 12, 18, 24, 30, 36, 42, 48, 54, 65, 77, 90, 105, 122, 140]),
    shield: pct([0, 6, 12, 18, 24, 30, 36, 42, 48, 54, 65, 77, 90, 105, 122, 140]),
    armor: pct([0, 6, 12, 18, 24, 30, 36, 42, 48, 54, 65, 77, 90, 105, 122, 140]),
    accessory: pct([0, 6, 12, 18, 24, 30, 36, 42, 48, 54, 60, 66, 72, 78, 84, 90]),
  },
  // asas e capas: por nível (+1 de dano %, +1 de absorção %, +2 de defesa até +9; mais forte depois)
  wings: { def: 2, wdmg: 1, absorb: 1, defHigh: 4, wdmgHigh: 2, absorbHigh: 1 },
  messages: {
    success: 'Sucesso! {item} agora está +{plus}.',
    fail: 'Falha no aprimoramento! {item} continua +{plus}.',
    smithFail: 'Falha no aprimoramento. {item} continua +{plus}. Os materiais da tentativa foram consumidos.',
    limit: 'Este equipamento atingiu o limite de aprimoramento direto. Para continuar até +15, procure o Ferreiro Mestre.',
  },
};

let H = null;
function cfg() { return SET.get('upgrade', DEFAULTS); }
async function init(helpers) { H = helpers; await SET.load('upgrade', DEFAULTS); }
const fill = (t, v) => String(t).replace(/\{(\w+)\}/g, (_, k) => (v[k] !== undefined ? v[k] : `{${k}}`));
const nameOf = (base) => (G.ITEM_BASES[base] || {}).name || base;
const fmt = (n) => Math.round(n).toLocaleString('pt-BR');

// ---------- atributos (usado por itemStats no mundo) ----------
function catOf(base) { const b = G.ITEM_BASES[base]; return b ? SLOT_CAT[b.slot] || null : null; }
function mult(base, plus) {
  const cat = catOf(base) || 'weapon';
  const t = cfg().bonus[cat === 'wings' ? 'weapon' : cat] || cfg().bonus.weapon;
  const p = Math.max(0, Math.min(t.length - 1, plus || 0));
  return 1 + (t[p] || 0) / 100;
}
function wingBonus(plus) {
  const w = cfg().wings, p = Math.max(0, plus || 0), lo = Math.min(p, 9), hi = Math.max(0, p - 9);
  return { def: lo * w.def + hi * w.defHigh, wdmg: lo * w.wdmg + hi * w.wdmgHigh, absorb: lo * w.absorb + hi * w.absorbHigh };
}
function upgradeable(it) {
  const cat = catOf(it.base);
  return !!(cat && cfg().cats[cat]);
}

// ---------- registro ----------
async function log(q, p, it, kind, from, to, success, mats, zen, chance) {
  await q(`INSERT INTO upgrade_log (character_id, char_name, item_id, item_base, kind, from_plus, to_plus, success, chance, materials, zen)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`, [p.charId, p.name, it.id, it.base, kind, from, to, success, chance, JSON.stringify(mats), zen]);
}
const have = (p, base) => p.items.filter((i) => i.base === base && !i.equipped).reduce((a, i) => a + (Number(i.qty) || 1), 0);
// tira qty de um material das pilhas da bolsa (dentro da transação); devolve a lista para atualizar a memória depois
async function takeMat(q, p, base, qty) {
  const plan = [];
  let need = qty;
  for (const st of p.items.filter((i) => i.base === base && !i.equipped).sort((a, b) => Number(a.id) - Number(b.id))) {
    if (need <= 0) break;
    const n = Number(st.qty) || 1, t = Math.min(n, need);
    const d = t < n
      ? await q('UPDATE items SET qty = qty - $3 WHERE id = $1 AND character_id = $2 AND qty = $4 AND vault_no IS NULL RETURNING id', [st.id, p.charId, t, n])
      : await q('DELETE FROM items WHERE id = $1 AND character_id = $2 AND qty = $3 AND vault_no IS NULL RETURNING id', [st.id, p.charId, n]);
    if (!d.rows[0]) throw new Error('Os materiais mudaram. Tente de novo.');
    plan.push({ st, left: n - t });
    need -= t;
  }
  if (need > 0) throw new Error('Os materiais mudaram. Tente de novo.');
  return plan;
}
function applyTakes(p, plans) { for (const pl of plans) for (const { st, left } of pl) { if (left > 0) st.qty = left; else p.items = p.items.filter((i) => i !== st); } }
function newPlus(fail, plus) { return fail === 'minus1' ? Math.max(0, plus - 1) : fail === 'reset' ? 0 : plus; }

// ---------- upgrade direto (joia em cima do item) ----------
function checkDirect(p, jewelId, itemId) {
  const c = cfg();
  const jw = p.items.find((i) => String(i.id) === String(jewelId) && !i.equipped);
  const it = p.items.find((i) => String(i.id) === String(itemId));
  if (!c.directEnabled) return { err: 'O aprimoramento com joias está desativado no momento.' };
  if (!jw || ![BLESS, SOUL].includes(jw.base)) return { err: 'Escolha uma Jewel of Bless ou Jewel of Soul da sua bolsa.' };
  if (!it) return { err: 'Este equipamento não está com você.' };
  if (it === jw) return { err: 'Escolha um equipamento.' };
  if (!upgradeable(it)) return { err: 'Este item não pode ser aprimorado com joias.' };
  if (it.locked) return { err: 'Este item está bloqueado.' };
  const plus = it.plus || 0;
  if (plus >= 9) return { err: c.messages.limit, limit: true };
  const need = plus < 6 ? BLESS : SOUL;
  if (jw.base !== need) return { err: plus < 6 ? `De +0 a +6 use Jewel of Bless (este item está +${plus}).` : `De +6 a +9 use Jewel of Soul (este item está +${plus}).` };
  const chance = Math.max(0, Math.min(100, Number(c.direct[plus]) || 0));
  return { jw, it, plus, chance };
}
function preview(p, msg) {
  const r = checkDirect(p, msg.jewel, msg.item);
  if (r.err) return p.send({ type: 'upgPreview', ok: false, text: r.err, limit: !!r.limit });
  const next = { ...r.it, plus: r.plus + 1 };
  p.send({ type: 'upgPreview', ok: true, jewel: String(r.jw.id), item: String(r.it.id), name: nameOf(r.it.base), jewelName: nameOf(r.jw.base), from: r.plus, to: r.plus + 1, chance: r.chance,
    now: H.itemStats(r.it), next: H.itemStats(next), fail: cfg().directFail });
}
async function direct(world, p, msg) {
  const say = (ok, text, extra = {}) => p.send({ type: 'upgResult', ok, text, ...extra });
  if (p.upgrading) return say(false, 'Espere a tentativa anterior terminar.');
  const r = checkDirect(p, msg.jewel, msg.item);
  if (r.err) return say(false, r.err, { limit: !!r.limit });
  const { jw, it, plus, chance } = r;
  const success = Math.random() * 100 < chance;
  const c = cfg();
  const to = success ? plus + 1 : newPlus(c.directFail, plus);
  p.upgrading = true;
  let plans = [];
  try {
    await db.tx(async (q) => {
      plans = [await takeMat(q, p, jw.base, 1)];
      const u = await q('UPDATE items SET plus = $3 WHERE id = $1 AND character_id = $2 AND plus = $4 AND vault_no IS NULL RETURNING id', [it.id, p.charId, to, plus]);
      if (!u.rows[0]) throw new Error('O item mudou. Tente de novo.');
      await log(q, p, it, 'direct', plus, to, success, [{ item: jw.base, qty: 1 }], 0, chance);
    });
  } catch (e) {
    p.upgrading = false;
    console.error('[upgrade]', p.name, e.message);
    return say(false, /mudou/.test(e.message) ? e.message : 'Não foi possível aprimorar agora. Nada foi gasto.');
  }
  p.upgrading = false;
  applyTakes(p, plans);
  it.plus = to;
  after(world, p, it);
  const name = nameOf(it.base);
  say(true, fill(success ? c.messages.success : c.messages.fail, { item: name, plus: to }), { success, item: H.publicItem(it), from: plus, to, chance });
  if (success && to >= 7) world.system(`${p.name} aprimorou ${name} para +${to}!`);
  return undefined;
}
function after(world, p, it) {
  p.dirty = true;
  if (it.equipped) {
    p.recalc();
    if (p.map) for (const o of p.map.players.values()) if (o !== p) o.send({ type: 'pj', ...world.pinfo(p) });
  }
  p.send(p.charState());
}

// ---------- Ferreiro Mestre (+9 a +15) ----------
function atSmith(p) { return !!(p.map && cfg().smith.maps[p.map.id] && (p.map.def.npcs || []).some((n) => n.kind === 'smith')); }
function npcVisible(mapId, n) { return n.kind !== 'smith' || (cfg().smith.enabled && !!cfg().smith.maps[mapId]); }
function stepOf(plus) { const c = cfg(); const i = plus - 9; return i >= 0 && plus < c.maxLevel ? c.smith.steps[i] || null : null; }
function smithInfo(p, sel) {
  const c = cfg();
  const cands = p.items.filter((i) => upgradeable(i) && (i.plus || 0) >= 9).sort((a, b) => (b.equipped - a.equipped) || (b.plus || 0) - (a.plus || 0));
  const out = { type: 'smithInfo', enabled: c.smith.enabled, atNpc: atSmith(p), maxLevel: c.maxLevel, zen: p.zen, fail: c.smith.fail,
    items: cands.map((i) => ({ ...H.publicItem(i), max: (i.plus || 0) >= c.maxLevel })), sel: null };
  const it = cands.find((i) => String(i.id) === String(sel)) || null;
  if (it) {
    const st = stepOf(it.plus || 0);
    out.sel = { id: String(it.id), item: H.publicItem(it), from: it.plus, to: st ? it.plus + 1 : null, now: H.itemStats(it), next: st ? H.itemStats({ ...it, plus: it.plus + 1 }) : null,
      chance: st ? st.chance : 0, zen: st ? st.zen : 0,
      mats: st ? [[BLESS, st.bless], [SOUL, st.soul], [CHAOS, st.chaos], [CREATION, st.creation]].map(([b, n]) => ({ base: b, name: nameOf(b), icon: (G.ITEM_BASES[b] || {}).icon, ic: (G.ITEM_BASES[b] || {}).ic, need: n, have: have(p, b) })) : [] };
  }
  return out;
}
async function smith(world, p, msg) {
  const a = String(msg.action || 'info');
  if (a === 'info') return p.send(smithInfo(p, msg.id));
  const say = (ok, text, extra = {}) => { p.send({ type: 'smithResult', ok, text, ...extra }); p.send(smithInfo(p, msg.id)); };
  const c = cfg();
  if (a !== 'upgrade') return say(false, 'Ação inválida.');
  if (!c.smith.enabled) return say(false, 'O Ferreiro Mestre está fechado no momento.');
  if (!atSmith(p)) return say(false, 'Fale com o Ferreiro Mestre em Lorencia.');
  if (p.dead) return say(false, 'Você está derrotado.');
  if (p.upgrading) return say(false, 'Espere a tentativa anterior terminar.');
  const it = p.items.find((i) => String(i.id) === String(msg.id));
  if (!it) return say(false, 'Este equipamento não está com você.');
  if (!upgradeable(it)) return say(false, 'Este item não pode ser aprimorado.');
  if (it.locked) return say(false, 'Este item está bloqueado.');
  const plus = it.plus || 0;
  if (plus < 9) return say(false, 'O Ferreiro Mestre só aprimora equipamentos +9 ou maiores. Use Jewel of Bless e Jewel of Soul direto no item até +9.');
  const st = stepOf(plus);
  if (!st) return say(false, `Este equipamento já está no nível máximo (+${c.maxLevel}).`);
  const req = [[BLESS, st.bless], [SOUL, st.soul], [CHAOS, st.chaos], [CREATION, st.creation]].filter(([, n]) => n > 0);
  const miss = req.filter(([b, n]) => have(p, b) < n).map(([b, n]) => `${n - have(p, b)}× ${nameOf(b)}`);
  if (p.zen < st.zen) miss.push(`${fmt(st.zen - p.zen)} Zen`);
  if (miss.length) return say(false, `Faltam: ${miss.join(', ')}.`);
  const success = Math.random() * 100 < st.chance;
  const to = success ? plus + 1 : newPlus(c.smith.fail, plus);
  p.upgrading = true;
  p.zen -= st.zen;
  let plans = [];
  try {
    await db.tx(async (q) => {
      plans = [];
      for (const [b, n] of req) plans.push(await takeMat(q, p, b, n));
      const u = await q('UPDATE items SET plus = $3 WHERE id = $1 AND character_id = $2 AND plus = $4 AND vault_no IS NULL RETURNING id', [it.id, p.charId, to, plus]);
      if (!u.rows[0]) throw new Error('O item mudou. Tente de novo.');
      await q('UPDATE characters SET zen = $2 WHERE id = $1 RETURNING id', [p.charId, Math.round(p.zen)]);
      await log(q, p, it, 'smith', plus, to, success, req.map(([b, n]) => ({ item: b, qty: n })), st.zen, st.chance);
    });
  } catch (e) {
    p.zen += st.zen; p.upgrading = false;
    console.error('[upgrade] ferreiro', p.name, e.message);
    return say(false, /mudou/.test(e.message) ? e.message : 'Não foi possível aprimorar agora. Nada foi gasto.');
  }
  p.upgrading = false;
  applyTakes(p, plans);
  it.plus = to;
  after(world, p, it);
  const name = nameOf(it.base);
  say(true, fill(success ? c.messages.success : c.messages.smithFail, { item: name, plus: to }), { success, from: plus, to, chance: st.chance });
  if (success) world.system(`🔨 ${p.name} aprimorou ${name} para +${to} no Ferreiro Mestre!`);
  return undefined;
}

// ---------- administração ----------
function sanitize(i) {
  const c = cfg();
  const n = (v, a, b, label) => { const x = Number(v); if (!(x >= a && x <= b)) throw new Error(`${label}: use um número de ${a} a ${b}.`); return Math.round(x * 100) / 100; };
  const out = {
    directEnabled: i.directEnabled !== false,
    maxLevel: Math.round(n(i.maxLevel ?? c.maxLevel, 9, 15, 'Nível máximo')),
    direct: (Array.isArray(i.direct) ? i.direct : c.direct).slice(0, 9).map((v, k) => n(v, 0, 100, `Chance +${k} → +${k + 1}`)),
    directFail: FAIL.includes(i.directFail) ? i.directFail : 'keep',
    smith: {
      enabled: (i.smith || {}).enabled !== false,
      maps: Object.fromEntries(Object.keys(DEFAULTS.smith.maps).map((m) => [m, !!(((i.smith || {}).maps) || c.smith.maps)[m]])),
      steps: ((i.smith || {}).steps || c.smith.steps).slice(0, 6).map((s, k) => ({
        chance: n(s.chance, 0, 100, `Ferreiro +${k + 9}: chance`), bless: Math.round(n(s.bless, 0, 99, `Ferreiro +${k + 9}: Bless`)), soul: Math.round(n(s.soul, 0, 99, `Ferreiro +${k + 9}: Soul`)),
        chaos: Math.round(n(s.chaos, 0, 99, `Ferreiro +${k + 9}: Chaos`)), creation: Math.round(n(s.creation, 0, 99, `Ferreiro +${k + 9}: Creation`)), zen: Math.round(n(s.zen, 0, 1e12, `Ferreiro +${k + 9}: Zen`)),
      })),
      fail: FAIL.includes((i.smith || {}).fail) ? i.smith.fail : 'keep',
    },
    cats: Object.fromEntries(CATS.map((k) => [k, !!((i.cats || c.cats)[k])])),
    bonus: {},
    wings: {},
    messages: {},
  };
  if (out.direct.length !== 9) throw new Error('Upgrade direto: são 9 chances (+0 a +9).');
  if (out.smith.steps.length !== 6) throw new Error('Ferreiro: são 6 níveis (+9 a +15).');
  if (!Object.values(out.smith.maps).some(Boolean)) throw new Error('Deixe o Ferreiro em pelo menos uma cidade.');
  for (const k of Object.keys(DEFAULTS.bonus)) {
    const arr = ((i.bonus || {})[k] || c.bonus[k]).slice(0, 16).map((v, j) => Math.round(n(v, 0, 1000, `Bônus ${k} +${j}`)));
    if (arr.length !== 16) throw new Error(`Bônus ${k}: são 16 valores (+0 a +15).`);
    for (let j = 1; j < 16; j++) if (arr[j] < arr[j - 1]) throw new Error(`Bônus ${k}: o +${j} não pode dar menos que o +${j - 1}.`);
    out.bonus[k] = arr;
  }
  for (const k of Object.keys(DEFAULTS.wings)) out.wings[k] = Math.round(n((i.wings || {})[k] ?? c.wings[k], 0, 50, `Asas: ${k}`));
  for (const k of Object.keys(DEFAULTS.messages)) out.messages[k] = String((i.messages || {})[k] || c.messages[k]).trim().slice(0, 200) || DEFAULTS.messages[k];
  return out;
}
async function saveConfig(i) { const c = sanitize(i); await SET.save('upgrade', c); return c; }
async function history(name = '', limit = 60) {
  return (await db.query(`SELECT char_name, item_base, kind, from_plus, to_plus, success, chance, materials, zen, created_at FROM upgrade_log
    WHERE ($1 = '' OR lower(char_name) = lower($1)) ORDER BY id DESC LIMIT $2`, [String(name || ''), Math.min(200, limit)])).rows.map((r) => ({ ...r, item: nameOf(r.item_base) }));
}
async function stats() {
  return (await db.query(`SELECT kind, to_plus, from_plus, count(*)::int AS n, count(*) FILTER (WHERE success)::int AS ok FROM upgrade_log
    WHERE created_at > now() - interval '7 days' GROUP BY kind, from_plus, to_plus ORDER BY from_plus`)).rows;
}

module.exports = { init, cfg, mult, wingBonus, upgradeable, preview, direct, smithInfo, smith, npcVisible, saveConfig, history, stats, DEFAULTS, BLESS, SOUL, CREATION, catOf };
