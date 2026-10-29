'use strict';
// Drops de materiais (Jewel of Chaos, Loch's Feather, armas do Caos) com tabela configurável,
// eventos temporários, itens no chão com dono e tempo, e histórico. Tudo calculado no servidor.
const db = require('./db');
const G = require('./gamedata');
const SET = require('./settings');

const DEFAULTS = {
  groundSecs: 60,          // tempo que um item fica no chão
  zenDelivery: 'direct',   // 'direct' (vai direto para o saldo) ou 'ground' (aparece no chão)
  fullPolicy: 'ground',    // bolsa cheia: 'ground' (fica no chão para você) ou 'zen' (vendido na hora)
  showRates: false,        // mostrar as chances para os jogadores
  maxEventMult: 5,         // limite dos bônus de eventos
  pickupRange: 30,         // distância para recolher
};
const TIERS = ['any', 'normal', 'elite', 'boss'];
const SCOPES = ['all', 'map', 'monster'];
const CATS = ['jewel', 'wing', 'cape', 'devil', 'castle'];
const TARGETS = ['all', 'jewel', 'wing', 'cape', 'boss', 'devil', 'castle'];

let rules = [];
let events = [];
let H = null;
let gseq = 0;

function cfg() { return SET.get('drops', DEFAULTS); }
const droppable = (k) => G.ITEM_BASES[k] && G.ITEM_BASES[k].slot !== 'wings';
const isStack = (k) => !!(G.ITEM_BASES[k] && G.ITEM_BASES[k].stack);

function normRule(r) {
  return { id: Number(r.id), item: r.item, scope: r.scope, scopeId: r.scope_id || null, tier: r.tier, chance: Number(r.chance),
    qtyMin: Number(r.qty_min), qtyMax: Number(r.qty_max), monMin: Number(r.mon_min_level), monMax: Number(r.mon_max_level),
    playerMin: Number(r.player_min_level), cats: String(r.cats || '').split(',').filter(Boolean), delivery: r.delivery, enabled: !!r.enabled, note: r.note || '' };
}

async function reload() {
  rules = (await db.query('SELECT * FROM drop_rules ORDER BY id')).rows.map(normRule);
  events = (await db.query('SELECT * FROM drop_events WHERE enabled AND ends_at > now() ORDER BY id')).rows.map((e) => ({
    id: Number(e.id), name: e.name, target: e.target, chanceMult: Number(e.chance_mult), qtyMult: Number(e.qty_mult),
    starts: new Date(e.starts_at).getTime(), ends: new Date(e.ends_at).getTime(),
  }));
}

async function init(helpers) {
  H = helpers;
  await SET.load('drops', DEFAULTS);
  try { await reload(); } catch (e) { console.error('[drops] tabela:', e.message); }
  setInterval(() => reload().catch((e) => console.error('[drops]', e.message)), 60 * 1000).unref();
}

const tierOf = (T) => (T.boss ? 'boss' : T.elite ? 'elite' : 'normal');

function matches(r, mType, T, mapId, plevel) {
  if (!r.enabled) return false;
  if (r.tier !== 'any' && r.tier !== tierOf(T)) return false;
  if (T.level < r.monMin || T.level > r.monMax) return false;
  if (plevel < r.playerMin) return false;
  if (r.scope === 'map' && r.scopeId !== mapId) return false;
  if (r.scope === 'monster' && r.scopeId !== mType) return false;
  return true;
}

// bônus de evento: vale o MAIOR que se aplica (nunca multiplica duas vezes)
function boost(r, T, now) {
  let cm = 1, qm = 1;
  const lim = cfg().maxEventMult;
  for (const e of events) {
    if (now < e.starts || now > e.ends) continue;
    const hit = e.target === 'all' || (e.target === 'boss' && T.boss) || r.cats.includes(e.target);
    if (!hit) continue;
    cm = Math.max(cm, e.chanceMult); qm = Math.max(qm, e.qtyMult);
  }
  return { cm: Math.min(cm, lim), qm: Math.min(qm, lim) };
}

const randi = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

// sorteia as regras para um monstro; devolve [{rule, item, qty}]
function roll(mType, T, mapId, plevel, now = Date.now()) {
  const out = [];
  for (const r of rules) {
    if (!matches(r, mType, T, mapId, plevel)) continue;
    const { cm, qm } = boost(r, T, now);
    const ch = Math.min(100, r.chance * cm);
    if (Math.random() * 100 >= ch) continue;
    const qty = Math.max(1, Math.round(randi(r.qtyMin, r.qtyMax) * qm));
    out.push({ rule: r, item: r.item, qty });
  }
  return out;
}

function log(p, item, qty, event, ctx = {}) {
  db.query(`INSERT INTO drop_log (character_id, char_name, item, qty, event, source, map, room, tier) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
    [p ? p.charId : null, p ? p.name : null, item, qty, event, ctx.source || null, ctx.map || null, ctx.room || null, ctx.tier || null])
    .catch((e) => console.error('[drops] log:', e.message));
}

// ---------- itens no chão ----------
function publicGround(e, now = Date.now()) {
  const b = G.ITEM_BASES[e.base] || {};
  return { gid: e.gid, base: e.base, name: e.base === 'zen' ? 'Zen' : b.name, icon: e.base === 'zen' ? 'zen' : b.icon, ic: b.ic || null,
    rarity: e.rarity || b.rarity || 'common', plus: e.plus || 0, qty: e.qty, x: e.x, y: e.y, owner: 'p' + e.owner, ownerName: e.ownerName, ttl: Math.max(0, e.expires - now) };
}

function spawnGround(map, p, entry, x, y) {
  if (!map.ground) map.ground = new Map();
  const e = { gid: 'g' + (++gseq).toString(36), owner: p.charId, ownerName: p.name, expires: Date.now() + cfg().groundSecs * 1000,
    x: Math.round(x + (Math.random() * 24 - 12)), y: Math.round(y + (Math.random() * 12 - 6)), ...entry };
  map.ground.set(e.gid, e);
  const msg = { type: 'gadd', g: publicGround(e) };
  for (const o of map.players.values()) o.send(msg);
  return e;
}

function removeGround(map, gid) {
  const e = map.ground && map.ground.get(gid);
  if (!e) return null;
  map.ground.delete(gid);
  for (const o of map.players.values()) o.send({ type: 'gdel', gid });
  return e;
}

function expire(map, now) {
  if (!map.ground || !map.ground.size) return;
  for (const e of [...map.ground.values()]) {
    if (now < e.expires) continue;
    removeGround(map, e.gid);
    log({ charId: e.owner, name: e.ownerName }, e.base, e.qty, 'expired', { map: map.id, room: map.room, source: e.source });
  }
}

// cabe na bolsa?
function fits(p, e) {
  if (e.base === 'zen') return true;
  if (isStack(e.base) && p.items.some((i) => i.base === e.base && !i.equipped && (Number(i.qty) || 1) < G.MAX_STACK)) return true;
  return H.bagUsed(p) < G.INVENTORY_SIZE;
}

function ownedNear(p, map, range) {
  if (!map.ground || !map.ground.size) return null;
  let best = null, bd = range;
  for (const e of map.ground.values()) {
    if (e.owner !== p.charId) continue;
    const d = Math.hypot(e.x - p.x, e.y - p.y);
    if (d < bd && fits(p, e)) { bd = d; best = e; }
  }
  return best;
}

// recolher: tira do chão na hora (ninguém mais pega) e só então grava; se der erro, volta para o chão
function pickup(world, p, e) {
  const map = p.map;
  if (!removeGround(map, e.gid)) return;
  p.run(async () => {
    try {
      if (e.base === 'zen') {
        p.zen += e.qty; p.dirty = true;
        p.send({ type: 'log', kind: 'zen', text: `+${e.qty.toLocaleString('pt-BR')} Zen` });
      } else if (isStack(e.base)) {
        const got = await world.giveMaterial(p, e.base, e.qty, { src: e.source, silentFull: true });
        if (got < e.qty) { e.qty -= got; map.ground.set(e.gid, e); for (const o of map.players.values()) o.send({ type: 'gadd', g: publicGround(e) }); }
        if (!got) return;
        log(p, e.base, got, 'pickup', { map: map.id, room: map.room, source: e.source, tier: e.tier });
        return;
      } else {
        const row = await world.giveItemRow(p, { base: e.base, rarity: e.rarity, plus: e.plus || 0 }, { src: e.source });
        if (!row) { map.ground.set(e.gid, e); for (const o of map.players.values()) o.send({ type: 'gadd', g: publicGround(e) }); return; }
      }
      log(p, e.base, e.qty, 'pickup', { map: map.id, room: map.room, source: e.source, tier: e.tier });
    } catch (err) {
      console.error('[drops] pickup:', err.message);
      map.ground.set(e.gid, e);
    }
  });
}

// ---------- entrega ----------
const RARITY_ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'ancestral'];

// entrega um resultado de sorteio para o jogador (bolsa ou chão, conforme a regra e a bolsa)
async function deliver(world, p, d, ctx) {
  const b = G.ITEM_BASES[d.item];
  if (!b) return;
  const map = p.map;
  const ground = d.rule.delivery === 'ground' && map && !ctx.offline;
  const lctx = { source: ctx.source, map: ctx.mapId, room: map ? map.room : null, tier: ctx.tier };
  if (isStack(d.item)) {
    if (ground) { spawnGround(map, p, { base: d.item, qty: d.qty, source: ctx.source, tier: ctx.tier }, ctx.x, ctx.y); log(p, d.item, d.qty, 'ground', lctx); return; }
    const got = await world.giveMaterial(p, d.item, d.qty, { src: ctx.source, silent: ctx.offline, x: ctx.x != null ? Math.round(ctx.x) : null, y: ctx.y != null ? Math.round(ctx.y) : null });
    if (got) log(p, d.item, got, 'drop', lctx);
    const left = d.qty - got;
    if (left > 0) overflow(world, p, { base: d.item, qty: left }, ctx, lctx);
    return;
  }
  for (let i = 0; i < d.qty; i++) {
    const it = { base: d.item, rarity: H.rollRarity(ctx.tier === 'boss' ? 'boss' : 'normal'), plus: H.rollPlus(ctx.tier === 'boss' ? 'boss' : 'normal') };
    if (ground) { spawnGround(map, p, { ...it, qty: 1, source: ctx.source, tier: ctx.tier }, ctx.x, ctx.y); log(p, d.item, 1, 'ground', lctx); continue; }
    const row = await world.giveItemRow(p, it, { src: ctx.source, silent: ctx.offline, x: ctx.x != null ? Math.round(ctx.x) : null, y: ctx.y != null ? Math.round(ctx.y) : null });
    if (row) log(p, d.item, 1, 'drop', lctx);
    else overflow(world, p, { ...it, qty: 1 }, ctx, lctx);
  }
}

// bolsa cheia: nada some sem aviso
function overflow(world, p, e, ctx, lctx) {
  const name = G.ITEM_BASES[e.base].name;
  if (cfg().fullPolicy === 'ground' && p.map && !ctx.offline) {
    spawnGround(p.map, p, { ...e, source: ctx.source, tier: ctx.tier }, ctx.x, ctx.y);
    p.send({ type: 'log', kind: 'warn', text: `Bolsa cheia: ${e.qty}× ${name} ficou no chão por ${cfg().groundSecs} segundos.` });
    log(p, e.base, e.qty, 'ground_full', lctx);
  } else {
    const v = H.itemValue({ base: e.base, rarity: e.rarity || G.ITEM_BASES[e.base].rarity || 'common', plus: e.plus || 0, qty: e.qty });
    p.zen += v; p.dirty = true;
    if (!ctx.offline) p.send({ type: 'log', kind: 'zen', text: `Bolsa cheia: ${e.qty}× ${name} vendido por ${v.toLocaleString('pt-BR')} Zen.` });
    log(p, e.base, e.qty, 'sold_full', lctx);
  }
}

// monstro derrotado: sorteia para quem matou (o servidor já validou a morte; cada morte é processada uma vez)
// itens de missão só caem para quem precisa deles agora
function questOk(p, d) { return !G.ITEM_BASES[d.item].quest || require('./classes').needs(p, d.item); }

function onKill(world, p, m, map) {
  const tier = tierOf(m.T);
  const got = roll(m.type, m.T, map.id, p.level).filter((d) => questOk(p, d));
  if (!got.length) return;
  const ctx = { source: m.T.name, mapId: map.id, tier, x: m.x, y: m.y };
  p.run(async () => { for (const d of got) await deliver(world, p, d, ctx); });
}

// progresso offline: só vai para a bolsa (sem chão); cada regra rende no máximo 20 por sessão
function offline(world, p, def, mapId, kills) {
  const found = [];
  if (!kills) return found;
  for (const g of def.groups) {
    const T = G.MONSTERS[g.type];
    const share = kills * (g.count / def.groups.reduce((a, x) => a + x.count, 0));
    for (const r of rules) {
      if (!matches(r, g.type, T, mapId, p.level)) continue;
      const exp = share * Math.min(100, r.chance) / 100 * (0.7 + Math.random() * 0.4);
      let n = Math.floor(exp) + (Math.random() < exp % 1 ? 1 : 0);
      n = Math.min(20, n);
      for (let i = 0; i < n; i++) { const d = { rule: r, item: r.item, qty: randi(r.qtyMin, r.qtyMax) }; if (questOk(p, d)) found.push(d); }
    }
  }
  return found;
}

// ---------- informações para a Chaos Machine ----------
function sources(items) {
  const show = cfg().showRates;
  const out = {};
  for (const k of items) {
    out[k] = rules.filter((r) => r.enabled && r.item === k).map((r) => {
      const who = r.scope === 'monster' ? (G.MONSTERS[r.scopeId] || {}).name || r.scopeId
        : r.scope === 'map' ? (G.WORLD[r.scopeId] || {}).name || r.scopeId
          : r.tier === 'boss' ? 'Bosses' : r.tier === 'elite' ? 'Elites e chefes' : 'Monstros';
      const lv = r.monMin > 0 ? ` (nível ${r.monMin}+)` : '';
      return show ? `${who}${lv}: ${String(r.chance).replace('.', ',')}%` : `${who}${lv}`;
    }).filter((v, i, a) => a.indexOf(v) === i);
  }
  return { show, list: out };
}

// ---------- administração ----------
function sanitizeRule(i) {
  const item = String(i.item || '');
  if (!droppable(item)) throw new Error('Item inválido para drop.');
  const scope = SCOPES.includes(i.scope) ? i.scope : 'all';
  const scopeId = scope === 'all' ? null : String(i.scopeId || '');
  if (scope === 'map' && !G.WORLD[scopeId]) throw new Error('Escolha um mapa válido.');
  if (scope === 'monster' && !G.MONSTERS[scopeId]) throw new Error('Escolha um monstro válido.');
  const tier = TIERS.includes(i.tier) ? i.tier : 'any';
  const chance = Number(String(i.chance).replace(',', '.'));
  if (!(chance > 0 && chance <= 100)) throw new Error('A chance precisa ser maior que 0 e no máximo 100%.');
  const qtyMin = Math.round(Number(i.qtyMin)), qtyMax = Math.round(Number(i.qtyMax));
  if (!(qtyMin >= 1 && qtyMax >= qtyMin && qtyMax <= 100)) throw new Error('Quantidade: mínimo 1, máximo até 100 e o máximo não pode ser menor que o mínimo.');
  if (!isStack(item) && qtyMax > 5) throw new Error('Itens que não empilham: no máximo 5 por drop.');
  const monMin = Math.max(0, Math.round(Number(i.monMin) || 0)), monMax = Math.round(Number(i.monMax ?? 9999));
  if (!(monMax >= monMin)) throw new Error('Nível do monstro: o máximo não pode ser menor que o mínimo.');
  const playerMin = Math.max(0, Math.min(G.LIMITS.maxLevel, Math.round(Number(i.playerMin) || 0)));
  const cats = (Array.isArray(i.cats) ? i.cats : String(i.cats || '').split(',')).map((c) => String(c).trim()).filter((c) => CATS.includes(c));
  return { item, scope, scopeId, tier, chance: Math.round(chance * 100000) / 100000, qtyMin, qtyMax, monMin, monMax: Math.min(9999, monMax), playerMin,
    cats: [...new Set(cats)].join(','), delivery: i.delivery === 'ground' ? 'ground' : 'bag', enabled: i.enabled !== false, note: String(i.note || '').slice(0, 120) };
}

async function saveRule(input) {
  const r = sanitizeRule(input);
  const vals = [r.item, r.scope, r.scopeId, r.tier, r.chance, r.qtyMin, r.qtyMax, r.monMin, r.monMax, r.playerMin, r.cats, r.delivery, r.enabled, r.note];
  if (input.id) {
    const { rows } = await db.query(`UPDATE drop_rules SET item=$2, scope=$3, scope_id=$4, tier=$5, chance=$6, qty_min=$7, qty_max=$8, mon_min_level=$9,
      mon_max_level=$10, player_min_level=$11, cats=$12, delivery=$13, enabled=$14, note=$15, updated_at=now() WHERE id=$1 RETURNING id`, [Number(input.id), ...vals]);
    if (!rows[0]) throw new Error('Regra não encontrada.');
  } else {
    await db.query(`INSERT INTO drop_rules (item, scope, scope_id, tier, chance, qty_min, qty_max, mon_min_level, mon_max_level, player_min_level, cats, delivery, enabled, note)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id`, vals);
  }
  await reload();
}

async function deleteRule(id) {
  await db.query('DELETE FROM drop_rules WHERE id = $1 RETURNING id', [Number(id)]);
  await reload();
}

async function saveConfig(i) {
  const c = {
    groundSecs: Math.round(Number(i.groundSecs)), zenDelivery: i.zenDelivery === 'ground' ? 'ground' : 'direct',
    fullPolicy: i.fullPolicy === 'zen' ? 'zen' : 'ground', showRates: !!i.showRates,
    maxEventMult: Number(i.maxEventMult), pickupRange: Math.round(Number(i.pickupRange)),
  };
  if (!(c.groundSecs >= 10 && c.groundSecs <= 600)) throw new Error('Tempo no chão: de 10 a 600 segundos.');
  if (!(c.maxEventMult >= 1 && c.maxEventMult <= 10)) throw new Error('Limite dos eventos: de 1 a 10.');
  if (!(c.pickupRange >= 10 && c.pickupRange <= 120)) throw new Error('Distância para recolher: de 10 a 120.');
  await SET.save('drops', c);
  return c;
}

async function saveEvent(i) {
  const name = String(i.name || '').trim().slice(0, 60);
  if (!name) throw new Error('Dê um nome ao evento.');
  const target = TARGETS.includes(i.target) ? i.target : 'all';
  const cm = Number(i.chanceMult), qm = Number(i.qtyMult ?? 1);
  const lim = cfg().maxEventMult;
  if (!(cm >= 1 && cm <= lim)) throw new Error(`Bônus de chance: de 1 a ${lim}×.`);
  if (!(qm >= 1 && qm <= Math.min(5, lim))) throw new Error(`Bônus de quantidade: de 1 a ${Math.min(5, lim)}×.`);
  const hours = Number(i.hours);
  if (!(hours > 0 && hours <= 24 * 30)) throw new Error('Duração: de 1 hora a 30 dias.');
  await db.query(`INSERT INTO drop_events (name, target, chance_mult, qty_mult, starts_at, ends_at) VALUES ($1,$2,$3,$4, now(), now() + ($5 || ' hours')::interval) RETURNING id`,
    [name, target, cm, qm, String(hours)]);
  await reload();
}

async function stopEvent(id) {
  await db.query('UPDATE drop_events SET enabled = FALSE WHERE id = $1 RETURNING id', [Number(id)]);
  await reload();
}

async function history(limit = 100, name = '') {
  const { rows } = await db.query(`SELECT id, char_name, item, qty, event, source, map, room, tier, created_at FROM drop_log
    WHERE ($1 = '' OR lower(char_name) = lower($1)) ORDER BY id DESC LIMIT $2`, [String(name || ''), Math.min(300, Math.max(1, limit))]);
  return rows;
}

// teste da tabela sem entregar nada
function simulate(mType, mapId, n, plevel, withEvents) {
  const T = G.MONSTERS[mType];
  if (!T) throw new Error('Monstro desconhecido.');
  n = Math.max(1, Math.min(200000, Math.round(Number(n) || 1000)));
  plevel = Math.max(1, Math.min(G.LIMITS.maxLevel, Math.round(Number(plevel) || T.level)));
  const saved = events;
  if (!withEvents) events = [];
  const tot = {};
  try {
    for (let i = 0; i < n; i++) for (const d of roll(mType, T, mapId, plevel)) tot[d.item] = (tot[d.item] || 0) + d.qty;
  } finally { events = saved; }
  return { monster: T.name, tier: tierOf(T), level: T.level, kills: n, playerLevel: plevel,
    items: Object.entries(tot).map(([k, q]) => ({ item: k, name: G.ITEM_BASES[k].name, qty: q, perKill: q / n, everyKills: q ? Math.round(n / q) : null })) };
}

function adminView() {
  return {
    config: cfg(), rules, events: events.map((e) => ({ ...e, starts: new Date(e.starts).toISOString(), ends: new Date(e.ends).toISOString() })),
    items: Object.keys(G.ITEM_BASES).filter(droppable).map((k) => ({ id: k, name: G.ITEM_BASES[k].name, slot: G.ITEM_BASES[k].slot, special: !!G.ITEM_BASES[k].special })),
    maps: Object.entries(G.WORLD).map(([id, w]) => ({ id, name: w.name, minLevel: w.minLevel, monsters: [...w.groups.map((g) => g.type), ...(w.boss ? [w.boss.type] : [])] })),
    monsters: Object.entries(G.MONSTERS).map(([id, m]) => ({ id, name: m.name, level: m.level, tier: tierOf(m), maps: Object.entries(G.WORLD).filter(([, w]) => w.groups.some((g) => g.type === id) || (w.boss && w.boss.type === id)).map(([mid]) => mid) })),
    tiers: TIERS, scopes: SCOPES, cats: CATS, targets: TARGETS,
  };
}

module.exports = { init, cfg, onKill, offline, deliver, spawnGround, removeGround, publicGround, expire, ownedNear, pickup, fits,
  sources, saveRule, deleteRule, saveConfig, saveEvent, stopEvent, history, simulate, adminView, reload, tierOf };
