'use strict';
// Loja de conjuntos sazonais com checkout BRL e resgate seguro após pagamento.
const crypto = require('crypto');
const db = require('./db');
const G = require('./gamedata');
const KEY = () => process.env.STRIPE_SECRET_KEY || '';
const CURRENCY = 'brl';
// Pacotes fixos de Box Kundun Promocional: conteúdo semi-full, sem itens ancestrais/full.
const BOX_PROMOS = [
  { id:'kundun-promo-10', name:'10 Boxes Kundun · Semi-full', price:5000, qty:10, tone:'#ef4350', type:'box' },
  { id:'kundun-promo-20', name:'20 Boxes Kundun · Semi-full', price:10000, qty:20, tone:'#c83845', type:'box' },
  { id:'kundun-promo-30', name:'30 Boxes Kundun · Semi-full', price:15000, qty:30, tone:'#a82b3a', type:'box' },
];
let config = {};
function findProduct(id) {
  const set = G.PREMIUM_SET_PACKS.find((p) => p.id === id);
  if (set) return { ...set, type:'set' };
  return BOX_PROMOS.find((p) => p.id === id) || null;
}

function publicCatalog(admin = false) {
  const sets = G.PREMIUM_SET_PACKS.map((p) => {
    const c = config[p.id] || {};
    return { id:p.id, name:p.name, price:Number.isInteger(c.price)?c.price:p.price, enabled:c.enabled !== false,
      req:p.req, plus:p.plus, tone:p.tone, pieces:12, type:'set', admin };
  });
  const boxes = BOX_PROMOS.map((p) => ({ ...p, enabled:true, pieces:p.qty, req:1, plus:0, admin }));
  return sets.concat(boxes);
}
async function init() {
  await db.query(`CREATE TABLE IF NOT EXISTS premium_orders (
    id BIGSERIAL PRIMARY KEY, stripe_ref TEXT UNIQUE NOT NULL, account_id BIGINT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    product_id TEXT NOT NULL, amount_cents INTEGER NOT NULL, currency TEXT NOT NULL DEFAULT 'brl',
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','claiming','claimed')),
    character_id BIGINT REFERENCES characters(id) ON DELETE SET NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), claimed_at TIMESTAMPTZ
  )`);
  try { const r = await db.query("SELECT value FROM game_settings WHERE key='premium_sets'"); config = r.rows[0]?.value || {}; } catch (_) { config = {}; }
}
async function saveConfig(input) {
  const next = {};
  for (const p of G.PREMIUM_SET_PACKS) {
    const old = config[p.id] || {};
    const raw = input && input[p.id] || {};
    const price = Math.round(Number(raw.price ?? old.price ?? p.price));
    if (!Number.isInteger(price) || price < 4500 || price > 9000) throw new Error('Cada conjunto deve custar de R$ 45,00 a R$ 90,00.');
    next[p.id] = { price, enabled: raw.enabled === undefined ? old.enabled !== false : raw.enabled === true };
  }
  await db.query(`INSERT INTO game_settings(key,value,updated_at) VALUES('premium_sets',$1::jsonb,now())
    ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=now()`, [JSON.stringify(next)]);
  config = next;
  return publicCatalog(true);
}
async function checkout({account, productId, baseUrl, back}) {
  if (!KEY() || !process.env.STRIPE_WEBHOOK_SECRET) { const e = new Error('Pagamentos indisponíveis no momento.'); e.status=503; throw e; }
  const product=findProduct(productId), isSet=product && product.type==='set', c=config[productId]||{};
  if (!product || (isSet && c.enabled===false)) { const e=new Error('Produto indisponível.'); e.status=404; throw e; }
  const amount=isSet && Number.isInteger(c.price)?c.price:product.price;
  const safeBack=typeof back==='string'&&/^\/[\w\-./?=&%]*$/.test(back)?back:'/game.html';
  const sep=safeBack.includes('?')?'&':'?';
  const f=new URLSearchParams();
  f.set('mode','payment'); f.set('success_url',`${baseUrl}${safeBack}${sep}store=ok`); f.set('cancel_url',`${baseUrl}${safeBack}${sep}store=cancelado`);
  f.set('client_reference_id',String(account.id)); if(account.email) f.set('customer_email',account.email);
  f.set('locale','pt-BR'); f.set('line_items[0][quantity]','1'); f.set('line_items[0][price_data][currency]',CURRENCY);
  f.set('line_items[0][price_data][unit_amount]',String(amount)); f.set('line_items[0][price_data][product_data][name]',product.name);
  f.set('line_items[0][price_data][product_data][description]', product.type==='box'
    ? `MU Idle Legends · pacote com ${product.qty} Boxes Kundun semi-full · resgate por personagem`
    : 'MU Idle Legends · conjunto semi-full de 12 peças · resgate por personagem');
  for(const pre of ['metadata','payment_intent_data[metadata]']) {
    f.set(`${pre}[game]`,'muidle-premium'); f.set(`${pre}[acc]`,String(account.id)); f.set(`${pre}[product]`,product.id); f.set(`${pre}[amt]`,String(amount));
  }
  const r=await fetch((process.env.STRIPE_API||'https://api.stripe.com')+'/v1/checkout/sessions',{method:'POST',
    headers:{Authorization:`Bearer ${KEY()}`,'Content-Type':'application/x-www-form-urlencoded','Idempotency-Key':crypto.randomUUID()},body:f});
  const j=await r.json().catch(()=>({}));
  if(!r.ok||!j.url){const e=new Error('Não foi possível abrir o pagamento.');e.status=502;throw e;}
  return {url:j.url};
}
async function webhook(s) {
  const md=s.metadata||{};
  if(md.game!=='muidle-premium') return 'outro-produto';
  const product=findProduct(md.product), accountId=Number(md.acc), amount=Number(md.amt);
  if(!product||!accountId||!Number.isInteger(amount)||s.currency?.toLowerCase()!==CURRENCY||Number(s.amount_total)!==amount) return 'metadados-invalidos';
  const r=await db.query(`INSERT INTO premium_orders(stripe_ref,account_id,product_id,amount_cents,currency,status)
    VALUES($1,$2,$3,$4,$5,'pending') ON CONFLICT(stripe_ref) DO NOTHING RETURNING id`,[s.id,accountId,product.id,amount,CURRENCY]);
  return r.rows[0]?'entregue':'ja-entregue';
}
async function pending(accountId) {
  return (await db.query(`SELECT id,product_id,amount_cents,created_at FROM premium_orders WHERE account_id=$1 AND status='pending' ORDER BY id DESC LIMIT 30`,[accountId])).rows
   .map(o=>({...o,product:findProduct(o.product_id)?.name||o.product_id}));
}
function itemList(productId) {
  const promo=BOX_PROMOS.find((p)=>p.id===productId);
  if (promo) return Array.from({length:promo.qty},()=>({base:'kundun_promo',rarity:'epic',plus:0}));
  const p=G.PREMIUM_SET_PACKS.find(x=>x.id===productId); if(!p) throw new Error('Produto inválido.');
  const suffix=['helm','armor','pants','gloves','boots','wings','pendant','ring1','ring2','sword','bow','shield'];
  return suffix.map((s)=>({base:`${p.id}_${s}`,rarity:s==='wings'?'epic':'rare',plus:s==='wings'?0:p.plus}));
}
async function claim({accountId,orderId,charId,world}) {
  const claimed=await db.query(`UPDATE premium_orders SET status='claiming' WHERE id=$1 AND account_id=$2 AND status='pending' RETURNING product_id`,[orderId,accountId]);
  if(!claimed.rows[0]) throw new Error('Pedido não encontrado ou já resgatado.');
  try {
    const owns=await db.query('SELECT id FROM characters WHERE id=$1 AND account_id=$2',[charId,accountId]);
    if(!owns.rows[0]) throw new Error('Escolha um personagem da sua conta.');
    const product=findProduct(claimed.rows[0].product_id);
    if (!product) throw new Error('Produto deste pedido não existe mais.');
    await world.adminGiveItems(String(charId),itemList(product.id));
    await db.query(`UPDATE premium_orders SET status='claimed', character_id=$2, claimed_at=now() WHERE id=$1 RETURNING id`,[orderId,charId]);
    return {ok:true,type:product.type,qty:product.qty||null};
  } catch(e) {
    await db.query("UPDATE premium_orders SET status='pending' WHERE id=$1 AND status='claiming' RETURNING id",[orderId]).catch(()=>{});
    throw e;
  }
}
module.exports={init,publicCatalog,saveConfig,checkout,webhook,pending,itemList,BOX_PROMOS};
