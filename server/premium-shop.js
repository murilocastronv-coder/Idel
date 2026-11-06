'use strict';
// Loja de conjuntos sazonais com checkout BRL e resgate seguro após pagamento.
const crypto = require('crypto');
const db = require('./db');
const G = require('./gamedata');
const UPG = require('./upgrade');
const CHAOS = require('./chaos');
const KEY = () => process.env.STRIPE_SECRET_KEY || '';
const CURRENCY = 'brl';
const RESET_STATUS = require('./reset-status');
// Montaria do Shopping Cash: Fenrir Dourado +11 semi-full (3 opções fixas, iguais em toda compra)
const FENRIR = { id:'fenrir-gold', name:'Fenrir Dourado +11 · Semi Full', price:6000, qty:1, tone:'#ffd36b', type:'mount', base:'fenrir_gold', plus:11 };
const FENRIR_OPTS = [
  { id:'excellent_damage', value:7 },
  { id:'damage_reduction', value:3 },
  { id:'max_hp', value:60 },
];
// Códigos promocionais: cada código vale só para o produto indicado. "promo 2026", "PROMO-2026" etc. viram PROMO2026.
const PROMO_CODES = { PROMO2026: { product: FENRIR.id, pct: 40 } };
const normCode = (code) => String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 32);
// devolve { code, pct, price } com o preço já descontado, ou lança erro com mensagem para o jogador
function applyPromo(productId, code, basePrice) {
  const k = normCode(code);
  if (!k) return null;
  const P = PROMO_CODES[k];
  if (!P) { const e = new Error('Código promocional inválido.'); e.status = 400; throw e; }
  if (P.product !== productId) { const e = new Error(`O código ${k} vale só para o ${FENRIR.name.split(' +')[0]}.`); e.status = 400; throw e; }
  return { code: k, pct: P.pct, price: Math.max(100, Math.round(basePrice * (100 - P.pct) / 100)) };
}
const STAT_RESET ={ id:'stat-reset', name:'Reset de atributos', price:500, qty:1, tone:'#e8b84a', type:'reset' };
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
  return BOX_PROMOS.find((p) => p.id === id) || (id === FENRIR.id ? FENRIR : null) || (id === STAT_RESET.id ? STAT_RESET : null);
}

function setAttributes(pack) {
  const id = pack.id, plus = pack.plus;
  const scaled = (suffix, field, rarity = 'rare') => {
    const baseId = `${id}_${suffix}`, b = G.ITEM_BASES[baseId] || {}, value = b[field];
    const m = (G.RARITY_MULT[rarity] || 1) * UPG.mult(baseId, suffix === 'wings' ? 0 : plus);
    return Array.isArray(value) ? value.map((x) => Math.round(x * m)) : Math.round((Number(value) || 0) * m);
  };
  const defense = ['helm','armor','pants','gloves','boots'].reduce((sum, slot) => sum + scaled(slot, 'def'), 0);
  const sword = scaled('sword', 'dmg');
  const bow = scaled('bow', 'dmg');
  const accessoryHp = ['ring1','ring2','pendant'].reduce((sum, slot) => sum + scaled(slot, 'hp'), 0);
  const wing = G.ITEM_BASES[`${id}_wings`] || {}, wingScale = (CHAOS.cfg().rarityAttributes || {}).epic || { def:100, wdmg:100, absorb:100 };
  const wingDef = Math.round((wing.def || 0) * wingScale.def / 100), wingDmg = Math.round((wing.wdmg || 0) * wingScale.wdmg / 100), wingAbsorb = Math.round((wing.absorb || 0) * wingScale.absorb / 100);
  return {
    'Defesa total (5 peças)': defense,
    'Dano da espada': `${sword[0]}–${sword[1]}`,
    'Dano do arco': `${bow[0]}–${bow[1]}`,
    'Defesa do escudo': scaled('shield','def'),
    'Vida dos acessórios': accessoryHp,
    'Asas (defesa / dano / absorção)': `${wingDef} / ${wingDmg} / ${wingAbsorb}%`,
  };
}

function fenrirOptions() {
  const defs = require('./excellent').adminView().definitions || {};
  return FENRIR_OPTS.map((o) => { const d = defs[o.id] || {}; return { id:o.id, name:d.name || o.id, value:o.value, unit:d.unit || '', effect:d.effect }; });
}
function fenrirAttributes() {
  const b = G.ITEM_BASES.fenrir_gold, m = (G.RARITY_MULT.legendary || 1) * UPG.mult('fenrir_gold', FENRIR.plus);
  const out = { 'Defesa (+11)': Math.round(b.def * m), 'Vida (+11)': Math.round(b.hp * m), 'Velocidade de movimento': '+' + Math.round(b.speed * 100) + '%' };
  for (const o of fenrirOptions()) out[o.name] = '+' + o.value + o.unit;
  return out;
}
function publicCatalog(admin = false) {
  const sets = G.PREMIUM_SET_PACKS.map((p) => {
    const c = config[p.id] || {};
    return { id:p.id, name:p.name, price:Number.isInteger(c.price)?c.price:p.price, enabled:c.enabled !== false,
      req:p.req, plus:p.plus, tier:p.tier, tone:p.tone, pieces:12, type:'set', attributes:setAttributes(p), excellentOptions:'2–4 opções Excellent semi-full por peça', admin };
  });
  const boxes = BOX_PROMOS.map((p) => ({ ...p, enabled:true, pieces:p.qty, req:1, plus:0, admin }));
  const c = config[FENRIR.id] || {};
  const fenrir = { ...FENRIR, price:Number.isInteger(c.price)?c.price:FENRIR.price, enabled:c.enabled !== false, pieces:1, req:1, admin,
    attributes:fenrirAttributes(), excellentOptions:'3 opções Excellent fixas (semi-full)' };
  return [fenrir].concat(sets, boxes, [{ ...STAT_RESET, enabled:true, pieces:1, req:1, plus:0, admin }]);
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
  let previousPrice = 0;
  for (const p of G.PREMIUM_SET_PACKS) {
    if (next[p.id].price <= previousPrice) throw new Error('A loja deve manter preços crescentes: conjuntos mais caros precisam ter atributos melhores.');
    previousPrice = next[p.id].price;
  }
  await db.query(`INSERT INTO game_settings(key,value,updated_at) VALUES('premium_sets',$1::jsonb,now())
    ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=now()`, [JSON.stringify(next)]);
  config = next;
  return publicCatalog(true);
}
function promoQuote(productId, code) {
  const product = findProduct(productId);
  if (!product) { const e = new Error('Produto indisponível.'); e.status = 404; throw e; }
  const c = config[productId] || {}, base = Number.isInteger(c.price) ? c.price : product.price;
  const p = applyPromo(product.id, code, base);
  if (!p) { const e = new Error('Digite um código promocional.'); e.status = 400; throw e; }
  return { product: product.id, code: p.code, pct: p.pct, oldPrice: base, price: p.price };
}
async function checkout({account, productId, baseUrl, back, charId, promo}) {
  if (!KEY() || !process.env.STRIPE_WEBHOOK_SECRET) { const e = new Error('Pagamentos indisponíveis no momento.'); e.status=503; throw e; }
  const product=findProduct(productId), isSet=product && product.type==='set', c=config[productId]||{};
  if (!product || (isSet && c.enabled===false)) { const e=new Error('Produto indisponível.'); e.status=404; throw e; }
  let resetCharacterId = null;
  if (product.type === 'reset') {
    resetCharacterId = Math.round(Number(charId));
    if (!Number.isSafeInteger(resetCharacterId) || resetCharacterId < 1) { const e=new Error('Escolha o personagem que receberá o reset.'); e.status=400; throw e; }
    const owned = await db.query('SELECT free_stat_reset_used,class,str,agi,vit,ene,cmd FROM characters WHERE id=$1 AND account_id=$2', [resetCharacterId, account.id]);
    if (!owned.rows[0]) { const e=new Error('Esse personagem não pertence à sua conta.'); e.status=403; throw e; }
    if (!owned.rows[0].free_stat_reset_used) { const e=new Error('O primeiro reset de atributos é grátis. Use-o no painel Herói antes de comprar outro.'); e.status=400; throw e; }
    const base = G.CLASSES[owned.rows[0].class].base;
    const keys = ['str','agi','vit','ene'].concat(owned.rows[0].class === 'dark_lord' ? ['cmd'] : []);
    if (!keys.some((key) => Number(owned.rows[0][key] || 0) > Number(base[key] || 0))) { const e=new Error('Não há pontos distribuídos para resetar.'); e.status=400; throw e; }
  }
  const fullPrice=(isSet || product.type==='mount') && Number.isInteger(c.price)?c.price:product.price;
  const promoApplied=applyPromo(product.id, promo, fullPrice);
  const amount=promoApplied?promoApplied.price:fullPrice;
  const safeBack=typeof back==='string'&&/^\/[\w\-./?=&%]*$/.test(back)?back:'/game.html';
  const sep=safeBack.includes('?')?'&':'?';
  const f=new URLSearchParams();
  f.set('mode','payment'); f.set('success_url',`${baseUrl}${safeBack}${sep}store=ok`); f.set('cancel_url',`${baseUrl}${safeBack}${sep}store=cancelado`);
  f.set('client_reference_id',String(account.id)); if(account.email) f.set('customer_email',account.email);
  f.set('locale','pt-BR'); f.set('line_items[0][quantity]','1'); f.set('line_items[0][price_data][currency]',CURRENCY);
  f.set('line_items[0][price_data][unit_amount]',String(amount)); f.set('line_items[0][price_data][product_data][name]',product.name + (promoApplied ? ` · ${promoApplied.code} (-${promoApplied.pct}%)` : ''));
  f.set('line_items[0][price_data][product_data][description]', product.type==='reset'
    ? 'MuonlineClaude · um reset de atributos para o personagem escolhido'
    : product.type==='mount'
      ? 'MuonlineClaude · montaria Fenrir Dourado +11 semi-full · resgate por personagem'
      : product.type==='box'
      ? `MuonlineClaude · pacote com ${product.qty} Boxes Kundun semi-full · resgate por personagem`
      : 'MuonlineClaude · conjunto semi-full de 12 peças · resgate por personagem');
  let buyerCharId = resetCharacterId;
  if (!buyerCharId && /^\d{1,18}$/.test(String(charId || ''))) {
    const own = await db.query('SELECT id FROM characters WHERE id=$1 AND account_id=$2', [String(charId), account.id]);
    if (own.rows[0]) buyerCharId = Number(own.rows[0].id);
  }
  for(const pre of ['metadata','payment_intent_data[metadata]']) {
    f.set(`${pre}[game]`,'muidle-premium'); f.set(`${pre}[acc]`,String(account.id)); f.set(`${pre}[product]`,product.id); f.set(`${pre}[amt]`,String(amount));
    if (buyerCharId) f.set(`${pre}[char]`, String(buyerCharId));
    if (promoApplied) f.set(`${pre}[promo]`, promoApplied.code);
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
  const resetCharacterId = product.type === 'reset' ? Math.round(Number(md.char)) : null;
  if (product.type === 'reset') {
    if (!Number.isSafeInteger(resetCharacterId) || resetCharacterId < 1) return 'metadados-invalidos';
    const owned = await db.query('SELECT id FROM characters WHERE id=$1 AND account_id=$2',[resetCharacterId,accountId]);
    if (!owned.rows[0]) return 'metadados-invalidos';
  }
  let charId = resetCharacterId;
  if (!charId && /^\d{1,18}$/.test(String(md.char || ''))) {
    const own = await db.query('SELECT id FROM characters WHERE id=$1 AND account_id=$2',[String(md.char),accountId]);
    if (own.rows[0]) charId = Number(own.rows[0].id);
  }
  const r=await db.query(`INSERT INTO premium_orders(stripe_ref,account_id,product_id,amount_cents,currency,status,character_id)
    VALUES($1,$2,$3,$4,$5,'pending',$6) ON CONFLICT(stripe_ref) DO NOTHING RETURNING id`,[s.id,accountId,product.id,amount,CURRENCY,charId]);
  if (r.rows[0] && WORLD) deliverOrder(r.rows[0].id).catch((e) => console.error('[premium-store] entrega automática:', e.message));
  return r.rows[0]?'entregue':'ja-entregue';
}
async function pending(accountId) {
  return (await db.query(`SELECT id,product_id,amount_cents,created_at FROM premium_orders WHERE account_id=$1 AND status='pending' ORDER BY id DESC LIMIT 30`,[accountId])).rows
   .map(o=>({...o,product:findProduct(o.product_id)?.name||o.product_id}));
}
function itemList(productId) {
  const promo=BOX_PROMOS.find((p)=>p.id===productId);
  if (promo) return Array.from({length:promo.qty},()=>({base:'kundun_promo',rarity:'epic',plus:0}));
  if (productId === FENRIR.id) return [{ base:FENRIR.base, rarity:'legendary', plus:FENRIR.plus, options:fenrirOptions() }];
  const p=G.PREMIUM_SET_PACKS.find(x=>x.id===productId); if(!p) throw new Error('Produto inválido.');
  const suffix=['helm','armor','pants','gloves','boots','wings','pendant','ring1','ring2','sword','bow','shield'];
  return suffix.map((s)=>({base:`${p.id}_${s}`,rarity:s==='wings'?'epic':'rare',plus:s==='wings'?0:p.plus}));
}
async function claim({accountId,orderId,charId,world}) {
  const claimed=await db.query(`UPDATE premium_orders SET status='claiming' WHERE id=$1 AND account_id=$2 AND status='pending' RETURNING product_id,character_id`,[orderId,accountId]);
  if(!claimed.rows[0]) throw new Error('Pedido não encontrado ou já resgatado.');
  try {
    const owns=await db.query('SELECT id FROM characters WHERE id=$1 AND account_id=$2',[charId,accountId]);
    if(!owns.rows[0]) throw new Error('Escolha um personagem da sua conta.');
    const product=findProduct(claimed.rows[0].product_id);
    if (!product) throw new Error('Produto deste pedido não existe mais.');
    if (product.type === 'reset') {
      if (String(claimed.rows[0].character_id) !== String(charId)) throw new Error('Este reset foi comprado para outro personagem.');
      await RESET_STATUS.paid(world, String(charId));
    } else await world.adminGiveItems(String(charId),itemList(product.id),{excellent:true});
    await db.query(`UPDATE premium_orders SET status='claimed', character_id=$2, claimed_at=now() WHERE id=$1 RETURNING id`,[orderId,charId]);
    return {ok:true,type:product.type,qty:product.qty||null};
  } catch(e) {
    await db.query("UPDATE premium_orders SET status='pending' WHERE id=$1 AND status='claiming' RETURNING id",[orderId]).catch(()=>{});
    throw e;
  }
}
// ---------------- entrega automática ----------------
// Todo pedido pago vai sozinho para o personagem que comprou (ou o último jogado da conta).
// Se a bolsa estiver cheia, o pedido continua pendente e é entregue de novo a cada poucos minutos / ao entrar no jogo.
let WORLD = null;
const failNote = new Map();
async function deliverOrder(orderId) {
  const o = (await db.query(`SELECT id, account_id, product_id, character_id FROM premium_orders WHERE id=$1 AND status='pending'`, [orderId])).rows[0];
  if (!o || !WORLD) return null;
  let charId = o.character_id;
  if (charId) { const own = await db.query('SELECT id FROM characters WHERE id=$1 AND account_id=$2', [charId, o.account_id]); if (!own.rows[0]) charId = null; }
  if (!charId) {
    const last = (await db.query('SELECT id FROM characters WHERE account_id=$1 ORDER BY last_seen_at DESC NULLS LAST, id DESC LIMIT 1', [o.account_id])).rows[0];
    if (!last) return null;
    charId = last.id;
  }
  const product = findProduct(o.product_id);
  try {
    await claim({ accountId: o.account_id, orderId: o.id, charId: String(charId), world: WORLD });
    console.log(`[premium-store] pedido #${o.id} (${o.product_id}) entregue automaticamente ao personagem ${charId}`);
    const name = product ? product.name : o.product_id;
    for (const p of WORLD.players.values()) if (String(p.accountId) === String(o.account_id)) p.send({ type: 'log', kind: 'quest', text: `🎁 Sua compra "${name}" foi entregue${String(p.id) === String(charId) ? ' na sua bolsa' : ' ao seu personagem'}!` });
    failNote.delete(o.id);
    return true;
  } catch (e) {
    if (failNote.get(o.id) !== e.message) {
      failNote.set(o.id, e.message);
      console.warn(`[premium-store] pedido #${o.id} ainda não entregue: ${e.message}`);
      for (const p of WORLD.players.values()) if (String(p.id) === String(charId)) p.send({ type: 'log', kind: 'warn', text: `Sua compra "${product ? product.name : o.product_id}" está esperando: ${e.message} Libere espaço que ela chega sozinha.` });
    }
    return false;
  }
}
async function deliverPending(accountId) {
  const rows = (await db.query(`SELECT id FROM premium_orders WHERE status='pending'${accountId ? ' AND account_id=$1' : ''} ORDER BY id LIMIT 50`, accountId ? [accountId] : [])).rows;
  for (const r of rows) await deliverOrder(r.id).catch((e) => console.error('[premium-store] entrega:', e.message));
}
function startAutoDelivery(world) {
  WORLD = world;
  // pedidos que ficaram pendentes (inclusive os antigos) e travas de "claiming" esquecidas por queda do servidor
  db.query(`UPDATE premium_orders SET status='pending' WHERE status='claiming'`).catch(() => {});
  setTimeout(() => deliverPending().catch(() => {}), 5000);
  setInterval(() => deliverPending().catch(() => {}), 3 * 60 * 1000).unref();
}
module.exports={init,publicCatalog,saveConfig,checkout,promoQuote,webhook,pending,itemList,BOX_PROMOS,startAutoDelivery,deliverPending};
