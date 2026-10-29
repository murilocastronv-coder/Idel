'use strict';
// Eventos em arena: Chaos Castle (PvP + monstros, área que diminui, último de pé vence) e Devil Square (ondas de monstros, ranking por pontos).
//  • ArenaManager (ChaosCastleManager): agenda, inscrições, início, fim e recuperação após reinício
//  • ArenaEntry (ChaosCastleEntry): requisitos por categoria, item de entrada gasto só quando a entrada é confirmada
//  • ArenaInstance (ChaosCastleArena): uma instância isolada por categoria, com muralhas e saída bloqueada
//  • ArenaCombat / MonsterSpawner: monstros próprios do evento, PvP só no Chaos Castle, disfarce visual
//  • ScoreManager: pontos por monstro e por jogador, desempate sem sorteio
//  • RewardService: prêmios gravados no banco e entregues uma única vez (também para quem caiu ou reiniciou)
const db = require('./db');
const G = require('./gamedata');
const SET = require('./settings');

const hourly = (min) => Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`);
const KINDS = ['castle', 'devil'];
const R = (kind, qty, extra = {}) => ({ kind, qty, ...extra });
function castleRewards(i) {
  const box = i < 2 ? 'kundun_bronze' : i < 4 ? 'kundun_prata' : 'kundun_ouro';
  return {
    winner: [R('zen', 400000 * (i + 1)), R('item', 1 + Math.floor(i / 2), { base: 'jewel_of_chaos' }), R('item', 1, { base: box }), R('gear', 1, { rarity: i < 3 ? 'rare' : 'epic' })],
    second: [R('zen', 150000 * (i + 1)), R('item', 1, { base: 'jewel_of_chaos' })],
    third: [R('zen', 80000 * (i + 1))],
    participant: [R('zen', 25000 * (i + 1))],
  };
}
function devilRewards(i) {
  const box = i < 2 ? 'kundun_bronze' : i < 5 ? 'kundun_prata' : 'kundun_ouro';
  return {
    winner: [R('zen', 300000 * (i + 1)), R('item', 1, { base: box }), R('item', 1, { base: 'jewel_of_chaos' })],
    second: [R('zen', 150000 * (i + 1)), R('item', 1, { base: 'kundun_bronze' })],
    third: [R('zen', 80000 * (i + 1))],
    participant: [R('zen', 20000 * (i + 1))],
  };
}
const CASTLE_CATS = [[15, 49], [50, 99], [100, 179], [180, 249], [250, 349], [350, 9999]];
const DEVIL_CATS = [[15, 79], [80, 129], [130, 179], [180, 239], [240, 299], [300, 399], [400, 9999]];
const DEFAULTS = {
  tzOffsetMin: -180,   // horários no fuso de Brasília
  castle: {
    enabled: true, name: 'Chaos Castle', times: hourly(20), openMin: 10, durationMin: 10, minPlayers: 2, maxPlayers: 30,
    entryItem: 'armor_of_guardsman', buyZen: 300000, disguise: true, pvp: true,
    monsters: { base: 26, perPlayer: -1, min: 10, mult: 1 },
    shrink: { enabled: true, startPct: 35, endPct: 90, finalSize: 30, dmgPct: 6 },
    score: { monster: 2, player: 6, survive: 5, minForReward: 1 },
    categories: CASTLE_CATS.map(([a, b], i) => ({ name: `Chaos Castle ${i + 1}`, minLevel: a, maxLevel: b, minResets: 0 })),
    rewards: CASTLE_CATS.map((_, i) => castleRewards(i)),
  },
  devil: {
    enabled: true, name: 'Devil Square', times: hourly(50), openMin: 10, durationMin: 8, minPlayers: 1, maxPlayers: 15,
    entryItem: '@devil', buyZen: 0, disguise: false, pvp: false,
    monsters: { maxAlive: 18, perPlayer: 3, everySec: 4, mult: 1 },
    shrink: { enabled: false, startPct: 50, endPct: 90, finalSize: 50, dmgPct: 5 },
    score: { monster: 1, player: 0, survive: 10, minForReward: 5 },
    categories: DEVIL_CATS.map(([a, b], i) => ({ name: `Devil Square ${i + 1}`, minLevel: a, maxLevel: b, minResets: 0 })),
    rewards: DEVIL_CATS.map((_, i) => devilRewards(i)),
  },
};
// monstros-base de cada categoria (sprites existentes, força ajustada à faixa de nível)
const MON_BASE = {
  castle: ['goblin_elite', 'death_knight', 'coral_golem', 'magma_golem', 'cloud_golem', 'glacier_golem'],
  devil: [['skeleton', 'goblin_elite'], ['hell_hound', 'death_knight'], ['cursed_skeleton', 'bone_mage'], ['obsidian_skeleton', 'magma_golem'],
    ['storm_spider', 'sand_golem'], ['void_skeleton', 'dark_treant'], ['demon_hound', 'glacier_golem']],
};
const NPC_OF = { castle: 'castle_guard', devil: 'charon' };
const ARENA_DEF = {
  castle: { theme: 'castle', w: 720, h: 600, margin: 46 },
  devil: { theme: 'devilsq', w: 760, h: 620, margin: 46 },
};

let W = null, H = null;
const ST = {};            // estado por tipo de evento
let seq = 0;
const pendingChars = new Set();

function cfg() { return SET.get('arena', DEFAULTS); }
const K = (kind) => cfg()[kind];
const fmt = (n) => Math.round(n).toLocaleString('pt-BR');
const nameOf = (base) => (G.ITEM_BASES[base] || {}).name || base;
function entryItemOf(kind, cat) { const e = K(kind).entryItem; return e === '@devil' ? 'devil_inv_' + (cat + 1) : e; }
const countItem = (p, base) => p.items.filter((i) => i.base === base && !i.equipped).reduce((a, i) => a + (Number(i.qty) || 1), 0);

// ---------- agenda ----------
function nextSlotAfter(kind, t) {
  const c = cfg(), k = K(kind), tz = c.tzOffsetMin;
  let best = Infinity;
  for (let d = 0; d <= 1; d++) {
    const local = new Date(t + tz * 60000 + d * 86400000);
    for (const hm of k.times) {
      const [h, m] = hm.split(':').map(Number);
      const ms = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), h, m) - tz * 60000;
      if (ms > t && ms < best) best = ms;
    }
  }
  return best === Infinity ? 0 : best;
}
function catFor(kind, p) {
  const cats = K(kind).categories;
  return cats.findIndex((c) => p.level >= c.minLevel && p.level <= c.maxLevel && (p.resets || 0) >= (c.minResets || 0));
}
function atNpc(p, kind) { return !!(p.map && (p.map.def.npcs || []).some((n) => n.kind === NPC_OF[kind])); }

function announce(text, banner = true, only = null) {
  W.system(text);
  if (!banner) return;
  const targets = only || W.players.values();
  for (const p of targets) p.send({ type: 'arena', phase: 'notice', text });
}

// ---------- informações para a janela do NPC ----------
function info(p, kind) {
  const k = K(kind), st = ST[kind];
  const my = catFor(kind, p);
  const reg = st.regs.get(p.charId);
  const now = Date.now();
  const slot = st.slot || nextSlotAfter(kind, now);
  return {
    type: 'arenaInfo', kind, name: k.name, enabled: k.enabled, phase: st.phase, slot, openAt: slot - k.openMin * 60000, now,
    durationMin: k.durationMin, minPlayers: k.minPlayers, maxPlayers: k.maxPlayers, pvp: !!k.pvp, shrink: !!k.shrink.enabled, disguise: !!k.disguise,
    atNpc: atNpc(p, kind), myCat: my, registered: reg ? reg.cat : null, inMatch: !!p.arena,
    categories: k.categories.map((c, i) => {
      const base = entryItemOf(kind, i);
      return { i, name: c.name, minLevel: c.minLevel, maxLevel: c.maxLevel, minResets: c.minResets || 0, entry: { base, name: nameOf(base), icon: (G.ITEM_BASES[base] || {}).icon, ic: (G.ITEM_BASES[base] || {}).ic, have: countItem(p, base) },
        registered: [...st.regs.values()].filter((r) => r.cat === i).length, running: !!(st.matches.get(i) && !st.matches.get(i).ended) };
    }),
    buyZen: k.buyZen, zen: p.zen,
    rewards: my >= 0 ? Object.fromEntries(Object.entries(k.rewards[my] || {}).map(([tag, list]) => [tag, list.map(rewardLabel)])) : null,
  };
}

// ---------- inscrição ----------
async function act(world, p, msg) {
  const kind = KINDS.includes(msg.kind) ? msg.kind : 'castle';
  const k = K(kind), st = ST[kind];
  const a = String(msg.action || 'info');
  const say = (ok, text) => p.send({ type: 'arenaResult', ok, text, kind });
  if (a === 'quit') {
    if (!p.arena) return say(false, 'Você não está em um evento.');
    const m = p.arena, part = m.parts.get(p.charId);
    if (part && part.alive) eliminate(m, part, 'desistiu');
    p.arena = null;
    if (!p.dead) W.enterMap(p, 'lorencia');
    say(true, 'Você saiu do evento. A entrada não é devolvida.');
    return p.send(info(p, kind));
  }
  if (a === 'info') return p.send(info(p, kind));
  if (!k.enabled) return say(false, `${k.name} está desativado no momento.`);
  if (p.arena) return say(false, 'Você já está em um evento.');
  if (!atNpc(p, kind)) return say(false, `Fale com ${kind === 'castle' ? 'o Guarda do Chaos Castle' : 'Charon'} em Lorencia.`);
  if (a === 'buy') {
    const base = entryItemOf(kind, 0);
    if (!k.buyZen || kind !== 'castle') return say(false, 'Este item não está à venda.');
    if (p.zen < k.buyZen) return say(false, `Você precisa de ${fmt(k.buyZen)} Zen.`);
    if (!p.items.some((i) => i.base === base && !i.equipped && (Number(i.qty) || 1) < G.MAX_STACK) && H.bagUsed(p) >= G.INVENTORY_SIZE) return say(false, 'Bolsa cheia.');
    p.zen -= k.buyZen;
    let got = 0;
    try { got = await W.giveMaterial(p, base, 1, { silent: true }); } catch (e) { got = 0; }
    if (!got) { p.zen += k.buyZen; return say(false, 'Não foi possível comprar agora. Nada foi gasto.'); }
    await db.query('UPDATE characters SET zen = $2 WHERE id = $1 RETURNING id', [p.charId, Math.round(p.zen)]);
    say(true, `Você comprou ${nameOf(base)} por ${fmt(k.buyZen)} Zen.`);
  } else if (a === 'register') {
    if (st.phase !== 'open') return say(false, st.phase === 'running' ? 'O evento já começou. Espere o próximo horário.' : 'As inscrições ainda não abriram.');
    if (p.dead) return say(false, 'Você está derrotado.');
    if (st.regs.has(p.charId)) return say(false, 'Você já está inscrito.');
    const cat = catFor(kind, p);
    if (cat < 0) return say(false, 'Seu nível não se encaixa em nenhuma categoria deste evento.');
    const base = entryItemOf(kind, cat);
    if (countItem(p, base) < 1) return say(false, `Você precisa de ${nameOf(base)} para entrar no ${k.categories[cat].name}.`);
    const n = [...st.regs.values()].filter((r) => r.cat === cat).length;
    if (n >= k.maxPlayers) return say(false, 'Esta categoria está lotada.');
    const ins = await db.query(`INSERT INTO arena_entries (kind, category, slot_at, character_id, char_name, account_id, status, entry_item)
      VALUES ($1,$2,to_timestamp($3 / 1000.0),$4,$5,$6,'registered',$7) ON CONFLICT (kind, slot_at, character_id) DO NOTHING RETURNING id`, [kind, cat, st.slot, p.charId, p.name, p.accountId, base]);
    if (!ins.rows[0]) return say(false, 'Você já está inscrito.');
    st.regs.set(p.charId, { cat, name: p.name, at: Date.now(), entryId: String(ins.rows[0].id) });
    say(true, `Inscrição confirmada no ${k.categories[cat].name}! O item de entrada só é usado quando o evento começar. Fique online.`);
  } else if (a === 'unregister') {
    const r = st.regs.get(p.charId);
    if (!r || st.phase !== 'open') return say(false, 'Você não está inscrito.');
    st.regs.delete(p.charId);
    await db.query("UPDATE arena_entries SET status = 'cancelled' WHERE id = $1 AND status = 'registered' RETURNING id", [r.entryId]);
    say(true, 'Inscrição cancelada.');
  } else return say(false, 'Ação inválida.');
  p.send(p.charState());
  return p.send(info(p, kind));
}

// ---------- instância e monstros ----------
function monTemplate(kind, cat, type) {
  const T0 = G.MONSTERS[type];
  const c = K(kind).categories[cat];
  const mid = Math.min(c.maxLevel, c.minLevel + 60, 1000);
  const s = Math.max(1, ((c.minLevel + mid) / 2) / T0.level);
  const mult = Number(K(kind).monsters.mult) || 1;
  const name = kind === 'castle' ? 'Soldado do Castelo' : T0.name;
  return {
    ...T0, name, level: Math.round(T0.level * s), hp: Math.round(T0.hp * Math.pow(s, 1.25) * mult), dmg: Math.round(T0.dmg * Math.pow(s, 0.9) * mult * 0.8), def: Math.round(T0.def * Math.sqrt(s)),
    exp: Math.round(T0.exp * s * 1.2), zen: [Math.round(T0.zen[0] * s), Math.round(T0.zen[1] * s)], aggro: 95, drop: 0, boss: false, elite: false,
    arena: kind, respawnMs: Infinity, tint: kind === 'castle' ? '#ff5a4a' : '#c84aff',
  };
}
function spawnMon(m, kind) {
  const inst = m.inst, d = inst.def, mg = d.margin + 10;
  const types = kind === 'castle' ? [MON_BASE.castle[Math.min(m.cat, MON_BASE.castle.length - 1)]] : MON_BASE.devil[Math.min(m.cat, MON_BASE.devil.length - 1)];
  const type = types[Math.floor(Math.random() * types.length)];
  const T = monTemplate(kind, m.cat, type);
  let x, y, tries = 0;
  do { x = mg + Math.random() * (d.w - mg * 2); y = mg + Math.random() * (d.h - mg * 2); tries++; }
  while (tries < 20 && [...m.parts.values()].some((pt) => pt.alive && pt.p && Math.hypot(pt.p.x - x, pt.p.y - y) < 70));
  const mo = { id: 'a' + (++seq).toString(36), type, T, x, y, hx: x, hy: y, hp: T.hp, dead: false, respawnAt: Infinity, target: null,
    nextAtk: 0, wander: null, nextWander: 0, contrib: new Map(), flip: false, arena: m.id };
  inst.monsters.push(mo);
  const msg = { type: 'madd', m: { id: mo.id, type, name: T.name, sprite: T.sprite, tint: T.tint, size: T.size, scale: T.scale || 1, level: T.level, maxHp: T.hp, boss: false, elite: false } };
  for (const o of inst.players.values()) o.send(msg);
  m.spawned++;
  return mo;
}
const aliveMons = (m) => m.inst.monsters.filter((x) => !x.dead).length;
const aliveParts = (m) => [...m.parts.values()].filter((x) => x.alive);

// ---------- início ----------
async function start(kind) {
  const k = K(kind), st = ST[kind];
  st.phase = 'running';
  const regs = [...st.regs.entries()];
  st.regs.clear();
  const byCat = new Map();
  for (const [cid, r] of regs) { if (!byCat.has(r.cat)) byCat.set(r.cat, []); byCat.get(r.cat).push([cid, r]); }
  let any = false;
  for (const [cat, list] of byCat) {
    list.sort((a, b) => a[1].at - b[1].at);
    const ok = [], out = [];
    for (const [cid, r] of list) {
      const p = W.players.get(cid);
      const base = entryItemOf(kind, cat);
      let why = null;
      if (!p) why = 'offline';
      else if (p.dead) why = 'derrotado';
      else if (p.arena) why = 'em outro evento';
      else if (catFor(kind, p) !== cat) why = 'nível fora da categoria';
      else if (countItem(p, base) < 1) why = 'sem item de entrada';
      else if (ok.length >= k.maxPlayers) why = 'categoria lotada';
      if (why) out.push([cid, r, why, p]); else ok.push([cid, r, p]);
    }
    for (const [, r, why, p] of out) {
      await db.query("UPDATE arena_entries SET status = 'no_show', elim_reason = $2 WHERE id = $1 AND status = 'registered' RETURNING id", [r.entryId, why]).catch(() => {});
      if (p) p.send({ type: 'arena', phase: 'notice', text: `Você não entrou no ${k.categories[cat].name} (${why}). Nenhum item foi usado.` });
    }
    if (ok.length < k.minPlayers) {
      for (const [, r, p] of ok) {
        await db.query("UPDATE arena_entries SET status = 'cancelled', elim_reason = 'poucos participantes' WHERE id = $1 RETURNING id", [r.entryId]).catch(() => {});
        p.send({ type: 'arena', phase: 'notice', text: `${k.categories[cat].name} não começou: precisa de pelo menos ${k.minPlayers} participantes. Seu item de entrada não foi usado.` });
      }
      continue;
    }
    // cria a partida e só então gasta as entradas (uma por jogador, em transação)
    const now = Date.now();
    const { rows } = await db.query(`INSERT INTO arena_matches (kind, category, slot_at, status, started_at, players) VALUES ($1,$2,to_timestamp($3 / 1000.0),'running',now(),$4) RETURNING id`, [kind, cat, st.slot, ok.length]);
    const id = String(rows[0].id);
    const key = `arena:${kind}:${cat}`;
    const def = { name: k.categories[cat].name, theme: ARENA_DEF[kind].theme, w: ARENA_DEF[kind].w, h: ARENA_DEF[kind].h, margin: ARENA_DEF[kind].margin,
      safe: false, pvp: !!k.pvp, arena: kind, minLevel: 0, spawn: [ARENA_DEF[kind].w / 2, ARENA_DEF[kind].h / 2], groups: [], npcs: [] };
    const inst = W.addInstance(key, `${kind}_arena`, def);
    const m = { id, kind, cat, key, inst, startedAt: now, endsAt: now + k.durationMin * 60000, parts: new Map(), spawned: 0, ended: false, started: 0,
      zone: { x0: def.margin, y0: def.margin, x1: def.w - def.margin, y1: def.h - def.margin }, lastSpawn: 0 };
    st.matches.set(cat, m);
    for (const [cid, r, p] of ok) {
      const base = entryItemOf(kind, cat);
      const res = await p.run(async () => {
        try {
          const stacks = p.items.filter((i) => i.base === base && !i.equipped).sort((a, b) => Number(a.id) - Number(b.id));
          const s = stacks[0];
          if (!s || p.dead || p.arena) throw new Error('sem item');
          const q = Number(s.qty) || 1;
          await db.tx(async (qq) => {
            const d = q > 1
              ? await qq('UPDATE items SET qty = qty - 1 WHERE id = $1 AND character_id = $2 AND qty = $3 AND vault_no IS NULL RETURNING id', [s.id, p.charId, q])
              : await qq('DELETE FROM items WHERE id = $1 AND character_id = $2 AND qty = 1 AND vault_no IS NULL RETURNING id', [s.id, p.charId]);
            if (!d.rows[0]) throw new Error('item mudou');
            const u = await qq("UPDATE arena_entries SET status = 'entered', match_id = $2, consumed = TRUE, entered_at = now() WHERE id = $1 AND status = 'registered' RETURNING id", [r.entryId, id]);
            if (!u.rows[0]) throw new Error('inscrição mudou');
          });
          if (q > 1) s.qty = q - 1; else p.items = p.items.filter((i) => i !== s);
          return 'ok';
        } catch (e) { return e.message || 'erro'; }
      });
      if (res !== 'ok') {
        await db.query("UPDATE arena_entries SET status = 'no_show', elim_reason = $2 WHERE id = $1 AND status = 'registered' RETURNING id", [r.entryId, String(res)]).catch(() => {});
        p.send({ type: 'arena', phase: 'notice', text: 'Não foi possível confirmar sua entrada. Nenhum item foi usado.' });
        continue;
      }
      if (p.duel) W.endDuel(null, null, 'draw', p);
      const part = { charId: cid, name: p.name, p, alive: true, score: 0, mk: 0, pk: 0, elimAt: 0, reason: null, entryId: r.entryId, place: 0 };
      m.parts.set(cid, part);
      p.arena = m;
      p.returnAt = 0; p.moveTo = null; p.target = null; p.pickTarget = null;
      p.hp = p.maxHp; p.mp = p.maxMp; p.buffs = {};
      const n = m.parts.size, ang = (n / Math.max(1, ok.length)) * Math.PI * 2;
      W.enterMap(p, def.arena + '_arena', [def.w / 2 + Math.cos(ang) * (def.w / 2 - def.margin - 40), def.h / 2 + Math.sin(ang) * (def.h / 2 - def.margin - 40)], inst);
      p.send(p.charState());
    }
    m.started = m.parts.size;
    if (!m.started) { await db.query("UPDATE arena_matches SET status = 'cancelled', ended_at = now(), end_reason = 'sem participantes' WHERE id = $1 RETURNING id", [id]); W.removeInstance(key); st.matches.delete(cat); continue; }
    await db.query('UPDATE arena_matches SET players = $2 WHERE id = $1 RETURNING id', [id, m.started]);
    any = true;
    // monstros iniciais
    if (kind === 'castle') {
      const mc = k.monsters, n = Math.max(mc.min, Math.round(mc.base + mc.perPlayer * m.started));
      for (let i = 0; i < n; i++) spawnMon(m, kind);
    } else {
      for (let i = 0; i < Math.min(K(kind).monsters.maxAlive, 6 + m.started * 2); i++) spawnMon(m, kind);
    }
    for (const part of m.parts.values()) part.p.send({ type: 'arena', phase: 'start', text: `${def.name} começou! ${kind === 'castle' ? 'Seja o último de pé.' : 'Derrote o máximo de monstros.'}`, ...hud(m, part) });
    announce(`${def.name} começou com ${m.started} participante${m.started > 1 ? 's' : ''}!`, false);
  }
  if (!any) { st.phase = 'idle'; st.slot = 0; st.manual = 0; await saveState(); }
}

// ---------- durante a partida ----------
function hud(m, part) {
  const k = K(m.kind);
  const alive = aliveParts(m);
  const ranked = rank(m, false);
  return { kind: m.kind, name: m.inst.def.name, endsAt: m.endsAt, now: Date.now(), alive: alive.length, total: m.started, monsters: aliveMons(m),
    score: part ? part.score : 0, pos: part ? ranked.indexOf(part) + 1 : 0, mk: part ? part.mk : 0, pk: part ? part.pk : 0, me: part ? part.alive : false,
    zone: k.shrink.enabled ? m.zone : null, full: { x0: m.inst.def.margin, y0: m.inst.def.margin, x1: m.inst.def.w - m.inst.def.margin, y1: m.inst.def.h - m.inst.def.margin } };
}
function eliminate(m, part, reason, by) {
  if (!part.alive || m.ended) return;
  part.alive = false; part.elimAt = Date.now(); part.reason = reason;
  if (part.p) part.p.arena = null;
  const left = aliveParts(m).length;
  const txt = reason === 'derrotado' ? `${part.name} foi derrotado${by ? ' por ' + by : ''}.` : reason === 'zona' ? `${part.name} ficou fora da área segura e caiu.`
    : reason === 'desistiu' ? `${part.name} desistiu.` : `${part.name} saiu do evento.`;
  for (const o of m.inst.players.values()) o.send({ type: 'arena', phase: 'elim', text: `${txt} Restam ${left}.` });
  if (m.kind === 'castle' && left === 1 && m.started > 1) for (const o of m.inst.players.values()) o.send({ type: 'arena', phase: 'notice', text: `Resta apenas ${aliveParts(m)[0].name}!` });
}
function rank(m, final) {
  const k = K(m.kind);
  const arr = [...m.parts.values()];
  const surv = (x) => (x.alive ? Infinity : x.elimAt);
  if (m.kind === 'castle') {
    return arr.sort((a, b) => (b.alive - a.alive) || (final && !a.alive ? b.elimAt - a.elimAt : 0) || b.score - a.score || b.pk - a.pk || b.mk - a.mk || surv(b) - surv(a));
  }
  return arr.sort((a, b) => b.score - a.score || b.mk - a.mk || (b.alive - a.alive) || surv(b) - surv(a));
}
function zoneFor(m, now) {
  const k = K(m.kind), d = m.inst.def, sh = k.shrink;
  const full = { x0: d.margin, y0: d.margin, x1: d.w - d.margin, y1: d.h - d.margin };
  if (!sh.enabled) return full;
  const t = (now - m.startedAt) / (m.endsAt - m.startedAt) * 100;
  const prog = Math.max(0, Math.min(1, (t - sh.startPct) / Math.max(1, sh.endPct - sh.startPct)));
  const size = 1 - prog * (1 - sh.finalSize / 100);
  const cx = d.w / 2, cy = d.h / 2, hw = (full.x1 - full.x0) / 2 * size, hh = (full.y1 - full.y0) / 2 * size;
  return { x0: Math.round(cx - hw), y0: Math.round(cy - hh), x1: Math.round(cx + hw), y1: Math.round(cy + hh) };
}
function tickMatch(m, now) {
  const k = K(m.kind);
  // quem saiu do mapa (desconectou, foi levado pelo ADM) está fora
  for (const part of m.parts.values()) {
    if (!part.alive) continue;
    const p = W.players.get(part.charId);
    if (!p || p !== part.p || p.map !== m.inst) { eliminate(m, part, 'saiu'); continue; }
  }
  // área segura diminuindo (validada aqui no servidor)
  m.zone = zoneFor(m, now);
  if (k.shrink.enabled) {
    for (const part of aliveParts(m)) {
      const p = part.p; if (p.dead) continue;
      if (p.x < m.zone.x0 || p.x > m.zone.x1 || p.y < m.zone.y0 || p.y > m.zone.y1) {
        const d = Math.max(1, Math.round(p.maxHp * k.shrink.dmgPct / 100));
        p.hp -= d; p.hurtAt = now;
        m.inst.emit({ k: 'h', a: null, t: p.id, d, fx: 'claw', aoe: 1 });
        if (p.hp <= 0) { part.zoneDeath = true; W.killPlayer(p, now, { T: { name: 'a área proibida' } }); }
      }
    }
  }
  // Devil Square: novas ondas
  if (m.kind === 'devil') {
    const mc = k.monsters, cap = Math.min(60, mc.maxAlive + mc.perPlayer * aliveParts(m).length);
    if (now - m.lastSpawn >= mc.everySec * 1000) {
      m.lastSpawn = now;
      const need = Math.min(4, cap - aliveMons(m));
      for (let i = 0; i < need; i++) spawnMon(m, m.kind);
    }
  }
  // fim
  const alive = aliveParts(m).length;
  if (now >= m.endsAt) return end(m, 'tempo');
  if (alive === 0) return end(m, 'sem participantes');
  if (m.kind === 'castle') {
    if (m.started > 1 && alive === 1) return end(m, 'último de pé');
    if (m.started === 1 && aliveMons(m) === 0) return end(m, 'castelo limpo');
  }
  for (const part of m.parts.values()) if (part.p && part.p.map === m.inst) part.p.send({ type: 'arena', phase: 'hud', ...hud(m, part) });
  return undefined;
}

// ---------- ganchos chamados pelo mundo ----------
function partOf(p) { return p.arena && p.arena.parts.get(p.charId); }
function onDeath(p, by) {
  const m = p.arena || [...Object.values(ST)].flatMap((s) => [...s.matches.values()]).find((x) => x.inst === p.map);
  if (!m) return;
  const part = m.parts.get(p.charId);
  if (part) eliminate(m, part, part.zoneDeath ? 'zona' : 'derrotado', by && by.T ? by.T.name : null);
  p.send({ type: 'log', kind: 'warn', text: `Você foi eliminado do ${m.inst.def.name}. Voltando para Lorencia…` });
}
function onMonsterKill(world, mo, map, killer) {
  const m = killer.arena;
  const part = m && m.parts.get(killer.charId);
  if (m && part && part.alive) { part.mk++; part.score += K(m.kind).score.monster * (m.kind === 'devil' ? 1 + Math.floor(m.cat / 2) : 1); }
  world.grantShare(killer, mo, 1);
  map.emit({ k: 'die', t: mo.id });
  // remove o corpo depois de um tempo
  setTimeout(() => { const i = map.monsters.indexOf(mo); if (i >= 0) { map.monsters.splice(i, 1); for (const o of map.players.values()) o.send({ type: 'mdel', id: mo.id }); } }, 1500).unref();
}
function onPvpKill(world, k, v) {
  const m = k.arena;
  const part = m && m.parts.get(k.charId);
  if (part && part.alive) { part.pk++; part.score += K(m.kind).score.player; }
  m && db.query('INSERT INTO arena_kills (match_id, killer_id, killer_name, victim_id, victim_name) VALUES ($1,$2,$3,$4,$5) RETURNING id', [m.id, k.charId, k.name, v.charId, v.name]).catch(() => {});
}
function onLeave(p) {
  const part = partOf(p);
  if (part) eliminate(p.arena, part, 'saiu');
}
// fora da área segura? devolve um ponto para onde correr (o modo automático usa)
function escape(p) {
  const m = p.arena;
  if (!m || !K(m.kind).shrink.enabled) return null;
  const z = m.zone, pad = 12;
  if (p.x >= z.x0 + pad && p.x <= z.x1 - pad && p.y >= z.y0 + pad && p.y <= z.y1 - pad) return null;
  return { x: (z.x0 + z.x1) / 2, y: (z.y0 + z.y1) / 2 };
}
function blocked(p) { return p.arena ? `Você está no ${p.arena.inst.def.name}. Use "Sair do evento" para desistir.` : null; }
function disguise(p) { return !!(p.arena && K(p.arena.kind).disguise); }

// ---------- fim e prêmios ----------
async function end(m, reason) {
  if (m.ended) return;
  m.ended = true;
  const k = K(m.kind);
  const now = Date.now();
  for (const part of aliveParts(m)) part.score += k.score.survive;
  const ranked = rank(m, true);
  let winner = null;
  if (reason !== 'admin' && reason !== 'sem participantes') {
    if (m.kind === 'castle') {
      const alive = ranked.filter((x) => x.alive);
      if (alive.length === 1) winner = alive[0];
      else if (alive.length > 1) {
        const [a, b] = alive;
        const same = a.score === b.score && a.pk === b.pk && a.mk === b.mk;
        winner = same ? null : a;   // empate total: sem vencedor (nunca sorteia)
      }
    } else {
      const [a, b] = ranked;
      if (a && a.score > 0 && !(b && a.score === b.score && a.mk === b.mk && a.alive === b.alive)) winner = a;
    }
  }
  ranked.forEach((x, i) => { x.place = i + 1; });
  const rw = k.rewards[m.cat] || {};
  const results = [];
  for (const x of ranked) {
    let tag = null;
    if (winner === x) tag = 'winner';
    else if (winner && x.place === 2 && x.score >= k.score.minForReward) tag = 'second';
    else if (winner && x.place === 3 && x.score >= k.score.minForReward) tag = 'third';
    else if (x.score >= k.score.minForReward) tag = 'participant';
    const list = tag ? (rw[tag] || []) : [];
    x.tag = tag; x.rewardLabels = list.map(rewardLabel);
    const status = winner === x ? 'winner' : x.alive ? 'finished' : 'eliminated';
    try {
      await db.query(`UPDATE arena_entries SET status = $2, score = $3, monster_kills = $4, pvp_kills = $5, place = $6, eliminated_at = CASE WHEN $7::bigint > 0 THEN to_timestamp($7 / 1000.0) ELSE NULL END, elim_reason = $8
        WHERE id = $1 RETURNING id`, [x.entryId, status, x.score, x.mk, x.pk, x.place, x.elimAt || 0, x.reason]);
      if (list.length) {
        await db.query(`INSERT INTO arena_rewards (entry_id, character_id, tag, payload, label) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (entry_id, tag) DO NOTHING RETURNING id`,
          [x.entryId, x.charId, tag, JSON.stringify(list.map((r) => ({ ...r, level: k.categories[m.cat].minLevel }))), `${m.inst.def.name}: ${tag}`]);
        pendingChars.add(x.charId);
      }
    } catch (e) { console.error('[arena] resultado', x.name, e.message); }
    results.push({ name: x.name, place: x.place, score: x.score, mk: x.mk, pk: x.pk, alive: x.alive, tag });
  }
  await db.query(`UPDATE arena_matches SET status = 'done', ended_at = now(), end_reason = $2, winner_id = $3, winner_name = $4, monsters = $5, data = $6 WHERE id = $1 RETURNING id`,
    [m.id, reason, winner ? winner.charId : null, winner ? winner.name : null, m.spawned, JSON.stringify({ results })]).catch((e) => console.error('[arena]', e.message));
  const title = m.inst.def.name;
  announce(winner ? `🏆 ${winner.name} venceu o ${title}!` : `${title} terminou sem vencedor (${reason}).`, true);
  for (const x of ranked) {
    const p = W.players.get(x.charId);
    if (!p) continue;
    p.send({ type: 'arena', phase: 'result', kind: m.kind, name: title, winner: winner ? winner.name : null, place: x.place, total: ranked.length, score: x.score, mk: x.mk, pk: x.pk,
      rewards: x.rewardLabels, reason, top: results.slice(0, 5) });
    deliverPending(p);
  }
  // os sobreviventes voltam para Lorencia após alguns segundos
  setTimeout(() => {
    for (const p of [...m.inst.players.values()]) { p.arena = null; if (!p.dead) W.enterMap(p, 'lorencia'); }
    W.removeInstance(m.key);
    ST[m.kind].matches.delete(m.cat);
    if (![...ST[m.kind].matches.values()].length) { ST[m.kind].phase = 'idle'; ST[m.kind].slot = 0; ST[m.kind].manual = 0; saveState(); }
  }, 8000).unref();
  for (const mo of m.inst.monsters) mo.target = null;
  for (const part of m.parts.values()) if (part.p) part.p.arena = null;
}
function rewardLabel(r) {
  if (r.kind === 'zen') return `${fmt(r.qty)} Zen`;
  if (r.kind === 'exp') return `${fmt(r.qty)} EXP`;
  if (r.kind === 'gear') return `${r.qty > 1 ? r.qty + '× ' : ''}Equipamento ${{ common: 'comum', uncommon: 'incomum', rare: 'raro', epic: 'épico', legendary: 'lendário', ancestral: 'ancestral' }[r.rarity] || ''}`.trim();
  return `${r.qty}× ${nameOf(r.base)}`;
}

// entrega os prêmios pendentes (uma vez só: a linha muda de pendente para entregue na mesma transação que cria os itens)
async function deliverPending(p) {
  return p.run(async () => {
    const { rows } = await db.query("SELECT id, payload, label FROM arena_rewards WHERE character_id = $1 AND status = 'pending' ORDER BY id", [p.charId]);
    if (!rows.length) { pendingChars.delete(p.charId); return; }
    for (const row of rows) {
      const list = row.payload || [];
      // espaço necessário na bolsa
      let need = 0;
      for (const r of list) {
        if (r.kind === 'gear') need += r.qty;
        else if (r.kind === 'item') { const b = G.ITEM_BASES[r.base]; if (!b) continue; need += b.stack && p.items.some((i) => i.base === r.base && !i.equipped && (Number(i.qty) || 1) + r.qty <= G.MAX_STACK) ? 0 : b.stack ? 1 : r.qty; }
      }
      if (H.bagUsed(p) + need > G.INVENTORY_SIZE) { p.send({ type: 'log', kind: 'warn', text: `Prêmio do evento esperando: libere ${need} espaço(s) na bolsa.` }); return; }
      let zen = 0, exp = 0;
      for (const r of list) { if (r.kind === 'zen') zen += r.qty; if (r.kind === 'exp') exp += r.qty; }
      const created = [], bumped = [];
      p.zen += zen;
      try {
        await db.tx(async (q) => {
          const u = await q("UPDATE arena_rewards SET status = 'delivered', delivered_at = now() WHERE id = $1 AND status = 'pending' RETURNING id", [row.id]);
          if (!u.rows[0]) throw new Error('já entregue');
          for (const r of list) {
            if (r.kind === 'item') {
              const b = G.ITEM_BASES[r.base]; if (!b) continue;
              const st = b.stack && p.items.find((i) => i.base === r.base && !i.equipped && (Number(i.qty) || 1) + r.qty <= G.MAX_STACK);
              if (st) { const x = await q('UPDATE items SET qty = qty + $3 WHERE id = $1 AND character_id = $2 RETURNING qty', [st.id, p.charId, r.qty]); bumped.push([st, Number(x.rows[0].qty)]); }
              else if (b.stack) created.push((await q('INSERT INTO items (character_id, base, rarity, plus, qty) VALUES ($1,$2,$3,0,$4) RETURNING id, base, rarity, plus, equipped, qty', [p.charId, r.base, b.rarity || 'common', r.qty])).rows[0]);
              else for (let i = 0; i < r.qty; i++) created.push((await q('INSERT INTO items (character_id, base, rarity, plus, qty) VALUES ($1,$2,$3,0,1) RETURNING id, base, rarity, plus, equipped, qty', [p.charId, r.base, b.rarity || 'common'])).rows[0]);
            } else if (r.kind === 'gear') {
              for (let i = 0; i < r.qty; i++) {
                const it = H.rollItem(Math.max(1, r.level || p.level), 'boss');
                created.push((await q('INSERT INTO items (character_id, base, rarity, plus, qty) VALUES ($1,$2,$3,$4,1) RETURNING id, base, rarity, plus, equipped, qty', [p.charId, it.base, r.rarity || it.rarity, it.plus || 0])).rows[0]);
              }
            }
          }
          await q('UPDATE characters SET zen = $2 WHERE id = $1 RETURNING id', [p.charId, Math.round(p.zen)]);
        });
      } catch (e) {
        p.zen -= zen;
        if (e.message !== 'já entregue') console.error('[arena] prêmio', p.name, e.message);
        continue;
      }
      for (const [st, q] of bumped) st.qty = q;
      for (const c of created) p.items.push(c);
      if (exp) { p.exp += exp; while (p.exp >= H.expToNext(p.level) && p.level < G.LIMITS.maxLevel) { p.exp -= H.expToNext(p.level); W.levelUp(p); } }
      p.dirty = true;
      p.send({ type: 'log', kind: 'quest', text: `Prêmio recebido (${row.label.replace(/: \w+$/, '')}): ${list.map(rewardLabel).join(', ')}.` });
      p.send(p.charState());
    }
    pendingChars.delete(p.charId);
  });
}

// ---------- ciclo ----------
async function saveState() {
  const out = {};
  for (const kind of KINDS) out[kind] = { manual: ST[kind].manual || 0 };
  await SET.save('arena_state', out).catch(() => {});
}
async function tickKind(kind, now) {
  const k = K(kind), st = ST[kind];
  if (st.phase === 'running') { for (const m of st.matches.values()) if (!m.ended) await tickMatch(m, now); return; }
  if (!k.enabled) {
    if (st.phase === 'open') { st.phase = 'idle'; for (const r of st.regs.values()) db.query("UPDATE arena_entries SET status = 'cancelled', elim_reason = 'evento desativado' WHERE id = $1 RETURNING id", [r.entryId]).catch(() => {}); st.regs.clear(); }
    return;
  }
  if (st.phase === 'idle') {
    const slot = st.manual || nextSlotAfter(kind, now);
    if (slot && now >= slot - k.openMin * 60000) {
      st.phase = 'open'; st.slot = slot; st.warned = false;
      announce(`Inscrições abertas para o ${k.name}! Começa em ${Math.max(1, Math.round((slot - now) / 60000))} min. Fale com ${kind === 'castle' ? 'o Guarda do Chaos Castle' : 'Charon'} em Lorencia.`);
    }
    return;
  }
  if (st.phase === 'open') {
    if (!st.warned && now >= st.slot - 60000) {
      st.warned = true;
      const regd = [...st.regs.keys()].map((c) => W.players.get(c)).filter(Boolean);
      announce(`${k.name} começa em 1 minuto!`, false);
      for (const p of regd) p.send({ type: 'arena', phase: 'notice', text: `${k.name} começa em 1 minuto! Fique online e vivo.` });
    }
    if (now >= st.slot) await start(kind);
  }
}
let ticking = false;
async function tick() {
  if (ticking) return;
  ticking = true;
  const now = Date.now();
  try { for (const kind of KINDS) await tickKind(kind, now); } catch (e) { console.error('[arena]', e.message); } finally { ticking = false; }
}

// após reiniciar: partidas que estavam rolando são canceladas e a entrada volta como prêmio pendente; inscrições futuras continuam
async function restore() {
  const st = await SET.load('arena_state', {});
  const running = (await db.query("SELECT id, kind, category FROM arena_matches WHERE status = 'running'")).rows;
  for (const m of running) {
    const ents = (await db.query("SELECT id, character_id, entry_item FROM arena_entries WHERE match_id = $1 AND status = 'entered' AND consumed", [m.id])).rows;
    for (const e of ents) {
      await db.query(`INSERT INTO arena_rewards (entry_id, character_id, tag, payload, label) VALUES ($1,$2,'refund',$3,$4) ON CONFLICT (entry_id, tag) DO NOTHING RETURNING id`,
        [e.id, e.character_id, JSON.stringify([{ kind: 'item', base: e.entry_item, qty: 1 }]), 'Devolução: evento interrompido pelo reinício']);
      await db.query("UPDATE arena_entries SET status = 'refunded', elim_reason = 'reinício do servidor' WHERE id = $1 RETURNING id", [e.id]);
      pendingChars.add(String(e.character_id));
    }
    await db.query("UPDATE arena_matches SET status = 'cancelled', ended_at = now(), end_reason = 'reinício do servidor' WHERE id = $1 RETURNING id", [m.id]);
    console.log(`[arena] partida #${m.id} (${m.kind}) cancelada pelo reinício; ${ents.length} entrada(s) devolvida(s)`);
  }
  await db.query("UPDATE arena_entries SET status = 'cancelled', elim_reason = 'reinício do servidor' WHERE status = 'registered' AND slot_at <= now() RETURNING id");
  const regs = (await db.query("SELECT id, kind, category, character_id, char_name, EXTRACT(EPOCH FROM slot_at) * 1000 AS slot, EXTRACT(EPOCH FROM created_at) * 1000 AS at FROM arena_entries WHERE status = 'registered' AND slot_at > now()")).rows;
  for (const kind of KINDS) {
    ST[kind] = { phase: 'idle', slot: 0, manual: (st[kind] && st[kind].manual > Date.now()) ? st[kind].manual : 0, regs: new Map(), matches: new Map(), warned: false };
    const mine = regs.filter((r) => r.kind === kind);
    if (mine.length) {
      ST[kind].slot = ST[kind].manual = Math.round(Number(mine[0].slot));
      ST[kind].phase = 'open';
      for (const r of mine) if (Math.round(Number(r.slot)) === ST[kind].slot) ST[kind].regs.set(String(r.character_id), { cat: r.category, name: r.char_name, at: Number(r.at), entryId: String(r.id) });
    }
  }
  for (const r of (await db.query("SELECT DISTINCT character_id FROM arena_rewards WHERE status = 'pending'")).rows) pendingChars.add(String(r.character_id));
}

async function init(world, helpers) {
  W = world; H = helpers;
  await SET.load('arena', DEFAULTS);
  for (const kind of KINDS) ST[kind] = { phase: 'idle', slot: 0, manual: 0, regs: new Map(), matches: new Map(), warned: false };
  try { await restore(); } catch (e) { console.error('[arena] restaurar:', e.message); }
  setInterval(() => { tick(); }, 1000).unref();
  // prêmios esperando (bolsa cheia, desconexão): tenta de novo a cada minuto
  setInterval(() => { for (const cid of [...pendingChars]) { const p = W.players.get(cid); if (p) deliverPending(p).catch(() => {}); } }, 60000).unref();
}
function onJoin(p) {
  if (pendingChars.has(p.charId)) setTimeout(() => deliverPending(p).catch(() => {}), 1500);
  for (const kind of KINDS) {
    const st = ST[kind];
    if (st && st.phase === 'open' && st.regs.has(p.charId)) p.send({ type: 'arena', phase: 'notice', text: `Você está inscrito no ${K(kind).name}. Começa às ${new Date(st.slot + cfg().tzOffsetMin * 60000).toISOString().slice(11, 16)}.` });
  }
}

// ---------- administração ----------
function sanitizeRewards(list, label) {
  if (!Array.isArray(list)) throw new Error(`${label}: lista inválida.`);
  if (list.length > 12) throw new Error(`${label}: no máximo 12 prêmios.`);
  return list.map((r) => {
    const kind = ['zen', 'exp', 'item', 'gear'].includes(r.kind) ? r.kind : null;
    if (!kind) throw new Error(`${label}: tipo de prêmio inválido.`);
    const qty = Math.round(Number(r.qty));
    if (!(qty >= 1 && qty <= (kind === 'zen' || kind === 'exp' ? 1e12 : 99))) throw new Error(`${label}: quantidade inválida.`);
    const out = { kind, qty };
    if (kind === 'item') { if (!G.ITEM_BASES[r.base] || G.ITEM_BASES[r.base].slot === 'quest') throw new Error(`${label}: item desconhecido (${r.base}).`); out.base = r.base; }
    if (kind === 'gear') { if (!['common', 'uncommon', 'rare', 'epic', 'legendary', 'ancestral'].includes(r.rarity)) throw new Error(`${label}: raridade inválida.`); out.rarity = r.rarity; }
    return out;
  });
}
function sanitize(kind, i) {
  const d = DEFAULTS[kind], c = K(kind);
  const n = (v, a, b, label) => { const x = Math.round(Number(v)); if (!(x >= a && x <= b)) throw new Error(`${label}: use um número de ${a} a ${b}.`); return x; };
  i = { ...c, ...i, monsters: { ...c.monsters, ...(i.monsters || {}) }, shrink: { ...c.shrink, ...(i.shrink || {}) }, score: { ...c.score, ...(i.score || {}) } };
  const cats = Array.isArray(i.categories) && i.categories.length ? i.categories : c.categories;
  const times = (Array.isArray(i.times) ? i.times : String(i.times || '').split(/[\s,;]+/)).map((t) => String(t).trim()).filter(Boolean);
  for (const t of times) if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(t)) throw new Error(`Horário inválido: ${t} (use HH:MM).`);
  if (!times.length) throw new Error('Coloque pelo menos um horário.');
  if (cats.length !== d.categories.length) throw new Error(`São ${d.categories.length} categorias.`);
  const out = {
    enabled: i.enabled !== false, name: d.name, times: [...new Set(times)].sort(), openMin: n(i.openMin, 1, 60, 'Inscrições (min antes)'), durationMin: n(i.durationMin, 2, 60, 'Duração (min)'),
    minPlayers: n(i.minPlayers, 1, 50, 'Mínimo de participantes'), maxPlayers: n(i.maxPlayers, 1, 100, 'Máximo de participantes'),
    entryItem: d.entryItem, buyZen: n(i.buyZen ?? 0, 0, 1e10, 'Preço da entrada'), disguise: !!i.disguise, pvp: d.pvp,
    monsters: kind === 'castle'
      ? { base: n(i.monsters.base, 0, 120, 'Monstros'), perPlayer: n(i.monsters.perPlayer, -5, 5, 'Monstros por jogador'), min: n(i.monsters.min, 0, 120, 'Mínimo de monstros'), mult: Math.max(0.2, Math.min(10, Number(i.monsters.mult) || 1)) }
      : { maxAlive: n(i.monsters.maxAlive, 3, 60, 'Monstros vivos'), perPlayer: n(i.monsters.perPlayer, 0, 10, 'Monstros por jogador'), everySec: n(i.monsters.everySec, 1, 60, 'Intervalo das ondas'), mult: Math.max(0.2, Math.min(10, Number(i.monsters.mult) || 1)) },
    shrink: { enabled: !!(i.shrink || {}).enabled, startPct: n(i.shrink.startPct, 0, 95, 'Área: começa em %'), endPct: n(i.shrink.endPct, 5, 100, 'Área: termina em %'), finalSize: n(i.shrink.finalSize, 10, 100, 'Área final %'), dmgPct: n(i.shrink.dmgPct, 1, 50, 'Dano fora da área %') },
    score: { monster: n(i.score.monster, 0, 100, 'Pontos por monstro'), player: n(i.score.player, 0, 100, 'Pontos por jogador'), survive: n(i.score.survive, 0, 500, 'Pontos por sobreviver'), minForReward: n(i.score.minForReward, 0, 1000, 'Pontos mínimos para prêmio') },
    categories: cats.map((x, j) => {
      const mn = n(x.minLevel, 1, G.LIMITS.maxLevel, `Categoria ${j + 1}: nível mínimo`), mx = n(x.maxLevel, 1, 9999, `Categoria ${j + 1}: nível máximo`);
      if (mx < mn) throw new Error(`Categoria ${j + 1}: o nível máximo é menor que o mínimo.`);
      return { name: String(x.name || d.categories[j].name).trim().slice(0, 40) || d.categories[j].name, minLevel: mn, maxLevel: mx, minResets: n(x.minResets || 0, 0, 1000, `Categoria ${j + 1}: resets`) };
    }),
    rewards: (Array.isArray(i.rewards) ? i.rewards : c.rewards).map((r, j) => ({
      winner: sanitizeRewards(r.winner || [], `Categoria ${j + 1}, vencedor`), second: sanitizeRewards(r.second || [], `Categoria ${j + 1}, 2º`),
      third: sanitizeRewards(r.third || [], `Categoria ${j + 1}, 3º`), participant: sanitizeRewards(r.participant || [], `Categoria ${j + 1}, participação`),
    })),
  };
  if (out.minPlayers > out.maxPlayers) throw new Error('O mínimo de participantes é maior que o máximo.');
  if (out.shrink.endPct <= out.shrink.startPct) throw new Error('A área precisa terminar de diminuir depois de começar.');
  if (out.rewards.length !== out.categories.length) throw new Error('Prêmios: uma entrada por categoria.');
  return out;
}
async function saveConfig(kind, i) {
  if (!KINDS.includes(kind)) throw new Error('Evento inválido.');
  const all = { ...cfg(), [kind]: sanitize(kind, i) };
  await SET.save('arena', all);
}
async function openNow(kind, minutes) {
  const st = ST[kind];
  if (st.phase === 'running') throw new Error('Já há uma partida em andamento.');
  const mins = Math.max(1, Math.min(60, Math.round(Number(minutes) || 2)));
  st.manual = Date.now() + mins * 60000;
  if (st.phase === 'open') {
    // muda o horário da rodada aberta (mantém as inscrições)
    st.slot = st.manual; st.warned = false;
    for (const r of st.regs.values()) await db.query('UPDATE arena_entries SET slot_at = to_timestamp($2 / 1000.0) WHERE id = $1 RETURNING id', [r.entryId, st.slot]).catch(() => {});
  }
  await saveState();
  st.phase = st.phase === 'open' ? 'open' : 'idle';
  return st.manual;
}
async function endNow(kind) {
  const st = ST[kind];
  const list = [...st.matches.values()].filter((m) => !m.ended);
  if (!list.length) throw new Error('Nenhuma partida em andamento.');
  for (const m of list) await end(m, 'admin');
  return list.length;
}
async function adminView() {
  const now = Date.now();
  const out = { config: cfg(), kinds: KINDS, items: Object.entries(G.ITEM_BASES).filter(([, b]) => b.slot !== 'quest').map(([id, b]) => ({ id, name: b.name })), state: {} };
  for (const kind of KINDS) {
    const st = ST[kind];
    out.state[kind] = { phase: st.phase, slot: st.slot || st.manual || nextSlotAfter(kind, now), now, regs: [...st.regs.values()].map((r) => ({ name: r.name, cat: r.cat })),
      matches: [...st.matches.values()].map((m) => ({ cat: m.cat, name: m.inst.def.name, alive: aliveParts(m).length, total: m.started, monsters: aliveMons(m), endsAt: m.endsAt, ended: m.ended })) };
  }
  out.history = (await db.query(`SELECT id, kind, category, status, started_at, ended_at, end_reason, winner_name, players, monsters, data FROM arena_matches ORDER BY id DESC LIMIT 30`)).rows;
  out.pending = (await db.query("SELECT count(*)::int AS n FROM arena_rewards WHERE status = 'pending'")).rows[0].n;
  return out;
}

module.exports = { init, info, act, escape, onDeath, onMonsterKill, onPvpKill, onLeave, onJoin, blocked, disguise, saveConfig, openNow, endNow, adminView, deliverPending, cfg, DEFAULTS, KINDS, NPC_OF };
