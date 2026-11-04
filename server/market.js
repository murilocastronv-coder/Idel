'use strict';
// Mercado entre jogadores (em Zen):
//  anunciar → o item sai da bolsa e fica guardado no anúncio (48 h)
//  comprar → o comprador paga o preço; o vendedor recebe o preço menos 10% de taxa (o Zen da taxa sai do jogo)
//  o Zen da venda e os itens cancelados/expirados ficam para o vendedor coletar (funciona mesmo com ele offline).
const db = require('./db');
const G = require('./gamedata');
const REAL = require('./market-real');
const WALLET = require('./market-wallet');

const FEE = 0.10;
const MAX_ACTIVE = 10;
const MAX_PRICE = 2000000000;
const DURATION_H = 48;
const PAGE = 30;
let W = null, H = null;

function init(world, helpers) {
  W = world; H = helpers;
  REAL.init(world, helpers);
  WALLET.init(world, helpers);
  // anúncios vencidos voltam para o vendedor coletar
  setInterval(() => {
    db.query("UPDATE market_listings SET status = 'expired', closed_at = now() WHERE status = 'active' AND expires_at < now()").catch((e) => console.error('[mercado] expirar', e.message));
  }, 60000).unref();
}

const nameOf = (base) => (G.ITEM_BASES[base] || {}).name || base;
const fmt = (n) => Math.round(n).toLocaleString('pt-BR');
const feeOf = (price, cur) => (cur === 'brl' || cur === 'usd' ? REAL.feeOf(price) : Math.floor(price * FEE));
const moneyOf = (v, cur) => (cur === 'brl' ? REAL.brl(v) : cur === 'usd' ? WALLET.usd(v) : `${fmt(v)} Zen`);
function sellable(it) {
  const b = G.ITEM_BASES[it.base];
  if (!b) return 'Item desconhecido.';
  if (it.equipped) return 'Desequipe o item antes de anunciar.';
  if (it.locked) return 'Este item está bloqueado.';
  if (b.slot === 'quest') return 'Itens de missão não podem ser vendidos no mercado.';
  if (b.bound) return 'Este item é vinculado ao personagem.';
  return null;
}
function view(r) {
  const it = H.publicItem({ id: 'L' + r.id, base: r.base, rarity: r.rarity, plus: r.plus, qty: r.qty, excellent_options: r.excellent_options, equipped: false });
  return { id: String(r.id), item: it, price: Number(r.price), fee: Number(r.fee) || feeOf(Number(r.price), r.currency), cur: r.currency || 'zen', mode: r.pay_mode || (r.currency === 'zen' ? 'zen' : 'connect'), seller: r.seller_name, sellerId: String(r.seller_char),
    status: r.status, buyer: r.buyer_name || null, collected: !!r.collected, expires: r.expires_at ? new Date(r.expires_at).getTime() : 0, closed: r.closed_at ? new Date(r.closed_at).getTime() : 0 };
}

async function browse(p, msg) {
  const q = String(msg.q || '').trim().toLowerCase().slice(0, 40);
  const cat = String(msg.cat || '');
  const sort = msg.sort === 'new' ? 'id DESC' : msg.sort === 'desc' ? 'price DESC, id' : 'price ASC, id';
  const page = Math.max(0, Math.min(200, Math.floor(Number(msg.page) || 0)));
  let bases = null;
  if (q || cat) {
    bases = Object.entries(G.ITEM_BASES).filter(([id, b]) => {
      if (q && !String(b.name || id).toLowerCase().includes(q)) return false;
      if (!cat) return true;
      const c = b.cat || b.slot;
      if (cat === 'weapon') return b.slot === 'weapon';
      if (cat === 'armor') return ['helm', 'armor', 'pants', 'gloves', 'boots', 'shield'].includes(b.slot);
      if (cat === 'jewelry') return ['ring', 'pendant', 'ring1', 'ring2'].includes(b.slot) || c === 'jewelry';
      if (cat === 'wings') return b.slot === 'wings';
      if (cat === 'material') return b.slot === 'material' || c === 'material' || c === 'jewel';
      return !['weapon', 'helm', 'armor', 'pants', 'gloves', 'boots', 'shield', 'ring', 'pendant', 'wings', 'material'].includes(b.slot);
    }).map(([id]) => id);
    if (!bases.length) return p.send({ type: 'market', view: 'browse', cur: ['brl', 'usd'].includes(msg.cur) ? msg.cur : 'zen', rows: [], page, more: false, fee: FEE, real: REAL.enabled() });
  }
  const args = [PAGE + 1, page * PAGE];
  const cur = ['brl', 'usd'].includes(msg.cur) ? msg.cur : 'zen';
  args.push(cur);
  let where = `status = 'active' AND expires_at > now() AND currency = $${args.length}`;
  if (bases) { args.push(bases.join(',')); where += ` AND base = ANY(string_to_array($${args.length}, ','))`; }
  if (msg.rarity && /^[a-z]+$/.test(String(msg.rarity))) { args.push(String(msg.rarity)); where += ` AND rarity = $${args.length}`; }
  const { rows } = await db.query(`SELECT * FROM market_listings WHERE ${where} ORDER BY ${sort} LIMIT $1 OFFSET $2`, args);
  const out = rows.slice(0, PAGE).map(view);
  if (cur !== 'zen') {
    // reputação do vendedor (vendas confirmadas, reclamações perdidas, tempo de conta) para o comprador decidir com segurança
    const reps = {};
    for (const r of rows.slice(0, PAGE)) if (r.seller_account && !reps[r.seller_account]) reps[r.seller_account] = await WALLET.reputation(r.seller_account).catch(() => null);
    rows.slice(0, PAGE).forEach((r, i) => { if (reps[r.seller_account]) out[i].rep = reps[r.seller_account]; });
  }
  p.send({ type: 'market', view: 'browse', cur, rows: out, page, more: rows.length > PAGE, fee: FEE, myZen: p.zen, real: REAL.enabled() });
}

async function mine(p) {
  const { rows } = await db.query(`SELECT * FROM market_listings WHERE seller_char = $1 AND (status = 'active' OR NOT collected OR closed_at > now() - interval '3 days')
    ORDER BY (status = 'active') DESC, (NOT collected AND status <> 'active') DESC, id DESC LIMIT 60`, [p.charId]);
  const buying = (await db.query("SELECT * FROM market_listings WHERE reserved_char = $1 AND status = 'reserved' AND pay_mode = 'pix' ORDER BY id DESC LIMIT 10", [p.charId])).rows
    .map((r) => ({ ...view(r), pixKey: r.pix_key, paid: !!r.buyer_paid_at, until: r.reserved_until ? new Date(r.reserved_until).getTime() : 0 }));
  const disp = buying.length ? (await db.query("SELECT listing_id FROM market_disputes WHERE status = 'open' AND listing_id = ANY(string_to_array($1, ',')::bigint[])", [buying.map((b) => b.id).join(',')])).rows.map((r) => String(r.listing_id)) : [];
  for (const b of buying) b.dispute = disp.includes(b.id);
  const out = rows.map((r) => ({ ...view(r), buyer: r.status === 'reserved' ? null : r.buyer_name, paid: !!r.buyer_paid_at }));
  for (const r of rows) if (r.status === 'reserved' && r.reserved_char) out.find((x) => x.id === String(r.id)).reservedBy = (await db.query('SELECT name FROM characters WHERE id = $1', [r.reserved_char])).rows[0]?.name || '?';
  p.send({ type: 'market', view: 'mine', rows: out, buying, fee: FEE, max: MAX_ACTIVE, hours: DURATION_H, myZen: p.zen, real: REAL.enabled() });
  WALLET.send(p).catch(() => {});
}

async function list(world, p, msg) {
  const say = (t) => p.send({ type: 'marketMsg', ok: false, text: t });
  const it = p.items.find((i) => String(i.id) === String(msg.item));
  if (!it) return say('Este item não está na sua bolsa.');
  const why = sellable(it); if (why) return say(why);
  const cur = ['brl', 'usd'].includes(msg.cur) ? msg.cur : 'zen';
  const price = Math.floor(Number(msg.price));
  let seller = null, mode = 'zen', pixKey = null;
  if (WALLET.isBlocked(p)) return say('Sua conta está bloqueada no mercado. Pague a comissão pendente (Minhas vendas) para voltar a vender.');
  if (cur === 'brl') {
    if (!Number.isFinite(price) || price < REAL.MIN_CENTS) return say(`O preço mínimo em reais é ${REAL.brl(REAL.MIN_CENTS)}.`);
    if (price > REAL.MAX_CENTS) return say(`O preço máximo em reais é ${REAL.brl(REAL.MAX_CENTS)}.`);
    const srow = REAL.enabled() ? await REAL.sellerRow(p.accountId) : null;
    if (srow && REAL.ready(srow)) { seller = srow; mode = 'connect'; }
    else {
      const w = await WALLET.wallet(p.accountId);
      if (!w.pix_key) return say('Para vender em reais, conecte sua conta Stripe ou cadastre sua chave Pix (aba Vender → R$).');
      const no = await WALLET.canListPix(p.accountId, price);
      if (no) return say(no);
      mode = 'pix'; pixKey = w.pix_key;
    }
  } else if (cur === 'usd') {
    if (!REAL.enabled()) return say('Vendas em dólar ainda não estão ligadas no servidor.');
    if (!Number.isFinite(price) || price < WALLET.USD_MIN) return say(`O preço mínimo em dólar é ${WALLET.usd(WALLET.USD_MIN)}.`);
    if (price > WALLET.USD_MAX) return say(`O preço máximo em dólar é ${WALLET.usd(WALLET.USD_MAX)}.`);
    mode = 'platform';
  } else {
    if (!Number.isFinite(price) || price < 1) return say('Coloque um preço em Zen.');
    if (price > MAX_PRICE) return say(`O preço máximo é ${fmt(MAX_PRICE)} Zen.`);
  }
  const have = Number(it.qty) || 1;
  const qty = G.ITEM_BASES[it.base].stack ? Math.floor(Number(msg.qty) || have) : 1;
  if (!(qty >= 1 && qty <= have)) return say(`Quantidade inválida (você tem ${fmt(have)}).`);
  const active = (await db.query("SELECT count(*)::int AS n FROM market_listings WHERE seller_char = $1 AND status IN ('active', 'reserved')", [p.charId])).rows[0].n;
  if (active >= MAX_ACTIVE) return say(`No máximo ${MAX_ACTIVE} anúncios ativos ao mesmo tempo.`);
  const whole = qty === have;
  let row;
  try {
    row = await db.tx(async (q) => {
      const u = whole
        ? await q('DELETE FROM items WHERE id = $1 AND character_id = $2 AND qty = $3 AND equipped = FALSE AND locked = FALSE AND vault_no IS NULL RETURNING id', [it.id, p.charId, have])
        : await q('UPDATE items SET qty = qty - $3 WHERE id = $1 AND character_id = $2 AND qty = $4 AND vault_no IS NULL RETURNING id', [it.id, p.charId, qty, have]);
      if (!u.rows[0]) throw new Error('item mudou');
      const r = await q(`INSERT INTO market_listings (seller_char, seller_name, base, rarity, plus, qty, excellent_options, price, fee, expires_at, currency, seller_account, stripe_account, pay_mode, pix_key)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, now() + ($10 || ' hours')::interval, $11, $12, $13, $14, $15) RETURNING *`,
        [p.charId, p.name, it.base, it.rarity || 'common', it.plus || 0, qty, JSON.stringify(it.excellent_options || []), price, feeOf(price, cur), String(DURATION_H),
          cur, p.accountId, seller ? seller.stripe_account : null, mode, pixKey]);
      return r.rows[0];
    });
  } catch (e) {
    console.error('[mercado] anunciar', p.name, e.message);
    return say('Não foi possível anunciar (o item mudou). Tente de novo.');
  }
  if (whole) p.items = p.items.filter((i) => i !== it); else it.qty = have - qty;
  p.dirty = true;
  p.send(p.charState());
  const how = mode === 'connect' ? ' direto na sua conta Stripe' : mode === 'pix' ? ' (o comprador paga o seu Pix e a comissão de 10% fica para pagar depois)' : mode === 'platform' ? ' no seu saldo em dólar (o administrador faz o pagamento)' : '';
  p.send({ type: 'marketMsg', ok: true, text: `${qty > 1 ? qty + '× ' : ''}${nameOf(it.base)}${it.plus ? ' +' + it.plus : ''} anunciado por ${moneyOf(price, cur)}. Você recebe ${moneyOf(mode === 'pix' ? price : price - feeOf(price, cur), cur)}${how} quando vender.` });
  return mine(p);
}

async function buy(world, p, msg) {
  const say = (t) => p.send({ type: 'marketMsg', ok: false, text: t });
  const id = Math.floor(Number(msg.id));
  if (!Number.isFinite(id)) return say('Anúncio inválido.');
  const r = (await db.query('SELECT * FROM market_listings WHERE id = $1', [id])).rows[0];
  if (!r || r.status !== 'active' || new Date(r.expires_at).getTime() < Date.now()) return say('Este anúncio não está mais à venda.');
  if (WALLET.isBlocked(p)) return say('Sua conta está bloqueada no mercado. Pague a comissão pendente (Minhas vendas) para voltar a comprar.');
  if (r.currency !== 'zen') {
    if (WALLET.isBlocked(p)) return say('Sua conta está bloqueada no mercado. Pague a comissão pendente para voltar a comprar.');
    if (String(r.seller_account) === String(p.accountId)) return say('Você não pode comprar um item da sua própria conta.');
    if (Number(msg.price) !== Number(r.price)) return say('O preço mudou. Confira de novo.');
    const mode = r.pay_mode || 'connect';
    if (mode === 'platform') return WALLET.buyUsd(p, r);
    if (mode === 'pix') return WALLET.buyPix(p, r);
    return REAL.act(p, { ...msg, action: 'buyReal' });
  }
  if (String(r.seller_char) === String(p.charId)) return say('Você não pode comprar o seu próprio anúncio. Use "Minhas vendas" para cancelar.');
  const price = Number(r.price);
  if (Number(msg.price) !== price) return say('O preço mudou. Confira de novo.');
  if (p.zen < price) return say(`Você precisa de ${fmt(price)} Zen (tem ${fmt(p.zen)}).`);
  if (H.bagUsed(p) >= G.INVENTORY_SIZE) return say('Sua bolsa está cheia.');
  const newZen = p.zen - price;
  let created;
  try {
    created = await db.tx(async (q) => {
      const u = await q(`UPDATE market_listings SET status = 'sold', buyer_char = $2, buyer_name = $3, closed_at = now()
        WHERE id = $1 AND status = 'active' AND currency = 'zen' AND expires_at > now() RETURNING id`, [id, p.charId, p.name]);
      if (!u.rows[0]) throw new Error('vendido');
      const z = await q('UPDATE characters SET zen = $2 WHERE id = $1 AND zen >= $3 RETURNING id', [p.charId, newZen, price]);
      if (!z.rows[0]) throw new Error('zen');
      const n = await q(`INSERT INTO items (character_id, base, rarity, plus, qty, excellent_options) VALUES ($1,$2,$3,$4,$5,$6)
        RETURNING id, base, rarity, plus, equipped, qty, eq_slot, locked, excellent_options`, [p.charId, r.base, r.rarity, r.plus, r.qty, JSON.stringify(r.excellent_options || [])]);
      return n.rows[0];
    });
  } catch (e) {
    return say(e.message === 'vendido' ? 'Outro jogador comprou este item primeiro.' : 'A compra não foi concluída (nada foi cobrado). Tente de novo.');
  }
  p.zen = newZen; p.items.push(created); p.dirty = true;
  p.send(p.charState());
  p.send({ type: 'marketMsg', ok: true, bought: true, text: `Você comprou ${r.qty > 1 ? r.qty + '× ' : ''}${nameOf(r.base)}${r.plus ? ' +' + r.plus : ''} de ${r.seller_name} por ${fmt(price)} Zen.` });
  // avisa o vendedor se estiver online
  const seller = W.players.get(String(r.seller_char)) || [...W.players.values()].find((x) => String(x.charId) === String(r.seller_char));
  if (seller) seller.send({ type: 'log', kind: 'quest', text: `Mercado: ${p.name} comprou seu ${nameOf(r.base)}${r.plus ? ' +' + r.plus : ''}. Colete ${fmt(price - Number(r.fee))} Zen em Mercado → Minhas vendas.` });
  return browse(p, msg.back || {});
}

async function cancel(world, p, msg) {
  const id = Math.floor(Number(msg.id));
  const u = await db.query("UPDATE market_listings SET status = 'cancelled', closed_at = now() WHERE id = $1 AND seller_char = $2 AND status = 'active' RETURNING id", [id, p.charId]);
  if (!u.rows[0]) {
    const st = (await db.query('SELECT status FROM market_listings WHERE id = $1 AND seller_char = $2', [id, p.charId])).rows[0];
    p.send({ type: 'marketMsg', ok: false, text: st && st.status === 'reserved' ? 'Um comprador está pagando este item agora; não dá para cancelar.' : 'Este anúncio não está mais ativo.' });
    return mine(p);
  }
  else p.send({ type: 'marketMsg', ok: true, text: 'Anúncio cancelado. Colete o item em "Minhas vendas".' });
  return collect(world, p, { id }, true);
}

// recebe o Zen das vendas e os itens que voltaram (cancelados/expirados)
async function collect(world, p, msg, quiet) {
  const say = (t, ok) => p.send({ type: 'marketMsg', ok: !!ok, text: t });
  const one = msg && msg.id ? Math.floor(Number(msg.id)) : null;
  const { rows } = await db.query(`SELECT * FROM market_listings WHERE seller_char = $1 AND status IN ('sold', 'cancelled', 'expired') AND NOT collected ${one ? 'AND id = $2' : ''} ORDER BY id`,
    one ? [p.charId, one] : [p.charId]);
  if (!rows.length) { if (!quiet) say('Não há nada para coletar.'); return mine(p); }
  let zen = 0; const got = []; let full = false;
  for (const r of rows) {
    if (r.status === 'sold' && r.currency !== 'zen') continue; // dinheiro real não passa pelo Zen
    if (r.status === 'sold') {
      const gain = Number(r.price) - Number(r.fee);
      try {
        await db.tx(async (q) => {
          const u = await q('UPDATE market_listings SET collected = TRUE WHERE id = $1 AND NOT collected RETURNING id', [r.id]);
          if (!u.rows[0]) throw new Error('coletado');
          await q('UPDATE characters SET zen = $2 WHERE id = $1', [p.charId, p.zen + gain]);
        });
      } catch (_) { continue; }
      p.zen += gain; zen += gain;
    } else {
      if (H.bagUsed(p) >= G.INVENTORY_SIZE) { full = true; continue; }
      let n;
      try {
        n = await db.tx(async (q) => {
          const u = await q('UPDATE market_listings SET collected = TRUE WHERE id = $1 AND NOT collected RETURNING id', [r.id]);
          if (!u.rows[0]) throw new Error('coletado');
          return (await q(`INSERT INTO items (character_id, base, rarity, plus, qty, excellent_options) VALUES ($1,$2,$3,$4,$5,$6)
            RETURNING id, base, rarity, plus, equipped, qty, eq_slot, locked, excellent_options`, [p.charId, r.base, r.rarity, r.plus, r.qty, JSON.stringify(r.excellent_options || [])])).rows[0];
        });
      } catch (_) { continue; }
      p.items.push(n); got.push(`${r.qty > 1 ? r.qty + '× ' : ''}${nameOf(r.base)}`);
    }
  }
  p.dirty = true;
  p.send(p.charState());
  const parts = [...(zen ? [`${fmt(zen)} Zen`] : []), ...got];
  if (parts.length) say(`Coletado: ${parts.join(', ')}.${full ? ' Alguns itens ficaram esperando: libere espaço na bolsa.' : ''}`, true);
  else if (full) say('Sua bolsa está cheia: libere espaço para coletar os itens.');
  return mine(p);
}

function act(world, p, msg) {
  if (p.trade) return p.send({ type: 'marketMsg', ok: false, text: 'Termine a troca antes de usar o mercado.' });
  const a = String(msg.action || '');
  if (a === 'buyReal') { msg = { ...msg, action: 'buy' }; return buy(world, p, msg); }
  const real = REAL.act(p, msg); if (real) return real;
  if (a === 'wallet') return WALLET.send(p);
  if (a === 'setInfo') return WALLET.setInfo(p, msg);
  if (a === 'payNow') return WALLET.payNow(p);
  if (a === 'pixPaid' || a === 'pixCancel' || a === 'pixConfirm' || a === 'pixDispute') return WALLET.pixAction(p, msg);
  if (a === 'browse') return browse(p, msg);
  if (a === 'mine') return mine(p);
  if (a === 'list') return list(world, p, msg);
  if (a === 'buy') return buy(world, p, msg);
  if (a === 'cancel') return cancel(world, p, msg);
  if (a === 'collect') return collect(world, p, msg);
  return p.send({ type: 'marketMsg', ok: false, text: 'Ação inválida.' });
}

// painel do admin: números do mercado
async function stats() {
  const { rows } = await db.query(`SELECT count(*) FILTER (WHERE status = 'active')::int AS active, count(*) FILTER (WHERE status = 'sold')::int AS sold,
    COALESCE(sum(fee) FILTER (WHERE status = 'sold'), 0)::bigint AS fees, COALESCE(sum(price) FILTER (WHERE status = 'sold'), 0)::bigint AS volume FROM market_listings`);
  return rows[0];
}

module.exports = { init, act, stats, FEE, mineFor: (p) => mine(p), isBlocked: (p) => WALLET.isBlocked(p) };
