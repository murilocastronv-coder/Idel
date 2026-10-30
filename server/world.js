'use strict';
// MU Idle Legends — mundo em tempo real. O servidor é a autoridade de movimento,
// combate, EXP, Zen, drops e inventário. O navegador só envia intenções.
const db = require('./db');
const G = require('./gamedata');
const Q = require('./quests');
const VIP = require('./vip');
const ADMIN = require('./admin');
const CHAOS = require('./chaos');
const DROPS = require('./drops');
const CMDS = require('./commands');
const INV = require('./invasion');
const KUNDUN = require('./kundun');
const EQUIP = require('./equip');
const VAULT = require('./vault');
const CLS = require('./classes');
const ARENA = require('./arena');
const UPG = require('./upgrade');
const TRADE = require('./trade');

const TICK_MS = 100;
const SAVE_EVERY_MS = 20000;
const PLAYER_SPEED = 80;           // px por segundo
const OFFLINE_CAP_S = 8 * 3600;    // limite de progresso offline
const RESPAWN_MS = 4000;
const ROOMS = 4;                   // salas (cópias separadas do mundo, como os subservidores do MU)
const MONSTER_RESPAWN_MS = 9000;
const POTION_CD_MS = 1200;
const PVP_SCALE = 0.7;          // dano entre jogadores é reduzido para lutas durarem mais
const DUEL_MS = 3 * 60 * 1000;
const PK_MS = 10 * 60 * 1000;
const RARITY_ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'ancestral'];
const DEFAULT_SETTINGS = { potHp: 0.5, potMp: 0.3, autoStats: true, returnToFarm: true, lootMin: 'common', skills: {} };

const rand = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(rand(a, b + 1));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Hard XP: curva pesada (nível 2 = 300 EXP, nível 10 ≈ 12.800, nível 25 ≈ 86.500)
function expToNext(level) { return Math.floor(100 * Math.pow(level, 2.1) + 200); }
const XP = () => G.GAME_MODE.expRate;

// Zen de combate: valores limitados no servidor. Overrides por monstro ficam em gamedata.js.
function monsterZen(T) {
  const level = Math.max(1, Number(T.level) || 1);
  const base = Number.isFinite(Number(T.zenReward)) ? Number(T.zenReward)
    : level < 20 ? 1 : level < 50 ? 2 : level < 100 ? 3 : level < 150 ? 4 : 5;
  return clamp(Math.round(base), 1, 5);
}
function bossZen(T) {
  const level = Math.max(1, Number(T.level) || 1);
  const base = Number.isFinite(Number(T.zenReward)) ? Number(T.zenReward)
    : level < 50 ? 60 : level < 100 ? 70 : level < 150 ? 80 : level < 200 ? 90 : 100;
  return clamp(Math.round(base), 60, 100);
}

// ------------------------------------------------------------------ itens
const WING_PLUS = 1; // cada +1 numa asa/capa: +1% de dano, +1% de absorção e +2 de defesa
function itemStats(it) {
  const b = G.ITEM_BASES[it.base];
  if (!b) return {};
  if (b.slot === 'wings') {
    const wb = UPG.wingBonus(it.plus || 0);
    return { def: b.def + wb.def, wdmg: b.wdmg + wb.wdmg, absorb: Math.min(60, b.absorb + wb.absorb) };
  }
  if (b.slot === 'material' || b.slot === 'box' || b.slot === 'quest') return {};
  // bônus do aprimoramento (+0 a +15) por tipo de equipamento, configurável no painel
  const m = (G.RARITY_MULT[it.rarity] || 1) * UPG.mult(it.base, it.plus || 0);
  const out = {};
  if (b.dmg) out.dmg = [Math.round(b.dmg[0] * m), Math.round(b.dmg[1] * m)];
  if (b.def) out.def = Math.round(b.def * m);
  if (b.hp) out.hp = Math.round(b.hp * m);
  return out;
}
function itemScore(it) {
  const s = itemStats(it);
  return (s.dmg ? (s.dmg[0] + s.dmg[1]) : 0) + (s.def || 0) * 2 + (s.hp || 0) / 4 + (s.wdmg || 0) * 6 + (s.absorb || 0) * 6;
}
function itemValue(it) {
  const b = G.ITEM_BASES[it.base];
  const q = Math.max(1, Number(it.qty) || 1);
  if (b && b.value) return Math.round(b.value * (1 + (it.plus || 0) * 0.2)) * q;
  return Math.round((20 + (b ? b.req : 1) * 12) * (RARITY_ORDER.indexOf(it.rarity) + 1) * (1 + (it.plus || 0) * 0.2)) * q;
}
function canUse(p, it) { return EQUIP.meets(p, it); }
function rollRarity(table) {
  const w = G.RARITY_WEIGHTS[table];
  const total = Object.values(w).reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (const k of RARITY_ORDER) { r -= w[k]; if (r <= 0) return k; }
  return 'common';
}
function rollPlus(table) {
  // +1 a +3 também ficou mais raro (6% dos drops; boss 12%), e +3 é o mais difícil
  const pr = Math.random(), plusChance = table === 'boss' ? 0.12 : 0.06;
  return pr < plusChance * 0.12 ? 3 : pr < plusChance * 0.4 ? 2 : pr < plusChance ? 1 : 0;
}
const RANDOM_POOL = () => Object.entries(G.ITEM_BASES).filter(([, b]) => !b.special);
function rollItem(level, table) {
  const all = RANDOM_POOL();
  let pool = all.filter(([, b]) => b.req <= level + 3 && b.req >= level - 16);
  if (!pool.length) pool = all.filter(([, b]) => b.req <= Math.max(1, level + 3));
  const [base] = pool[Math.floor(Math.random() * pool.length)];
  return { base, rarity: rollRarity(table), plus: rollPlus(table) };
}
// o que aparece no corpo do herói: arma (item exato), conjunto de cada peça de armadura e asa/capa
function gearVisual(items) {
  const out = { w: null };
  for (const it of items) {
    const b = G.ITEM_BASES[it.base];
    if (!b) continue;
    if (b.slot === 'weapon') { out.w = it.base; out.wr = it.rarity; out.wp = it.plus || 0; }
    else if (b.slot === 'wings') out.wings = it.base;
    else if (['helm', 'armor', 'gloves', 'boots'].includes(b.slot) && b.set) out[b.slot] = b.set;
  }
  return out;
}
function publicItem(it) {
  const b = G.ITEM_BASES[it.base] || {};
  return { id: String(it.id), base: it.base, name: b.name, slot: b.slot, icon: b.icon, ic: b.ic || null, kind: b.kind, req: b.req, set: b.set,
    cat: b.cat || (b.slot === 'material' ? 'material' : null), tier: b.tier || 0, event: b.event || null, classes: b.classes || null, chaos: !!b.chaos, desc: b.desc || null,
    qty: Math.max(1, Number(it.qty) || 1), stack: b.stack || 0, contents: b.slot === 'box' ? KUNDUN.contents(it.base) : undefined,
    rarity: it.rarity, plus: it.plus, equipped: !!it.equipped, eqSlot: it.equipped ? EQUIP.eqSlotOf(it) : null, reqs: EQUIP.reqs(it.base), locked: !!it.locked,
    stats: itemStats(it), value: itemValue(it) };
}
function bagUsed(p) { return p.items.filter((i) => !i.equipped).length; }

function skillDesc(s) {
  if (s.heal) return `Cura ${Math.round(s.heal * 100)}% da vida`;
  if (s.buff) return `${s.buff === 'dmg' ? 'Dano' : 'Defesa'} +${Math.round((s.bmult - 1) * 100)}% por ${s.dur / 1000}s`;
  return `${Math.round(s.mult * 100)}% de dano${s.aoe ? ' em área' : ''}`;
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
    this.quests = row.quests || {};
    this.buffs = {};
    this.isPlayer = true;
    this.pvp = { kills: row.pvp_kills || 0, deaths: row.pvp_deaths || 0, duelW: row.duel_wins || 0, duelL: row.duel_losses || 0, pk: row.pk_count || 0 };
    this.pkUntil = 0; this.duel = null; this.duelInvite = null;
    this.vipRow = { vip1_until: row.vip1_until, vip2_until: row.vip2_until };
    this.isAdmin = !!row.is_admin_user;
    this.role = this.isAdmin ? 'superadmin' : (row.acc_role || 'player');
    this.mutedUntil = row.muted_until ? new Date(row.muted_until).getTime() : 0;
    this.masterResets = row.master_resets || 0;
    this.evo = Math.max(0, Math.min((G.EVOLUTIONS[row.class] || [1]).length - 1, row.evo || 0));
    this.classQuest = row.class_quest || null;
    // lugar de cada item equipado (anéis repetidos: o segundo vai para o anel direito)
    const used = new Set();
    for (const it of items) {
      if (!it.equipped) continue;
      let sl = it.eq_slot || (G.ITEM_BASES[it.base] ? G.ITEM_BASES[it.base].slot : null);
      if (sl === 'ring' && used.has('ring')) sl = 'ring2';
      it.eq_slot = sl; used.add(sl);
    }
    this.bonusPoints = row.bonus_points || 0;
    this.crafting = false;
    this.onlineAcc = 0;
    this.questsDirty = false;
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
    let wdmg = [1, 2], def = 0, hpBonus = 0, wingDmg = 0, absorb = 0;
    const setCount = {};
    for (const it of eq) {
      const st = itemStats(it);
      if (st.dmg) wdmg = st.dmg;
      def += st.def || 0;
      hpBonus += st.hp || 0;
      wingDmg += st.wdmg || 0; absorb += st.absorb || 0;
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
    const dmgMul = (fullSet ? 1.05 : 1) * (1 + wingDmg / 100);
    this.absorb = Math.min(0.6, absorb / 100);
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
  skills() { return G.SKILLS[this.cls].filter((sk) => (!sk.lvl || this.level >= sk.lvl) && (!sk.evo || this.evo >= sk.evo)); }
  className() { return (G.EVOLUTIONS[this.cls] || [])[this.evo] || G.CLASSES[this.cls].name; }
  skillOn(id) { return this.settings.skills[id] !== false; }
  send(msg) { if (this.client && !this.client.closed) this.client.send(msg); }
  // fila: operações de inventário/salvamento nunca correm em paralelo (evita duplicação)
  run(fn) {
    this.queue = this.queue.then(fn).catch((e) => console.error(`[world] ${this.name}:`, e.message));
    return this.queue;
  }
  vip() { return VIP.status(this.vipRow); }
  perks() { return VIP.perks(this.vip().tier); }
  charState() {
    const v = this.vip();
    return {
      vip: { tier: v.tier, plan: v.plan, name: v.name, until: v.until, vip1Until: v.vip1Until, vip2Until: v.vip2Until },
      admin: this.isAdmin, role: this.role, masterResets: this.masterResets, absorb: Math.round((this.absorb || 0) * 100),
      evo: this.evo, className: this.className(), evolutions: G.EVOLUTIONS[this.cls], classQuest: this.classQuest,
      type: 'char', id: this.id, name: this.name, cls: this.cls, ap: this.ap, level: this.level, resets: this.resets,
      stats: this.stats, free: this.free, zen: this.zen, pots: this.pots, settings: this.settings,
      dmg: [this.dmgMin, this.dmgMax], def: this.def, maxHp: this.maxHp, maxMp: this.maxMp, atkMs: this.atkMs,
      crit: this.crit, power: this.power, fullSet: this.fullSet, kills: this.kills, deaths: this.deaths,
      items: this.items.map(publicItem), invMax: G.INVENTORY_SIZE,
      skills: this.skills().map((s) => ({ id: s.id, name: s.name, mana: s.mana, cd: s.cd, fx: s.fx, buff: s.buff || null, heal: !!s.heal, aoe: !!s.aoe, on: this.skillOn(s.id) })),
      mode: G.GAME_MODE.name, deathLoss: G.GAME_MODE.deathExpLoss, pvp: this.pvp,
      allSkills: G.SKILLS[this.cls].filter((s) => s.id !== 'basic').map((s) => ({ id: s.id, name: s.name, lvl: s.lvl || 1, evo: s.evo || 0, evoName: s.evo ? G.EVOLUTIONS[this.cls][s.evo] : null, mana: s.mana, cd: s.cd, desc: skillDesc(s) })),
    };
  }
}

// ------------------------------------------------------------------ mapa
class MapInstance {
  constructor(world, id, def, room = 1) {
    this.world = world; this.id = id; this.def = def; this.room = room;
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
    for (let r = 1; r <= ROOMS; r++) for (const [id, def] of Object.entries(G.WORLD)) this.maps.set(`${r}:${id}`, new MapInstance(this, id, def, r));
    this.players = new Map(); // charId -> Player
    this.chat = [];
    this.timer = setInterval(() => this.tick(), TICK_MS);
    this.saver = setInterval(() => this.saveDirty(), 5000);
    this.lastTick = Date.now();
    this.charLocks = new Map();   // trava por personagem (entrada no mundo x comandos de administração)
    this.lastQueues = new Map();  // última fila de gravação de quem acabou de sair
  }

  async init() {
    const helpers = { publicItem, bagUsed, itemValue, rollRarity, rollPlus };
    await CHAOS.init(helpers);
    await DROPS.init(helpers);
    CMDS.init(this, expToNext);
    this.commands = CMDS;
    await EQUIP.init();
    await CLS.init(helpers);
    await KUNDUN.init(helpers);
    await VAULT.init(helpers);
    await UPG.init({ ...helpers, itemStats });
    TRADE.init(this, helpers);
    await INV.init(this, helpers);
    this.invasion = INV;
    this.expToNext = expToNext;
    await ARENA.init(this, { ...helpers, rollItem, expToNext });
    this.arena = ARENA;
  }

  // instâncias temporárias (arenas de evento): entram no ciclo do mundo enquanto existirem
  addInstance(key, id, def) {
    const inst = new MapInstance(this, id, def, 0);
    inst.key = key;
    this.maps.set(key, inst);
    return inst;
  }
  removeInstance(key) {
    const inst = this.maps.get(key);
    if (!inst || !inst.key) return;
    for (const p of [...inst.players.values()]) {
      p.arena = null;
      if (p.dead) { p.dead = false; p.hp = p.maxHp; p.mp = p.maxMp; }
      this.enterMap(p, 'lorencia');
    }
    this.maps.delete(key);
  }

  // ficha de um personagem que não está no mundo (para comandos de administração)
  async loadShadow(charId) {
    const { rows } = await db.query(`SELECT c.*, a.username AS acc_username, a.email AS acc_email, a.vip1_until, a.vip2_until, a.role AS acc_role, a.muted_until
      FROM characters c JOIN accounts a ON a.id = c.account_id WHERE c.id = $1`, [charId]);
    if (!rows[0]) throw new Error('Personagem não encontrado.');
    rows[0].is_admin_user = ADMIN.isAdmin({ username: rows[0].acc_username, email: rows[0].acc_email });
    const items = (await db.query('SELECT id, base, rarity, plus, equipped, qty, eq_slot, locked FROM items WHERE character_id = $1 AND vault_no IS NULL ORDER BY id', [charId])).rows;
    const p = new Player(rows[0], null, items);
    p.room = 1;
    return p;
  }

  // grava a progressão de uma ficha offline (sem mexer em mapa/posição)
  async persistProgress(p) {
    p.recalc();
    await db.query(`UPDATE characters SET level=$2, exp=$3, zen=$4, str=$5, agi=$6, vit=$7, ene=$8, cmd=$9, free_points=$10,
      resets=$11, master_resets=$12, bonus_points=$13, combat_power=$14, settings=$15 WHERE id=$1 RETURNING id`,
    [p.charId, p.level, Math.round(p.exp), Math.round(p.zen), p.stats.str, p.stats.agi, p.stats.vit, p.stats.ene, p.stats.cmd, p.free,
      p.resets, p.masterResets, p.bonusPoints, p.power, JSON.stringify(p.settings)]);
  }

  // muda um personagem com segurança: online = na fila dele; offline = carregado, alterado e gravado, tudo com a trava
  editChar(charId, fn) {
    return this.withCharLock(charId, async () => {
      const live = this.players.get(String(charId));
      if (live) {
        const job = live.queue.then(async () => {
          const r = await fn(live, true);
          live.recalc(); live.hp = Math.min(live.hp, live.maxHp); live.dirty = true;
          await this.persist(live);
          live.send(live.charState());
          if (live.map) for (const o of live.map.players.values()) if (o !== live) o.send({ type: 'pj', ...this.pinfo(live) });
          return r;
        });
        live.queue = job.catch(() => {});
        return job;
      }
      const lastQ = this.lastQueues.get(String(charId));
      if (lastQ) await lastQ.catch(() => {});
      const p = await this.loadShadow(charId);
      const r = await fn(p, false);
      await this.persistProgress(p);
      return r;
    });
  }

  // depois de mudar nível/reset de quem está online: volta para Lorencia se o mapa não for mais permitido
  adminMoved(p) {
    if (p.map && G.WORLD[p.map.id].minLevel > p.level) { this.enterMap(p, 'lorencia'); p.send({ type: 'log', kind: 'info', text: 'Seu nível mudou: você voltou para Lorencia.' }); }
    p.send({ type: 'log', kind: 'quest', text: 'A administração ajustou seu personagem.' });
  }

  // executa fn com o personagem travado: ninguém entra no mundo com ele nem outro comando mexe ao mesmo tempo
  withCharLock(charId, fn) {
    const key = String(charId);
    const prev = this.charLocks.get(key) || Promise.resolve();
    const next = prev.catch(() => {}).then(fn);
    const tail = next.catch(() => {});
    this.charLocks.set(key, tail);
    tail.then(() => { if (this.charLocks.get(key) === tail) this.charLocks.delete(key); });
    return next;
  }

  online() { return this.players.size; }

  // ---------- entrada e saída ----------
  roomCounts() {
    const out = Array.from({ length: ROOMS }, (_, i) => ({ room: i + 1, players: 0 }));
    for (const p of this.players.values()) if (out[(p.room || 1) - 1]) out[(p.room || 1) - 1].players++;
    return out;
  }

  switchRoom(p, room) {
    room = Math.round(Number(room));
    if (!(room >= 1 && room <= ROOMS) || !p.map || room === p.room) return;
    if (p.dead) return;
    if (p.duel) return p.send({ type: 'log', kind: 'warn', text: 'Termine o duelo antes de trocar de sala.' });
    if (p.arena || (p.map && p.map.def.arena)) return p.send({ type: 'log', kind: 'warn', text: ARENA.blocked(p) || 'Você está em um evento.' });
    if (Date.now() - Math.max(p.pvpHitAt || 0, p.pvpAtkAt || 0) < 10000) return p.send({ type: 'log', kind: 'warn', text: 'Em combate PvP: espere alguns segundos para trocar de sala.' });
    const mapId = p.map.id;
    p.room = room;
    this.enterMap(p, mapId);
    p.send({ type: 'log', kind: 'info', text: `Você entrou na Sala ${room}.` });
  }

  async join(client, charId, room) {
    if (!client.meta.accountId) return client.send({ type: 'error', error: 'Faça login para entrar no mundo.' });
    if (!/^\d{1,18}$/.test(String(charId))) return client.send({ type: 'error', error: 'Personagem inválido.' });
    return this.withCharLock(charId, () => this.joinLocked(client, charId, room));
  }

  async joinLocked(client, charId, room) {
    const lastQ = this.lastQueues.get(String(charId));
    if (lastQ) await lastQ.catch(() => {});
    const { rows } = await db.query(`SELECT c.*, EXTRACT(EPOCH FROM (now() - c.last_seen_at))::int AS offline_secs,
        a.username AS acc_username, a.email AS acc_email, a.vip1_until, a.vip2_until, a.role AS acc_role, a.muted_until
      FROM characters c JOIN accounts a ON a.id = c.account_id WHERE c.id = $1 AND c.account_id = $2`, [charId, client.meta.accountId]);
    const row = rows[0];
    if (row) row.is_admin_user = ADMIN.isAdmin({ username: row.acc_username, email: row.acc_email });
    if (!row) return client.send({ type: 'error', error: 'Personagem não encontrado nesta conta.' });

    // Uma sessão de jogo por conta: derruba a anterior
    for (const p of this.players.values()) {
      if (p.accountId === String(row.account_id)) {
        p.send({ type: 'kicked', reason: 'Sua conta entrou no mundo em outro aparelho ou aba.' });
        await this.leave(p);
      }
    }
    if (client.player) await this.leave(client.player);

    const items = (await db.query('SELECT id, base, rarity, plus, equipped, qty, eq_slot, locked FROM items WHERE character_id = $1 AND vault_no IS NULL ORDER BY id', [row.id])).rows;
    const p = new Player(row, client, items);
    p.room = Math.min(ROOMS, Math.max(1, Math.round(Number(room)) || 1));
    client.player = p;
    this.players.set(p.charId, p);

    if (!row.starter_given) await this.giveStarter(p);
    const report = await this.offlineProgress(p, row);
    Q.normalize(p);
    Q.checkAchievements(p);

    let mapId = G.WORLD[row.map] ? row.map : 'lorencia';
    if (G.WORLD[mapId].minLevel > p.level) mapId = 'lorencia';
    this.enterMap(p, mapId, row.map === mapId && row.pos_x > 0 ? [row.pos_x, row.pos_y] : null);
    p.send(p.charState());
    p.send({ type: 'chatlog', lines: this.chat.slice(-30) });
    p.send({ type: 'invasion', phase: 'status', ...INV.status() });
    ARENA.onJoin(p);
    p.send(Q.state(p));
    if (report) p.send({ type: 'offline', ...report });
    p.dirty = true;
  }

  async giveStarter(p) {
    const weapon = { dark_knight: 'short_sword', magic_gladiator: 'short_sword', dark_wizard: 'skull_staff',
      fairy_elf: 'short_bow', dark_lord: 'small_scepter', summoner: 'spirit_book' }[p.cls];
    for (const base of [weapon, 'leather_armor']) {
      const { rows } = await db.query(`INSERT INTO items (character_id, base, rarity, equipped) VALUES ($1, $2, 'common', TRUE)
        RETURNING id, base, rarity, plus, equipped, qty`, [p.charId, base]);
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
    TRADE.drop(p);
    ARENA.onLeave(p);
    if (p.duel) this.endDuel(null, null, 'draw', p);
    if (p.map) {
      p.map.players.delete(p.id);
      for (const o of p.map.players.values()) o.send({ type: 'pl', id: p.id });
    }
    if (p.client && p.client.player === p) p.client.player = null;
    const q = this.save(p);
    this.lastQueues.set(p.charId, q);
    q.finally(() => { if (this.lastQueues.get(p.charId) === q) this.lastQueues.delete(p.charId); });
    await q;
  }

  disconnect(client) {
    if (client.player) this.leave(client.player).catch((e) => console.error('[world] leave:', e.message));
  }

  enterMap(p, mapId, pos, inst) {
    const m = inst || this.maps.get(`${p.room || 1}:${mapId}`);
    if (p.trade && p.map !== m) TRADE.drop(p, `A troca foi cancelada: ${p.name} mudou de mapa.`);
    if (p.map) {
      p.map.players.delete(p.id);
      for (const o of p.map.players.values()) o.send({ type: 'pl', id: p.id });
    }
    p.map = m;
    const [sx, sy] = pos || m.def.spawn;
    p.x = clamp(sx + (pos ? 0 : rand(-20, 20)), 20, m.def.w - 20);
    p.y = clamp(sy + (pos ? 0 : rand(-20, 20)), 20, m.def.h - 20);
    p.target = null; p.moveTo = null;
    if (!m.def.safe && !m.def.arena) p.lastFarm = mapId;
    m.players.set(p.id, p);
    p.send({
      type: 'enter', map: mapId, room: m.room, rooms: ROOMS, name: m.def.name, theme: m.def.theme, w: m.def.w, h: m.def.h, safe: !!m.def.safe,
      arena: m.def.arena || null, pvp: !!m.def.pvp, margin: m.def.margin || 0,
      npcs: (m.def.npcs || []).filter((n) => VAULT.npcVisible(mapId, n) && UPG.npcVisible(mapId, n)),
      ground: m.ground ? [...m.ground.values()].map((g) => DROPS.publicGround(g)) : [],
      monsters: m.monsters.map((mo) => INV.monInfo(mo)),
      players: [...m.players.values()].filter((o) => o !== p).map((o) => this.pinfo(o)),
      you: p.id,
    });
    for (const o of m.players.values()) if (o !== p) o.send({ type: 'pj', ...this.pinfo(p) });
    p.dirty = true;
  }

  pinfo(p) {
    const w = p.equipped().find((i) => G.ITEM_BASES[i.base] && G.ITEM_BASES[i.base].slot === 'weapon');
    // disfarce do Chaos Castle: só a aparência muda; itens e atributos reais continuam no servidor
    if (ARENA.disguise(p)) return { id: p.id, name: p.name, cls: 'dark_knight', ap: { hair: 0, skin: 1 }, level: p.level, evo: 0, className: 'Guerreiro do Castelo', weaponRarity: 'common', vip: 0, disguise: 1,
      eq: { helm: 'abyss', armor: 'abyss', gloves: 'abyss', boots: 'abyss', w: 'sword' } };
    return { id: p.id, name: p.name, cls: p.cls, ap: p.ap, level: p.level, evo: p.evo, className: p.className(), weaponRarity: w ? w.rarity : 'common', vip: p.vip().tier, eq: gearVisual(p.equipped()) };
  }

  // ---------- mensagens do navegador ----------
  async handle(client, msg) {
    if (msg.type === 'join') return this.join(client, msg.charId, msg.room);
    const p = client.player;
    if (!p) return;
    if (TRADE.blocks(p, msg.type)) return p.send({ type: 'log', kind: 'warn', text: 'Termine ou cancele a troca primeiro.' });
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
        if (p.dead) return;
        if (String(msg.id).startsWith('p')) {
          const o = p.map.players.get(String(msg.id));
          if (o && this.hostile(p, o)) { p.target = o; p.moveTo = null; }
          else if (o && !p.map.def.safe && !p.settings.pvpOn) p.send({ type: 'log', kind: 'warn', text: 'Ligue o botão PvP para atacar jogadores.' });
          else if (o && !p.map.def.safe) p.send({ type: 'log', kind: 'warn', text: `${o.name} está com o PvP desligado.` });
          else p.send({ type: 'log', kind: 'warn', text: 'Na cidade não há PvP. Desafie para um duelo ou vá para fora da cidade.' });
          return;
        }
        if (p.map.def.safe) return;
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
      case 'equip': return p.run(() => this.equip(p, String(msg.id), msg.slot ? String(msg.slot) : null));
      case 'unequip': return p.run(() => this.unequip(p, String(msg.id)));
      case 'sell': return p.run(() => this.sell(p, String(msg.id)));
      case 'sellMany': return p.run(() => this.sellMany(p, Array.isArray(msg.ids) ? msg.ids.slice(0, 500).map(String) : []));
      case 'autoequip': return p.run(() => this.autoEquip(p));
      case 'chat': return this.chatMsg(p, msg.text);
      case 'claim': return p.run(() => this.claim(p, String(msg.kind), String(msg.id || '')));
      case 'duel': return this.duelRequest(p, String(msg.id));
      case 'duelAnswer': return this.duelAnswer(p, String(msg.id), !!msg.accept);
      case 'pvp': return this.setPvp(p, !!msg.on, Date.now());
      case 'room': return this.switchRoom(p, msg.room);
      case 'chaosInfo': return p.send(CHAOS.info(p, DROPS.sources(['jewel_of_chaos', 'loch_feather', ...CHAOS.CHAOS_WEAPONS, ...[1, 2, 3, 4, 5, 6, 7].flatMap((n) => ['devil_eye_' + n, 'devil_key_' + n])])));
      case 'chaos': return p.run(() => CHAOS.craft(this, p, String(msg.recipe), String(msg.main || '')));
      case 'openBox': return p.run(() => KUNDUN.open(this, p, String(msg.id || '')));
      case 'trade': return p.run(() => TRADE.act(this, p, msg));
      case 'vault': return p.run(() => VAULT.act(this, p, msg));
      case 'arena': return p.run(() => ARENA.act(this, p, msg));
      case 'upgPreview': return p.run(() => UPG.preview(p, msg));
      case 'upgDirect': return p.run(() => UPG.direct(this, p, msg));
      case 'smith': return p.run(() => UPG.smith(this, p, msg));
      case 'cqInfo': return p.send(CLS.info(p, String(msg.npc || ''), DROPS.sources(CLS.QUEST_ITEMS)));
      case 'cqAct': return p.run(() => CLS.act(this, p, String(msg.action || ''), String(msg.npc || ''), DROPS.sources(CLS.QUEST_ITEMS)));
      case 'pickup': {
        if (p.dead || !p.map || !p.map.ground) return undefined;
        const g = p.map.ground.get(String(msg.gid));
        if (!g) return undefined;
        if (g.owner !== p.charId) return p.send({ type: 'log', kind: 'warn', text: `Este item é de ${g.ownerName}.` });
        p.moveTo = { x: g.x, y: g.y }; p.target = null; p.pickTarget = g.gid;
        return undefined;
      }
      case 'cmd': return this.commands ? this.commands.run(p, String(msg.text || ''), msg.nonce) : undefined;
      case 'duelQuit': if (p.duel) this.endDuel(p.duel.with, p, 'quit'); return undefined;
      case 'leave': return this.leave(p).then(() => client.send({ type: 'left' }));
      default: return undefined;
    }
  }

  teleport(p, mapId) {
    const def = G.WORLD[mapId];
    if (!def) return p.send({ type: 'log', kind: 'warn', text: 'Mapa não disponível.' });
    if (p.dead) return;
    const ab = ARENA.blocked(p); if (ab) return p.send({ type: 'log', kind: 'warn', text: ab });
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
    if (typeof s.pvpAuto === 'boolean') out.pvpAuto = s.pvpAuto;
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

  // equipar: todas as checagens no servidor; troca de lugar numa transação (nunca dois itens no mesmo lugar)
  async equip(p, id, wanted) {
    const it = p.items.find((i) => String(i.id) === id);
    if (!it) { EQUIP.logDenial(p, null, 'item que não está na bolsa: ' + id); return p.send({ type: 'log', kind: 'warn', text: 'Este item não está na sua bolsa.' }); }
    if (it.equipped) return undefined;
    const r = EQUIP.check(p, it, wanted);
    if (!r.ok) { EQUIP.logDenial(p, it.base, r.reason); return p.send({ type: 'log', kind: 'warn', text: r.reason }); }
    const cur = p.items.find((i) => i.equipped && EQUIP.eqSlotOf(i) === r.slot);
    await db.tx(async (q) => {
      if (cur) await q('UPDATE items SET equipped = FALSE, eq_slot = NULL WHERE id = $1 AND character_id = $2 RETURNING id', [cur.id, p.charId]);
      const d = await q('UPDATE items SET equipped = TRUE, eq_slot = $3 WHERE id = $1 AND character_id = $2 AND equipped = FALSE RETURNING id', [it.id, p.charId, r.slot]);
      if (!d.rows[0]) throw new Error('item mudou');
    });
    if (cur) { cur.equipped = false; cur.eq_slot = null; }
    it.equipped = true; it.eq_slot = r.slot;
    this.afterGearChange(p);
    return undefined;
  }

  async unequip(p, id) {
    const it = p.items.find((i) => String(i.id) === id && i.equipped);
    if (!it) return;
    await db.query('UPDATE items SET equipped = FALSE, eq_slot = NULL WHERE id = $1 AND character_id = $2 RETURNING id', [it.id, p.charId]);
    it.equipped = false; it.eq_slot = null;
    this.afterGearChange(p);
  }

  // melhor equipamento que o personagem pode usar em cada lugar (respeita duas mãos x escudo e os dois anéis)
  async autoEquip(p) {
    const usable = p.items.filter((it) => !it.vault && !EQUIP.meets(p, it));
    const best = (slot, skip = []) => usable.filter((it) => EQUIP.slotsFor(it.base).includes(slot) && !skip.includes(it)).sort((a, b) => itemScore(b) - itemScore(a))[0] || null;
    const plan = {};
    for (const sl of ['weapon', 'helm', 'armor', 'pants', 'gloves', 'boots', 'wings', 'necklace']) plan[sl] = best(sl);
    const curW = p.items.find((i) => i.equipped && EQUIP.eqSlotOf(i) === 'weapon');
    const weapon = plan.weapon || curW;
    plan.shield = weapon && G.ITEM_BASES[weapon.base].twoHand ? null : best('shield');
    plan.ring = best('ring');
    plan.ring2 = best('ring2', plan.ring ? [plan.ring] : []);
    let changed = 0;
    const ops = [];
    for (const [sl, it] of Object.entries(plan)) {
      const cur = p.items.find((i) => i.equipped && EQUIP.eqSlotOf(i) === sl);
      if (!it) { if (sl === 'shield' && cur) ops.push({ off: cur }); continue; }
      if (cur === it) continue;
      if (cur && itemScore(cur) >= itemScore(it) && !EQUIP.meets(p, cur)) continue;
      ops.push({ off: cur, on: it, slot: sl });
    }
    if (ops.length) {
      await db.tx(async (q) => {
        for (const o of ops) if (o.off) await q('UPDATE items SET equipped = FALSE, eq_slot = NULL WHERE id = $1 AND character_id = $2 RETURNING id', [o.off.id, p.charId]);
        for (const o of ops) if (o.on) await q('UPDATE items SET equipped = TRUE, eq_slot = $3 WHERE id = $1 AND character_id = $2 RETURNING id', [o.on.id, p.charId, o.slot]);
      });
      for (const o of ops) if (o.off) { o.off.equipped = false; o.off.eq_slot = null; }
      for (const o of ops) if (o.on) { o.on.equipped = true; o.on.eq_slot = o.slot; changed++; }
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

  async sellMany(p, ids) {
    const want = new Set(ids);
    const list = p.items.filter((i) => want.has(String(i.id)) && !i.equipped);
    if (!list.length) return;
    const { rows } = await db.query("DELETE FROM items WHERE id = ANY(string_to_array($1, ',')::bigint[]) AND character_id = $2 AND equipped = FALSE RETURNING id",
      [list.map((i) => String(Number(i.id))).join(','), p.charId]);
    const gone = new Set(rows.map((r) => String(r.id)));
    let v = 0, n = 0;
    for (const it of list) if (gone.has(String(it.id))) { v += itemValue(it); n++; }
    if (!n) return;
    p.items = p.items.filter((i) => !gone.has(String(i.id)));
    p.zen += v;
    await this.persist(p);
    p.send({ type: 'log', kind: 'info', text: `Vendeu ${n} ${n > 1 ? 'itens' : 'item'} por ${v} Zen.` });
    p.send(p.charState());
  }

  chatMsg(p, text) {
    const t = String(text || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 120);
    if (!t) return;
    // comandos nunca vão para o chat público
    if (t.startsWith('/')) return this.commands ? this.commands.run(p, t) : undefined;
    const now = Date.now();
    if (p.mutedUntil > now) return p.send({ type: 'log', kind: 'warn', text: `Você está silenciado no chat por mais ${Math.ceil((p.mutedUntil - now) / 60000)} min.` });
    if (p.lastChat && now - p.lastChat < 1200) return p.send({ type: 'log', kind: 'warn', text: 'Calma: espere um pouco para enviar outra mensagem.' });
    p.lastChat = now;
    const line = { from: p.name, cls: p.cls, text: t, t: now };
    this.chat.push(line); if (this.chat.length > 60) this.chat.shift();
    for (const o of this.players.values()) o.send({ type: 'chat', ...line });
  }

  system(text, en) {
    const line = { from: null, text, t: Date.now() };
    if (en) line.en = en;
    this.chat.push(line); if (this.chat.length > 60) this.chat.shift();
    for (const o of this.players.values()) o.send({ type: 'chat', ...line });
  }

  // ---------- progresso offline (calculado só com o relógio do servidor) ----------
  async offlineProgress(p, row) {
    const pk = p.perks(), capS = Math.max(OFFLINE_CAP_S, pk.offlineH * 3600);
    const secs = Math.min(capS, Math.max(0, Number(row.offline_secs) || 0));
    const def = G.WORLD[row.last_farm_map];
    if (!row.auto_on || !def || def.safe || secs < 60 || p.level < def.minLevel) return null;
    const types = def.groups.map((g) => ({ T: G.MONSTERS[g.type], n: g.count }));
    const totalN = types.reduce((a, t) => a + t.n, 0);
    const avg = (f) => types.reduce((a, t) => a + f(t.T) * t.n, 0) / totalN;
    const mHp = avg((T) => T.hp), mDmg = avg((T) => T.dmg), mExp = avg((T) => T.exp);
    const mZen = avg((T) => monsterZen(T)), mDrop = avg((T) => T.drop), mLvl = avg((T) => T.level);
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
      kills++; exp += mExp * XP() * pk.exp; zen += mZen;
      p.exp += mExp * XP() * pk.exp;
      while (p.exp >= expToNext(p.level) && p.level < G.LIMITS.maxLevel) { p.exp -= expToNext(p.level); this.levelUp(p, true); levels++; }
      if (kills > 50000) break;
    }
    p.pots.hp = Math.floor(p.pots.hp);
    p.zen += Math.round(zen);
    p.kills += kills;
    const found = [];
    const drops = Math.min(12 + (pk.tier || 0) * 6, Math.round(kills * mDrop * pk.drop * rand(0.7, 1.1)));
    for (let i = 0; i < drops; i++) {
      const it = rollItem(Math.round(mLvl), 'normal');
      const r = await this.addItem(p, it, true);
      if (r) found.push(r);
    }
    const mats = DROPS.offline(this, p, def, row.last_farm_map, kills);
    const matCount = {};
    for (const d of mats) {
      const before = p.zen;
      await DROPS.deliver(this, p, d, { offline: true, source: def.name, mapId: row.last_farm_map, tier: 'normal' });
      if (p.zen === before) matCount[d.item] = (matCount[d.item] || 0) + d.qty;
    }
    for (const [k, q] of Object.entries(matCount)) found.push({ id: 'm' + k, base: k, rarity: G.ITEM_BASES[k].rarity || 'common', plus: 0, equipped: false, qty: q });
    if (died) { p.deaths++; p.lastFarm = row.last_farm_map; }
    p.recalc();
    p.hp = p.maxHp; p.mp = p.maxMp;
    p.dirty = true;
    return { secs, capped: Number(row.offline_secs) > capS, capH: Math.round(capS / 3600), vip: pk.tier || 0, map: def.name, kills, exp: Math.round(exp), levels,
      zen: Math.round(zen), potsUsed: Math.round(potsUsed), died, items: found.map(publicItem) };
  }

  // Adiciona um item (drop). Itens abaixo da raridade mínima ou sem espaço viram Zen.
  async addItem(p, it, silent) {
    const minIdx = RARITY_ORDER.indexOf(p.settings.lootMin);
    if (RARITY_ORDER.indexOf(it.rarity) < minIdx || bagUsed(p) >= G.INVENTORY_SIZE) {
      const v = itemValue(it);
      p.zen += v; p.dirty = true;
      if (!silent) p.send({ type: 'log', kind: 'zen', text: `${G.ITEM_BASES[it.base].name} vendido automaticamente: +${v} Zen` });
      return null;
    }
    const { rows } = await db.query(`INSERT INTO items (character_id, base, rarity, plus) VALUES ($1,$2,$3,$4)
      RETURNING id, base, rarity, plus, equipped, qty`, [p.charId, it.base, it.rarity, it.plus]);
    p.items.push(rows[0]);
    this.quest(p, 'loot', 1);
    if (['legendary', 'ancestral'].includes(it.rarity)) { p.quests.life = p.quests.life || {}; p.quests.life.legendary = (p.quests.life.legendary || 0) + 1; this.achieve(p); }
    if (!silent) {
      p.send({ type: 'drop', item: publicItem(rows[0]), x: it.pos ? it.pos[0] : null, y: it.pos ? it.pos[1] : null });
      p.send(p.charState());
    }
    return rows[0];
  }

  // material empilhável: completa as pilhas que já existem e cria novas se precisar. Devolve quanto entrou.
  async giveMaterial(p, base, qty, opts = {}) {
    let left = Math.max(0, Math.round(qty));
    let got = 0;
    let last = null;
    for (const st of p.items.filter((i) => i.base === base && !i.equipped).sort((a, b) => Number(a.id) - Number(b.id))) {
      if (left <= 0) break;
      const room = G.MAX_STACK - (Number(st.qty) || 1);
      if (room <= 0) continue;
      const n = Math.min(room, left);
      const { rows } = await db.query('UPDATE items SET qty = qty + $3 WHERE id = $1 AND character_id = $2 AND qty + $3 <= $4 RETURNING qty', [st.id, p.charId, n, G.MAX_STACK]);
      if (!rows[0]) continue;
      st.qty = Number(rows[0].qty); left -= n; got += n; last = st;
    }
    while (left > 0 && bagUsed(p) < G.INVENTORY_SIZE) {
      const n = Math.min(G.MAX_STACK, left);
      const b = G.ITEM_BASES[base];
      const { rows } = await db.query(`INSERT INTO items (character_id, base, rarity, plus, qty) VALUES ($1,$2,$3,0,$4)
        RETURNING id, base, rarity, plus, equipped, qty`, [p.charId, base, b.rarity || 'common', n]);
      p.items.push(rows[0]); left -= n; got += n; last = rows[0];
    }
    if (got) {
      p.dirty = true;
      if (!opts.silent && p.client) {
        p.send({ type: 'drop', item: publicItem(last), gain: got, src: opts.src || null, x: opts.x ?? null, y: opts.y ?? null });
        p.send(p.charState());
      }
    }
    return got;
  }

  // item comum de drop especial (arma do Caos): vai para a bolsa se houver lugar. Devolve a linha ou null.
  async giveItemRow(p, it, opts = {}) {
    if (bagUsed(p) >= G.INVENTORY_SIZE) return null;
    const { rows } = await db.query(`INSERT INTO items (character_id, base, rarity, plus) VALUES ($1,$2,$3,$4)
      RETURNING id, base, rarity, plus, equipped, qty`, [p.charId, it.base, it.rarity, it.plus || 0]);
    p.items.push(rows[0]);
    p.dirty = true;
    if (!opts.silent && p.client) {
      p.send({ type: 'drop', item: publicItem(rows[0]), gain: 1, src: opts.src || null, x: opts.x ?? null, y: opts.y ?? null });
      p.send(p.charState());
    }
    return rows[0];
  }

  levelUp(p, silent) {
    p.level++;
    p.free += G.POINTS_PER_LEVEL[p.cls];
    if (p.settings.autoStats) this.autoDistribute(p); else p.recalc();
    p.hp = p.maxHp; p.mp = p.maxMp;
    if (p.quests && p.quests.ach) this.achieve(p, silent);
    if (!silent && p.map) {
      p.map.emit({ k: 'lv', t: p.id });
      for (const o of p.map.players.values()) o.send({ type: 'pj', ...this.pinfo(p) });
      p.send(p.charState());
      if (p.level % 10 === 0) this.system(`${p.name} alcançou o nível ${p.level}!`);
    }
  }

  // ---------- VIP e administração ----------
  async refreshVip(accountId) {
    const { rows } = await db.query('SELECT vip1_until, vip2_until FROM accounts WHERE id = $1', [accountId]);
    if (!rows[0]) return;
    for (const p of this.players.values()) {
      if (p.accountId !== String(accountId)) continue;
      p.vipRow = rows[0];
      const v = p.vip();
      p.send(p.charState());
      if (p.map) for (const o of p.map.players.values()) o.send({ type: 'pj', ...this.pinfo(p) });
      if (v.tier > 0) p.send({ type: 'log', kind: 'quest', text: `${v.name} ativo até ${new Date(v.until).toLocaleDateString('pt-BR')}! Obrigado por apoiar o MU Idle Legends.` });
      else p.send({ type: 'log', kind: 'info', text: 'Seu VIP terminou.' });
    }
  }

  async adminChar(name) {
    const { rows } = await db.query(`SELECT c.id, c.name, c.class, c.level, c.resets, c.zen, c.free_points, c.str, c.agi, c.vit, c.ene, c.cmd,
        a.username, a.vip1_until, a.vip2_until,
        (SELECT count(*) FROM items i WHERE i.character_id = c.id AND NOT i.equipped AND i.vault_no IS NULL)::int AS bag
      FROM characters c JOIN accounts a ON a.id = c.account_id WHERE lower(c.name) = lower($1)`, [String(name || '').trim()]);
    const r = rows[0];
    if (!r) return null;
    const p = this.players.get(String(r.id));
    const out = { id: String(r.id), name: r.name, cls: r.class, level: r.level, resets: r.resets, zen: Number(r.zen), free: r.free_points,
      stats: { str: r.str, agi: r.agi, vit: r.vit, ene: r.ene, cmd: r.cmd }, account: r.username, bag: r.bag, online: !!p,
      vip: VIP.status(r) };
    if (p) Object.assign(out, { level: p.level, zen: p.zen, free: p.free, stats: { ...p.stats }, bag: p.items.filter((i) => !i.equipped).length, vip: p.vip() });
    return out;
  }

  // itens escolhidos pelo administrador (vão para a bolsa, sem virar Zen); materiais empilham
  async adminGiveItems(charId, list) {
    const clean = [];
    for (const it of list) {
      const b = G.ITEM_BASES[it.base];
      if (!b) throw new Error('Item desconhecido.');
      if (!RARITY_ORDER.includes(it.rarity)) throw new Error('Raridade inválida.');
      const fixed = b.stack || b.slot === 'wings';
      clean.push({ base: it.base, rarity: fixed ? (b.rarity || 'common') : it.rarity, plus: b.stack ? 0 : clamp(Math.round(Number(it.plus) || 0), 0, 15) });
    }
    return this.editChar(charId, async (p) => {
      const stacks = {}, rows = [];
      for (const it of clean) if (G.ITEM_BASES[it.base].stack) stacks[it.base] = (stacks[it.base] || 0) + 1; else rows.push(it);
      const newStacks = Object.keys(stacks).filter((k) => !p.items.some((i) => i.base === k && !i.equipped && (Number(i.qty) || 1) + stacks[k] <= G.MAX_STACK)).length;
      const free = G.INVENTORY_SIZE - bagUsed(p);
      if (rows.length + newStacks > free) throw new Error(`Bolsa sem espaço: ${free} lugar(es) livre(s).`);
      const added = [];
      for (const [k, n] of Object.entries(stacks)) { await this.giveMaterial(p, k, n, { silent: true }); added.push({ id: 'x', base: k, rarity: G.ITEM_BASES[k].rarity, plus: 0, qty: n }); }
      for (const it of rows) { const r = await this.giveItemRow(p, it, { silent: true }); if (r) added.push(r); }
      p.send({ type: 'log', kind: 'quest', text: `O administrador enviou ${clean.length} item(ns) para a sua bolsa.` });
      return added.map(publicItem);
    });
  }

  // melhor equipamento da classe: arma mais forte, conjunto do Dragão e anel, todos ancestrais +15
  bestKit(cls) {
    const kinds = G.CLASS_WEAPONS[cls] || [];
    const best = (pred) => Object.entries(G.ITEM_BASES).filter(([, b]) => pred(b)).sort((a, b) => b[1].req - a[1].req)[0];
    const out = [];
    for (const k of kinds) { const w = best((b) => b.slot === 'weapon' && b.kind === k); if (w) out.push(w[0]); }
    for (const slot of ['helm', 'armor', 'pants', 'gloves', 'boots', 'ring', 'necklace']) { const b = best((x) => x.slot === slot && !x.special); if (b) out.push(b[0]); }
    const r1 = best((x) => x.slot === 'ring' && !x.special); if (r1) out.push(r1[0]);
    if (kinds.some((k) => k === 'sword' || k === 'scepter' || k === 'book') && ['dark_knight', 'dark_wizard', 'dark_lord'].includes(cls)) { const sh = best((x) => x.slot === 'shield'); if (sh) out.push(sh[0]); }
    return out.map((base) => ({ base, rarity: 'ancestral', plus: 15 }));
  }

  async adminSetLevel(charId, level) {
    level = clamp(Math.round(Number(level) || 1), 1, G.LIMITS.maxLevel);
    return this.editChar(charId, async (p, online) => {
      while (p.level < level) this.levelUp(p, true);
      if (p.level > level) p.level = level;
      p.exp = 0; p.recalc(); p.hp = p.maxHp; p.mp = p.maxMp;
      if (online) p.send({ type: 'log', kind: 'quest', text: `O administrador ajustou seu nível para ${p.level}.` });
      return p.level;
    });
  }

  // atributos no máximo (32.767 em cada, como no MU)
  async adminMaxStats(charId) {
    const MAX = 32767;
    return this.editChar(charId, async (p, online) => {
      for (const k of ['str', 'agi', 'vit', 'ene']) p.stats[k] = MAX;
      if (p.cls === 'dark_lord') p.stats.cmd = MAX;
      p.free = 0; p.recalc(); p.hp = p.maxHp; p.mp = p.maxMp;
      if (online) p.send({ type: 'log', kind: 'quest', text: 'O administrador colocou seus atributos no máximo.' });
      return true;
    });
  }

  async adminAdd(charId, what, n) {
    n = Math.round(Number(n) || 0);
    if (!n || Math.abs(n) > 2e9) throw new Error('Quantidade inválida.');
    if (!['points', 'zen'].includes(what)) throw new Error('Opção inválida.');
    return this.editChar(charId, async (p) => {
      if (what === 'points') { const before = p.free; p.free = Math.max(0, p.free + n); p.bonusPoints = Math.max(0, p.bonusPoints + (p.free - before)); }
      else p.zen = Math.max(0, p.zen + n);
      return true;
    });
  }

  // ---------- PvP ----------
  hostile(a, b) {
    if (!b || !b.isPlayer || a === b || a.dead || b.dead || !a.map || a.map !== b.map) return false;
    if (a.duel && a.duel.with === b) return true;
    if (a.map.def.safe) return false;
    if (a.map.def.arena) return !!a.map.def.pvp;
    if (a.map.def.pvp) return true;
    // nos outros mapas de caça: luta quem ligou o modo PvP (os dois)
    return !!a.settings.pvpOn && !!b.settings.pvpOn;
  }

  setPvp(p, on, now) {
    if (on === !!p.settings.pvpOn) return;
    const lastFight = Math.max(p.pvpHitAt || 0, p.pvpAtkAt || 0);
    if (!on && now - lastFight < 10000) {
      const s = Math.ceil((10000 - (now - lastFight)) / 1000);
      return p.send({ type: 'log', kind: 'warn', text: `Em combate PvP: espere ${s}s para desligar.` });
    }
    p.settings.pvpOn = on; p.dirty = true;
    if (!on && p.target && p.target.isPlayer && !this.hostile(p, p.target)) p.target = null;
    p.send({ type: 'log', kind: on ? 'pvp' : 'info', text: on
      ? 'Modo PvP LIGADO: fora da cidade você pode atacar e ser atacado por quem também está com PvP ligado. Em Vulcanus o PvP é sempre aberto.'
      : 'Modo PvP desligado.' });
  }

  damagePlayer(a, v, mult, crit, now) {
    const bd = a.buffs.dmg && a.buffs.dmg.until > now ? a.buffs.dmg.mult : 1;
    const db = v.buffs.def && v.buffs.def.until > now ? v.buffs.def.mult : 1;
    const raw = rand(a.dmgMin, a.dmgMax) * mult * bd * (crit ? 1.5 : 1);
    const d = Math.max(1, Math.round((raw - v.def * db / 2) * PVP_SCALE * (1 - (v.absorb || 0))));
    v.hp -= d;
    v.pvpHitAt = now; a.pvpAtkAt = now;
    v.flip = a.x < v.x;
    // revida automaticamente quem está atacando
    if (v.auto && (!v.target || !v.target.isPlayer)) v.target = a;
    if (v.hp <= 0) this.pvpDefeat(a, v, now);
    return d;
  }

  pvpDefeat(k, v, now) {
    if (k.duel && k.duel.with === v) {
      v.hp = Math.max(1, Math.round(v.maxHp * 0.3));
      this.endDuel(k, v, 'win');
      return;
    }
    const map = k.map;
    k.pvp.kills++; v.pvp.deaths++;
    if (map.def.arena) {
      ARENA.onPvpKill(this, k, v);
      this.killPlayer(v, now, { T: { name: k.name } });
      if (k.target === v) k.target = null;
      k.dirty = true; v.dirty = true;
      return;
    }
    if (v.pkUntil > now) {
      k.zen += 3000;
      k.send({ type: 'log', kind: 'quest', text: `Você derrotou o PK ${v.name}: +3.000 Zen de recompensa.` });
    } else if (k.level - v.level >= 20) {
      k.pkUntil = now + PK_MS; k.pvp.pk++;
      this.system(`${k.name} atacou um herói muito mais fraco e virou PK por 10 minutos! Derrotá-lo dá recompensa.`);
    }
    for (const o of map.players.values()) o.send({ type: 'log', kind: 'pvp', text: `${k.name} derrotou ${v.name} em ${map.def.name}.` });
    this.killPlayer(v, now, { T: { name: k.name } });
    if (k.target === v) k.target = null;
    k.dirty = true; v.dirty = true;
  }

  duelRequest(p, id) {
    const now = Date.now();
    if (p.lastDuelReq && now - p.lastDuelReq < 5000) return p.send({ type: 'log', kind: 'warn', text: 'Espere alguns segundos para convidar de novo.' });
    const o = this.players.get(id.replace(/^p/, ''));
    if (!o || o === p || o.map !== p.map) return p.send({ type: 'log', kind: 'warn', text: 'O jogador precisa estar no mesmo mapa.' });
    if (p.map && p.map.def.arena) return p.send({ type: 'log', kind: 'warn', text: 'Não há duelos durante eventos.' });
    if (p.duel || o.duel) return p.send({ type: 'log', kind: 'warn', text: 'Um de vocês já está em duelo.' });
    if (p.dead || o.dead) return;
    p.lastDuelReq = now;
    o.duelInvite = { from: p, until: now + 15000 };
    o.send({ type: 'duelInvite', id: p.id, name: p.name, level: p.level, cls: p.cls });
    p.send({ type: 'log', kind: 'info', text: `Convite de duelo enviado para ${o.name}.` });
  }

  duelAnswer(o, fromId, accept) {
    const inv = o.duelInvite;
    o.duelInvite = null;
    if (!inv || inv.from.id !== fromId || Date.now() > inv.until) return o.send({ type: 'log', kind: 'warn', text: 'O convite expirou.' });
    const p = inv.from;
    if (!this.players.has(p.charId) || p.map !== o.map || p.duel || o.duel) return o.send({ type: 'log', kind: 'warn', text: 'Não foi possível começar o duelo.' });
    if (!accept) return p.send({ type: 'log', kind: 'warn', text: `${o.name} recusou o duelo.` });
    const until = Date.now() + DUEL_MS;
    p.duel = { with: o, until }; o.duel = { with: p, until };
    for (const x of [p, o]) { x.hp = x.maxHp; x.mp = x.maxMp; x.target = null; x.moveTo = null; }
    p.send({ type: 'duel', with: o.id, name: o.name, until: DUEL_MS });
    o.send({ type: 'duel', with: p.id, name: p.name, until: DUEL_MS });
    for (const x of p.map.players.values()) x.send({ type: 'log', kind: 'pvp', text: `Duelo: ${p.name} contra ${o.name}!` });
  }

  endDuel(winner, loser, reason, leaver) {
    const a = winner || (leaver && leaver.duel && leaver.duel.with) || null;
    const b = loser || leaver || (a && a.duel && a.duel.with) || null;
    for (const x of [a, b]) if (x) { x.duel = null; if (x.target && x.target.isPlayer) x.target = null; }
    if (reason === 'win' || reason === 'quit') {
      winner.pvp.duelW++; loser.pvp.duelL++;
      winner.dirty = true; loser.dirty = true;
      this.system(`${winner.name} venceu o duelo contra ${loser.name}${reason === 'quit' ? ' (desistência)' : ''}!`);
      winner.send({ type: 'duelEnd', result: 'win' }); loser.send({ type: 'duelEnd', result: 'loss' });
    } else {
      for (const x of [a, b]) if (x) x.send({ type: 'duelEnd', result: 'draw' });
    }
  }

  // ---------- missões ----------
  quest(p, kind, amount) {
    if (!p.quests || !p.quests.daily) return;
    const done = Q.track(p, kind, amount);
    if (done.length || kind === 'kill' || kind === 'loot' || kind === 'elite' || kind === 'online') p.questsDirty = true;
    for (const m of done) p.send({ type: 'log', kind: 'quest', text: 'Missão diária concluída! Abra Missões para pegar o prêmio.' });
    if (kind === 'zen' && Math.random() < 0.05) p.questsDirty = true;
  }

  achieve(p, silent) {
    if (!p.quests || !p.quests.ach) return;
    const done = Q.checkAchievements(p);
    if (done.length) p.questsDirty = true;
    if (!silent) for (const a of done) p.send({ type: 'log', kind: 'quest', text: `Conquista: ${a.text}! Pegue o prêmio em Missões.` });
  }

  async grant(p, reward, label) {
    const parts = [];
    if (reward.zen) { p.zen += reward.zen; parts.push(`${reward.zen.toLocaleString('pt-BR')} Zen`); }
    if (reward.pot_hp) { p.pots.hp += reward.pot_hp; parts.push(`${reward.pot_hp} poções de vida`); }
    if (reward.pot_mp) { p.pots.mp += reward.pot_mp; parts.push(`${reward.pot_mp} poções de mana`); }
    if (reward.item) {
      const it = rollItem(Math.max(1, p.level), 'normal');
      it.rarity = reward.item;
      if (bagUsed(p) >= G.INVENTORY_SIZE) { const v = itemValue(it) * 2; p.zen += v; parts.push(`${v} Zen (bolsa cheia)`); }
      else {
        const { rows } = await db.query(`INSERT INTO items (character_id, base, rarity, plus) VALUES ($1,$2,$3,$4)
          RETURNING id, base, rarity, plus, equipped, qty`, [p.charId, it.base, it.rarity, it.plus]);
        p.items.push(rows[0]);
        p.send({ type: 'drop', item: publicItem(rows[0]) });
        parts.push(G.ITEM_BASES[it.base].name);
      }
    }
    p.send({ type: 'log', kind: 'quest', text: `${label}: ${parts.join(' + ')}` });
  }

  async claim(p, kind, id) {
    const q = p.quests;
    if (kind === 'daily') {
      const m = (q.daily.list || []).find((x) => x.id === id);
      if (!m || m.claimed || m.prog < m.goal) return;
      m.claimed = true;
      await this.grant(p, G.DAILY_POOL.find((d) => d.id === id).reward, 'Prêmio da missão');
    } else if (kind === 'login') {
      if (q.login.claimed) return;
      q.login.claimed = true;
      const idx = ((q.login.streak || 1) - 1) % G.LOGIN_REWARDS.length;
      await this.grant(p, G.LOGIN_REWARDS[idx], `Prêmio do dia ${idx + 1}`);
      Q.checkAchievements(p);
    } else if (kind === 'ach') {
      if (q.ach[id] !== 'done') return;
      q.ach[id] = 'claimed';
      await this.grant(p, G.ACHIEVEMENTS.find((a) => a.id === id).reward, 'Prêmio da conquista');
    } else return;
    await this.persist(p);
    p.send(p.charState());
    p.send(Q.state(p));
  }

  // ---------- combate ----------
  usePotion(p, kind, now, manual) {
    if (p.dead || now < p.nextPot) return;
    if (p.pots[kind] <= 0) { if (manual) p.send({ type: 'log', kind: 'warn', text: kind === 'hp' ? 'Sem poções de vida. Compre na loja de Lorencia.' : 'Sem poções de mana.' }); return; }
    if (kind === 'hp' && p.hp >= p.maxHp) return;
    if (kind === 'mp' && p.mp >= p.maxMp) return;
    p.pots[kind]--;
    p.nextPot = now + POTION_CD_MS;
    this.quest(p, 'potion', 1);
    if (kind === 'hp') { const v = Math.round(p.maxHp * (now - (p.pvpHitAt || 0) < 5000 ? 0.15 : 0.35)); p.hp = Math.min(p.maxHp, p.hp + v); p.map.emit({ k: 'heal', t: p.id, d: v }); }
    else p.mp = Math.min(p.maxMp, p.mp + Math.round(p.maxMp * 0.5));
    p.dirty = true;
  }

  damageMonster(p, m, mult, crit, now) {
    const bd = p.buffs.dmg && p.buffs.dmg.until > now ? p.buffs.dmg.mult : 1;
    const raw = rand(p.dmgMin, p.dmgMax) * mult * bd * (crit ? 1.5 : 1);
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
      const inPvp = !!p.duel || !!(target && target.isPlayer);
      const v = Math.round(p.maxHp * sk.heal * (inPvp ? 0.5 : 1));
      p.hp = Math.min(p.maxHp, p.hp + v);
      p.mp -= sk.mana; p.cds[sk.id] = now + sk.cd;
      map.emit({ k: 'heal', t: p.id, d: v, fx: 'heal' });
      return;
    }
    if (sk.buff) {
      p.mp -= sk.mana; p.cds[sk.id] = now + sk.cd;
      p.buffs[sk.buff] = { mult: sk.bmult, until: now + sk.dur };
      map.emit({ k: 'buff', t: p.id, b: sk.buff });
      this.quest(p, 'skill', 1);
      return;
    }
    p.mp -= sk.mana;
    if (sk.cd) p.cds[sk.id] = now + sk.cd;
    if (sk.id !== 'basic') this.quest(p, 'skill', 1);
    p.nextAtk = now + p.atkMs;
    p.flip = target.x < p.x;
    const crit = Math.random() < p.crit;
    if (sk.aoe) {
      const cx = sk.self ? p.x : target.x, cy = sk.self ? p.y : target.y;
      const hits = map.monsters.filter((m) => !m.dead && Math.hypot(m.x - cx, m.y - cy) <= sk.aoe).slice(0, 8);
      const foes = [...map.players.values()].filter((o) => this.hostile(p, o) && Math.hypot(o.x - cx, o.y - cy) <= sk.aoe).slice(0, 4);
      map.emit({ k: 'aoe', a: p.id, x: Math.round(cx), y: Math.round(cy), r: sk.aoe, fx: sk.fx });
      for (const m of hits) { const d = this.damageMonster(p, m, sk.mult, crit, now); map.emit({ k: 'h', a: p.id, t: m.id, d, c: crit ? 1 : 0, fx: sk.fx, aoe: 1 }); }
      for (const o of foes) { if (o.dead) continue; const d = this.damagePlayer(p, o, sk.mult, crit, now); map.emit({ k: 'h', a: p.id, t: o.id, d, c: crit ? 1 : 0, fx: sk.fx, aoe: 1 }); }
    } else if (target.isPlayer) {
      const d = this.damagePlayer(p, target, sk.mult, crit, now);
      map.emit({ k: 'h', a: p.id, t: target.id, d, c: crit ? 1 : 0, fx: sk.fx });
    } else {
      const d = this.damageMonster(p, target, sk.mult, crit, now);
      map.emit({ k: 'h', a: p.id, t: target.id, d, c: crit ? 1 : 0, fx: sk.fx });
    }
  }

  killMonster(m, killer, now) {
    if (m.dead) return;
    m.dead = true; m.hp = 0; m.target = null;
    const map = killer.map;
    m.respawnAt = m.golden ? Infinity : now + (m.T.respawnMs || MONSTER_RESPAWN_MS);
    if (m.T.arena) return ARENA.onMonsterKill(this, m, map, killer);
    map.emit({ k: 'die', t: m.id });
    if (m.T.golden) return INV.onKill(this, m, map, killer);
    if (m.T.boss) return this.bossRewards(m, map, killer);
    const p = killer;
    const pk = p.perks();
    const exp = Math.round(m.T.exp * XP() * pk.exp), zen = monsterZen(m.T);
    p.exp += exp; p.kills++; p.zen += zen;
    // Zen de monstros normais é sempre creditado diretamente; bônus VIP/evento não ultrapassam o teto.
    this.quest(p, 'kill', 1); this.quest(p, 'zen', zen);
    if (m.T.elite) this.quest(p, 'elite', 1);
    if (p.kills % 50 === 0 || p.kills === 100) this.achieve(p);
    p.send({ type: 'reward', exp, zen, mon: m.T.name });
    while (p.exp >= expToNext(p.level) && p.level < G.LIMITS.maxLevel) { p.exp -= expToNext(p.level); this.levelUp(p); }
    p.dirty = true;
    if (Math.random() < Math.min(0.95, m.T.drop * pk.drop)) {
      const it = rollItem(m.T.level, 'normal');
      it.pos = [Math.round(m.x), Math.round(m.y)];
      p.run(() => this.addItem(p, it));
    }
    DROPS.onKill(this, p, m, map);
    m.contrib.clear();
  }

  // EXP e Zen de um monstro dividido por contribuição (Invasão Dourada)
  grantShare(p, m, share) {
    const pk = p.perks();
    const exp = Math.round(m.T.exp * XP() * pk.exp * share);
    const zen = Math.min(5, Math.max(0, Math.round(monsterZen(m.T) * Math.max(0, share))));
    p.exp += exp; p.zen += zen; p.kills++;
    this.quest(p, 'kill', 1); this.quest(p, 'elite', 1); this.quest(p, 'zen', zen); this.achieve(p);
    p.send({ type: 'reward', exp, zen, mon: m.T.name, share: share < 1 ? Math.round(share * 100) : undefined });
    while (p.exp >= expToNext(p.level) && p.level < G.LIMITS.maxLevel) { p.exp -= expToNext(p.level); this.levelUp(p); }
    p.dirty = true;
  }

  bossRewards(m, map, killer) {
    const ranked = [...m.contrib.entries()].sort((a, b) => b[1] - a[1]);
    const eligible = ranked.map(([charId, dmg]) => ({ p: this.players.get(charId), dmg }))
      .filter((x) => x.p && x.p.map === map && x.dmg > 0);
    const total = eligible.reduce((a, x) => a + x.dmg, 0) || 1;
    // Um único prêmio total por morte de Boss, repartido por contribuição; VIP não multiplica Zen.
    const pool = bossZen(m.T);
    let distributed = 0;
    eligible.forEach(({ p, dmg }, i) => {
      const share = dmg / total;
      const zen = i === eligible.length - 1 ? pool - distributed : Math.floor(pool * share);
      distributed += zen;
      const pk = p.perks();
      const exp = Math.round(m.T.exp * XP() * pk.exp * Math.max(0.1, share));
      p.exp += exp; p.zen += zen; p.bossesKilled++;
      this.quest(p, 'elite', 1); this.quest(p, 'zen', zen); this.achieve(p);
      p.send({ type: 'reward', exp, zen, mon: m.T.name, share: Math.round(share * 100) });
      while (p.exp >= expToNext(p.level) && p.level < G.LIMITS.maxLevel) { p.exp -= expToNext(p.level); this.levelUp(p); }
      const rolls = i === 0 ? 2 : (share >= 0.1 && Math.random() < 0.5 ? 1 : 0);
      for (let r = 0; r < rolls; r++) { const it = rollItem(m.T.level, 'boss'); it.pos = [Math.round(m.x + rand(-20, 20)), Math.round(m.y + rand(-10, 10))]; p.run(() => this.addItem(p, it)); }
      if (i === 0 || share >= 0.1) DROPS.onKill(this, p, m, map);
      p.dirty = true;
      p.lastSave = 0;
    });
    const top = eligible[0] && eligible[0].p;
    this.system(`O ${m.T.name} foi derrotado na Sala ${map.room}${top ? ` — maior dano: ${top.name}` : ''}! Ele volta em 10 minutos.`);
    m.contrib.clear();
  }

  hurtPlayer(m, p, now) {
    const db = p.buffs.def && p.buffs.def.until > now ? p.buffs.def.mult : 1;
    const d = Math.max(1, Math.round((m.T.dmg * rand(0.85, 1.15) - p.def * db / 2) * (1 - (p.absorb || 0))));
    p.hp -= d; p.hurtAt = now;
    p.map.emit({ k: 'h', a: m.id, t: p.id, d, fx: m.T.boss ? 'boss' : 'claw' });
    if (p.hp <= 0) this.killPlayer(p, now, m);
  }

  killPlayer(p, now, by) {
    p.hp = 0; p.dead = true; p.deaths++;
    TRADE.drop(p, `A troca foi cancelada: ${p.name} foi derrotado.`);
    p.respawnAt = now + RESPAWN_MS;
    p.target = null; p.moveTo = null;
    p.map.emit({ k: 'pdie', t: p.id });
    // eliminado de um evento: não perde EXP
    if (p.map.def.arena) { p.buffs = {}; ARENA.onDeath(p, by); p.dirty = true; return; }
    // Hard XP: morrer custa uma parte da EXP do nível atual
    const pkMul = p.pkUntil > now ? 3 : 1; // PK perde o triplo
    const loss = Math.min(p.exp, Math.floor(expToNext(p.level) * G.GAME_MODE.deathExpLoss * pkMul));
    p.exp -= loss;
    p.buffs = {};
    p.send({ type: 'log', kind: 'warn', text: `Você foi derrotado por ${by.T.name}${loss ? ` e perdeu ${loss.toLocaleString('pt-BR')} de EXP` : ''}. Voltando para Lorencia…` });
    p.dirty = true;
  }

  // ---------- loop principal ----------
  tick() {
    const now = Date.now();
    const dt = Math.min(0.25, (now - this.lastTick) / 1000);
    this.lastTick = now;
    for (const map of this.maps.values()) {
      if (map.ground && map.ground.size) DROPS.expire(map, now);
      if (!map.players.size && !map.events.length) {
        // sem jogadores: só cuida de renascimentos
        for (const m of map.monsters) if (m.dead && now >= m.respawnAt) this.respawnMonster(map, m);
        continue;
      }
      // um erro num jogador ou monstro não pode travar o mapa inteiro
      for (const p of [...map.players.values()]) { try { this.tickPlayer(p, map, now, dt); } catch (e) { this.tickError('jogador ' + p.name, e); } }
      for (const m of map.monsters) { try { this.tickMonster(m, map, now, dt); } catch (e) { this.tickError('monstro ' + m.type, e); } }
      try { this.broadcast(map, now); } catch (e) { this.tickError('envio ' + map.id, e); }
    }
  }

  tickError(who, e) {
    const k = who + e.message;
    this.tickErrs = this.tickErrs || new Map();
    if (Date.now() - (this.tickErrs.get(k) || 0) < 60000) return;
    this.tickErrs.set(k, Date.now());
    console.error('[world] tick', who, e.stack || e.message);
  }

  respawnMonster(map, m) {
    m.dead = false; m.hp = m.T.hp; m.x = m.hx; m.y = m.hy; m.target = null; m.contrib.clear();
    m.enraged = false; m.slam = null; m.nextSpecial = Date.now() + 5000;
    map.emit({ k: 'spawn', t: m.id, boss: m.T.boss ? 1 : 0 });
    if (m.T.boss) this.system(`O ${m.T.name} despertou em ${map.def.name} (Sala ${map.room})!`);
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
    const step = m.T.speed * dt * (m.enraged ? 1.25 : 1);
    if (m.T.boss) {
      // fúria abaixo de 50% da vida
      if (!m.enraged && m.hp < m.T.hp * 0.5) { m.enraged = true; map.emit({ k: 'enrage', t: m.id }); }
      // golpe especial: avisa a área 1,3 s antes, depois acerta quem ficou dentro
      if (m.slam && now >= m.slam.at) {
        const sl = m.slam; m.slam = null;
        map.emit({ k: 'slam', a: m.id, x: sl.x, y: sl.y, r: sl.r });
        for (const p of map.players.values()) {
          if (p.dead || Math.hypot(p.x - sl.x, p.y - sl.y) > sl.r) continue;
          const db = p.buffs.def && p.buffs.def.until > now ? p.buffs.def.mult : 1;
          const d = Math.max(1, Math.round((m.T.dmg * 2.4 * rand(0.9, 1.1) - p.def * db / 2) * (1 - (p.absorb || 0))));
          p.hp -= d; p.hurtAt = now;
          map.emit({ k: 'h', a: m.id, t: p.id, d, fx: 'boss', aoe: 1 });
          if (p.hp <= 0) this.killPlayer(p, now, m);
        }
      }
      if (m.slam) return; // parado preparando o golpe
      if (t && !m.slam && now >= (m.nextSpecial || 0) && dist(m, t) < 150) {
        m.nextSpecial = now + (m.enraged ? 6000 : 9000);
        m.slam = { x: Math.round(t.x), y: Math.round(t.y), r: 64, at: now + 1300 };
        map.emit({ k: 'warn', a: m.id, x: m.slam.x, y: m.slam.y, r: 64, ms: 1300 });
        return;
      }
    }
    if (t) {
      if (Math.hypot(m.x - m.hx, m.y - m.hy) > 260) { // fugiu longe demais: volta e cura
        m.target = null; m.hp = m.T.hp; m.contrib.clear(); m.wander = { x: m.hx, y: m.hy }; return;
      }
      const d = dist(m, t);
      const reach = m.T.range + 6 * m.T.size;
      if (d > reach) { m.x += (t.x - m.x) / d * step; m.y += (t.y - m.y) / d * step; m.flip = t.x > m.x; }
      else if (now >= m.nextAtk) { m.nextAtk = now + m.T.atkMs * (m.enraged ? 0.7 : 1); m.flip = t.x > m.x; this.hurtPlayer(m, t, now); }
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
    if (p.duel) {
      const o = p.duel.with;
      if (now > p.duel.until || !this.players.has(o.charId) || o.map !== p.map) this.endDuel(null, null, 'draw', p);
    }
    // minutos jogados (missão diária) e virada do dia
    p.onlineAcc += dt;
    if (p.onlineAcc >= 60) {
      p.onlineAcc -= 60;
      this.quest(p, 'online', 1);
      if (Q.normalize(p)) { this.achieve(p); p.questsDirty = true; p.send({ type: 'log', kind: 'info', text: 'Novo dia: missões diárias renovadas e prêmio de login liberado!' }); }
    }
    if (p.questsDirty && (!p.lastQuestSend || now - p.lastQuestSend > 1500)) { p.questsDirty = false; p.lastQuestSend = now; p.send(Q.state(p)); }
    // regeneração: rápida na cidade, lenta no campo
    const fast = map.def.safe && !p.duel;
    const regen = fast ? 0.08 : 0.004;
    p.hp = Math.min(p.maxHp, p.hp + p.maxHp * regen * dt);
    p.mp = Math.min(p.maxMp, p.mp + p.maxMp * (fast ? 0.08 : 0.02) * dt);

    if (map.def.safe && !p.duel) {
      if (p.returnAt && now >= p.returnAt) {
        p.returnAt = 0;
        const dest = p.lastFarm;
        if (dest && G.WORLD[dest] && p.level >= G.WORLD[dest].minLevel && p.auto) { this.enterMap(p, dest); p.send({ type: 'log', kind: 'info', text: `Voltando ao farm em ${G.WORLD[dest].name}.` }); return; }
      }
    } else if (!p.duel) {
      if (p.hp < p.maxHp * p.settings.potHp) this.usePotion(p, 'hp', now);
      else if (p.mp < p.maxMp * p.settings.potMp) this.usePotion(p, 'mp', now);
    }

    // itens no chão: recolhe o que é seu ao chegar perto; no modo automático vai buscar
    if (map.ground && map.ground.size) {
      const range = DROPS.cfg().pickupRange;
      const near = DROPS.ownedNear(p, map, range);
      if (near) { DROPS.pickup(this, p, near); if (p.pickTarget === near.gid) { p.pickTarget = null; p.moveTo = null; } }
      else if (p.auto && !p.moveTo && !(p.target && p.target.isPlayer) && !(map.def.safe && !p.duel)) {
        const far = DROPS.ownedNear(p, map, 320);
        if (far && !(p.target && p.target.target === p && dist(p, p.target) < 60)) { this.stepToward(p, far, PLAYER_SPEED * dt); return; }
      }
    }
    // movimento manual tem prioridade
    if (p.moveTo) { this.stepToward(p, p.moveTo, PLAYER_SPEED * dt); if (dist(p, p.moveTo) < 2) p.moveTo = null; return; }
    // evento com área segura diminuindo: o automático volta para dentro antes de lutar
    if (p.auto && map.def.arena) { const e = ARENA.escape(p); if (e) { p.target = null; this.stepToward(p, e, PLAYER_SPEED * dt); return; } }
    if (map.def.safe && !p.duel) return;

    // escolhe alvo
    if (p.target && (p.target.isPlayer ? !this.hostile(p, p.target) : (p.target.dead || !map.monsters.includes(p.target)))) p.target = null;
    if (!p.target && p.auto && p.duel) p.target = p.duel.with;
    if (!p.target && p.auto && (p.settings.pvpAuto || (map.def.arena && map.def.pvp)) && (map.def.pvp || p.settings.pvpOn)) {
      let best = null, bd = 170;
      for (const o of map.players.values()) { if (!this.hostile(p, o)) continue; const d = dist(p, o); if (d < bd) { bd = d; best = o; } }
      p.target = best;
    }
    if (!p.target && p.auto && !map.def.safe) {
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
    if (p.auto) {
      const buff = skills.find((s) => s.buff && p.skillOn(s.id) && p.mp >= s.mana && !(p.cds[s.id] > now) && !(p.buffs[s.buff] && p.buffs[s.buff].until > now));
      if (buff && dist(p, t) < 160) { this.attack(p, buff, t, now); return; }
      sk = skills.filter((s) => s.id !== 'basic' && !s.heal && !s.buff && p.skillOn(s.id) && p.mp >= s.mana && !(p.cds[s.id] > now))
        .sort((a, b) => (b.mult * (b.aoe ? 1.3 : 1)) - (a.mult * (a.aoe ? 1.3 : 1)))[0] || null;
    }
    if (!sk) sk = skills[0];
    const d = dist(p, t);
    const reach = sk.range + 8 * (t.T ? t.T.size : 1);
    if (d > reach) { this.stepToward(p, t, PLAYER_SPEED * dt, reach - 2); return; }
    if (now >= p.nextAtk) this.attack(p, sk, t, now);
  }

  stepToward(p, dest, step, stopAt = 0) {
    const d = dist(p, dest);
    if (d <= stopAt) return;
    const s = Math.min(step, d - stopAt);
    p.x += (dest.x - p.x) / d * s; p.y += (dest.y - p.y) / d * s;
    p.flip = dest.x < p.x;
    const mg = p.map.def.margin || 10;
    p.x = clamp(p.x, mg, p.map.def.w - mg); p.y = clamp(p.y, mg, p.map.def.h - mg);
  }

  broadcast(map, now) {
    const P = [...map.players.values()].map((p) => [p.id, Math.round(p.x), Math.round(p.y), Math.round(p.hp), p.maxHp, p.dead ? 1 : 0, p.flip ? 1 : 0,
      (p.buffs.dmg && p.buffs.dmg.until > now ? 1 : 0) + (p.buffs.def && p.buffs.def.until > now ? 2 : 0),
      (p.pkUntil > now ? 1 : 0) + (p.duel ? 2 : 0) + (p.settings.pvpOn ? 4 : 0)]);
    const M = map.monsters.map((m) => [m.id, Math.round(m.x), Math.round(m.y), Math.max(0, Math.round(m.hp)), m.dead ? 1 : 0, m.flip ? 1 : 0]);
    const ev = map.events; map.events = [];
    let boss = null;
    if (map.boss) {
      const total = [...map.boss.contrib.values()].reduce((a, b) => a + b, 0) || 1;
      boss = { id: map.boss.id, name: map.boss.T.name, hp: Math.max(0, Math.round(map.boss.hp)), max: map.boss.T.hp, dead: map.boss.dead, enraged: !!map.boss.enraged,
        respawnIn: map.boss.dead ? Math.max(0, map.boss.respawnAt - now) : 0,
        top: [...map.boss.contrib.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
          .map(([cid, d]) => ({ name: (this.players.get(cid) || {}).name || '—', pct: Math.round(d / total * 100) })) };
    }
    for (const p of map.players.values()) {
      const cds = {};
      for (const [k, v] of Object.entries(p.cds)) if (v > now) cds[k] = v - now;
      p.send({ type: 's', P, M, ev, boss, me: {
        hp: Math.round(p.hp), mp: Math.round(p.mp), maxHp: p.maxHp, maxMp: p.maxMp, level: p.level,
        exp: Math.round(p.exp), next: expToNext(p.level), zen: p.zen, pots: p.pots, auto: p.auto, free: p.free, pvpOn: !!p.settings.pvpOn,
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
      const inArena = !!(p.map && p.map.def.arena);
      const map = p.dead || inArena ? 'lorencia' : (p.map ? p.map.id : 'lorencia');
      await db.query(`UPDATE characters SET level=$2, exp=$3, zen=$4, str=$5, agi=$6, vit=$7, ene=$8, cmd=$9, free_points=$10,
        map=$11, pos_x=$12, pos_y=$13, hp=$14, mp=$15, pot_hp=$16, pot_mp=$17, settings=$18, kills=$19, deaths=$20,
        bosses_killed=$21, combat_power=$22, last_farm_map=$23, auto_on=$24, quests=$25, pvp_kills=$26, pvp_deaths=$27, duel_wins=$28, duel_losses=$29, pk_count=$30,
        resets=$31, master_resets=$32, bonus_points=$33, evo=$34, class_quest=$35, last_seen_at=now()
        WHERE id=$1 RETURNING id`,
      [p.charId, p.level, Math.round(p.exp), Math.round(p.zen), p.stats.str, p.stats.agi, p.stats.vit, p.stats.ene, p.stats.cmd, p.free,
        map, p.dead || inArena ? 0 : Math.round(p.x), p.dead || inArena ? 0 : Math.round(p.y), Math.max(1, Math.round(p.hp)), Math.round(p.mp),
        p.pots.hp, p.pots.mp, JSON.stringify(p.settings), p.kills, p.deaths, p.bossesKilled, p.power, p.lastFarm, p.auto, JSON.stringify(p.quests || {}), p.pvp.kills, p.pvp.deaths, p.pvp.duelW, p.pvp.duelL, p.pvp.pk,
        p.resets, p.masterResets, p.bonusPoints, p.evo, p.classQuest ? JSON.stringify(p.classQuest) : null]);
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
