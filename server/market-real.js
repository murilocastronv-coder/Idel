'use strict';
// Mercado com dinheiro real — Stripe Connect (contas Express + cobrança com destino):
//  • o vendedor conecta a conta Stripe dele (cadastro feito no próprio Stripe);
//  • o comprador paga no Stripe Checkout; o Stripe manda o valor direto para a conta do vendedor
//    e separa a comissão do jogo (10%) na mesma hora — não existe dívida de comissão;
//  • o webhook confirma o pagamento e entrega o item ao comprador.
// Usa as mesmas variáveis do VIP: STRIPE_SECRET_KEY e STRIPE_WEBHOOK_SECRET. O Connect precisa estar ativo no painel do Stripe.
const crypto = require('crypto');
const db = require('./db');
const G = require('./gamedata');

const FEE = 0.10;
const CURRENCY = 'brl';
const MIN_CENTS = 500;        // R$ 5,00
const MAX_CENTS = 500000;     // R$ 5.000,00
const HOLD_MIN = 31;          // o Checkout do Stripe dura no mínimo 30 minutos
// países onde uma plataforma na França consegue pagar vendedores automaticamente (Stripe: EUA, Reino Unido, EEE, Canadá e Suíça)
const COUNTRIES = { PT: 'Portugal', FR: 'França', ES: 'Espanha', IT: 'Itália', DE: 'Alemanha', BE: 'Bélgica', NL: 'Holanda', LU: 'Luxemburgo', IE: 'Irlanda',
  AT: 'Áustria', CH: 'Suíça', GB: 'Reino Unido', US: 'Estados Unidos', CA: 'Canadá', PL: 'Polônia', SE: 'Suécia', DK: 'Dinamarca', FI: 'Finlândia', NO: 'Noruega', CZ: 'Tchéquia', GR: 'Grécia', RO: 'Romênia' };
// se o Stripe liberar outros países para a sua conta (ex.: Brasil), coloque no Render: MARKET_EXTRA_COUNTRIES=BR
const EXTRA_NAMES = { BR: 'Brasil', MX: 'México', AR: 'Argentina', JP: 'Japão', AU: 'Austrália' };
for (const c of String(process.env.MARKET_EXTRA_COUNTRIES || '').toUpperCase().split(/[^A-Z]+/)) if (c.length === 2) COUNTRIES[c] = EXTRA_NAMES[c] || c;
let W = null, H = null;

const KEY = () => process.env.STRIPE_SECRET_KEY || '';
const enabled = () => !!KEY() && !!process.env.STRIPE_WEBHOOK_SECRET;
const API = () => process.env.STRIPE_API || 'https://api.stripe.com';
const BASE = () => (process.env.APP_URL || (process.env.RENDER ? 'https://muonlineclaude.com' : 'http://localhost:' + (process.env.PORT || 3000))).replace(/\/$/, '');
const brl = (c) => 'R$ ' + (Number(c) / 100).toFixed(2).replace('.', ',');
const feeOf = (c) => Math.max(1, Math.round(c * FEE));
const nameOf = (base) => (G.ITEM_BASES[base] || {}).name || base;

async function stripe(method, path, form) {
  const r = await fetch(API() + path, {
    method,
    headers: { Authorization: `Bearer ${KEY()}`, 'Content-Type': 'application/x-www-form-urlencoded', ...(method === 'POST' ? { 'Idempotency-Key': crypto.randomUUID() } : {}) },
    body: method === 'POST' ? new URLSearchParams(form || {}) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error((j.error && j.error.message) || `Stripe ${r.status}`); e.stripe = j.error || {}; e.status = r.status; throw e; }
  return j;
}

function init(world, helpers) {
  W = world; H = helpers;
  setInterval(() => { releaseExpired().catch((e) => console.error('[mercado real] reservas', e.message)); }, 60000).unref();
}

// ---------- vendedor: conectar a conta Stripe ----------
async function sellerRow(accountId) { return (await db.query('SELECT * FROM market_sellers WHERE account_id = $1', [accountId])).rows[0] || null; }
const ready = (s) => !!(s && s.charges_enabled && s.payouts_enabled);
function sellerView(s) {
  return { enabled: enabled(), countries: COUNTRIES, connected: !!s, ready: ready(s), country: s ? s.country : null, details: !!(s && s.details_submitted), payouts: !!(s && s.payouts_enabled), fee: FEE, min: MIN_CENTS, max: MAX_CENTS };
}
async function refresh(s) {
  if (!s) return s;
  try {
    const a = await stripe('GET', `/v1/accounts/${encodeURIComponent(s.stripe_account)}`);
    const caps = a.capabilities || {};
    const charges = caps.transfers === 'active' || !!a.charges_enabled;
    const { rows } = await db.query(`UPDATE market_sellers SET charges_enabled = $2, payouts_enabled = $3, details_submitted = $4, updated_at = now() WHERE account_id = $1 RETURNING *`,
      [s.account_id, charges, !!a.payouts_enabled, !!a.details_submitted]);
    return rows[0] || s;
  } catch (e) { console.error('[mercado real] conta', s.stripe_account, e.message); return s; }
}
async function status(p) {
  const s = await refresh(await sellerRow(p.accountId));
  p.send({ type: 'marketStripe', ...sellerView(s) });
}
async function connect(p, msg) {
  const say = (t) => p.send({ type: 'marketMsg', ok: false, text: t });
  if (!enabled()) return say('Pagamentos com dinheiro real ainda não estão ligados no servidor.');
  let s = await sellerRow(p.accountId);
  if (!s) {
    const country = String(msg.country || '').toUpperCase();
    if (!COUNTRIES[country]) return say('Escolha o país da sua conta bancária.');
    const email = (await db.query('SELECT email FROM accounts WHERE id = $1', [p.accountId])).rows[0];
    const form = { type: 'express', country, business_type: 'individual', 'capabilities[transfers][requested]': 'true', 'capabilities[card_payments][requested]': 'true',
      'business_profile[product_description]': 'Venda de itens do jogo MuonlineClaude no mercado entre jogadores', 'business_profile[url]': BASE(),
      'metadata[game]': 'muidle', 'metadata[acc]': String(p.accountId) };
    if (email && email.email) form.email = email.email;
    let acct;
    try { acct = await stripe('POST', '/v1/accounts', form); }
    catch (e) {
      try { delete form['capabilities[card_payments][requested]']; acct = await stripe('POST', '/v1/accounts', form); }
      catch (e2) {
        console.error('[mercado real] criar conta', country, e2.message);
        return say(`O Stripe não aceitou criar a conta (${COUNTRIES[country]}): ${e2.message}`);
      }
    }
    s = (await db.query(`INSERT INTO market_sellers (account_id, stripe_account, country) VALUES ($1,$2,$3)
      ON CONFLICT (account_id) DO UPDATE SET updated_at = now() RETURNING *`, [p.accountId, acct.id, country])).rows[0];
  }
  try {
    const back = `${BASE()}/game.html?c=${encodeURIComponent(p.charId)}&mercado=stripe`;
    const link = await stripe('POST', '/v1/account_links', { account: s.stripe_account, refresh_url: back, return_url: back, type: 'account_onboarding' });
    p.send({ type: 'marketOpen', url: link.url, why: 'connect' });
  } catch (e) { console.error('[mercado real] link', e.message); say('Não foi possível abrir o cadastro do Stripe. Tente de novo.'); }
  return undefined;
}
async function dashboard(p) {
  const s = await sellerRow(p.accountId);
  if (!s) return p.send({ type: 'marketMsg', ok: false, text: 'Conecte sua conta Stripe primeiro.' });
  try { const l = await stripe('POST', `/v1/accounts/${encodeURIComponent(s.stripe_account)}/login_links`, {}); p.send({ type: 'marketOpen', url: l.url, why: 'dashboard' }); }
  catch (e) { p.send({ type: 'marketMsg', ok: false, text: 'Termine o cadastro no Stripe para abrir o painel de recebimentos.' }); }
  return undefined;
}

// usado pelo market.js ao anunciar em reais
async function sellerForListing(p) {
  if (!enabled()) return { error: 'Vendas em dinheiro real ainda não estão ligadas no servidor.' };
  let s = await sellerRow(p.accountId);
  if (!s) return { error: 'Conecte sua conta Stripe (aba Dinheiro real) para vender por reais.' };
  if (!ready(s)) s = await refresh(s);
  if (!ready(s)) return { error: 'Seu cadastro no Stripe ainda não está completo. Termine o cadastro para vender por reais.' };
  return { seller: s };
}

// ---------- comprador: Checkout ----------
async function checkout(p, msg) {
  const say = (t) => p.send({ type: 'marketMsg', ok: false, text: t });
  if (!enabled()) return say('Pagamentos com dinheiro real ainda não estão ligados no servidor.');
  const id = Math.floor(Number(msg.id));
  const r0 = (await db.query('SELECT * FROM market_listings WHERE id = $1', [id])).rows[0];
  if (!r0 || r0.currency !== CURRENCY) return say('Anúncio inválido.');
  if (String(r0.seller_account) === String(p.accountId)) return say('Você não pode comprar um item da sua própria conta.');
  if (Number(msg.price) !== Number(r0.price)) return say('O preço mudou. Confira de novo.');
  if (H.bagUsed(p) >= G.INVENTORY_SIZE) return say('Libere um espaço na bolsa antes de comprar.');
  // reserva o anúncio enquanto o pagamento está aberto
  const res = await db.query(`UPDATE market_listings SET status = 'reserved', reserved_char = $2, reserved_until = now() + ($3 || ' minutes')::interval
    WHERE id = $1 AND status = 'active' AND expires_at > now() RETURNING *`, [id, p.charId, String(HOLD_MIN + 1)]);
  const r = res.rows[0];
  if (!r) return say(r0.status === 'reserved' ? 'Outro jogador está pagando este item agora. Tente daqui a pouco.' : 'Este anúncio não está mais à venda.');
  const price = Number(r.price), fee = feeOf(price);
  const back = `${BASE()}/game.html?c=${encodeURIComponent(p.charId)}&mercado=`;
  const f = {
    mode: 'payment', locale: 'pt-BR', success_url: back + 'pago', cancel_url: back + 'cancelado', client_reference_id: String(p.accountId),
    expires_at: String(Math.floor(Date.now() / 1000) + HOLD_MIN * 60),
    'line_items[0][quantity]': '1', 'line_items[0][price_data][currency]': CURRENCY, 'line_items[0][price_data][unit_amount]': String(price),
    'line_items[0][price_data][product_data][name]': `${nameOf(r.base)}${r.plus ? ' +' + r.plus : ''}${r.qty > 1 ? ' ×' + r.qty : ''} — MuonlineClaude`,
    'line_items[0][price_data][product_data][description]': `Item do mercado entre jogadores · vendedor ${r.seller_name} · entregue para ${p.name}`,
    'payment_intent_data[application_fee_amount]': String(fee), 'payment_intent_data[transfer_data][destination]': r.stripe_account,
  };
  for (const pre of ['metadata', 'payment_intent_data[metadata]']) {
    f[`${pre}[game]`] = 'muidle-market'; f[`${pre}[listing]`] = String(r.id); f[`${pre}[buyer]`] = String(p.charId); f[`${pre}[acc]`] = String(p.accountId); f[`${pre}[amt]`] = String(price);
  }
  let s;
  try { s = await stripe('POST', '/v1/checkout/sessions', f); }
  catch (e) {
    console.error('[mercado real] checkout', r.id, e.message);
    await db.query("UPDATE market_listings SET status = 'active', reserved_char = NULL, reserved_until = NULL WHERE id = $1 AND status = 'reserved' AND checkout_id IS NULL", [r.id]);
    return say('Não foi possível abrir o pagamento. Tente de novo.');
  }
  await db.query('UPDATE market_listings SET checkout_id = $2 WHERE id = $1', [r.id, s.id]);
  p.send({ type: 'marketOpen', url: s.url, why: 'pay', text: `Pagamento de ${brl(price)} aberto. O item fica reservado para você por ${HOLD_MIN - 1} minutos.` });
  return undefined;
}

// reservas vencidas: encerra o Checkout no Stripe e devolve o anúncio para a vitrine
async function releaseExpired() {
  if (!KEY()) return;
  const { rows } = await db.query("SELECT id, checkout_id FROM market_listings WHERE status = 'reserved' AND reserved_until < now() AND COALESCE(pay_mode, 'connect') <> 'pix' LIMIT 50");
  for (const r of rows) {
    if (r.checkout_id) {
      try { await stripe('POST', `/v1/checkout/sessions/${encodeURIComponent(r.checkout_id)}/expire`, {}); }
      catch (e) {
        // já foi pago (ou já expirou): consulta antes de liberar
        try { const s = await stripe('GET', `/v1/checkout/sessions/${encodeURIComponent(r.checkout_id)}`); if (s.payment_status === 'paid') { await webhook(s); continue; } }
        catch (_) { continue; }
      }
    }
    await db.query(`UPDATE market_listings SET status = CASE WHEN expires_at < now() THEN 'expired' ELSE 'active' END, closed_at = CASE WHEN expires_at < now() THEN now() ELSE NULL END,
      reserved_char = NULL, reserved_until = NULL, checkout_id = NULL WHERE id = $1 AND status = 'reserved'`, [r.id]);
  }
}

// pagamento confirmado pelo Stripe → entrega o item (uma única vez)
async function webhook(s) {
  const md = s.metadata || {};
  if (md.kind === 'commission' || md.kind === 'platform') return require('./market-wallet').webhook(s);
  const id = Number(md.listing), buyer = Number(md.buyer), amt = Number(md.amt);
  if (!id || !buyer) return 'metadados-invalidos';
  if (String(s.currency).toLowerCase() !== CURRENCY || Number(s.amount_total) !== amt) { console.error(`[mercado real] valor diferente na sessão ${s.id}`); return 'valor-diferente'; }
  let row, item;
  await db.tx(async (q) => {
    const u = await q(`UPDATE market_listings SET status = 'sold', collected = TRUE, buyer_char = $2, buyer_name = (SELECT name FROM characters WHERE id = $2), closed_at = now(),
      payment_ref = $3, reserved_until = NULL WHERE id = $1 AND checkout_id = $4 AND status IN ('reserved', 'active', 'expired') AND price = $5 RETURNING *`, [id, buyer, s.payment_intent || s.id, s.id, amt]);
    row = u.rows[0];
    if (!row) return;
    item = (await q(`INSERT INTO items (character_id, base, rarity, plus, qty, excellent_options) VALUES ($1,$2,$3,$4,$5,$6)
      RETURNING id, base, rarity, plus, equipped, qty, eq_slot, locked, excellent_options`, [buyer, row.base, row.rarity, row.plus, row.qty, JSON.stringify(row.excellent_options || [])])).rows[0];
  });
  if (!row) return 'ja-entregue';
  console.log(`[mercado real] anúncio ${id} pago (${brl(amt)}), item entregue ao personagem ${buyer}`);
  const online = W && [...W.players.values()].find((x) => String(x.charId) === String(buyer));
  if (online) {
    online.items.push(item); online.dirty = true; online.send(online.charState());
    online.send({ type: 'marketMsg', ok: true, bought: true, text: `Pagamento confirmado! ${nameOf(row.base)}${row.plus ? ' +' + row.plus : ''} chegou na sua bolsa.` });
  }
  const seller = W && [...W.players.values()].find((x) => String(x.charId) === String(row.seller_char));
  if (seller) seller.send({ type: 'log', kind: 'quest', text: `Mercado: seu ${nameOf(row.base)} foi vendido por ${brl(amt)}. ${brl(amt - feeOf(amt))} vão para a sua conta Stripe.` });
  return 'entregue';
}

function act(p, msg) {
  const a = String(msg.action || '');
  if (a === 'stripeStatus') return status(p);
  if (a === 'stripeConnect') return connect(p, msg);
  if (a === 'stripeDashboard') return dashboard(p);
  if (a === 'buyReal') return checkout(p, msg);
  return null;
}

module.exports = { init, act, webhook, sellerForListing, sellerRow, ready, enabled, feeOf, MIN_CENTS, MAX_CENTS, CURRENCY, FEE, brl, stripe, BASE, KEY, HOLD_MIN };
