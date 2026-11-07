'use strict';
// Comandos GM pelo chat, liberados SÓ para os personagens da lista de GMs (padrão: SacoLa).
// Tudo roda e é validado no servidor; cada ação é registrada em admin_log (papel "gm").
// Eventos temporários (EXP multiplicada e Box com 100% de drop) são modificadores reversíveis:
// não mexem nas tabelas de EXP/drop, ficam salvos (sobrevivem a reinício) e acabam sozinhos.
const db = require('./db');
const G = require('./gamedata');
const SET = require('./settings');

const GM_KEY = 'gm_chars';
const GM_DEFAULT = { names: [] }; // nenhum GM por padrão
const EV_KEY = 'gm_events';
const NUM_KEY = 'item_numbers';
const RAR = { comum: 'common', common: 'common', incomum: 'uncommon', uncommon: 'uncommon', raro: 'rare', rare: 'rare', epico: 'epic', epic: 'epic',
  lendario: 'legendary', legendary: 'legendary', ancestral: 'ancestral' };
const RAR_ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'ancestral'];
const RAR_PT = { common: 'Comum', uncommon: 'Incomum', rare: 'Raro', epic: 'Épico', legendary: 'Lendário', ancestral: 'Ancestral' };
const XP_MAX_MULT = 10, MAX_EVENT_MIN = 24 * 60, CHAT_MAX = 140;

let H = null;      // ajudantes de commands.js (mundo, log, resposta…)
let EV = { xp: null, drop: null };
let NUM = { byBase: {}, byNum: {} };

const fmt = (n) => Math.round(Number(n)).toLocaleString('pt-BR');
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const err = (m, usage) => { const e = new Error(m); e.user = true; e.usage = usage; return e; };
function int(v, a, b, label, usage) {
  const s = String(v ?? '').replace(/\./g, '');
  if (!/^\d+$/.test(s)) throw err(`${label}: use um número inteiro positivo.`, usage);
  const n = Number(s);
  if (!Number.isSafeInteger(n) || n < a || n > b) throw err(`${label}: use um valor de ${fmt(a)} a ${fmt(b)}.`, usage);
  return n;
}
function lev(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

// ---------- quem é GM ----------
function isGM(p) { if (!p || p.playOnly) return false; const names = (SET.get(GM_KEY, GM_DEFAULT).names || []).map(norm); return !!(p && p.name && names.includes(norm(p.name))); }
const gmAdmin = (p) => ({ accountId: p.accountId, name: p.name, role: 'gm' });

// ---------- números fixos dos itens (para "/dar 30 1") ----------
// cada item do catálogo ganha um número que nunca muda; itens novos recebem o próximo número livre
async function loadNumbers() {
  const saved = await SET.load(NUM_KEY, {});
  const byBase = { ...(saved && typeof saved === 'object' ? saved : {}) };
  let max = Object.values(byBase).reduce((a, n) => Math.max(a, Number(n) || 0), 0), changed = false;
  for (const base of Object.keys(G.ITEM_BASES).sort()) if (!byBase[base]) { byBase[base] = ++max; changed = true; }
  if (changed) await SET.save(NUM_KEY, byBase).catch((e) => console.error('[gm] números dos itens:', e.message));
  NUM = { byBase, byNum: Object.fromEntries(Object.entries(byBase).map(([b, n]) => [String(n), b])) };
}
function itemOf(arg, usage) {
  const a = String(arg || '').trim();
  const base = /^\d+$/.test(a) ? NUM.byNum[a] : (G.ITEM_BASES[a.toLowerCase()] ? a.toLowerCase() : null);
  if (!base || !G.ITEM_BASES[base]) throw err(`Item "${a}" não existe. Use /itens BUSCA para ver os números e IDs.`, usage);
  return base;
}
const numOf = (base) => NUM.byBase[base] || '?';

// ---------- eventos ----------
async function loadEvents() {
  const v = await SET.load(EV_KEY, { xp: null, drop: null });
  EV = { xp: v.xp && v.xp.until > Date.now() ? v.xp : null, drop: v.drop && v.drop.until > Date.now() ? v.drop : null };
}
const saveEvents = () => SET.save(EV_KEY, EV).catch((e) => console.error('[gm] eventos:', e.message));
function xpMult() { return EV.xp && EV.xp.until > Date.now() ? EV.xp.mult : 1; }
function dropBox() { return EV.drop && EV.drop.until > Date.now() ? EV.drop.base : null; }
function endEvent(kind, why) {
  const e = EV[kind]; if (!e) return;
  EV[kind] = null; saveEvents();
  const what = kind === 'xp' ? `Evento de EXP ${e.mult}x` : `Evento de drop de ${G.ITEM_BASES[e.base] ? G.ITEM_BASES[e.base].name : e.base}`;
  H.W.system(`⏰ ${what} terminou${why ? ` (${why})` : ''}. Valores normais restaurados.`, `⏰ ${kind === 'xp' ? `${e.mult}x EXP event` : 'Box drop event'} ended.`);
  H.log({ accountId: null, name: e.by || 'GM', role: 'gm' }, `evento_${kind}_fim`, null, { ...e, why: why || 'tempo' }, null, null, 'ok', `${what} encerrado`, null);
}
function tickEvents() { const now = Date.now(); for (const k of ['xp', 'drop']) if (EV[k] && EV[k].until <= now) endEvent(k); }
function duration(s, usage) {
  const m = String(s || '').toLowerCase().match(/^(\d+)\s*(m|min|h|hora|horas)?$/);
  if (!m) throw err('Duração inválida: use por exemplo 5m, 30m, 1h ou 2h.', usage);
  const min = Number(m[1]) * (m[2] && m[2].startsWith('h') ? 60 : 1);
  if (!(min >= 1 && min <= MAX_EVENT_MIN)) throw err(`Duração: de 1 minuto a ${MAX_EVENT_MIN / 60} horas.`, usage);
  return min;
}
const left = (until) => { const s = Math.max(0, Math.round((until - Date.now()) / 1000)); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), ss = s % 60; return `${h ? h + 'h ' : ''}${m}min ${ss}s`; };
const clock = (t) => new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }) + ' (Brasília)';

// Box do evento de drop: entregue na bolsa de quem derrotou um monstro comum (100%)
function onKill(world, p, m) {
  const base = dropBox();
  if (!base || !p || m.T.arena || m.T.structure) return;
  p.run(async () => {
    const got = await world.giveMaterial(p, base, 1, { src: 'evento GM', x: Math.round(m.x), y: Math.round(m.y) });
    if (!got && (!p.boxFullNote || Date.now() - p.boxFullNote > 30000)) { p.boxFullNote = Date.now(); p.send({ type: 'log', kind: 'warn', text: `Bolsa cheia: a ${G.ITEM_BASES[base].name} do evento não coube. Libere espaço!` }); }
  });
}

// ---------- comandos ----------
const CMDS = {
  ajuda: { usage: '/ajuda', cat: '' },
  itens: { usage: '/itens [busca]', cat: 'Itens', desc: 'Números e IDs dos itens. Ex.: /itens box' },
  dar: { usage: '/dar ID QUANTIDADE', cat: 'Itens', desc: 'Entrega item na sua bolsa (raridade padrão, +0). Ex.: /dar 30 1 · /dar jewel_of_chaos 10' },
  criaritem: { usage: '/criaritem ID [QUANTIDADE] [NIVEL] [RARIDADE] [EXC]', cat: 'Itens', desc: 'NIVEL +0 a +15; RARIDADE COMUM, INCOMUM, RARO, EPICO, LENDARIO, ANCESTRAL; EXC = opções Excellent semi-full. Ex.: /criaritem 500 1 15 LENDARIO EXC' },
  z: { usage: '/z QUANTIDADE', cat: 'Zen', desc: 'Adiciona Zen. Ex.: /z 100000 (também /zn)' },
  removerzen: { usage: '/removerzen QUANTIDADE', cat: 'Zen', desc: 'Remove Zen (precisa ter saldo). Ex.: /removerzen 100000' },
  xp: { usage: '/xp QUANTIDADE', cat: 'Experiência', desc: 'Adiciona EXP e sobe de nível normalmente. Ex.: /xp 50000' },
  removerxp: { usage: '/removerxp QUANTIDADE', cat: 'Experiência', desc: 'Remove EXP do nível atual (não desce de nível). Ex.: /removerxp 1000' },
  mover: { usage: '/mover MAPA  ·  /mover player JOGADOR', cat: 'Teletransporte', desc: 'Leva você ao mapa (na sua sala) ou traz o jogador online para perto de você. Ex.: /mover Noria · /mover player Jogador123' },
  reviver: { usage: '/reviver boss NOME [SALA|todas]', cat: 'Bosses', desc: 'Faz o Boss morto nascer agora no lugar original (na sua sala, numa sala ou em todas). Ex.: /reviver boss Kundun' },
  evento: { usage: '/evento xp MULT DURAÇÃO · /evento drop ID_BOX DURAÇÃO · /evento status · /evento parar [xp|drop]', cat: 'Eventos', desc: 'Ex.: /evento xp 2x 30m · /evento drop kundun_1 5m' },
  chatgm: { usage: '/chatgm MENSAGEM', cat: 'Comunicação', desc: `Aviso grande e vermelho na tela de todos (até ${CHAT_MAX} letras).` },
  online: { usage: '/online', cat: 'Consultas', desc: 'Quantos jogadores estão conectados.' },
  info: { usage: '/info JOGADOR', cat: 'Consultas', desc: 'Classe, nível, reset, mapa, online, guilda, Zen e EXP.' },
};
const ALIAS = { zn: 'z', help: 'ajuda', items: 'itens', criar: 'criaritem', teleporte: 'mover', revive: 'reviver', event: 'evento' };
const has = (name) => !!CMDS[ALIAS[name] || name];

function reply(p, ok, lines, extra) { H.reply(p, ok, lines, extra); }
const self = (p) => ({ id: String(p.charId), name: p.name });
// muda a ficha do próprio GM (travada, salva e registra antes/depois)
async function onSelf(p, cmd, params, fn) {
  let before = null, after = null, msg = '';
  await H.W.editChar(p.charId, async (c) => { before = H.snap(c); msg = await fn(c); after = H.snap(c); });
  H.log(gmAdmin(p), cmd, self(p), params, before, after, 'ok', msg, null);
  reply(p, true, msg);
}

const handlers = {
  async ajuda(p) {
    const lines = ['Comandos GM (só para personagem GM):'];
    let cat = null;
    for (const [k, d] of Object.entries(CMDS)) { if (k === 'ajuda') continue; if (d.cat !== cat) { cat = d.cat; lines.push(`— ${cat} —`); } lines.push(`${d.usage} — ${d.desc}`); }
    reply(p, true, lines);
  },
  async itens(p, a) {
    const q = norm(a.join(' '));
    const list = Object.entries(G.ITEM_BASES).filter(([k, b]) => !q || norm(k).includes(q) || norm(b.name).includes(q) || String(numOf(k)) === q)
      .sort((x, y) => numOf(x[0]) - numOf(y[0]));
    const lines = list.slice(0, 40).map(([k, b]) => `#${numOf(k)} ${k} — ${b.name} (${b.slot}${b.stack ? ', empilha' : ''}, nv. ${b.req || 1})`);
    if (list.length > 40) lines.push(`… e mais ${list.length - 40}. Refine a busca: /itens asa`);
    reply(p, true, lines.length ? lines : 'Nenhum item encontrado.');
  },
  async dar(p, a, d) {
    if (a.length < 1) throw err('Faltam parâmetros.', d.usage);
    const base = itemOf(a[0], d.usage), b = G.ITEM_BASES[base];
    const qty = a[1] === undefined ? 1 : int(a[1], 1, b.stack ? 9999 : 40, 'Quantidade', d.usage);
    await onSelf(p, 'gm_dar', { base, qty }, async (c) => `Entregue: ${await H.giveItems(c, base, qty, 0, b.rarity || 'common')} (#${numOf(base)}).`);
  },
  async criaritem(p, a, d) {
    if (a.length < 1) throw err('Faltam parâmetros.', d.usage);
    const base = itemOf(a[0], d.usage), b = G.ITEM_BASES[base];
    const qty = a[1] === undefined ? 1 : int(a[1], 1, b.stack ? 9999 : 40, 'Quantidade', d.usage);
    const plus = a[2] === undefined ? 0 : int(String(a[2]).replace(/^\+/, ''), 0, 15, 'Nível (+0 a +15)', d.usage);
    let rarity = b.rarity || 'common';
    if (a[3] !== undefined) { rarity = RAR[norm(a[3])]; if (!rarity) throw err('Raridade: COMUM, INCOMUM, RARO, EPICO, LENDARIO ou ANCESTRAL.', d.usage); }
    const exc = a.slice(4).some((x) => /^exc/i.test(x)) || (a[3] && /^exc/i.test(a[3]));
    if (b.stack || b.slot === 'material' || b.slot === 'box' || b.slot === 'quest') {
      if (plus || a[3] !== undefined) throw err(`${b.name} é material/caixa: não tem nível nem raridade. Use /dar ${numOf(base)} ${qty}.`);
      return handlers.dar(p, [base, String(qty)], CMDS.dar);
    }
    if (b.slot === 'wings' && rarity !== (b.rarity || 'common')) rarity = b.rarity || rarity; // asas têm raridade fixa
    await onSelf(p, 'gm_criaritem', { base, qty, plus, rarity, exc }, async (c) => {
      const free = G.INVENTORY_SIZE - c.items.filter((i) => !i.equipped).length;
      if (qty > free) throw err(`Bolsa sem espaço: ${free} lugar(es) livre(s).`);
      const made = [];
      for (let i = 0; i < qty; i++) {
        const row = await H.W.giveItemRow(c, { base, rarity, plus }, { silent: true, excellent: !!exc });
        if (!row) throw err(`Bolsa cheia: criados ${made.length} de ${qty}.`);
        made.push(row);
      }
      const opts = made[0] && Array.isArray(made[0].excellent_options) ? made[0].excellent_options.length : 0;
      return `Criado: ${qty}× ${b.name} +${plus} (${RAR_PT[rarity]})${exc ? ` com ${opts ? opts + ' opções Excellent' : 'Excellent (este item não tem opções)'}` : ''} · #${numOf(base)}.`;
    });
  },
  async z(p, a, d) {
    const n = int(a[0], 1, H.cfg().maxZen, 'Quantidade de Zen', d.usage);
    await onSelf(p, 'gm_z', { n }, (c) => H.OPS.addgold(c, n));
  },
  async removerzen(p, a, d) {
    const n = int(a[0], 1, H.cfg().maxZen, 'Quantidade de Zen', d.usage);
    await onSelf(p, 'gm_removerzen', { n }, (c) => H.OPS.removegold(c, n));
  },
  async xp(p, a, d) {
    const n = int(a[0], 1, 1e15, 'Quantidade de EXP', d.usage);
    if (p.level >= G.LIMITS.maxLevel) throw err(`Você já está no nível máximo (${G.LIMITS.maxLevel}).`);
    await onSelf(p, 'gm_xp', { n }, (c) => H.OPS.addxp(c, n));
  },
  async removerxp(p, a, d) {
    const n = int(a[0], 1, 1e15, 'Quantidade de EXP', d.usage);
    await onSelf(p, 'gm_removerxp', { n }, (c) => {
      if (n > c.exp) throw err(`Você tem só ${fmt(c.exp)} de EXP no nível ${c.level}; não dá para remover ${fmt(n)} (a EXP não fica negativa e o nível não desce).`);
      c.exp -= n;
      return `-${fmt(n)} EXP. Nível ${c.level} (EXP ${fmt(c.exp)}/${fmt(H.XP(c.level))}).`;
    });
  },
  async mover(p, a, d) {
    if (!a.length) throw err('Faltam parâmetros.', d.usage);
    if (norm(a[0]) === 'player' || norm(a[0]) === 'jogador') {
      if (!a[1]) throw err('Diga o nome do jogador.', d.usage);
      const t = [...H.W.players.values()].find((o) => norm(o.name) === norm(a[1]));
      if (!t) throw err(`${a[1]} não está online (ou não existe).`);
      if (t === p) throw err('Esse é você.');
      if (!p.map) throw err('Você não está num mapa.');
      if (p.map.def.arena || (t.map && t.map.def.arena)) throw err('Não dá para convocar de/para um evento (Blood Castle, Devil Square, Chaos Castle).');
      if (t.duel || p.duel) throw err('Não dá para convocar durante um duelo.');
      if (t.dead) throw err(`${t.name} está derrotado agora; tente em alguns segundos.`);
      const from = t.map ? `${t.map.def.name} (Sala ${t.map.room})` : '?';
      await new Promise((res, rej) => t.run(() => { try {
        t.room = p.map.room; H.W.enterMap(t, p.map.id, [p.x + 24, p.y + 6], p.map);
        t.send({ type: 'log', kind: 'info', text: `O GM ${p.name} chamou você para ${p.map.def.name}.` }); t.dirty = true; res();
      } catch (e) { rej(e); } }));
      H.log(gmAdmin(p), 'gm_convocar', { id: String(t.charId), name: t.name }, { from, to: `${p.map.id}:${p.map.room}` }, null, null, 'ok', `${t.name} trazido de ${from}`, null);
      return reply(p, true, `${t.name} foi trazido de ${from} para perto de você em ${p.map.def.name} (Sala ${p.map.room}).`);
    }
    const q = norm(a.join(' '));
    const maps = Object.entries(G.WORLD).filter(([, w]) => !w.arena);
    let hit = maps.find(([id, w]) => norm(id) === q || norm(w.name) === q);
    if (!hit) { const best = maps.map(([id, w]) => [id, w, Math.min(lev(q, norm(id)), lev(q, norm(w.name)))]).sort((x, y) => x[2] - y[2])[0]; if (best && best[2] <= 2) hit = best; }
    if (!hit) throw err(`Mapa "${a.join(' ')}" não existe. Mapas: ${maps.map(([, w]) => w.name).join(', ')}.`);
    const [id, w] = hit;
    if (p.map && p.map.def.arena) throw err('Saia do evento antes de se teletransportar.');
    if (p.dead) throw err('Você está derrotado.');
    await new Promise((res, rej) => p.run(() => { try { H.W.enterMap(p, id); p.dirty = true; res(); } catch (e) { rej(e); } }));
    H.log(gmAdmin(p), 'gm_mover', self(p), { map: id }, null, null, 'ok', `foi para ${w.name}`, null);
    reply(p, true, `Você foi para ${w.name} (Sala ${p.map.room}).`);
  },
  async reviver(p, a, d) {
    if (norm(a[0]) !== 'boss' || a.length < 2) throw err('Use: /reviver boss NOME.', d.usage);
    let rooms = 'mine'; const rest = a.slice(1);
    const last = rest[rest.length - 1];
    if (rest.length > 1 && /^(todas|all)$/i.test(last)) { rooms = 'all'; rest.pop(); } else if (rest.length > 1 && /^\d+$/.test(last)) { rooms = Number(rest.pop()); }
    const q = norm(rest.join(' '));
    const all = [...H.W.maps.values()].filter((m) => m.boss);
    const names = [...new Set(all.map((m) => m.boss.T.name))];
    let match = all.filter((m) => norm(m.boss.T.name) === q || norm(m.boss.type) === q);
    if (!match.length) match = all.filter((m) => norm(m.boss.T.name).includes(q) || norm(m.def.name) === q);
    if (!match.length) throw err(`Boss "${rest.join(' ')}" não encontrado. Bosses: ${names.join(', ')}.`);
    const myRoom = p.map ? p.map.room : 1;
    if (rooms === 'mine') match = match.filter((m) => m.room === myRoom); else if (typeof rooms === 'number') match = match.filter((m) => m.room === rooms);
    if (!match.length) throw err('Essa sala não existe.');
    const bossName = match[0].boss.T.name;
    const dead = match.filter((m) => m.boss.dead);
    if (!dead.length) return reply(p, false, `${bossName} já está vivo${rooms === 'all' ? ' em todas as salas' : ` na Sala ${typeof rooms === 'number' ? rooms : myRoom}`} (${match[0].def.name}).`);
    // nasce agora no lugar original, com vida, dano e recompensas normais; a próxima morte volta ao tempo normal de respawn
    for (const m of dead) H.W.respawnMonster(m, m.boss);
    H.log(gmAdmin(p), 'gm_reviver_boss', null, { boss: match[0].boss.type, rooms: dead.map((m) => m.room) }, null, null, 'ok', `${bossName} revivido`, null);
    reply(p, true, `Boss ${bossName} foi revivido com sucesso! (${match[0].def.name}, Sala ${dead.map((m) => m.room).join(', ')})`);
  },
  async evento(p, a, d) {
    const sub = norm(a[0]);
    if (sub === 'status') {
      const L = [];
      if (EV.xp) L.push(`EXP ${EV.xp.mult}x · faltam ${left(EV.xp.until)} · termina às ${clock(EV.xp.until)} (por ${EV.xp.by})`);
      if (EV.drop) L.push(`Drop de ${G.ITEM_BASES[EV.drop.base].name} (100%) · faltam ${left(EV.drop.until)} · termina às ${clock(EV.drop.until)} (por ${EV.drop.by})`);
      return reply(p, true, L.length ? ['Eventos ativos:', ...L] : 'Nenhum evento GM ativo.');
    }
    if (sub === 'parar') {
      const which = a[1] ? norm(a[1]) : null;
      const kinds = (which ? [which] : ['xp', 'drop']).filter((k) => EV[k]);
      if (!kinds.length) return reply(p, false, 'Nenhum evento GM ativo para parar.');
      for (const k of kinds) endEvent(k, `parado pelo GM ${p.name}`);
      return reply(p, true, `Evento(s) encerrado(s): ${kinds.map((k) => k === 'xp' ? 'EXP' : 'drop').join(' e ')}.`);
    }
    if (sub === 'xp') {
      if (EV.xp) throw err(`Já existe um evento de EXP ${EV.xp.mult}x (faltam ${left(EV.xp.until)}). Use /evento parar xp antes.`);
      const mult = Number(String(a[1] || '').toLowerCase().replace(/x$/, '').replace(',', '.'));
      if (!(mult >= 1.1 && mult <= XP_MAX_MULT)) throw err(`Multiplicador: de 1.1x a ${XP_MAX_MULT}x (ex.: 2x, 3x, 5x).`, d.usage);
      const min = duration(a[2], d.usage);
      EV.xp = { mult: Math.round(mult * 10) / 10, until: Date.now() + min * 60000, by: p.name, at: Date.now() }; await saveEvents();
      H.W.system(`🔥 EVENTO DE EXP ${EV.xp.mult}x INICIADO por ${min >= 60 && min % 60 === 0 ? min / 60 + 'h' : min + ' min'}! Aproveitem!`, `🔥 ${EV.xp.mult}x EXP EVENT started!`);
      H.log(gmAdmin(p), 'evento_xp', null, EV.xp, null, null, 'ok', `EXP ${EV.xp.mult}x por ${min} min`, null);
      return reply(p, true, `Evento de EXP ${EV.xp.mult}x ativo por ${min} min (termina às ${clock(EV.xp.until)}).`);
    }
    if (sub === 'drop') {
      if (EV.drop) throw err(`Já existe um evento de drop (${G.ITEM_BASES[EV.drop.base].name}, faltam ${left(EV.drop.until)}). Use /evento parar drop antes.`);
      const base = itemOf(a[1], d.usage);
      if (G.ITEM_BASES[base].slot !== 'box') throw err(`${G.ITEM_BASES[base].name} não é uma Box. Boxes: ${Object.entries(G.ITEM_BASES).filter(([, b]) => b.slot === 'box').map(([k, b]) => `#${numOf(k)} ${k} (${b.name})`).join(', ')}.`);
      const min = duration(a[2], d.usage);
      EV.drop = { base, until: Date.now() + min * 60000, by: p.name, at: Date.now() }; await saveEvents();
      H.W.system(`🎁 EVENTO DE DROP: todo monstro derrotado dá ${G.ITEM_BASES[base].name} por ${min} min!`, `🎁 DROP EVENT: every monster drops ${G.ITEM_BASES[base].name}!`);
      H.log(gmAdmin(p), 'evento_drop', null, EV.drop, null, null, 'ok', `${base} 100% por ${min} min`, null);
      return reply(p, true, `Evento de drop de ${G.ITEM_BASES[base].name} (100%) ativo por ${min} min (termina às ${clock(EV.drop.until)}).`);
    }
    throw err('Use: /evento xp MULT DURAÇÃO · /evento drop ID_BOX DURAÇÃO · /evento status · /evento parar.', d.usage);
  },
  async chatgm(p, a, d, raw) {
    const text = String(raw || '').replace(/^\/\S+\s*/, '').replace(/\s+/g, ' ').trim();
    if (!text) throw err('A mensagem está vazia.', d.usage);
    if (text.length > CHAT_MAX) throw err(`Mensagem longa demais: até ${CHAT_MAX} letras (tem ${text.length}).`, d.usage);
    for (const o of H.W.players.values()) o.send({ type: 'gmmsg', text, by: p.name });
    H.log(gmAdmin(p), 'gm_chatgm', null, { text }, null, null, 'ok', text, null);
    reply(p, true, `Aviso enviado para ${H.W.players.size} jogador(es) online.`);
  },
  async online(p) {
    const n = H.W.players.size;
    H.log(gmAdmin(p), 'gm_online', null, {}, null, null, 'ok', `${n} online`, null);
    reply(p, true, `Jogadores conectados agora: ${n}.`);
  },
  async info(p, a, d) {
    if (!a[0]) throw err('Diga o nome do jogador.', d.usage);
    const t = await H.findChar(a[0]);
    const live = H.W.players.get(t.id);
    const c = live || await H.W.loadShadow(t.id);
    const g = (await db.query('SELECT g.name FROM guild_members gm JOIN guilds g ON g.id = gm.guild_id WHERE gm.character_id = $1', [t.id]).catch(() => ({ rows: [] }))).rows[0];
    let mapName = live && live.map ? `${live.map.def.name} (Sala ${live.map.room})` : null;
    if (!mapName) { const r = (await db.query('SELECT map FROM characters WHERE id = $1', [t.id])).rows[0]; mapName = `${(G.WORLD[r && r.map] || G.WORLD.lorencia).name} (último)`; }
    H.log(gmAdmin(p), 'gm_info', t, {}, null, null, 'ok', 'consulta', null);
    reply(p, true, [
      `${c.name} · ${G.CLASSES[c.cls].name} · Nível ${c.level} · Reset ${c.resets || 0}${c.masterResets ? ` · MR ${c.masterResets}` : ''}`,
      `${live ? '🟢 Online' : '⚫ Offline'} · Mapa: ${mapName} · Guilda: ${g ? g.name : 'nenhuma'}`,
      `Zen ${fmt(c.zen)} · EXP ${fmt(c.exp)} / ${fmt(H.XP(c.level))}`,
    ]);
  },
};

async function exec(p, name, parts, raw) {
  name = ALIAS[name] || name;
  const d = CMDS[name];
  try {
    return await handlers[name](p, parts, d, raw);
  } catch (e) {
    if (!e.user) throw e;
    H.log(gmAdmin(p), 'gm_' + name, null, { args: parts }, null, null, 'error', e.message, null);
    return reply(p, false, e.usage ? [e.message, `Uso: ${typeof e.usage === 'string' ? e.usage : d.usage}`] : [e.message]);
  }
}

async function init(helpers) {
  H = helpers;
  await SET.load(GM_KEY, GM_DEFAULT);
  await loadNumbers();
  await loadEvents();
  setInterval(tickEvents, 2000).unref();
}

// eventos ativos do GM para o calendário
function eventsStatus() {
  const out = [];
  if (EV.xp && EV.xp.until > Date.now()) out.push({ kind: 'xp', name: `Evento de EXP ${EV.xp.mult}x`, until: EV.xp.until, desc: `EXP ${EV.xp.mult}x em monstros e bosses` });
  if (EV.drop && EV.drop.until > Date.now()) out.push({ kind: 'drop', name: 'Evento de drop', until: EV.drop.until, desc: `Todo monstro dá ${(G.ITEM_BASES[EV.drop.base] || {}).name || EV.drop.base}` });
  return out;
}

module.exports = { eventsStatus, init, isGM, has, exec, xpMult, dropBox, onKill, numOf, CMDS };
