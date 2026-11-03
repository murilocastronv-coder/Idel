'use strict';
// Mercado com dinheiro real — carteira de cada conta:
//  • USD: o comprador paga no Stripe do jogo; o jogo guarda 90% como saldo do vendedor e o administrador paga (painel ADM).
//  • BRL sem Stripe conectado (Pix): o comprador paga o Pix do vendedor, o vendedor confirma e o item é entregue;
//    a comissão de 10% acumula. Ao chegar em R$ 5 o vendedor recebe um link de pagamento (Stripe do jogo);
//    se não pagar no prazo, a conta fica bloqueada no mercado e nas trocas até pagar.
const db = require('./db');
const G = require('./gamedata');
const R = require('./market-real');

const LIMIT_BRL = 500;                                              // R$ 5,00
const GRACE_H = Math.max(1, Number(process.env.MARKET_COMMISSION_GRACE_H) || 48);
const USD_MIN = 100, USD_MAX = 100000;                              // US$ 1,00 a US$ 1.000,00
const PIX_HOLD_H = 24;
const blocked = new Set();
let W = null, H = null;

const usd = (c) => 'US$ ' + (Number(c) / 100).toFixed(2);
const nameOf = (base) => (G.ITEM_BASES[base] || {}).name || base;
const online = (charId) => W && [...W.players.values()].find((x) => String(x.charId) === String(charId));
const onlineAcc = (acc) => W ? [...W.players.values()].filter((x) => String(x.accountId) === String(acc)) : [];
const feeOf = (c) => Math.max(1, Math.round(c * R.FEE));

async function init(world, helpers) {
  W = world; H = helpers;
  try { for (const r of (await db.query('SELECT account_id FROM market_wallets WHERE blocked')).rows) blocked.add(String(r.account_id)); } catch (e) { console.error('[carteira] bloqueios', e.message); }
  setInterval(() => { sweep().catch((e) => console.error('[carteira] prazo', e.message)); }, 60000).unref();
}
const isBlocked = (p) => !!(p && blocked.has(String(p.accountId)));

async function wallet(acc, q = db.query.bind(db)) {
  await q('INSERT INTO market_wallets (account_id) VALUES ($1) ON CONFLICT (account_id) DO NOTHING', [acc]);
  return (await q('SELECT * FROM market_wallets WHERE account_id = $1', [acc])).rows[0];
}
function walletView(w) {
  return { dueBrl: Number(w.due_brl), limit: LIMIT_BRL, usdOwed: Number(w.usd_owed), pixKey: w.pix_key || '', payoutInfo: w.payout_info || '', blocked: !!w.blocked,
    blockNote: w.block_note || null, payUrl: w.pay_url && w.pay_expires && new Date(w.pay_expires) > new Date() ? w.pay_url : null,
    deadline: w.due_since ? new Date(w.due_since).getTime() + GRACE_H * 3600000 : 0, graceH: GRACE_H, usdMin: USD_MIN, usdMax: USD_MAX };
}
async function send(p) { p.send({ type: 'marketWallet', ...walletView(await wallet(p.accountId)) }); }
async function setBlocked(acc, on, note) {
  await db.query('UPDATE market_wallets SET blocked = $2, block_note = $3, updated_at = now() WHERE account_id = $1', [acc, !!on, on ? note || null : null]);
  if (on) blocked.add(String(acc)); else blocked.delete(String(acc));
  await db.query('INSERT INTO market_ledger (account_id, kind, note) VALUES ($1,$2,$3)', [acc, on ? 'block' : 'unblock', note || null]);
  for (const p of onlineAcc(acc)) { p.send({ type: 'log', kind: on ? 'warn' : 'quest', text: on ? `Mercado: sua conta foi BLOQUEADA no mercado e nas trocas${note ? ' (' + note + ')' : ''}. Pague a comissão pendente para liberar.` : 'Mercado: sua conta foi liberada.' }); send(p).catch(() => {}); }
}

// link de pagamento da comissão (Stripe do jogo), renovado quando vence
async function payLink(acc) {
  const w = await wallet(acc);
  const due = Number(w.due_brl);
  if (due < LIMIT_BRL || !R.KEY()) return w;
  if (w.pay_url && Number(w.pay_amount) === due && w.pay_expires && new Date(w.pay_expires) > new Date(Date.now() + 10 * 60000)) return w;
  const acct = (await db.query('SELECT username, email FROM accounts WHERE id = $1', [acc])).rows[0] || {};
  const f = { mode: 'payment', locale: 'pt-BR', success_url: `${R.BASE()}/app?mercado=comissao-paga`, cancel_url: `${R.BASE()}/app`, client_reference_id: String(acc),
    expires_at: String(Math.floor(Date.now() / 1000) + 23 * 3600),
    'line_items[0][quantity]': '1', 'line_items[0][price_data][currency]': 'brl', 'line_items[0][price_data][unit_amount]': String(due),
    'line_items[0][price_data][product_data][name]': 'Comissão do Mercado — MU Idle Legends', 'line_items[0][price_data][product_data][description]': `Comissão de 10% das vendas por Pix · conta ${acct.username || acc}` };
  if (acct.email) f.customer_email = acct.email;
  for (const pre of ['metadata', 'payment_intent_data[metadata]']) { f[`${pre}[game]`] = 'muidle-market'; f[`${pre}[kind]`] = 'commission'; f[`${pre}[acc]`] = String(acc); f[`${pre}[amt]`] = String(due); }
  try {
    const s = await R.stripe('POST', '/v1/checkout/sessions', f);
    return (await db.query(`UPDATE market_wallets SET pay_url = $2, pay_session = $3, pay_amount = $4, pay_expires = to_timestamp($5), updated_at = now() WHERE account_id = $1 RETURNING *`,
      [acc, s.url, s.id, due, Math.floor(Date.now() / 1000) + 23 * 3600])).rows[0];
  } catch (e) { console.error('[carteira] link de comissão', acc, e.message); return w; }
}

// soma comissão; ao passar de R$ 5 manda o link e começa o prazo
async function addCommission(acc, amount, listingId) {
  const w = (await db.query(`INSERT INTO market_wallets (account_id, due_brl) VALUES ($1, $2)
    ON CONFLICT (account_id) DO UPDATE SET due_brl = market_wallets.due_brl + $2, updated_at = now() RETURNING *`, [acc, amount])).rows[0];
  await db.query('INSERT INTO market_ledger (account_id, kind, amount, currency, listing_id) VALUES ($1, $2, $3, $4, $5)', [acc, 'commission', amount, 'brl', listingId]);
  if (Number(w.due_brl) >= LIMIT_BRL) {
    if (!w.due_since) await db.query('UPDATE market_wallets SET due_since = now() WHERE account_id = $1 AND due_since IS NULL', [acc]);
    const w2 = await payLink(acc);
    for (const p of onlineAcc(acc)) {
      p.send({ type: 'log', kind: 'warn', text: `Mercado: sua comissão pendente chegou a ${R.brl(w2.due_brl)}. Pague em até ${GRACE_H} horas pelo link no Mercado (Minhas vendas) para não ser bloqueado.` });
      send(p).catch(() => {});
    }
  }
}
// prazo vencido → bloqueio
async function sweep() {
  const { rows } = await db.query(`SELECT account_id FROM market_wallets WHERE NOT blocked AND due_brl >= $1 AND due_since < now() - ($2 || ' hours')::interval`, [LIMIT_BRL, String(GRACE_H)]);
  for (const r of rows) await setBlocked(r.account_id, true, 'comissão do mercado não paga');
}

// ---------- vendedor ----------
async function setInfo(p, msg) {
  const pix = msg.pixKey !== undefined ? String(msg.pixKey || '').trim().slice(0, 120) : undefined;
  const info = msg.payoutInfo !== undefined ? String(msg.payoutInfo || '').trim().slice(0, 200) : undefined;
  await wallet(p.accountId);
  if (pix !== undefined) await db.query('UPDATE market_wallets SET pix_key = $2, updated_at = now() WHERE account_id = $1', [p.accountId, pix || null]);
  if (info !== undefined) await db.query('UPDATE market_wallets SET payout_info = $2, updated_at = now() WHERE account_id = $1', [p.accountId, info || null]);
  p.send({ type: 'marketMsg', ok: true, text: 'Dados de recebimento salvos.' });
  return send(p);
}
async function payNow(p) {
  const w = await payLink(p.accountId);
  if (Number(w.due_brl) < LIMIT_BRL) return p.send({ type: 'marketMsg', ok: true, text: `Comissão pendente: ${R.brl(w.due_brl)}. O link de pagamento aparece quando chegar a ${R.brl(LIMIT_BRL)}.` });
  if (!w.pay_url) return p.send({ type: 'marketMsg', ok: false, text: 'Não foi possível gerar o link agora. Tente de novo em instantes.' });
  return p.send({ type: 'marketOpen', url: w.pay_url, why: 'commission' });
}

// ---------- comprador: USD pelo Stripe do jogo ----------
async function buyUsd(p, r) {
  const say = (t) => p.send({ type: 'marketMsg', ok: false, text: t });
  if (!R.enabled()) return say('Pagamentos com dinheiro real ainda não estão ligados no servidor.');
  if (H.bagUsed(p) >= G.INVENTORY_SIZE) return say('Libere um espaço na bolsa antes de comprar.');
  const res = await db.query(`UPDATE market_listings SET status = 'reserved', reserved_char = $2, reserved_until = now() + ($3 || ' minutes')::interval
    WHERE id = $1 AND status = 'active' AND expires_at > now() RETURNING *`, [r.id, p.charId, String(R.HOLD_MIN + 1)]);
  const L = res.rows[0];
  if (!L) return say('Este anúncio não está mais à venda.');
  const price = Number(L.price);
  const back = `${R.BASE()}/game.html?c=${encodeURIComponent(p.charId)}&mercado=`;
  const f = { mode: 'payment', locale: 'pt-BR', success_url: back + 'pago', cancel_url: back + 'cancelado', client_reference_id: String(p.accountId),
    expires_at: String(Math.floor(Date.now() / 1000) + R.HOLD_MIN * 60),
    'line_items[0][quantity]': '1', 'line_items[0][price_data][currency]': 'usd', 'line_items[0][price_data][unit_amount]': String(price),
    'line_items[0][price_data][product_data][name]': `${nameOf(L.base)}${L.plus ? ' +' + L.plus : ''}${L.qty > 1 ? ' ×' + L.qty : ''} — MU Idle Legends`,
    'line_items[0][price_data][product_data][description]': `Item do mercado entre jogadores · vendedor ${L.seller_name} · entregue para ${p.name}` };
  for (const pre of ['metadata', 'payment_intent_data[metadata]']) { f[`${pre}[game]`] = 'muidle-market'; f[`${pre}[kind]`] = 'platform'; f[`${pre}[listing]`] = String(L.id); f[`${pre}[buyer]`] = String(p.charId); f[`${pre}[amt]`] = String(price); }
  let s;
  try { s = await R.stripe('POST', '/v1/checkout/sessions', f); }
  catch (e) {
    console.error('[carteira] checkout usd', L.id, e.message);
    await db.query("UPDATE market_listings SET status = 'active', reserved_char = NULL, reserved_until = NULL WHERE id = $1 AND status = 'reserved' AND checkout_id IS NULL", [L.id]);
    return say('Não foi possível abrir o pagamento. Tente de novo.');
  }
  await db.query('UPDATE market_listings SET checkout_id = $2 WHERE id = $1', [L.id, s.id]);
  return p.send({ type: 'marketOpen', url: s.url, why: 'pay', text: `Pagamento de ${usd(price)} aberto. O item fica reservado para você por ${R.HOLD_MIN - 1} minutos.` });
}

// entrega um anúncio vendido: item para o comprador (online ou não)
async function deliver(q, L, buyerChar) {
  return (await q(`INSERT INTO items (character_id, base, rarity, plus, qty, excellent_options) VALUES ($1,$2,$3,$4,$5,$6)
    RETURNING id, base, rarity, plus, equipped, qty, eq_slot, locked, excellent_options`, [buyerChar, L.base, L.rarity, L.plus, L.qty, JSON.stringify(L.excellent_options || [])])).rows[0];
}
function afterDeliver(L, buyerChar, item, text) {
  const b = online(buyerChar);
  if (b) { b.items.push(item); b.dirty = true; b.send(b.charState()); b.send({ type: 'marketMsg', ok: true, bought: true, text }); }
}

// ---------- comprador: Pix direto ao vendedor ----------
async function buyPix(p, r) {
  const say = (t) => p.send({ type: 'marketMsg', ok: false, text: t });
  if (H.bagUsed(p) >= G.INVENTORY_SIZE) return say('Libere um espaço na bolsa antes de comprar.');
  const busy = (await db.query("SELECT count(*)::int AS n FROM market_listings WHERE reserved_char = $1 AND status = 'reserved' AND pay_mode = 'pix'", [p.charId])).rows[0].n;
  if (busy >= 3) return say('Você já tem 3 compras por Pix esperando confirmação. Aguarde os vendedores confirmarem.');
  const res = await db.query(`UPDATE market_listings SET status = 'reserved', reserved_char = $2, reserved_until = now() + ($3 || ' hours')::interval
    WHERE id = $1 AND status = 'active' AND expires_at > now() RETURNING *`, [r.id, p.charId, String(PIX_HOLD_H)]);
  const L = res.rows[0];
  if (!L) return say('Este anúncio não está mais à venda.');
  const sp = online(L.seller_char);
  if (sp) sp.send({ type: 'log', kind: 'quest', text: `Mercado: ${p.name} quer comprar seu ${nameOf(L.base)} por ${R.brl(L.price)} via Pix. Confira o Pix e confirme em Mercado → Minhas vendas.` });
  p.send({ type: 'marketPix', id: String(L.id), key: L.pix_key, amount: Number(L.price), seller: L.seller_name, item: nameOf(L.base) + (L.plus ? ' +' + L.plus : ''), hours: PIX_HOLD_H });
  return require('./market').mineFor(p);
}
async function pixAction(p, msg) {
  const say = (t, ok) => p.send({ type: 'marketMsg', ok: !!ok, text: t });
  const id = Math.floor(Number(msg.id));
  const L = (await db.query("SELECT * FROM market_listings WHERE id = $1 AND pay_mode = 'pix'", [id])).rows[0];
  if (!L || L.status !== 'reserved') { say('Esta compra por Pix não está mais aberta.'); return require('./market').mineFor(p); }
  const a = String(msg.action);
  const isSeller = String(L.seller_char) === String(p.charId), isBuyer = String(L.reserved_char) === String(p.charId);
  if (a === 'pixPaid' && isBuyer) {
    await db.query('UPDATE market_listings SET buyer_paid_at = now() WHERE id = $1', [id]);
    const sp = online(L.seller_char); if (sp) sp.send({ type: 'log', kind: 'quest', text: `Mercado: ${p.name} avisou que pagou ${R.brl(L.price)} pelo Pix do ${nameOf(L.base)}. Confira e confirme em Minhas vendas.` });
    say('O vendedor foi avisado. O item chega na sua bolsa assim que ele confirmar o Pix.', true);
  } else if (a === 'pixCancel' && (isBuyer || isSeller)) {
    await db.query("UPDATE market_listings SET status = 'active', reserved_char = NULL, reserved_until = NULL, buyer_paid_at = NULL WHERE id = $1 AND status = 'reserved'", [id]);
    const other = online(isBuyer ? L.seller_char : L.reserved_char);
    if (other) other.send({ type: 'log', kind: 'warn', text: `Mercado: a compra por Pix do ${nameOf(L.base)} foi cancelada por ${p.name}.` });
    say(isBuyer ? 'Reserva cancelada.' : 'Venda liberada: o item voltou para a vitrine.', true);
  } else if (a === 'pixConfirm' && isSeller) {
    if (isBlocked(p)) say('Sua conta está bloqueada, mas a entrega deste item foi permitida para não prejudicar o comprador.', true);
    await confirmPix(L, null);
    say(`Pix confirmado. O item foi entregue e a comissão de ${R.brl(feeOf(Number(L.price)))} foi somada à sua conta.`, true);
  } else say('Ação inválida.');
  return require('./market').mineFor(p);
}
async function confirmPix(L, admin) {
  let item = null, ok = false;
  await db.tx(async (q) => {
    const u = await q(`UPDATE market_listings SET status = 'sold', collected = TRUE, buyer_char = reserved_char, buyer_name = (SELECT name FROM characters WHERE id = reserved_char),
      closed_at = now(), reserved_until = NULL WHERE id = $1 AND status = 'reserved' AND pay_mode = 'pix' RETURNING *`, [L.id]);
    if (!u.rows[0]) return;
    ok = true; L = u.rows[0];
    item = await deliver(q, L, L.buyer_char);
  });
  if (!ok) throw new Error('Esta compra não está mais aberta.');
  await addCommission(L.seller_account, feeOf(Number(L.price)), L.id);
  if (admin) await db.query('INSERT INTO market_ledger (account_id, kind, listing_id, note) VALUES ($1, $2, $3, $4)', [L.seller_account, 'force_deliver', L.id, admin]);
  afterDeliver(L, L.buyer_char, item, `O vendedor confirmou o Pix! ${nameOf(L.base)}${L.plus ? ' +' + L.plus : ''} chegou na sua bolsa.`);
}

// ---------- webhooks: comissão paga e vendas em USD ----------
async function webhook(s) {
  const md = s.metadata || {};
  if (md.kind === 'commission') {
    const acc = Number(md.acc), amt = Number(s.amount_total);
    if (!acc || String(s.currency).toLowerCase() !== 'brl') return 'metadados-invalidos';
    const ins = await db.query("INSERT INTO market_ledger (account_id, kind, amount, currency, ref) VALUES ($1, 'commission_paid', $2, 'brl', $3) ON CONFLICT DO NOTHING RETURNING id", [acc, amt, s.id]);
    if (!ins.rows[0]) return 'ja-entregue';
    const w = (await db.query(`UPDATE market_wallets SET due_brl = GREATEST(0, due_brl - $2), pay_url = NULL, pay_session = NULL, pay_amount = NULL, pay_expires = NULL,
      due_since = CASE WHEN due_brl - $2 >= $3 THEN due_since ELSE NULL END, updated_at = now() WHERE account_id = $1 RETURNING *`, [acc, amt, LIMIT_BRL])).rows[0];
    console.log(`[carteira] comissão paga: conta ${acc} ${R.brl(amt)}`);
    if (w && w.blocked && Number(w.due_brl) < LIMIT_BRL) await setBlocked(acc, false);
    for (const p of onlineAcc(acc)) { p.send({ type: 'log', kind: 'quest', text: `Mercado: comissão de ${R.brl(amt)} recebida. Obrigado!` }); send(p).catch(() => {}); }
    return 'entregue';
  }
  // venda em USD paga no Stripe do jogo
  const id = Number(md.listing), buyer = Number(md.buyer), amt = Number(md.amt);
  if (!id || !buyer) return 'metadados-invalidos';
  if (String(s.currency).toLowerCase() !== 'usd' || Number(s.amount_total) !== amt) { console.error(`[carteira] valor diferente na sessão ${s.id}`); return 'valor-diferente'; }
  let L, item;
  await db.tx(async (q) => {
    const u = await q(`UPDATE market_listings SET status = 'sold', collected = TRUE, buyer_char = $2, buyer_name = (SELECT name FROM characters WHERE id = $2), closed_at = now(),
      payment_ref = $3, reserved_until = NULL WHERE id = $1 AND checkout_id = $4 AND status IN ('reserved', 'active', 'expired') AND price = $5 AND pay_mode = 'platform' RETURNING *`, [id, buyer, s.payment_intent || s.id, s.id, amt]);
    L = u.rows[0];
    if (!L) return;
    item = await deliver(q, L, buyer);
    const gain = amt - Number(L.fee);
    await q(`INSERT INTO market_wallets (account_id, usd_owed) VALUES ($1, $2) ON CONFLICT (account_id) DO UPDATE SET usd_owed = market_wallets.usd_owed + $2, updated_at = now()`, [L.seller_account, gain]);
    await q("INSERT INTO market_ledger (account_id, kind, amount, currency, listing_id, ref) VALUES ($1, 'usd_credit', $2, 'usd', $3, $4)", [L.seller_account, gain, L.id, s.id]);
  });
  if (!L) return 'ja-entregue';
  console.log(`[carteira] venda USD ${id} paga (${usd(amt)}), item entregue ao personagem ${buyer}`);
  afterDeliver(L, buyer, item, `Pagamento confirmado! ${nameOf(L.base)}${L.plus ? ' +' + L.plus : ''} chegou na sua bolsa.`);
  const sp = online(L.seller_char);
  if (sp) { sp.send({ type: 'log', kind: 'quest', text: `Mercado: seu ${nameOf(L.base)} foi vendido por ${usd(amt)}. ${usd(amt - Number(L.fee))} ficaram no seu saldo em dólar; o administrador faz o pagamento.` }); send(sp).catch(() => {}); }
  return 'entregue';
}

// ---------- painel ADM ----------
async function adminView() {
  const totals = (await db.query(`SELECT currency, count(*)::int AS sold, COALESCE(sum(price), 0)::bigint AS volume, COALESCE(sum(fee), 0)::bigint AS fees
    FROM market_listings WHERE status = 'sold' GROUP BY currency`)).rows;
  const active = (await db.query("SELECT currency, count(*)::int AS n FROM market_listings WHERE status IN ('active','reserved') GROUP BY currency")).rows;
  const wallets = (await db.query(`SELECT w.*, a.username, a.email FROM market_wallets w JOIN accounts a ON a.id = w.account_id
    WHERE w.due_brl > 0 OR w.usd_owed > 0 OR w.blocked ORDER BY w.blocked DESC, w.usd_owed DESC, w.due_brl DESC LIMIT 200`)).rows
    .map((w) => ({ account: String(w.account_id), username: w.username, email: w.email, ...walletView(w) }));
  const pix = (await db.query(`SELECT l.*, c.name AS buyer FROM market_listings l LEFT JOIN characters c ON c.id = l.reserved_char
    WHERE l.status = 'reserved' AND l.pay_mode = 'pix' ORDER BY l.reserved_until LIMIT 100`)).rows
    .map((l) => ({ id: String(l.id), item: nameOf(l.base) + (l.plus ? ' +' + l.plus : ''), price: Number(l.price), seller: l.seller_name, buyer: l.buyer, paidAt: l.buyer_paid_at, until: l.reserved_until }));
  const sales = (await db.query(`SELECT id, base, plus, price, fee, currency, pay_mode, seller_name, buyer_name, closed_at FROM market_listings WHERE status = 'sold' ORDER BY closed_at DESC LIMIT 40`)).rows
    .map((l) => ({ id: String(l.id), item: nameOf(l.base) + (l.plus ? ' +' + l.plus : ''), price: Number(l.price), fee: Number(l.fee), currency: l.currency, mode: l.pay_mode, seller: l.seller_name, buyer: l.buyer_name, at: l.closed_at }));
  const sellers = (await db.query('SELECT count(*)::int AS n, count(*) FILTER (WHERE charges_enabled AND payouts_enabled)::int AS ready FROM market_sellers')).rows[0];
  return { totals, active, wallets, pix, sales, sellers, limit: LIMIT_BRL, graceH: GRACE_H, stripe: R.enabled() };
}
async function adminOp(body, who) {
  const acc = Number(body.account);
  const amt = Math.round(Number(body.amount) || 0);
  const note = String(body.note || '').slice(0, 200) || null;
  switch (body.op) {
    case 'usdPaid': {
      if (!(amt > 0)) throw new Error('Valor inválido.');
      const u = await db.query('UPDATE market_wallets SET usd_owed = usd_owed - $2, updated_at = now() WHERE account_id = $1 AND usd_owed >= $2 RETURNING usd_owed', [acc, amt]);
      if (!u.rows[0]) throw new Error('Valor maior que o saldo do vendedor.');
      await db.query("INSERT INTO market_ledger (account_id, kind, amount, currency, note) VALUES ($1, 'usd_payout', $2, 'usd', $3)", [acc, amt, `${who}: ${note || ''}`]);
      for (const p of onlineAcc(acc)) { p.send({ type: 'log', kind: 'quest', text: `Mercado: o administrador registrou o pagamento de ${usd(amt)} das suas vendas em dólar.` }); send(p).catch(() => {}); }
      return `Pagamento de ${usd(amt)} registrado.`;
    }
    case 'forgive': {
      if (!(amt > 0)) throw new Error('Valor inválido.');
      const w = (await db.query(`UPDATE market_wallets SET due_brl = GREATEST(0, due_brl - $2), due_since = CASE WHEN due_brl - $2 >= $3 THEN due_since ELSE NULL END,
        pay_url = NULL, pay_session = NULL, pay_amount = NULL, pay_expires = NULL, updated_at = now() WHERE account_id = $1 RETURNING *`, [acc, amt, LIMIT_BRL])).rows[0];
      if (!w) throw new Error('Conta não encontrada.');
      await db.query("INSERT INTO market_ledger (account_id, kind, amount, currency, note) VALUES ($1, 'commission_forgiven', $2, 'brl', $3)", [acc, amt, `${who}: ${note || ''}`]);
      if (w.blocked && Number(w.due_brl) < LIMIT_BRL) await setBlocked(acc, false);
      return `Comissão reduzida em ${R.brl(amt)}.`;
    }
    case 'block': await wallet(acc); await setBlocked(acc, true, note || 'bloqueado pelo administrador'); return 'Conta bloqueada no mercado e nas trocas.';
    case 'unblock': await wallet(acc); await setBlocked(acc, false); return 'Conta liberada.';
    case 'pixDeliver': {
      const L = (await db.query("SELECT * FROM market_listings WHERE id = $1 AND pay_mode = 'pix' AND status = 'reserved'", [Number(body.listing)])).rows[0];
      if (!L) throw new Error('Compra por Pix não encontrada.');
      await confirmPix(L, who);
      return 'Item entregue ao comprador e comissão lançada para o vendedor.';
    }
    case 'pixRelease': {
      const u = await db.query("UPDATE market_listings SET status = 'active', reserved_char = NULL, reserved_until = NULL, buyer_paid_at = NULL WHERE id = $1 AND pay_mode = 'pix' AND status = 'reserved' RETURNING seller_account", [Number(body.listing)]);
      if (!u.rows[0]) throw new Error('Compra por Pix não encontrada.');
      await db.query("INSERT INTO market_ledger (account_id, kind, listing_id, note) VALUES ($1, 'release', $2, $3)", [u.rows[0].seller_account, Number(body.listing), who]);
      return 'Reserva cancelada; o item voltou para a vitrine.';
    }
    case 'findAccount': {
      const r = (await db.query('SELECT id FROM accounts WHERE lower(username) = lower($1)', [String(body.username || '')])).rows[0];
      if (!r) throw new Error('Conta não encontrada.');
      await wallet(r.id);
      return `Conta encontrada (#${r.id}).`;
    }
    default: throw new Error('Operação inválida.');
  }
}

module.exports = { init, isBlocked, send, setInfo, payNow, buyUsd, buyPix, pixAction, webhook, adminView, adminOp, wallet, USD_MIN, USD_MAX, LIMIT_BRL, usd };
