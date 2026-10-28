'use strict';
// VIP Ouro e VIP Diamante: planos, vantagens, compra pelo Stripe Checkout e webhook assinado.
// Variáveis no Render (nunca no código):
//   STRIPE_SECRET_KEY      chave secreta do Stripe (sk_live_... / rk_live_... ou sk_test_... para testar)
//   STRIPE_WEBHOOK_SECRET  segredo do webhook (whsec_...) — endpoint: https://muonlineclaude.com/api/stripe-webhook
// Sem as chaves, a compra fica desligada e o resto do jogo funciona normal (o administrador ainda pode dar VIP).
const crypto = require('crypto');
const db = require('./db');

const PLANS = {
  vip1: {
    id: 'vip1', tier: 1, name: 'VIP Ouro', color: '#ffd36b',
    prices: { 15: 1300, 30: 2340 }, // centavos de real (30 dias = 2 × 15 dias com 10% de desconto)
    exp: 2, zen: 1.5, drop: 1.25, offlineH: 12,
    perks: ['EXP 2x', 'Zen +50%', 'Drops +25%', 'Progresso offline de até 12 horas', 'Selo VIP Ouro no nome'],
  },
  vip2: {
    id: 'vip2', tier: 2, name: 'VIP Diamante', color: '#7fe3ff',
    prices: { 15: 2600, 30: 4680 },
    exp: 3, zen: 2, drop: 1.5, offlineH: 24,
    perks: ['EXP 3x', 'Zen em dobro', 'Drops +50%', 'Progresso offline de até 24 horas', 'Selo VIP Diamante no nome'],
  },
};
const DAYS = [15, 30];
const CURRENCY = 'brl';
const FREE = { tier: 0, exp: 1, zen: 1, drop: 1, offlineH: 8 };

const KEY = () => process.env.STRIPE_SECRET_KEY || '';
const WHSEC = () => process.env.STRIPE_WEBHOOK_SECRET || '';
const enabled = () => !!KEY() && !!WHSEC();

// preços editados pelo administrador ficam no banco
async function loadPrices() {
  try {
    const { rows } = await db.query("SELECT value FROM game_settings WHERE key = 'vip_prices'");
    const v = rows[0] && rows[0].value;
    if (v && typeof v === 'object') {
      for (const pid of Object.keys(PLANS)) {
        for (const d of DAYS) {
          const c = v[pid] && Number(v[pid][d]);
          if (Number.isInteger(c) && c >= 100 && c <= 1000000) PLANS[pid].prices[d] = c;
        }
      }
    }
  } catch (e) { console.error('[vip] preços:', e.message); }
}
async function savePrices(input) {
  const out = {};
  for (const pid of Object.keys(PLANS)) {
    out[pid] = {};
    for (const d of DAYS) {
      const c = Math.round(Number(input && input[pid] && input[pid][d]));
      if (!Number.isInteger(c) || c < 100 || c > 1000000) throw new Error('Preço inválido: use de R$ 1,00 a R$ 10.000,00.');
      out[pid][d] = c;
    }
  }
  await db.query(`INSERT INTO game_settings (key, value, updated_at) VALUES ('vip_prices', $1::jsonb, now())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now() RETURNING key`, [JSON.stringify(out)]);
  for (const pid of Object.keys(out)) PLANS[pid].prices = { ...out[pid] };
  return publicPlans();
}

function publicPlans() {
  return Object.values(PLANS).map((p) => ({ id: p.id, tier: p.tier, name: p.name, color: p.color, perks: p.perks, prices: { ...p.prices } }));
}

// nível VIP a partir das datas da conta (o Diamante vale mais se os dois estiverem ativos)
function status(row, now = Date.now()) {
  const u1 = row && row.vip1_until ? new Date(row.vip1_until).getTime() : 0;
  const u2 = row && row.vip2_until ? new Date(row.vip2_until).getTime() : 0;
  const plan = u2 > now ? PLANS.vip2 : u1 > now ? PLANS.vip1 : null;
  return {
    tier: plan ? plan.tier : 0, plan: plan ? plan.id : null, name: plan ? plan.name : null,
    until: plan ? (plan.tier === 2 ? u2 : u1) : 0, vip1Until: u1 > now ? u1 : 0, vip2Until: u2 > now ? u2 : 0,
  };
}
function perks(tier) {
  if (tier === 2) return PLANS.vip2;
  if (tier === 1) return PLANS.vip1;
  return FREE;
}

// soma dias ao plano (renovar antes de acabar não perde nada); days <= 0 remove o plano
async function grant(accountId, planId, days) {
  const plan = PLANS[planId];
  if (!plan) throw new Error('Plano inválido.');
  const col = plan.tier === 2 ? 'vip2_until' : 'vip1_until';
  const sql = days > 0
    ? `UPDATE accounts SET ${col} = GREATEST(COALESCE(${col}, now()), now()) + ($2::int * interval '1 day') WHERE id = $1 RETURNING id, username, vip1_until, vip2_until`
    : `UPDATE accounts SET ${col} = NULL WHERE id = $1 AND $2::int <= 0 RETURNING id, username, vip1_until, vip2_until`;
  const { rows } = await db.query(sql, [accountId, Math.trunc(days)]);
  if (!rows[0]) throw new Error('Conta não encontrada.');
  return rows[0];
}

// ---------- Stripe ----------
async function createCheckout({ account, planId, days, baseUrl, back }) {
  if (!enabled()) { const e = new Error('Pagamentos indisponíveis no momento.'); e.status = 503; throw e; }
  const plan = PLANS[planId];
  if (!plan || !plan.prices[days]) { const e = new Error('Plano inválido.'); e.status = 400; throw e; }
  const amount = plan.prices[days]; // o preço é sempre calculado aqui no servidor
  const backPath = typeof back === 'string' && /^\/[\w\-./?=&%]*$/.test(back) ? back : '/app';
  const sep = backPath.includes('?') ? '&' : '?';
  const f = new URLSearchParams();
  f.set('mode', 'payment');
  f.set('success_url', `${baseUrl}${backPath}${sep}vip=ok`);
  f.set('cancel_url', `${baseUrl}${backPath}${sep}vip=cancelado`);
  f.set('client_reference_id', String(account.id));
  if (account.email) f.set('customer_email', account.email);
  f.set('locale', 'pt-BR');
  f.set('line_items[0][quantity]', '1');
  f.set('line_items[0][price_data][currency]', CURRENCY);
  f.set('line_items[0][price_data][unit_amount]', String(amount));
  f.set('line_items[0][price_data][product_data][name]', `${plan.name} — ${days} dias`);
  f.set('line_items[0][price_data][product_data][description]', `MU Idle Legends · conta ${account.username} · ${plan.perks.slice(0, 3).join(', ')}`);
  for (const pre of ['metadata', 'payment_intent_data[metadata]']) {
    f.set(`${pre}[game]`, 'muidle');
    f.set(`${pre}[acc]`, String(account.id));
    f.set(`${pre}[plan]`, plan.id);
    f.set(`${pre}[days]`, String(days));
    f.set(`${pre}[amt]`, String(amount));
  }
  const r = await fetch((process.env.STRIPE_API || 'https://api.stripe.com') + '/v1/checkout/sessions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY()}`, 'Content-Type': 'application/x-www-form-urlencoded', 'Idempotency-Key': crypto.randomUUID() },
    body: f,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.url) {
    console.error('[vip] stripe checkout', r.status, j && j.error && j.error.message);
    const e = new Error('Não foi possível abrir o pagamento. Tente de novo.'); e.status = 502; throw e;
  }
  return { url: j.url, id: j.id };
}

// assinatura do Stripe: t=...,v1=hmac_sha256(segredo, t + "." + corpo)
function verifySig(raw, header) {
  const secret = WHSEC();
  if (!secret || typeof header !== 'string') return false;
  const parts = header.split(',').map((x) => x.trim().split('='));
  const t = (parts.find((p) => p[0] === 't') || [])[1];
  const v1 = parts.filter((p) => p[0] === 'v1').map((p) => p[1]);
  if (!t || !v1.length || Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;
  const exp = crypto.createHmac('sha256', secret).update(Buffer.concat([Buffer.from(`${t}.`), raw])).digest('hex');
  return v1.some((x) => x.length === exp.length && crypto.timingSafeEqual(Buffer.from(x), Buffer.from(exp)));
}

// entrega o VIP de uma sessão paga (uma única vez por sessão)
async function deliver(s, onGranted) {
  const md = s.metadata || {};
  if (md.game !== 'muidle') return 'outro-produto'; // eventos de outros projetos no mesmo Stripe
  const plan = PLANS[md.plan];
  const days = Number(md.days), acc = Number(md.acc), amt = Number(md.amt);
  if (!plan || !DAYS.includes(days) || !acc) return 'metadados-invalidos';
  if (String(s.currency).toLowerCase() !== CURRENCY || s.amount_total !== amt) {
    console.error(`[vip] valor diferente na sessão ${s.id}: ${s.amount_total} ${s.currency} (esperado ${amt} ${CURRENCY}). Nada foi entregue.`);
    return 'valor-diferente';
  }
  const ins = await db.query(`INSERT INTO payments (provider, ref, account_id, plan, days, amount_cents, currency, status, note)
    VALUES ('stripe', $1, $2, $3, $4, $5, $6, 'paid', $7) ON CONFLICT (ref) DO NOTHING RETURNING id`,
  [s.id, acc, plan.id, days, s.amount_total, CURRENCY, (s.customer_details && s.customer_details.email) || s.customer_email || null]);
  if (!ins.rows[0]) return 'ja-entregue';
  const row = await grant(acc, plan.id, days);
  console.log(`[vip] ${plan.name} ${days} dias entregue para a conta ${row.username} (sessão ${s.id})`);
  if (onGranted) onGranted(acc, plan, days);
  return 'entregue';
}

async function webhook(raw, sigHeader, onGranted) {
  if (!verifySig(raw, sigHeader)) return { code: 400, body: { error: 'assinatura inválida' } };
  const ev = JSON.parse(raw.toString('utf8'));
  const o = ev.data && ev.data.object;
  if ((ev.type === 'checkout.session.completed' || ev.type === 'checkout.session.async_payment_succeeded') && o && o.payment_status === 'paid') {
    const r = await deliver(o, onGranted);
    return { code: 200, body: { received: true, result: r } };
  }
  return { code: 200, body: { received: true } };
}

module.exports = { PLANS, DAYS, CURRENCY, enabled, loadPrices, savePrices, publicPlans, status, perks, grant, createCheckout, webhook, verifySig };
