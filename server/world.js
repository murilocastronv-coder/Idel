'use strict';
// MU Idle Legends — mundo em tempo real. O servidor é a autoridade de movimento,
// combate, EXP, Zen, drops e inventário. O navegador só envia intenções.
const db = require('./db');
const G = require('./gamedata');

const TICK_MS = 100;
const SAVE_EVERY_MS = 20000;
const PLAYER_SPEED = 80;           // px por segundo
const OFFLINE_CAP_S = 8 * 3600;    // limite de progresso offline
const RESPAWN_MS = 4000;
const MONSTER_RESPAWN_MS = 9000;
const POTION_CD_MS = 1200;
const RARITY_ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'ancestral'];
const DEFAULT_SETTINGS = { potHp: 0.5, potMp: 0.3, autoStats: true, returnToFarm: true, lootMin: 'common', skills: {} };

const rand = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(rand(a, b + 1));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function expToNext(level) { return Math.floor(60 * Math.pow(level, 1.7) + 40); }

// ------------------------------------------------------------------ itens
function itemStats(it) {
  const b = G.ITEM_BASES[it.base];
  if (!b) return {};
  const m = (G.RARITY_MULT[it.rarity] || 1) * (1 + (it.plus || 0) * 0.06);
  const out = {};
  if (b.dmg) out.dmg = [Math.round(b.dmg[0] * m), Math.round(b.dmg[1] * m)];
  if (b.def) out.def = Math.round(b.def * m);
  if (b.hp) out.hp = Math.round(b.hp * m);
  return out;
}
function itemScore(it) {
  const s = itemStats(it);
  return (s.dmg ? (s.dmg[0] + s.dmg[1]) : 0) + (s.def || 0) * 2 + (s.hp || 0) / 4;
}
function itemValue(it) {
  const b = G.ITEM_BASES[it.base];
  return Math.round((20 + (b ? b.req : 1) * 12) * (RARITY_ORDER.indexOf(it.rarity) + 1) * (1 + (it.plus || 0) * 0.2));
}
function canUse(p, it) {
  const b = G.ITEM_BASES[it.base];
  if (!b) return 'Item desconhecido.';
  if (p.level < b.req) return `Requer nível ${b.req}.`;
  if (b.slot === 'weapon' && !G.CLASS_WEAPONS[p.cls].includes(b.kind)) return 'Sua classe não usa esta arma.';
  return null;
}
function rollRarity(table) {
  const w = G.RARITY_WEIGHTS[table];
  const total = Object.values(w).reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (const k of RARITY_ORDER) { r -= w[k]; if (r <= 0) return k; }
  return 'common';
}
function rollItem(level, table) {
  let pool = Object.entries(G.ITEM_BASES).filter(([, b]) => b.req <= level + 3 && b.req >= level - 16);
  if (!pool.length) pool = Object.entries(G.ITEM_BASES).filter(([, b]) => b.req <= Math.max(1, level + 3));
  const [base] = pool[Math.floor(Math.random() * pool.length)];
  return { base, rarity: rollRarity(table), plus: Math.random() < 0.15 ? randi(1, 3) : 0 };
}
function publicItem(it) {
  const b = G.ITEM_BASES[it.base] || {};
  return { id: String(it.id), base: it.base, name: b.name, slot: b.slot, icon: b.icon, kind: b.kind, req: b.req, set: b.set,
    rarity: it.rarity, plus: it.plus, equipped: !!it.equipped, stats: itemStats(it), value: itemValue(it) };
}

// ------------------------------------------------------------------ jogador
class Player {
  constructor(row, client, items) {
    this.client = client;
    this.accountId = String(row.account_id);
    this.charId = String(row.id);
    this.id = 'p' + this.charId;
    this.name = row.name;
    this.cls = row.class;
    this.ap = row.appearance || {};
    this.level = row.level;
    this.resets = row.resets;
    this.exp = Number(row.exp);
    this.zen = Number(row.zen);
    this.stats = { str: row.str, agi: row.agi, vit: row.vit, ene: row.ene, cmd: row.cmd };
    this.free = row.free_points;
    this.pots = { hp: row.pot_hp, mp: row.pot_mp };
    this.settings = { ...DEFAULT_SETTINGS, ...(row.settings || {}) };
    this.kills = Number(row.kills);
    this.deaths = row.deaths;
    this.bossesKilled = row.bosses_killed;
    this.lastFarm = row.last_farm_map;
    this.auto = !!row.auto_on;
    this.items = items;
    this.map = null;
    this.x = 0; this.y = 0; this.flip = false;
    this.cds = {};
    this.nextAtk = 0; this.nextPot = 0;
    this.target = null; this.moveTo = null;
    this.dead = false; this.respawnAt = 0; this.returnAt = 0;
    this.queue = Promise.resolve();
    this.dirty = false;
    this.lastSave = Date.now();
    this.recalc();
    this.hp = row.hp > 0 ? Math.min(row.hp, this.maxHp) : this.maxHp;
    this.mp = row.mp > 0 ? Math.min(row.mp, this.maxMp) : this.maxMp;
  }
  equipped() { return this.items.filter((i) => i.equipped); }
  recalc() {
    const s = this.stats, c = this.cls, lv = this.level;
    const eq = this.equipped();
    let wdmg = [1, 2], def = 0, hpBonus = 0;
    const setCount = {};
    for (const it of eq) {
      const st = itemStats(it);
      if (st.dmg) wdmg = st.dmg;
      def += st.def || 0;
      hpBonus += st.hp || 0;
      const b = G.ITEM_BASES[it.base];
      if (b && b.set) setCount[b.set] = (setCount[b.set] || 0) + 1;
    }
    const fullSet = Object.values(setCount).some((n) => n >= 4);
    let base;
    switch (c) {
      case 'dark_knight': base = [s.str / 6, s.str / 4]; break;
      case 'dark_wizard': base = [s.ene / 6, s.ene / 4]; break;
      case 'fairy_elf': base = [(s.str + s.agi) / 10, (s.str + s.agi) / 7]; break;
      case 'magic_gladiator': base = [s.str / 8 + s.ene / 10, s.str / 6 + s.ene / 8]; break;
      case 'dark_lord': base = [s.str / 7 + s.cmd / 10, s.str / 5 + s.cmd / 8]; break;
      default: base = [s.ene / 6, s.ene / 4];
    }
    const dmgMul = fullSet ? 1.05 : 1;
    this.dmgMin = Math.max(1, Math.round((base[0] + wdmg[0]) * dmgMul));
    this.dmgMax = Math.max(this.dmgMin + 1, Math.round((base[1] + wdmg[1]) * dmgMul));
    this.def = Math.round((s.agi / 4 + def) * (fullSet ? 1.1 : 1));
    this.fullSet = fullSet;
    this.maxHp = Math.round(80 + s.vit * 5 + lv * 6 + hpBonus);
    this.maxMp = Math.round(30 + s.ene * 2 + lv * 2);
    this.atkMs = Math.max(450, 1100 - s.agi * 3);
    this.crit = Math.min(0.25, 0.05 + s.agi / 2000);
    this.power = Math.round((this.dmgMin + this.dmgMax) * 4 + this.def * 3 + this.maxHp / 2 + lv * 5);
    if (this.hp > this.maxHp) this.hp = this.maxHp;
    if (this.mp > this.maxMp) this.mp = this.maxMp;
  }
  skills() { return G.SKILLS[this.cls].filter((sk) => !sk.lvl || this.level >= sk.lvl); }
  skillOn(id) { return this.settings.skills[id] !== false; }
  send(msg) { if (this.client && !this.client.closed) this.client.send(msg); }
  // fila: operações de inventário/salvamento nunca correm em paralelo (evita duplicação)
  run(fn) {
    this.queue = this.queue.then(fn).catch((e) => console.error(`[world] ${this.name}:`, e.message));
    return this.queue;
  }
  charState() {
    return {
      type: 'char', id: this.id, name: this.name, cls: this.cls, ap: this.ap, level: this.level, resets: this.resets,
      stats: this.stats, free: this.free, zen: this.zen, pots: this.pots, settings: this.settings,
      dmg: [this.dmgMin, this.dmgMax], def: this.def, maxHp: this.maxHp, maxMp: this.maxMp, atkMs: this.atkMs,
      crit: this.crit, power: this.power, fullSet: this.fullSet, kills: this.kills, deaths: this.deaths,
      items: this.items.map(publicItem), invMax: G.INVENTORY_SIZE,
      skills: this.skills().map((s) => ({ id: s.id, name: s.name, mana: s.mana, cd: s.cd, fx: s.fx, on: this.skillOn(s.id) })),
      allSkills: G.SKILLS[this.cls].map((s) => ({ id: s.id, name: s.name, lvl: s.lvl || 1 })),
    };
  }
}

// ------------------------------------------------------------------ mapa
class MapInstance {
  constructor(world, id, def) {
    this.world = world; this.id = id; this.def = def;
    this.players = new Map();
    this.monsters = [];
    this.events = [];
    let n = 0;
    for (const g of def.groups) {
      for (let i = 0; i < g.count; i++) this.monsters.push(this.makeMonster(++n, g.type));
    }
    if (def.boss) {
      const m = this.makeMonster(++n, def.boss.type, def.boss.x, def.boss.y);
      this.boss = m;
      this.monsters.push(m);
    }
  }
  makeMonster(n, type, x, y) {
    const T = G.MONSTERS[type];
    const def = this.def;
    let hx = x, hy = y;
    if (hx === undefined) {
      do { hx = rand(80, def.w - 60); hy = rand(80, def.h - 60); } while (Math.hypot(hx - def.spawn[0], hy - def.spawn[1]) < 200);
    }
    return { id: 'm' + n, type, T, x: hx, y: hy, hx, hy, hp: T.hp, dead: false, respawnAt: 0, target: null,
      nextAtk: 0, wander: null, nextWander: 0, contrib: new Map(), flip: false };
  }
  emit(ev) { this.events.push(ev); }
}

// ------------------------------------------------------------------ mundo
class World {
  constructor() {
    this.maps = new Map();
    for (const [id, def] of Object.entries(G.WORLD)) this.maps.set(id, new MapInstance(this, id, def));
    this.players = new Map(); // charId -> Player
    this.chat = [];
    this.timer = setInterval(() => this.tick(), TICK_MS);
    this.saver = setInterval(() => this.saveDirty(), 5000);
    this.lastTick = Date.now();
  }

  online() { return this.players.size; }

  // ---------- entrada e saída ----------
  async join(client, charId) {
    if (!client.meta.accountId) return client.send({ type: 'error', error: 'Faça login para entrar no mundo.' });
    if (!/^\d{1,18}$/.test(String(charId))) return client.send({ type: 'error', error: 'Personagem inválido.' });
    const { rows } = await db.query(`SELECT *, EXTRACT(EPOCH FROM (now() - last_seen_at))::int AS offline_secs
      FROM characters WHERE id = $1 AND account_id = $2`, [charId, client.meta.accountId]);
    const row = rows[0];
    if (!row) return client.send({ type: 'error', error: 'Personagem não encontrado nesta conta.' });

    // Uma sessão de jogo por conta: derruba a anterior
    for (const p of this.players.values()) {
      if (p.accountId === String(row.account_id)) {
        p.send({ type: 'kicked', reason: 'Sua conta entrou no mundo em outro aparelho ou aba.' });
        await this.leave(p);
      }
    }
    if (client.player) await this.leave(client.player);

    const items = (await db.query('SELECT id, base, rarity, plus, equipped FROM items WHERE character_id = $1 ORDER BY id', [row.id])).rows;
    const p = new Player(row, client, items);
    client.player = p;
    this.players.set(p.charId, p);

    if (!row.starter_given) await this.giveStarter(p);
    const report = await this.offlineProgress(p, row);

    let mapId = G.WORLD[row.map] ? row.map : 'lorencia';
    if (G.WORLD[mapId].minLevel > p.level) mapId = 'lorencia';
    this.enterMap(p, mapId, row.map === mapId && row.pos_x > 0 ? [row.pos_x, row.pos_y] : null);
    p.send(p.charState());
    p.send({ type: 'chatlog', lines: this.chat.slice(-30) });
    if (report) p.send({ type: 'offline', ...report });
    p.dirty = true;
  }

  async giveStarter(p) {
    const weapon = { dark_knight: 'short_sword', magic_gladiator: 'short_sword', dark_wizard: 'skull_staff',
      fairy_elf: 'short_bow', dark_lord: 'small_scepter', summoner: 'spirit_book' }[p.cls];
    for (const base of [weapon, 'leather_armor']) {
      const { rows } = await db.query(`INSERT INTO items (character_id, base, rarity, equipped) VALUES ($1, $2, 'common', TRUE)
        RETURNING id, base, rarity, plus, equipped`, [p.charId, base]);
      p.items.push(rows[0]);
    }
    p.pots.hp += 30; p.pots.mp += 15;
    await db.query('UPDATE characters SET starter_given = TRUE, pot_hp = $2, pot_mp = $3 WHERE id = $1 RETURNING id', [p.charId, p.pots.hp, p.pots.mp]);
    p.recalc(); p.hp = p.maxHp; p.mp = p.maxMp;
    p.send({ type: 'log', kind: 'info', text: 'Kit inicial recebido: arma, armadura de couro, 30 poções de vida e 15 de mana.' });
  }

  async leave(p) {
    if (!this.players.has(p.charId) || this.players.get(p.charId) !== p) return;
    this.players.delete(p.charId);
    if (p.map) {
      p.map.players.delete(p.id);
      for (const o of p.map.players.values()) o.send({ type: 'pl', id: p.id });
    }
    if (p.client && p.client.player === p) p.client.player = null;
    await this.save(p);
  }

  disconnect(client) {
    if (client.player) this.leave(client.player).catch((e) => console.error('[world] leave:', e.message));
  }

  enterMap(p, mapId, pos) {
    const m = this.maps.get(mapId);
    if (p.map) {
      p.map.players.delete(p.id);
      for (const o of p.map.players.values()) o.send({ type: 'pl', id: p.id });
    }
    p.map = m;
    const [sx, sy] = pos || m.def.spawn;
    p.x = clamp(sx + (pos ? 0 : rand(-20, 20)), 20, m.def.w - 20);
    p.y = clamp(sy + (pos ? 0 : rand(-20, 20)), 20, m.def.h - 20);
    p.target = null; p.moveTo = null;
    if (!m.def.safe) p.lastFarm = mapId;
    m.players.set(p.id, p);
    p.send({
      type: 'enter', map: mapId, name: m.def.name, theme: m.def.theme, w: m.def.w, h: m.def.h, safe: !!m.def.safe,
      npcs: m.def.npcs || [],
      monsters: m.monsters.map((mo) => ({ id: mo.id, type: mo.type, name: mo.T.name, sprite: mo.T.sprite, tint: mo.T.tint || null,
        size: mo.T.size, level: mo.T.level, maxHp: mo.T.hp, boss: !!mo.T.boss, elite: !!mo.T.elite })),
      players: [...m.players.values()].filter((o) => o !== p).map((o) => this.pinfo(o)),
      you: p.id,
    });
    for (const o of m.players.values()) if (o !== p) o.send({ type: 'pj', ...this.pinfo(p) });
    p.dirty = true;
  }

  pinfo(p) {
    const w = p.equipped().find((i) => G.ITEM_BASES[i.base] && G.ITEM_BASES[i.base].slot === 'weapon');
    return { id: p.id, name: p.name, cls: p.cls, ap: p.ap, level: p.level, weaponRarity: w ? w.rarity : 'common' };
  }

  // ---------- mensagens do navegador ----------
  async handle(client, msg) {
    if (msg.type === 'join') return this.join(client, msg.charId);
    const p = client.player;
    if (!p) return;
    switch (msg.type) {
      case 'move': {
        if (p.dead) return;
        const x = Number(msg.x), y = Number(msg.y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return;
        p.moveTo = { x: clamp(x, 10, p.map.def.w - 10), y: clamp(y, 10, p.map.def.h - 10) };
        p.target = null;
        return;
      }
      case 'target': {
        if (p.dead || p.map.def.safe) return;
        const m = p.map.monsters.find((mo) => mo.id === msg.id && !mo.dead);
        if (m) { p.target = m; p.moveTo = null; }
        return;
      }
      case 'auto': p.auto = !!msg.on; p.dirty = true; if (!p.auto) p.target = null; return;
      case 'potion': return this.usePotion(p, msg.kind === 'mp' ? 'mp' : 'hp', Date.now(), true);
      case 'teleport': return this.teleport(p, String(msg.map));
      case 'settings': return this.updateSettings(p, msg.settings || {});
      case 'stat': return this.addStat(p, String(msg.stat), Number(msg.n));
      case 'buy': return p.run(() => this.buy(p, String(msg.item), Number(msg.qty)));
      case 'equip': return p.run(() => this.equip(p, String(msg.id)));
      case 'unequip': return p.run(() => this.unequip(p, String(msg.id)));
      case 'sell': return p.run(() => this.sell(p, String(msg.id)));
      case 'autoequip': return p.run(() => this.autoEquip(p));
      case 'chat': return this.chatMsg(p, msg.text);
      case 'leave': return this.leave(p).then(() => client.send({ type: 'left' }));
      default: return undefined;
    }
  }

  teleport(p, mapId) {
    const def = G.WORLD[mapId];
    if (!def) return p.send({ type: 'log', kind: 'warn', text: 'Mapa não disponível.' });
    if (p.dead) return;
    if (p.level < def.minLevel) return p.send({ type: 'log', kind: 'warn', text: `${def.name} abre no nível ${def.minLevel}.` });
    if (p.map && p.map.id === mapId) return;
    this.enterMap(p, mapId);
    p.send({ type: 'log', kind: 'info', text: `Você chegou em ${def.name}.` });
  }

  updateSettings(p, s) {
    const out = p.settings;
    if (typeof s.potHp === 'number') out.potHp = clamp(Math.round(s.potHp * 100) / 100, 0, 0.9);
    if (typeof s.potMp === 'number') out.potMp = clamp(Math.round(s.potMp * 100) / 100, 0, 0.9);
    if (typeof s.autoStats === 'boolean') out.autoStats = s.autoStats;
    if (typeof s.returnToFarm === 'boolean') out.returnToFarm = s.returnToFarm;
    if (RARITY_ORDER.includes(s.lootMin)) out.lootMin = s.lootMin;
    if (s.skills && typeof s.skills === 'object') {
      for (const sk of G.SKILLS[p.cls]) if (typeof s.skills[sk.id] === 'boolean' && sk.id !== 'basic') out.skills[sk.id] = s.skills[sk.id];
    }
    if (out.autoStats && p.free > 0) this.autoDistribute(p);
    p.dirty = true;
    p.send(p.charState());
  }

  addStat(p, stat, n) {
    if (!['str', 'agi', 'vit', 'ene', 'cmd'].includes(stat)) return;
    if (stat === 'cmd' && p.cls !== 'dark_lord') return;
    n = Math.floor(n);
    if (!(n >= 1) || n > p.free) return;
    p.stats[stat] += n; p.free -= n;
    p.recalc(); p.dirty = true;
    p.send(p.charState());
  }

  autoDistribute(p) {
    const plan = G.AUTO_STATS[p.cls];
    const total = Object.values(plan).reduce((a, b) => a + b, 0);
    while (p.free > 0) {
      for (const [k, w] of Object.entries(plan)) {
        const n = Math.min(p.free, w);
        p.stats[k] += n; p.free -= n;
        if (p.free <= 0) break;
      }
      if (total <= 0) break;
    }
    p.recalc();
  }

  async buy(p, item, qty) {
    const s = G.SHOP[item];
    qty = Math.floor(qty);
    if (!s || !(qty >= 1 && qty <= 500)) return;
    if (!p.map.def.safe) return p.send({ type: 'log', kind: 'warn', text: 'A loja fica na cidade de Lorencia.' });
    const cost = s.price * qty;
    if (p.zen < cost) return p.send({ type: 'log', kind: 'warn', text: `Zen insuficiente: custa ${cost}.` });
    p.zen -= cost;
    if (item === 'pot_hp') p.pots.hp += qty; else p.pots.mp += qty;
    await this.persist(p);
    p.send({ type: 'log', kind: 'info', text: `Comprou ${qty}× ${s.name} por ${cost} Zen.` });
    p.send(p.charState());
  }

  async equip(p, id) {
    const it = p.items.find((i) => String(i.id) === id);
    if (!it || it.equipped) return;
    const err = canUse(p, it);
    if (err) return p.send({ type: 'log', kind: 'warn', text: err });
    const slot = G.ITEM_BASES[it.base].slot;
    const cur = p.items.find((i) => i.equipped && G.ITEM_BASES[i.base].slot === slot);
    if (cur) {
      await db.query('UPDATE items SET equipped = FALSE WHERE id = $1 AND character_id = $2 RETURNING id', [cur.id, p.charId]);
      cur.equipped = false;
    }
    await db.query('UPDATE items SET equipped = TRUE WHERE id = $1 AND character_id = $2 RETURNING id', [it.id, p.charId]);
    it.equipped = true;
    this.afterGearChange(p);
  }

  async unequip(p, id) {
    const it = p.items.find((i) => String(i.id) === id && i.equipped);
    if (!it) return;
    await db.query('UPDATE items SET equipped = FALSE WHERE id = $1 AND character_id = $2 RETURNING id', [it.id, p.charId]);
    it.equipped = false;
    this.afterGearChange(p);
  }

  async autoEquip(p) {
    const bySlot = {};
    for (const it of p.items) {
      if (canUse(p, it)) continue;
      const slot = G.ITEM_BASES[it.base].slot;
      if (!bySlot[slot] || itemScore(it) > itemScore(bySlot[slot])) bySlot[slot] = it;
    }
    let changed = 0;
    for (const [slot, best] of Object.entries(bySlot)) {
      if (best.equipped) continue;
      const cur = p.items.find((i) => i.equipped && G.ITEM_BASES[i.base].slot === slot);
      if (cur) { await db.query('UPDATE items SET equipped = FALSE WHERE id = $1 AND character_id = $2 RETURNING id', [cur.id, p.charId]); cur.equipped = false; }
      await db.query('UPDATE items SET equipped = TRUE WHERE id = $1 AND character_id = $2 RETURNING id', [best.id, p.charId]);
      best.equipped = true; changed++;
    }
    p.send({ type: 'log', kind: 'info', text: changed ? `Equipou ${changed} ${changed > 1 ? 'itens melhores' : 'item melhor'}.` : 'Você já usa o melhor equipamento disponível.' });
    this.afterGearChange(p);
  }

  afterGearChange(p) {
    p.recalc(); p.dirty = true;
    p.send(p.charState());
    if (p.map) for (const o of p.map.players.values()) if (o !== p) o.send({ type: 'pj', ...this.pinfo(p) });
  }

  async sell(p, id) {
    const it = p.items.find((i) => String(i.id) === id);
    if (!it) return;
    if (it.equipped) return p.send({ type: 'log', kind: 'warn', text: 'Desequipe o item antes de vender.' });
    const { rows } = await db.query('DELETE FROM items WHERE id = $1 AND character_id = $2 AND equipped = FALSE RETURNING id', [it.id, p.charId]);
    if (!rows[0]) return;
    p.items = p.items.filter((i) => i !== it);
    const v = itemValue(it);
    p.zen += v;
    await this.persist(p);
    p.send({ type: 'log', kind: 'info', text: `Vendeu ${G.ITEM_BASES[it.base].name} por ${v} Zen.` });
    p.send(p.charState());
  }

  chatMsg(p, text) {
    const t = String(text || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 120);
    if (!t) return;
    const now = Date.now();
    if (p.lastChat && now - p.lastChat < 1200) return p.send({ type: 'log', kind: 'warn', text: 'Calma: espere um pouco para enviar outra mensagem.' });
    p.lastChat = now;
    const line = { from: p.name, cls: p.cls, text: t, t: now };
    this.chat.push(line); if (this.chat.length > 60) this.chat.shift();
    for (const o of this.players.values()) o.send({ type: 'chat', ...line });
  }

  system(text) {
    const line = { from: null, text, t: Date.now() };
    this.chat.push(line); if (this.chat.length > 60) this.chat.shift();
    for (const o of this.players.values()) o.send({ type: 'chat', ...line });
  }

  // ---------- progresso offline (calculado só com o relógio do servidor) ----------
  async offlineProgress(p, row) {
    const secs = Math.min(OFFLINE_CAP_S, Math.max(0, Number(row.offline_secs) || 0));
    const def = G.WORLD[row.last_farm_map];
    if (!row.auto_on || !def || def.safe || secs < 60 || p.level < def.minLevel) return null;
    const types = def.groups.map((g) => ({ T: G.MONSTERS[g.type], n: g.count }));
    const totalN = types.reduce((a, t) => a + t.n, 0);
    const avg = (f) => types.reduce((a, t) => a + f(t.T) * t.n, 0) / totalN;
    const mHp = avg((T) => T.hp), mDmg = avg((T) => T.dmg), mExp = avg((T) => T.exp);
    const mZen = avg((T) => (T.zen[0] + T.zen[1]) / 2), mDrop = avg((T) => T.drop), mLvl = avg((T) => T.level);
    let kills = 0, exp = 0, zen = 0, levels = 0, potsUsed = 0, died = false, elapsed = 0;
    while (elapsed < secs) {
      const dps = ((p.dmgMin + p.dmgMax) / 2) * 1.25 / (p.atkMs / 1000);
      const killTime = mHp / dps + 2.5;
      const incoming = Math.max(1, mDmg - p.def / 2) / 1.4 * 0.6;
      const potsNeeded = (incoming * killTime) / (p.maxHp * 0.35) - 0.05 * killTime;
      if (potsNeeded > 0) {
        if (p.pots.hp < potsNeeded) { died = true; break; }
        p.pots.hp -= potsNeeded; potsUsed += potsNeeded;
      }
      elapsed += killTime / 0.6; // eficiência offline de 60%
      if (elapsed > secs) break;
      kills++; exp += mExp; zen += mZen;
      p.exp += mExp;
      while (p.exp >= expToNext(p.level) && p.level < G.LIMITS.maxLevel) { p.exp -= expToNext(p.level); this.levelUp(p, true); levels++; }
      if (kills > 50000) break;
    }
    p.pots.hp = Math.floor(p.pots.hp);
    p.zen += Math.round(zen);
    p.kills += kills;
    const found = [];
    const drops = Math.min(12, Math.round(kills * mDrop * rand(0.7, 1.1)));
    for (let i = 0; i < drops; i++) {
      const it = rollItem(Math.round(mLvl), 'normal');
      const r = await this.addItem(p, it, true);
      if (r) found.push(r);
    }
    if (died) { p.deaths++; p.lastFarm = row.last_farm_map; }
    p.recalc();
    p.hp = p.maxHp; p.mp = p.maxMp;
    p.dirty = true;
    return { secs, capped: Number(row.offline_secs) > OFFLINE_CAP_S, map: def.name, kills, exp: Math.round(exp), levels,
      zen: Math.round(zen), potsUsed: Math.round(potsUsed), died, items: found.map(publicItem) };
  }

  // Adiciona um item (drop). Itens abaixo da raridade mínima ou sem espaço viram Zen.
  async addItem(p, it, silent) {
    const minIdx = RARITY_ORDER.indexOf(p.settings.lootMin);
    if (RARITY_ORDER.indexOf(it.rarity) < minIdx || p.items.length >= G.INVENTORY_SIZE) {
      const v = itemValue(it);
      p.zen += v; p.dirty = true;
      if (!silent) p.send({ type: 'log', kind: 'zen', text: `${G.ITEM_BASES[it.base].name} vendido automaticamente: +${v} Zen` });
      return null;
    }
    const { rows } = await db.query(`INSERT INTO items (character_id, base, rarity, plus) VALUES ($1,$2,$3,$4)
      RETURNING id, base, rarity, plus, equipped`, [p.charId, it.base, it.rarity, it.plus]);
    p.items.push(rows[0]);
    if (!silent) {
      p.send({ type: 'drop', item: publicItem(rows[0]) });
      p.send(p.charState());
    }
    return rows[0];
  }

  levelUp(p, silent) {
    p.level++;
    p.free += G.POINTS_PER_LEVEL[p.cls];
    if (p.settings.autoStats) this.autoDistribute(p); else p.recalc();
    p.hp = p.maxHp; p.mp = p.maxMp;
    if (!silent && p.map) {
      p.map.emit({ k: 'lv', t: p.id });
      for (const o of p.map.players.values()) o.send({ type: 'pj', ...this.pinfo(p) });
      p.send(p.charState());
      if (p.level % 10 === 0) this.system(`${p.name} alcançou o nível ${p.level}!`);
    }
  }

  // ---------- combate ----------
  usePotion(p, kind, now, manual) {
    if (p.dead || now < p.nextPot) return;
    if (p.pots[kind] <= 0) { if (manual) p.send({ type: 'log', kind: 'warn', text: kind === 'hp' ? 'Sem poções de vida. Compre na loja de Lorencia.' : 'Sem poções de mana.' }); return; }
    if (kind === 'hp' && p.hp >= p.maxHp) return;
    if (kind === 'mp' && p.mp >= p.maxMp) return;
    p.pots[kind]--;
    p.nextPot = now + POTION_CD_MS;
    if (kind === 'hp') { const v = Math.round(p.maxHp * 0.35); p.hp = Math.min(p.maxHp, p.hp + v); p.map.emit({ k: 'heal', t: p.id, d: v }); }
    else p.mp = Math.min(p.maxMp, p.mp + Math.round(p.maxMp * 0.5));
    p.dirty = true;
  }

  damageMonster(p, m, mult, crit, now) {
    const raw = rand(p.dmgMin, p.dmgMax) * mult * (crit ? 1.5 : 1);
    const d = Math.max(1, Math.round(raw - m.T.def / 2));
    m.hp -= d;
    m.flip = p.x > m.x;
    if (!m.target || m.target.dead || m.target.map !== p.map) m.target = p;
    m.contrib.set(p.charId, (m.contrib.get(p.charId) || 0) + Math.min(d, d + m.hp));
    if (m.hp <= 0) this.killMonster(m, p, now);
    return d;
  }

  attack(p, sk, target, now) {
    const map = p.map;
    if (sk.heal) {
      const v = Math.round(p.maxHp * sk.heal);
      p.hp = Math.min(p.maxHp, p.hp + v);
      p.mp -= sk.mana; p.cds[sk.id] = now + sk.cd;
      map.emit({ k: 'heal', t: p.id, d: v, fx: 'heal' });
      return;
    }
    p.mp -= sk.mana;
    if (sk.cd) p.cds[sk.id] = now + sk.cd;
    p.nextAtk = now + p.atkMs;
    p.flip = target.x < p.x;
    const crit = Math.random() < p.crit;
    if (sk.aoe) {
      const cx = sk.self ? p.x : target.x, cy = sk.self ? p.y : target.y;
      const hits = map.monsters.filter((m) => !m.dead && Math.hypot(m.x - cx, m.y - cy) <= sk.aoe).slice(0, 8);
      map.emit({ k: 'aoe', a: p.id, x: Math.round(cx), y: Math.round(cy), r: sk.aoe, fx: sk.fx });
      for (const m of hits) { const d = this.damageMonster(p, m, sk.mult, crit, now); map.emit({ k: 'h', a: p.id, t: m.id, d, c: crit ? 1 : 0, fx: sk.fx, aoe: 1 }); }
    } else {
      const d = this.damageMonster(p, target, sk.mult, crit, now);
      map.emit({ k: 'h', a: p.id, t: target.id, d, c: crit ? 1 : 0, fx: sk.fx });
    }
  }

  killMonster(m, killer, now) {
    if (m.dead) return;
    m.dead = true; m.hp = 0; m.target = null;
    const map = killer.map;
    m.respawnAt = now + (m.T.respawnMs || MONSTER_RESPAWN_MS);
    map.emit({ k: 'die', t: m.id });
    if (m.T.boss) return this.bossRewards(m, map, killer);
    const p = killer;
    const exp = m.T.exp, zen = randi(m.T.zen[0], m.T.zen[1]);
    p.exp += exp; p.zen += zen; p.kills++;
    p.send({ type: 'reward', exp, zen, mon: m.T.name });
    while (p.exp >= expToNext(p.level) && p.level < G.LIMITS.maxLevel) { p.exp -= expToNext(p.level); this.levelUp(p); }
    p.dirty = true;
    if (Math.random() < m.T.drop) {
      const it = rollItem(m.T.level, 'normal');
      p.run(() => this.addItem(p, it));
    }
    m.contrib.clear();
  }

  bossRewards(m, map, killer) {
    const total = [...m.contrib.values()].reduce((a, b) => a + b, 0) || 1;
    const ranked = [...m.contrib.entries()].sort((a, b) => b[1] - a[1]);
    ranked.forEach(([charId, dmg], i) => {
      const p = this.players.get(charId);
      if (!p || p.map !== map) return;
      const share = dmg / total;
      const exp = Math.round(m.T.exp * Math.max(0.1, share));
      const zen = Math.round(randi(m.T.zen[0], m.T.zen[1]) * Math.max(0.1, share));
      p.exp += exp; p.zen += zen; p.bossesKilled++;
      p.send({ type: 'reward', exp, zen, mon: m.T.name, share: Math.round(share * 100) });
      while (p.exp >= expToNext(p.level) && p.level < G.LIMITS.maxLevel) { p.exp -= expToNext(p.level); this.levelUp(p); }
      const rolls = i === 0 ? 2 : (share >= 0.1 && Math.random() < 0.5 ? 1 : 0);
      for (let r = 0; r < rolls; r++) { const it = rollItem(m.T.level, 'boss'); p.run(() => this.addItem(p, it)); }
      p.dirty = true;
      p.lastSave = 0; // salva no próximo ciclo
    });
    const top = ranked[0] && this.players.get(ranked[0][0]);
    this.system(`O ${m.T.name} foi derrotado${top ? ` — maior dano: ${top.name}` : ''}! Ele volta em 10 minutos.`);
    m.contrib.clear();
  }

  hurtPlayer(m, p, now) {
    const d = Math.max(1, Math.round(m.T.dmg * rand(0.85, 1.15) - p.def / 2));
    p.hp -= d;
    p.map.emit({ k: 'h', a: m.id, t: p.id, d, fx: m.T.boss ? 'boss' : 'claw' });
    if (p.hp <= 0) this.killPlayer(p, now, m);
  }

  killPlayer(p, now, by) {
    p.hp = 0; p.dead = true; p.deaths++;
    p.respawnAt = now + RESPAWN_MS;
    p.target = null; p.moveTo = null;
    p.map.emit({ k: 'pdie', t: p.id });
    p.send({ type: 'log', kind: 'warn', text: `Você foi derrotado por ${by.T.name}. Voltando para Lorencia…` });
    p.dirty = true;
  }

  // ---------- loop principal ----------
  tick() {
    const now = Date.now();
    const dt = Math.min(0.25, (now - this.lastTick) / 1000);
    this.lastTick = now;
    for (const map of this.maps.values()) {
      if (!map.players.size && !map.events.length) {
        // sem jogadores: só cuida de renascimentos
        for (const m of map.monsters) if (m.dead && now >= m.respawnAt) this.respawnMonster(map, m);
        continue;
      }
      for (const p of [...map.players.values()]) this.tickPlayer(p, map, now, dt);
      for (const m of map.monsters) this.tickMonster(m, map, now, dt);
      this.broadcast(map, now);
    }
  }

  respawnMonster(map, m) {
    m.dead = false; m.hp = m.T.hp; m.x = m.hx; m.y = m.hy; m.target = null; m.contrib.clear();
    map.emit({ k: 'spawn', t: m.id });
    if (m.T.boss) this.system(`O ${m.T.name} despertou em ${map.def.name}!`);
  }

  tickMonster(m, map, now, dt) {
    if (m.dead) { if (now >= m.respawnAt) this.respawnMonster(map, m); return; }
    let t = m.target;
    if (t && (t.dead || t.map !== map || !map.players.has(t.id))) t = m.target = null;
    if (!t && m.T.aggro) {
      let best = null, bd = m.T.aggro;
      for (const p of map.players.values()) { if (p.dead) continue; const d = dist(m, p); if (d < bd) { bd = d; best = p; } }
      if (best) t = m.target = best;
    }
    const step = m.T.speed * dt;
    if (t) {
      if (Math.hypot(m.x - m.hx, m.y - m.hy) > 260) { // fugiu longe demais: volta e cura
        m.target = null; m.hp = m.T.hp; m.contrib.clear(); m.wander = { x: m.hx, y: m.hy }; return;
      }
      const d = dist(m, t);
      const reach = m.T.range + 6 * m.T.size;
      if (d > reach) { m.x += (t.x - m.x) / d * step; m.y += (t.y - m.y) / d * step; m.flip = t.x > m.x; }
      else if (now >= m.nextAtk) { m.nextAtk = now + m.T.atkMs; m.flip = t.x > m.x; this.hurtPlayer(m, t, now); }
      return;
    }
    if (m.hp < m.T.hp) m.hp = Math.min(m.T.hp, m.hp + m.T.hp * 0.02 * dt);
    if (now >= m.nextWander) {
      m.nextWander = now + rand(2500, 6000);
      m.wander = Math.random() < 0.6 ? { x: clamp(m.hx + rand(-60, 60), 20, map.def.w - 20), y: clamp(m.hy + rand(-60, 60), 20, map.def.h - 20) } : null;
    }
    if (m.wander) {
      const d = Math.hypot(m.wander.x - m.x, m.wander.y - m.y);
      if (d < 2) m.wander = null;
      else { const s = step * 0.5; m.x += (m.wander.x - m.x) / d * Math.min(s, d); m.y += (m.wander.y - m.y) / d * Math.min(s, d); m.flip = m.wander.x > m.x; }
    }
  }

  tickPlayer(p, map, now, dt) {
    if (p.dead) {
      if (now >= p.respawnAt) {
        p.dead = false; p.hp = p.maxHp; p.mp = p.maxMp;
        this.enterMap(p, 'lorencia');
        if (p.auto && p.settings.returnToFarm && p.lastFarm) p.returnAt = now + 8000;
      }
      return;
    }
    // regeneração: rápida na cidade, lenta no campo
    const regen = map.def.safe ? 0.08 : 0.004;
    p.hp = Math.min(p.maxHp, p.hp + p.maxHp * regen * dt);
    p.mp = Math.min(p.maxMp, p.mp + p.maxMp * (map.def.safe ? 0.08 : 0.02) * dt);

    if (map.def.safe) {
      if (p.returnAt && now >= p.returnAt) {
        p.returnAt = 0;
        const dest = p.lastFarm;
        if (dest && G.WORLD[dest] && p.level >= G.WORLD[dest].minLevel && p.auto) { this.enterMap(p, dest); p.send({ type: 'log', kind: 'info', text: `Voltando ao farm em ${G.WORLD[dest].name}.` }); return; }
      }
    } else {
      if (p.hp < p.maxHp * p.settings.potHp) this.usePotion(p, 'hp', now);
      else if (p.mp < p.maxMp * p.settings.potMp) this.usePotion(p, 'mp', now);
    }

    // movimento manual tem prioridade
    if (p.moveTo) { this.stepToward(p, p.moveTo, PLAYER_SPEED * dt); if (dist(p, p.moveTo) < 2) p.moveTo = null; return; }
    if (map.def.safe) return;

    // escolhe alvo
    if (p.target && (p.target.dead || !map.monsters.includes(p.target))) p.target = null;
    if (!p.target && p.auto) {
      let best = null, bd = Infinity;
      for (const m of map.monsters) {
        if (m.dead) continue;
        let d = dist(p, m);
        if (m.target === p) d -= 200; // prioriza quem está atacando
        if (m.T.boss && p.level < m.T.level - 5) d += 2000; // evita o boss quando fraco
        if (d < bd) { bd = d; best = m; }
      }
      p.target = best;
    }
    const t = p.target;
    if (!t) return;
    const skills = p.skills();
    // cura do elfo
    const heal = skills.find((s) => s.heal && p.skillOn(s.id));
    if (heal && p.hp < p.maxHp * 0.6 && p.mp >= heal.mana && !(p.cds[heal.id] > now)) { this.attack(p, heal, t, now); return; }
    let sk = null;
    if (p.auto) sk = skills.find((s) => s.id !== 'basic' && !s.heal && p.skillOn(s.id) && p.mp >= s.mana && !(p.cds[s.id] > now));
    if (!sk) sk = skills[0];
    const d = dist(p, t);
    const reach = sk.range + 8 * t.T.size;
    if (d > reach) { this.stepToward(p, t, PLAYER_SPEED * dt, reach - 2); return; }
    if (now >= p.nextAtk) this.attack(p, sk, t, now);
  }

  stepToward(p, dest, step, stopAt = 0) {
    const d = dist(p, dest);
    if (d <= stopAt) return;
    const s = Math.min(step, d - stopAt);
    p.x += (dest.x - p.x) / d * s; p.y += (dest.y - p.y) / d * s;
    p.flip = dest.x < p.x;
    p.x = clamp(p.x, 10, p.map.def.w - 10); p.y = clamp(p.y, 10, p.map.def.h - 10);
  }

  broadcast(map, now) {
    const P = [...map.players.values()].map((p) => [p.id, Math.round(p.x), Math.round(p.y), Math.round(p.hp), p.maxHp, p.dead ? 1 : 0, p.flip ? 1 : 0]);
    const M = map.monsters.map((m) => [m.id, Math.round(m.x), Math.round(m.y), Math.max(0, Math.round(m.hp)), m.dead ? 1 : 0, m.flip ? 1 : 0]);
    const ev = map.events; map.events = [];
    let boss = null;
    if (map.boss) {
      const total = [...map.boss.contrib.values()].reduce((a, b) => a + b, 0) || 1;
      boss = { id: map.boss.id, name: map.boss.T.name, hp: Math.max(0, Math.round(map.boss.hp)), max: map.boss.T.hp, dead: map.boss.dead,
        respawnIn: map.boss.dead ? Math.max(0, map.boss.respawnAt - now) : 0,
        top: [...map.boss.contrib.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
          .map(([cid, d]) => ({ name: (this.players.get(cid) || {}).name || '—', pct: Math.round(d / total * 100) })) };
    }
    for (const p of map.players.values()) {
      const cds = {};
      for (const [k, v] of Object.entries(p.cds)) if (v > now) cds[k] = v - now;
      p.send({ type: 's', P, M, ev, boss, me: {
        hp: Math.round(p.hp), mp: Math.round(p.mp), maxHp: p.maxHp, maxMp: p.maxMp, level: p.level,
        exp: Math.round(p.exp), next: expToNext(p.level), zen: p.zen, pots: p.pots, auto: p.auto, free: p.free,
        target: p.target ? p.target.id : null, cds, dead: p.dead, respawnIn: p.dead ? Math.max(0, p.respawnAt - now) : 0,
        returnIn: p.returnAt ? Math.max(0, p.returnAt - now) : 0,
      } });
    }
  }

  // ---------- salvamento ----------
  save(p) { return p.run(() => this.persist(p)); }

  // grava direto (usar só dentro de p.run, que já serializa as operações)
  async persist(p) {
    {
      const map = p.dead ? 'lorencia' : (p.map ? p.map.id : 'lorencia');
      await db.query(`UPDATE characters SET level=$2, exp=$3, zen=$4, str=$5, agi=$6, vit=$7, ene=$8, cmd=$9, free_points=$10,
        map=$11, pos_x=$12, pos_y=$13, hp=$14, mp=$15, pot_hp=$16, pot_mp=$17, settings=$18, kills=$19, deaths=$20,
        bosses_killed=$21, combat_power=$22, last_farm_map=$23, auto_on=$24, last_seen_at=now()
        WHERE id=$1 RETURNING id`,
      [p.charId, p.level, Math.round(p.exp), Math.round(p.zen), p.stats.str, p.stats.agi, p.stats.vit, p.stats.ene, p.stats.cmd, p.free,
        map, p.dead ? 0 : Math.round(p.x), p.dead ? 0 : Math.round(p.y), Math.max(1, Math.round(p.hp)), Math.round(p.mp),
        p.pots.hp, p.pots.mp, JSON.stringify(p.settings), p.kills, p.deaths, p.bossesKilled, p.power, p.lastFarm, p.auto]);
      p.dirty = false; p.lastSave = Date.now();
    }
  }

  saveDirty() {
    const now = Date.now();
    for (const p of this.players.values()) if (p.dirty && now - p.lastSave >= SAVE_EVERY_MS) this.save(p);
  }

  async shutdown() {
    clearInterval(this.timer); clearInterval(this.saver);
    await Promise.all([...this.players.values()].map((p) => this.save(p)));
  }
}

module.exports = { World, expToNext };
