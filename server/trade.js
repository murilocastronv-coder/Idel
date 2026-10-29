'use strict';
// Troca entre jogadores (estilo MU):
//  convite (30 s) → janela para os dois → cada um coloca itens (até 12) e Zen → os dois confirmam a MESMA versão da oferta
//  → o servidor valida de novo e transfere tudo numa única transação (ou nada é transferido).
// Enquanto a troca está aberta, o jogador não vende, equipa, guarda no baú, combina nem abre caixas (os itens ficam reservados).
const db = require('./db');
const G = require('./gamedata');

const INVITE_MS = 30000;
const IDLE_MS = 5 * 60000;
const MAX_SLOTS = 12;
let W = null, H = null;
let seq = 0;
const sessions = new Map();

function init(world, helpers) {
  W = world; H = helpers;
  setInterval(() => {
    const now = Date.now();
    for (const s of sessions.values()) if (now - s.touched > IDLE_MS) cancel(s, 'A troca foi cancelada por inatividade.');
  }, 15000).unref();
}

const nameOf = (base) => (G.ITEM_BASES[base] || {}).name || base;
const fmt = (n) => Math.round(n).toLocaleString('pt-BR');
const otherOf = (s, p) => (s.a === p ? s.b : s.a);
function tradeable(it) {
  const b = G.ITEM_BASES[it.base];
  if (!b) return 'Item desconhecido.';
  if (it.equipped) return 'Desequipe o item antes de oferecer.';
  if (it.locked) return 'Este item está bloqueado e não pode ser trocado.';
  if (b.slot === 'quest') return 'Itens de missão não podem ser trocados.';
  if (b.bound) return 'Este item é vinculado ao personagem.';
  return null;
}
function busy(p) {
  if (p.dead) return 'está derrotado';
  if (p.trade) return 'já está em uma troca';
  if (p.arena || (p.map && p.map.def.arena)) return 'está em um evento';
  if (p.duel) return 'está em um duelo';
  return null;
}

// ---------- convite ----------
function invite(p, targetId) {
  const o = [...W.players.values()].find((x) => x.id === String(targetId));
  const say = (t) => p.send({ type: 'log', kind: 'warn', text: t });
  if (!o || o === p) return say('Jogador não encontrado.');
  if (o.map !== p.map) return say('O jogador precisa estar no mesmo mapa.');
  let b = busy(p); if (b) return say(`Você ${b}.`);
  b = busy(o); if (b) return say(`${o.name} ${b}.`);
  if (o.tradeInvite && o.tradeInvite.until > Date.now() && o.tradeInvite.from !== p) return say(`${o.name} já tem um convite de troca aberto.`);
  if (p.lastTradeInv && Date.now() - p.lastTradeInv < 3000) return say('Espere alguns segundos para convidar de novo.');
  p.lastTradeInv = Date.now();
  const id = 'ti' + (++seq);
  o.tradeInvite = { id, from: p, until: Date.now() + INVITE_MS };
  o.send({ type: 'tradeInvite', id, from: { id: p.id, name: p.name, level: p.level, cls: p.cls, className: p.className() }, to: { name: o.name, level: o.level, cls: o.cls }, ms: INVITE_MS });
  p.send({ type: 'log', kind: 'info', text: `Solicitação de troca enviada para ${o.name}.` });
  setTimeout(() => {
    if (o.tradeInvite && o.tradeInvite.id === id) { o.tradeInvite = null; o.send({ type: 'tradeInviteEnd', id }); p.send({ type: 'log', kind: 'warn', text: `${o.name} não respondeu ao convite de troca.` }); }
  }, INVITE_MS + 200).unref();
  return undefined;
}
function answer(o, id, accept) {
  const inv = o.tradeInvite;
  if (!inv || inv.id !== String(id)) return o.send({ type: 'tradeInviteEnd', id, text: 'Este convite não vale mais.' });
  o.tradeInvite = null;
  const p = inv.from;
  if (inv.until < Date.now()) return o.send({ type: 'tradeInviteEnd', id, text: 'O convite expirou.' });
  if (!accept) { p.send({ type: 'log', kind: 'warn', text: `${o.name} recusou a troca.` }); return undefined; }
  if (!W.players.has(p.charId) || W.players.get(p.charId) !== p) return o.send({ type: 'log', kind: 'warn', text: 'O outro jogador saiu do jogo.' });
  if (p.map !== o.map) return o.send({ type: 'log', kind: 'warn', text: 'Vocês precisam estar no mesmo mapa.' });
  let b = busy(p); if (b) return o.send({ type: 'log', kind: 'warn', text: `${p.name} ${b}.` });
  b = busy(o); if (b) return o.send({ type: 'log', kind: 'warn', text: `Você ${b}.` });
  const s = { id: 't' + (++seq), a: p, b: o, offers: new Map([[p.charId, { items: new Map(), zen: 0 }], [o.charId, { items: new Map(), zen: 0 }]]),
    ver: 1, confirm: new Set(), touched: Date.now(), done: false };
  sessions.set(s.id, s);
  p.trade = s; o.trade = s;
  p.target = null; o.target = null;
  push(s, 'open');
  return undefined;
}

// ---------- estado enviado para cada lado ----------
function offerView(s, who) {
  const off = s.offers.get(who.charId);
  const items = [];
  for (const [id, qty] of off.items) {
    const it = who.items.find((i) => String(i.id) === id);
    if (!it) continue;
    items.push({ ...H.publicItem(it), qty, stackQty: Number(it.qty) || 1 });
  }
  return { name: who.name, level: who.level, cls: who.cls, className: who.className(), items, zen: off.zen, confirmed: s.confirm.has(who.charId), online: W.players.get(who.charId) === who };
}
function push(s, phase, text) {
  for (const me of [s.a, s.b]) {
    const other = otherOf(s, me);
    me.send({ type: 'trade', phase, id: s.id, ver: s.ver, me: offerView(s, me), them: offerView(s, other), myZen: me.zen, text: text || null, max: MAX_SLOTS });
  }
}
function changed(s, text) {
  s.ver++; s.confirm.clear(); s.touched = Date.now();
  push(s, 'update', text);
}

// ---------- ações ----------
function act(world, p, msg) {
  const a = String(msg.action || '');
  if (a === 'invite') return invite(p, msg.to);
  if (a === 'answer') return answer(p, msg.id, !!msg.accept);
  const s = p.trade;
  const say = (t) => p.send({ type: 'tradeMsg', text: t });
  if (!s || s.done) return p.send({ type: 'trade', phase: 'closed', text: 'Você não está em uma troca.' });
  const off = s.offers.get(p.charId);
  if (a === 'cancel') return cancel(s, `${p.name} cancelou a troca.`);
  if (a === 'add') {
    const it = p.items.find((i) => String(i.id) === String(msg.item));
    if (!it) return say('Este item não está na sua bolsa.');
    const why = tradeable(it); if (why) return say(why);
    const have = Number(it.qty) || 1;
    const qty = G.ITEM_BASES[it.base].stack ? Math.floor(Number(msg.qty) || have) : 1;
    if (!(qty >= 1 && qty <= have)) return say(`Quantidade inválida (você tem ${fmt(have)}).`);
    if (!off.items.has(String(it.id)) && off.items.size >= MAX_SLOTS) return say(`No máximo ${MAX_SLOTS} itens por troca.`);
    off.items.set(String(it.id), qty);
    return changed(s, `${p.name} colocou ${qty > 1 ? qty + '× ' : ''}${nameOf(it.base)}${it.plus ? ' +' + it.plus : ''} na oferta.`);
  }
  if (a === 'remove') {
    if (!off.items.delete(String(msg.item))) return say('Este item não está na sua oferta.');
    return changed(s, `${p.name} tirou um item da oferta.`);
  }
  if (a === 'zen') {
    const z = Math.floor(Number(msg.amount));
    if (!Number.isFinite(z) || z < 0) return say('Valor de Zen inválido.');
    if (z > p.zen) return say(`Você só tem ${fmt(p.zen)} Zen.`);
    if (z === off.zen) return undefined;
    off.zen = z;
    return changed(s, `${p.name} ofereceu ${fmt(z)} Zen.`);
  }
  if (a === 'confirm') {
    if (Number(msg.ver) !== s.ver) return say('A oferta mudou. Confira de novo antes de confirmar.');
    s.confirm.add(p.charId); s.touched = Date.now();
    if (s.confirm.size < 2) { push(s, 'update', `${p.name} confirmou a oferta atual.`); return undefined; }
    return finalize(s);
  }
  if (a === 'unconfirm') { s.confirm.delete(p.charId); push(s, 'update'); return undefined; }
  return say('Ação inválida.');
}

function cancel(s, text) {
  if (s.done) return;
  s.done = true;
  sessions.delete(s.id);
  for (const me of [s.a, s.b]) { if (me.trade === s) me.trade = null; me.send({ type: 'trade', phase: 'closed', text }); }
  db.query('INSERT INTO trade_log (char_a, name_a, char_b, name_b, status, detail) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
    [s.a.charId, s.a.name, s.b.charId, s.b.name, 'cancelled', JSON.stringify({ text })]).catch(() => {});
}

// ---------- conclusão (tudo ou nada) ----------
async function finalize(s) {
  if (s.done || s.finishing) return;
  s.finishing = true;
  const sides = [s.a, s.b];
  const fail = (text) => { s.finishing = false; s.confirm.clear(); s.ver++; push(s, 'update', text); };
  // revalida com os dados reais do servidor
  for (const me of sides) if (W.players.get(me.charId) !== me || me.dead) { s.finishing = false; return cancel(s, 'A troca foi cancelada: um dos jogadores saiu ou foi derrotado.'); }
  const plan = new Map();
  for (const me of sides) {
    const off = s.offers.get(me.charId);
    if (off.zen > me.zen) return fail(`${me.name} não tem mais esse Zen. Confirmem de novo.`);
    const list = [];
    for (const [id, qty] of off.items) {
      const it = me.items.find((i) => String(i.id) === id);
      if (!it || tradeable(it)) return fail('Um item da oferta mudou. Confiram e confirmem de novo.');
      const have = Number(it.qty) || 1;
      if (qty > have) return fail('A quantidade de um item mudou. Confiram e confirmem de novo.');
      list.push({ it, qty, whole: qty === have });
    }
    plan.set(me.charId, list);
  }
  // espaço na bolsa de quem recebe (cada item recebido ocupa um lugar; os itens entregues inteiros liberam lugar)
  for (const me of sides) {
    const other = otherOf(s, me);
    const recv = plan.get(other.charId).length;
    const freed = plan.get(me.charId).filter((x) => x.whole).length;
    if (H.bagUsed(me) - freed + recv > G.INVENTORY_SIZE) return fail(`A bolsa de ${me.name} não tem espaço para receber os itens.`);
  }
  const za = s.offers.get(s.a.charId).zen, zb = s.offers.get(s.b.charId).zen;
  const newZen = new Map([[s.a.charId, s.a.zen - za + zb], [s.b.charId, s.b.zen - zb + za]]);
  const created = new Map([[s.a.charId, []], [s.b.charId, []]]);
  try {
    await db.tx(async (q) => {
      for (const me of sides) {
        const other = otherOf(s, me);
        for (const x of plan.get(me.charId)) {
          if (x.whole) {
            const u = await q(`UPDATE items SET character_id = $3, equipped = FALSE, eq_slot = NULL WHERE id = $1 AND character_id = $2 AND qty = $4 AND equipped = FALSE AND vault_no IS NULL
              RETURNING id, base, rarity, plus, equipped, qty, eq_slot, locked`, [x.it.id, me.charId, other.charId, Number(x.it.qty) || 1]);
            if (!u.rows[0]) throw new Error('item mudou');
            created.get(other.charId).push(u.rows[0]);
          } else {
            const u = await q('UPDATE items SET qty = qty - $3 WHERE id = $1 AND character_id = $2 AND qty = $4 AND vault_no IS NULL RETURNING id', [x.it.id, me.charId, x.qty, Number(x.it.qty)]);
            if (!u.rows[0]) throw new Error('item mudou');
            const n = await q('INSERT INTO items (character_id, base, rarity, plus, qty) VALUES ($1,$2,$3,$4,$5) RETURNING id, base, rarity, plus, equipped, qty, eq_slot, locked',
              [other.charId, x.it.base, x.it.rarity, x.it.plus || 0, x.qty]);
            created.get(other.charId).push(n.rows[0]);
          }
        }
      }
      for (const me of sides) {
        const z = Math.round(newZen.get(me.charId));
        if (z < 0) throw new Error('zen negativo');
        await q('UPDATE characters SET zen = $2 WHERE id = $1 RETURNING id', [me.charId, z]);
      }
      await q('INSERT INTO trade_log (char_a, name_a, char_b, name_b, status, detail) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
        [s.a.charId, s.a.name, s.b.charId, s.b.name, 'done', JSON.stringify({
          a: { zen: za, items: plan.get(s.a.charId).map((x) => ({ id: String(x.it.id), base: x.it.base, rarity: x.it.rarity, plus: x.it.plus || 0, qty: x.qty })) },
          b: { zen: zb, items: plan.get(s.b.charId).map((x) => ({ id: String(x.it.id), base: x.it.base, rarity: x.it.rarity, plus: x.it.plus || 0, qty: x.qty })) } })]);
    });
  } catch (e) {
    console.error('[troca]', s.a.name, s.b.name, e.message);
    return fail('A troca não foi concluída (nada foi transferido). Confiram e confirmem de novo.');
  }
  // só depois de gravado: atualiza a memória dos dois
  for (const me of sides) {
    for (const x of plan.get(me.charId)) {
      if (x.whole) me.items = me.items.filter((i) => i !== x.it);
      else x.it.qty = (Number(x.it.qty) || 1) - x.qty;
    }
  }
  for (const me of sides) {
    for (const row of created.get(me.charId)) me.items.push(row);
    me.zen = newZen.get(me.charId); me.dirty = true;
  }
  s.done = true;
  sessions.delete(s.id);
  for (const me of sides) {
    const other = otherOf(s, me);
    if (me.trade === s) me.trade = null;
    const got = created.get(me.charId).map((r) => `${r.qty > 1 ? r.qty + '× ' : ''}${nameOf(r.base)}${r.plus ? ' +' + r.plus : ''}`);
    const zIn = s.offers.get(other.charId).zen;
    me.send({ type: 'trade', phase: 'done', text: 'Troca concluída com sucesso!', got, zenIn: zIn });
    me.send({ type: 'log', kind: 'quest', text: `Troca com ${other.name} concluída${got.length || zIn ? ': recebeu ' + [...got, ...(zIn ? [fmt(zIn) + ' Zen'] : [])].join(', ') : ''}.` });
    me.send(me.charState());
  }
  return undefined;
}

// chamado quando alguém sai, morre ou muda de mapa
function drop(p, why) {
  if (p.tradeInvite) p.tradeInvite = null;
  const s = p.trade;
  if (s && !s.done) cancel(s, why || `A troca foi cancelada: ${p.name} saiu.`);
}
// ações bloqueadas durante a troca (os itens oferecidos ficam reservados)
const BLOCKED = new Set(['sell', 'sellMany', 'equip', 'unequip', 'autoequip', 'vault', 'chaos', 'openBox', 'upgDirect', 'smith', 'cqAct', 'buy', 'teleport', 'room', 'arena', 'duel', 'claim']);
function blocks(p, type) { return !!(p.trade && BLOCKED.has(type)); }

module.exports = { init, act, drop, blocks };
