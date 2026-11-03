'use strict';
// Mercado entre jogadores (em Zen):
//  anunciar → o item sai da bolsa e fica guardado no anúncio (48 h)
//  comprar → o comprador paga o preço; o vendedor recebe o preço menos 10% de taxa (o Zen da taxa sai do jogo)
//  o Zen da venda e os itens cancelados/expirados ficam para o vendedor coletar (funciona mesmo com ele offline).
const db = require('./db');
const G = require('./gamedata');

const FEE = 0.10;
const MAX_ACTIVE = 10;
const MAX_PRICE = 2000000000;
const DURATION_H = 48;
const PAGE = 30;
let W = null, H = null;

function init(world, helpers) {
  W = world; H = helpers;
  // anúncios vencidos voltam para o vendedor coletar
  setInterval(() => {
    db.query("UPDATE market_listings SET status = 'expired', closed_at = now() WHERE status = 'active' AND expires_at < now()").catch((e) => console.error('[mercado] expirar', e.message));
  }, 60000).unref();
}

const nameOf = (base) => (G.ITEM_BASES[base] || {}).name || base;
const fmt = (n) => Math.round(n).toLocaleString('pt-BR');
const feeOf = (price) => Math.floor(price * FEE);
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
  return { id: String(r.id), item: it, price: Number(r.price), fee: Number(r.fee) || feeOf(Number(r.price)), seller: r.seller_name, sellerId: String(r.seller_char),
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
    if (!bases.length) return p.send({ type: 'market', view: 'browse', rows: [], page, more: false, fee: FEE });
  }
  const args = [PAGE + 1, page * PAGE];
  let where = "status = 'active' AND expires_at > now()";
  if (bases) { args.push(bases.join(',')); where += ` AND base = ANY(string_to_array($${args.length}, ','))`; }
  if (msg.rarity && /^[a-z]+$/.test(String(msg.rarity))) { args.push(String(msg.rarity)); where += ` AND rarity = $${args.length}`; }
  const { rows } = await db.query(`SELECT * FROM market_listings WHERE ${where} ORDER BY ${sort} LIMIT $1 OFFSET $2`, args);
  p.send({ type: 'market', view: 'browse', rows: rows.slice(0, PAGE).map(view), page, more: rows.length > PAGE, fee: FEE, myZen: p.zen });
}

async function mine(p) {
  const { rows } = await db.query(`SELECT * FROM market_listings WHERE seller_char = $1 AND (status = 'active' OR NOT collected OR closed_at > now() - interval '3 days')
    ORDER BY (status = 'active') DESC, (NOT collected AND status <> 'active') DESC, id DESC LIMIT 60`, [p.charId]);
  p.send({ type: 'market', view: 'mine', rows: rows.map(view), fee: FEE, max: MAX_ACTIVE, hours: DURATION_H, myZen: p.zen });
}

async function list(world, p, msg) {
  const say = (t) => p.send({ type: 'marketMsg', ok: false, text: t });
  const it = p.items.find((i) => String(i.id) === String(msg.item));
  if (!it) return say('Este item não está na sua bolsa.');
  const why = sellable(it); if (why) return say(why);
  const price = Math.floor(Number(msg.price));
  if (!Number.isFinite(price) || price < 1) return say('Coloque um preço em Zen.');
  if (price > MAX_PRICE) return say(`O preço máximo é ${fmt(MAX_PRICE)} Zen.`);
  const have = Number(it.qty) || 1;
  const qty = G.ITEM_BASES[it.base].stack ? Math.floor(Number(msg.qty) || have) : 1;
  if (!(qty >= 1 && qty <= have)) return say(`Quantidade inválida (você tem ${fmt(have)}).`);
  const active = (await db.query("SELECT count(*)::int AS n FROM market_listings WHERE seller_char = $1 AND status = 'active'", [p.charId])).rows[0].n;
  if (active >= MAX_ACTIVE) return say(`No máximo ${MAX_ACTIVE} anúncios ativos ao mesmo tempo.`);
  const whole = qty === have;
  let row;
  try {
    row = await db.tx(async (q) => {
      const u = whole
        ? await q('DELETE FROM items WHERE id = $1 AND character_id = $2 AND qty = $3 AND equipped = FALSE AND locked = FALSE AND vault_no IS NULL RETURNING id', [it.id, p.charId, have])
        : await q('UPDATE items SET qty = qty - $3 WHERE id = $1 AND character_id = $2 AND qty = $4 AND vault_no IS NULL RETURNING id', [it.id, p.charId, qty, have]);
      if (!u.rows[0]) throw new Error('item mudou');
      const r = await q(`INSERT INTO market_listings (seller_char, seller_name, base, rarity, plus, qty, excellent_options, price, fee, expires_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, now() + ($10 || ' hours')::interval) RETURNING *`,
        [p.charId, p.name, it.base, it.rarity || 'common', it.plus || 0, qty, JSON.stringify(it.excellent_options || []), price, feeOf(price), String(DURATION_H)]);
      return r.rows[0];
    });
  } catch (e) {
    console.error('[mercado] anunciar', p.name, e.message);
    return say('Não foi possível anunciar (o item mudou). Tente de novo.');
  }
  if (whole) p.items = p.items.filter((i) => i !== it); else it.qty = have - qty;
  p.dirty = true;
  p.send(p.charState());
  p.send({ type: 'marketMsg', ok: true, text: `${qty > 1 ? qty + '× ' : ''}${nameOf(it.base)}${it.plus ? ' +' + it.plus : ''} anunciado por ${fmt(price)} Zen. Você recebe ${fmt(price - feeOf(price))} Zen quando vender.` });
  return mine(p);
}

async function buy(world, p, msg) {
  const say = (t) => p.send({ type: 'marketMsg', ok: false, text: t });
  const id = Math.floor(Number(msg.id));
  if (!Number.isFinite(id)) return say('Anúncio inválido.');
  const r = (await db.query('SELECT * FROM market_listings WHERE id = $1', [id])).rows[0];
  if (!r || r.status !== 'active' || new Date(r.expires_at).getTime() < Date.now()) return say('Este anúncio não está mais à venda.');
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
        WHERE id = $1 AND status = 'active' AND expires_at > now() RETURNING id`, [id, p.charId, p.name]);
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
  if (!u.rows[0]) p.send({ type: 'marketMsg', ok: false, text: 'Este anúncio não está mais ativo.' });
  else p.send({ type: 'marketMsg', ok: true, text: 'Anúncio cancelado. Colete o item em "Minhas vendas".' });
  return collect(world, p, { id }, true);
}

// recebe o Zen das vendas e os itens que voltaram (cancelados/expirados)
async function collect(world, p, msg, quiet) {
  const say = (t, ok) => p.send({ type: 'marketMsg', ok: !!ok, text: t });
  const one = msg && msg.id ? Math.floor(Number(msg.id)) : null;
  const { rows } = await db.query(`SELECT * FROM market_listings WHERE seller_char = $1 AND status <> 'active' AND NOT collected ${one ? 'AND id = $2' : ''} ORDER BY id`,
    one ? [p.charId, one] : [p.charId]);
  if (!rows.length) { if (!quiet) say('Não há nada para coletar.'); return mine(p); }
  let zen = 0; const got = []; let full = false;
  for (const r of rows) {
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

module.exports = { init, act, stats, FEE };
