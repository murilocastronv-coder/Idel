'use strict';
// Comandos de administração no chat ("/addgold Nome 1000"). Tudo roda no servidor:
// permissão conferida a cada execução, parâmetros validados, personagem travado durante a mudança,
// confirmação para o que remove ou reduz, e registro de cada operação em admin_log.
const crypto = require('crypto');
const db = require('./db');
const G = require('./gamedata');
const SET = require('./settings');

const ROLES = ['player', 'moderator', 'admin', 'superadmin'];
const ROLE_PT = { player: 'Jogador', moderator: 'Moderador', admin: 'Administrador', superadmin: 'Super ADM' };
const rank = (r) => Math.max(0, ROLES.indexOf(r));
const RARITY_ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'ancestral'];
const RAR_PT = { common: 'Comum', uncommon: 'Incomum', rare: 'Raro', epic: 'Épico', legendary: 'Lendário', ancestral: 'Ancestral' };
const STATS = ['str', 'agi', 'vit', 'ene', 'cmd'];
const STAT_PT = { str: 'Força', agi: 'Agilidade', vit: 'Vitalidade', ene: 'Energia', cmd: 'Comando' };

const DEFAULTS = {
  confirmSecs: 60,
  maxZen: 999999999999,
  maxFreePoints: 10000000,
  maxAddPoints: 1000000,
  reset: { minLevel: 400, keepStats: false, pointsPerReset: 500, maxResets: 1000 },
  master: { minResets: 10, minLevel: 400, pointsPerMaster: 5000 },
};
function cfg() { return SET.get('admin_rules', DEFAULTS); }

const fmt = (n) => Math.round(Number(n)).toLocaleString('pt-BR');
const err = (m, usage) => { const e = new Error(m); e.user = true; e.usage = !!usage; return e; };
function int(v, a, b, label) {
  if (!/^-?\d+$/.test(String(v || ''))) throw err(`${label}: use um número inteiro.`, true);
  const n = Number(v);
  if (!Number.isSafeInteger(n) || n < a || n > b) throw err(`${label}: use um valor de ${fmt(a)} a ${fmt(b)}.`, true);
  return n;
}

let W = null;          // mundo
let XP = null;         // expToNext
const pending = new Map();

function init(world, expToNext) {
  W = world; XP = expToNext;
  SET.load('admin_rules', DEFAULTS).catch(() => {});
  setInterval(() => {
    const now = Date.now();
    for (const [code, c] of pending) if (now > c.expires) { pending.delete(code); log(c.admin, c.cmd, c.target, c.params, null, null, 'expired', 'Confirmação expirou.', c.reason); }
  }, 15000).unref();
}

function log(admin, command, target, params, before, after, result, message, reason) {
  db.query(`INSERT INTO admin_log (admin_account, admin_name, role, command, target_name, target_char, params, before, after, result, message, reason)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
  [admin ? admin.accountId : null, admin ? admin.name : null, admin ? admin.role : null, command, target ? target.name : null, target ? target.id : null,
    JSON.stringify(params || {}), before ? JSON.stringify(before) : null, after ? JSON.stringify(after) : null, result, message ? String(message).slice(0, 500) : null, reason || null])
    .catch((e) => console.error('[admin_log]', e.message));
}

// personagem pelo nome (online ou não)
async function findChar(name) {
  const n = String(name || '').trim();
  if (!/^[A-Za-z0-9_]{2,16}$/.test(n)) throw err('Nome de personagem inválido.');
  const { rows } = await db.query(`SELECT c.id, c.name, c.class, c.account_id, a.username, a.role, a.email FROM characters c JOIN accounts a ON a.id = c.account_id
    WHERE lower(c.name) = lower($1)`, [n]);
  if (!rows[0]) throw err(`Personagem "${n}" não encontrado.`);
  const owner = require('./admin').isAdmin({ username: rows[0].username, email: rows[0].email });
  return { id: String(rows[0].id), name: rows[0].name, cls: rows[0].class, accountId: String(rows[0].account_id), username: rows[0].username, role: owner ? 'superadmin' : rows[0].role, email: rows[0].email };
}

function snap(p) {
  return { level: p.level, exp: Math.round(p.exp), zen: Math.round(p.zen), resets: p.resets, masterResets: p.masterResets, free: p.free, bonus: p.bonusPoints, stats: { ...p.stats } };
}
function baseStats(cls) { return { ...G.CLASSES[cls].base }; }
function ppl(cls) { return G.POINTS_PER_LEVEL[cls] || 5; }

function itemCatalog(id) {
  const b = G.ITEM_BASES[id];
  if (!b) throw err(`Item "${id}" não existe. Use /itens para ver os IDs.`);
  return b;
}

// ---------- operações (recebem o personagem, online ou carregado do banco) ----------
const OPS = {
  resetstatus(p) {
    const base = baseStats(p.cls);
    let back = 0;
    for (const k of STATS) {
      if (k === 'cmd' && p.cls !== 'dark_lord') continue;
      const extra = Math.max(0, (p.stats[k] || 0) - (base[k] || 0));
      back += extra;
      if (extra > 0) p.stats[k] = base[k] || 0;
    }
    p.free += back;
    p.settings.autoStats = false; // senão a distribuição automática gastaria tudo de novo
    return `${fmt(back)} pontos devolvidos (${fmt(p.free)} livres). A distribuição automática foi desligada para o jogador escolher.`;
  },
  addpontos(p, n) {
    const c = cfg();
    if (p.free + n > c.maxFreePoints) throw err(`Limite de pontos livres: ${fmt(c.maxFreePoints)}.`);
    p.free += n; p.bonusPoints += n;
    return `+${fmt(n)} pontos (${fmt(p.free)} livres).`;
  },
  addgold(p, n) {
    const c = cfg();
    if (p.zen + n > c.maxZen) throw err(`O saldo passaria do limite de ${fmt(c.maxZen)} Zen.`);
    p.zen += n;
    return `+${fmt(n)} Zen (saldo ${fmt(p.zen)}).`;
  },
  removegold(p, n) {
    if (p.zen < n) throw err(`Saldo insuficiente: ${fmt(p.zen)} Zen.`);
    p.zen -= n;
    return `-${fmt(n)} Zen (saldo ${fmt(p.zen)}).`;
  },
  setgold(p, n) {
    if (n > cfg().maxZen) throw err(`Limite: ${fmt(cfg().maxZen)} Zen.`);
    p.zen = n;
    return `Saldo definido: ${fmt(p.zen)} Zen.`;
  },
  addxp(p, n) {
    const lv0 = p.level;
    p.exp += n;
    while (p.level < G.LIMITS.maxLevel && p.exp >= XP(p.level)) { p.exp -= XP(p.level); W.levelUp(p, true); }
    if (p.level >= G.LIMITS.maxLevel) p.exp = Math.min(p.exp, XP(p.level) - 1);
    return `+${fmt(n)} EXP. Nível ${lv0} → ${p.level} (EXP ${fmt(p.exp)}/${fmt(XP(p.level))}).`;
  },
  setxp(p, n) {
    if (n >= XP(p.level)) throw err(`No nível ${p.level} a EXP vai de 0 a ${fmt(XP(p.level) - 1)} (EXP dentro do nível atual).`);
    p.exp = n;
    return `EXP definida: ${fmt(n)}/${fmt(XP(p.level))} no nível ${p.level}.`;
  },
  // policy: preserve (mantém os atributos; ao descer, tira dos pontos livres) ou recalc (atributos da classe + pontos refeitos)
  async setlevel(p, L, policy) {
    const lv0 = p.level;
    if (policy === 'recalc') {
      p.level = L; p.exp = 0;
      p.stats = { ...p.stats, ...baseStats(p.cls) };
      p.free = (L - 1) * ppl(p.cls) + p.bonusPoints;
    } else if (L >= lv0) {
      while (p.level < L) W.levelUp(p, true);
      p.exp = 0;
    } else {
      const need = (lv0 - L) * ppl(p.cls);
      if (p.free < need) throw err(`Para descer ${lv0 - L} níveis mantendo os atributos é preciso tirar ${fmt(need)} pontos livres, mas só há ${fmt(p.free)}. Use "recalcular".`);
      p.free -= need; p.level = L; p.exp = 0;
    }
    const off = await unequipAbove(p);
    return `Nível ${lv0} → ${p.level}${policy === 'recalc' ? ` (atributos recalculados: ${fmt(p.free)} pontos livres)` : ''}.${off.length ? ` Desequipados: ${off.join(', ')}.` : ''}`;
  },
  async resetplayer(p, force) {
    const c = cfg().reset;
    if (!force && p.level < c.minLevel) throw err(`O reset exige nível ${c.minLevel} (está no ${p.level}). Para forçar: /resetplayer NOME forcar`);
    if (p.resets >= c.maxResets) throw err(`Limite de ${c.maxResets} resets.`);
    p.resets += 1; p.level = 1; p.exp = 0; p.bonusPoints += c.pointsPerReset;
    if (c.keepStats) p.free += c.pointsPerReset;
    else { p.stats = { ...p.stats, ...baseStats(p.cls) }; p.free = p.bonusPoints; }
    return `Reset feito: ${p.resets} resets, nível 1, ${fmt(p.free)} pontos livres${c.keepStats ? ' (atributos mantidos)' : ''}.`;
  },
  async masterreset(p) {
    const c = cfg().master, r = cfg().reset;
    if (p.resets < c.minResets) throw err(`O Master Reset exige ${c.minResets} resets (tem ${p.resets}).`);
    if (p.level < c.minLevel) throw err(`O Master Reset exige nível ${c.minLevel} (está no ${p.level}).`);
    const fromResets = p.resets * r.pointsPerReset;
    p.masterResets += 1; p.resets = 0; p.level = 1; p.exp = 0;
    p.bonusPoints = Math.max(0, p.bonusPoints - fromResets) + c.pointsPerMaster;
    p.stats = { ...p.stats, ...baseStats(p.cls) }; p.free = p.bonusPoints;
    return `Master Reset feito: ${p.masterResets} MR, resets zerados, nível 1, ${fmt(p.free)} pontos livres.`;
  },
};

// itens equipados acima do novo nível saem do corpo (continuam na bolsa)
async function unequipAbove(p) {
  const off = p.items.filter((i) => i.equipped && G.ITEM_BASES[i.base] && G.ITEM_BASES[i.base].req > p.level);
  if (!off.length) return [];
  await db.query("UPDATE items SET equipped = FALSE WHERE character_id = $2 AND id = ANY(string_to_array($1, ',')::bigint[]) RETURNING id", [off.map((i) => String(Number(i.id))).join(','), p.charId]);
  for (const i of off) i.equipped = false;
  return off.map((i) => G.ITEM_BASES[i.base].name);
}

function bagFree(p) { return G.INVENTORY_SIZE - p.items.filter((i) => !i.equipped).length; }
function stackRoom(p, base) {
  return p.items.filter((i) => i.base === base && !i.equipped).reduce((a, i) => a + (G.MAX_STACK - (Number(i.qty) || 1)), 0) + bagFree(p) * G.MAX_STACK;
}

async function giveItems(p, base, qty, plus, rarity) {
  const b = G.ITEM_BASES[base];
  if (b.stack) {
    if (qty > stackRoom(p, base)) throw err('Bolsa sem espaço para essa quantidade.');
    const got = await W.giveMaterial(p, base, qty, { silent: true });
    if (got < qty) throw err(`Só couberam ${got}.`);
    return `${fmt(qty)}× ${b.name}`;
  }
  if (qty > bagFree(p)) throw err(`Bolsa sem espaço: ${bagFree(p)} lugar(es) livre(s).`);
  for (let i = 0; i < qty; i++) {
    const row = await W.giveItemRow(p, { base, rarity, plus }, { silent: true });
    if (!row) throw err('Bolsa cheia.');
  }
  return `${qty}× ${b.name}${plus ? ' +' + plus : ''} (${RAR_PT[rarity]})`;
}

// o que /removeitem vai tirar (regra fixa: só da bolsa, menor + e raridade primeiro, depois o mais antigo)
function removalPlan(p, base, qty) {
  const b = G.ITEM_BASES[base];
  const list = p.items.filter((i) => i.base === base && !i.equipped);
  if (b.stack) {
    const have = list.reduce((a, i) => a + (Number(i.qty) || 1), 0);
    if (have < qty) throw err(`Só há ${fmt(have)} na bolsa.`);
    let need = qty; const plan = [];
    for (const it of list.sort((a, c) => Number(a.id) - Number(c.id))) {
      if (need <= 0) break;
      const q = Number(it.qty) || 1, t = Math.min(q, need);
      plan.push({ it, take: t, left: q - t }); need -= t;
    }
    return plan;
  }
  if (list.length < qty) throw err(`Só há ${list.length} na bolsa (itens equipados não são removidos).`);
  return list.sort((a, c) => (a.plus || 0) - (c.plus || 0) || RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(c.rarity) || Number(a.id) - Number(c.id))
    .slice(0, qty).map((it) => ({ it, take: 1, left: 0 }));
}

async function removeItems(p, base, qty) {
  const plan = removalPlan(p, base, qty);
  await db.tx(async (q) => {
    for (const t of plan) {
      const r = t.left > 0
        ? await q('UPDATE items SET qty = qty - $3 WHERE id = $1 AND character_id = $2 AND equipped = FALSE AND qty > $3 RETURNING id', [t.it.id, p.charId, t.take])
        : await q('DELETE FROM items WHERE id = $1 AND character_id = $2 AND equipped = FALSE RETURNING id', [t.it.id, p.charId]);
      if (!r.rows[0]) throw err('A bolsa mudou durante a remoção. Nada foi removido; tente de novo.');
    }
  });
  for (const t of plan) { if (t.left > 0) t.it.qty = t.left; else p.items = p.items.filter((i) => i !== t.it); }
  return `Removido: ${fmt(qty)}× ${G.ITEM_BASES[base].name}.`;
}

function describeRemoval(p, base, qty) {
  const plan = removalPlan(p, base, qty);
  const b = G.ITEM_BASES[base];
  if (b.stack) return `${fmt(qty)}× ${b.name} (das pilhas ${plan.map((t) => '#' + t.it.id).join(', ')})`;
  return plan.map((t) => `${b.name}${t.it.plus ? ' +' + t.it.plus : ''} ${RAR_PT[t.it.rarity]} #${t.it.id}`).join(', ');
}

// ---------- definições dos comandos ----------
// role = papel mínimo; confirm = pede confirmação; preview = texto mostrado antes de confirmar
const CMDS = {
  ajuda: { role: 'moderator', usage: '/ajuda', desc: 'Lista os comandos que você pode usar.' },
  statusplayer: { role: 'moderator', usage: '/statusplayer NOME', desc: 'Nome, classe, nível, EXP, resets, atributos e pontos.', read: true },
  admplayer: { role: 'moderator', usage: '/admplayer NOME', desc: 'Painel completo do personagem (só consulta).', read: true },
  kick: { role: 'moderator', usage: '/kick NOME', desc: 'Tira o jogador do mundo.' },
  mute: { role: 'moderator', usage: '/mute NOME MINUTOS', desc: 'Silencia no chat (1 a 10080 min).' },
  unmute: { role: 'moderator', usage: '/unmute NOME', desc: 'Tira o silêncio.' },
  itens: { role: 'admin', usage: '/itens [busca]', desc: 'IDs do catálogo de itens (para /giveitem).' },
  resetstatus: { role: 'admin', usage: '/resetstatus NOME', desc: 'Devolve os pontos distribuídos (não mexe em nível, EXP, resets, itens nem Zen).', confirm: true, target: true },
  addpontos: { role: 'admin', usage: '/addpontos NOME QUANTIDADE', desc: 'Adiciona pontos livres (permanentes).', target: true },
  giveitem: { role: 'admin', usage: '/giveitem NOME ID_ITEM QUANTIDADE', desc: 'Entrega item do catálogo (raridade padrão, +0).', target: true },
  giveitemop: { role: 'admin', usage: '/giveitemop NOME ID_ITEM QUANTIDADE LEVEL OPCOES', desc: 'LEVEL = +0 a +15; OPCOES = raridade 0-5 (0 Comum, 1 Incomum, 2 Raro, 3 Épico, 4 Lendário, 5 Ancestral).', target: true },
  removeitem: { role: 'admin', usage: '/removeitem NOME ID_ITEM QUANTIDADE', desc: 'Remove da bolsa (menor + e raridade primeiro; equipados nunca).', confirm: true, target: true },
  addgold: { role: 'admin', usage: '/addgold NOME QUANTIDADE', desc: 'Adiciona Zen.', target: true },
  removegold: { role: 'admin', usage: '/removegold NOME QUANTIDADE', desc: 'Remove Zen (precisa ter saldo).', confirm: true, target: true },
  setgold: { role: 'admin', usage: '/setgold NOME QUANTIDADE', desc: 'Define o saldo de Zen.', confirm: true, target: true },
  addxp: { role: 'admin', usage: '/addxp NOME QUANTIDADE', desc: 'Adiciona EXP e sobe os níveis que der (pontos pela regra da classe).', target: true },
  setxp: { role: 'admin', usage: '/setxp NOME QUANTIDADE', desc: 'Define a EXP DENTRO do nível atual (0 até a EXP do próximo nível − 1).', confirm: true, target: true },
  setlevel: { role: 'admin', usage: '/setlevel NOME LEVEL [preservar|recalcular]', desc: 'preservar (padrão): mantém atributos; ao descer tira dos pontos livres. recalcular: atributos da classe e pontos refeitos.', target: true },
  addlevel: { role: 'admin', usage: '/addlevel NOME QUANTIDADE', desc: 'Sobe níveis com os pontos da classe.', target: true },
  removelevel: { role: 'admin', usage: '/removelevel NOME QUANTIDADE', desc: 'Desce níveis (tira os pontos livres correspondentes).', confirm: true, target: true },
  resetplayer: { role: 'admin', usage: '/resetplayer NOME [forcar]', desc: 'Reset normal pela regra do servidor.', confirm: true, target: true },
  masterresetplayer: { role: 'admin', usage: '/masterresetplayer NOME', desc: 'Master Reset (confere os requisitos).', confirm: true, target: true },
  admlog: { role: 'admin', usage: '/admlog [NOME] [QUANTIDADE]', desc: 'Histórico administrativo.' },
  invasao: { role: 'admin', usage: '/invasao iniciar|parar|status|spawn MAPA QTD [SALA]|remover|configurar|teste [bronze|prata|ouro] [N] [NIVEL]|proxima MINUTOS', desc: 'Controla a Invasão Dourada.' },
  setrole: { role: 'superadmin', usage: '/setrole NOME player|moderator|admin', desc: 'Muda o papel da conta do personagem.', confirm: true },
  confirm: { role: 'moderator', usage: '/confirm CODIGO', desc: 'Confirma uma operação pendente.' },
  cancel: { role: 'moderator', usage: '/cancel CODIGO', desc: 'Cancela uma operação pendente.' },
};
const ALIAS = { invasion: 'invasao', 'invasão': 'invasao', help: 'ajuda', confirmar: 'confirm', cancelar: 'cancel', masterreset: 'masterresetplayer', items: 'itens' };

function reply(p, ok, lines, extra = {}) {
  p.send({ type: 'cmdres', ok, lines: Array.isArray(lines) ? lines : [lines], ...extra });
}

// execução numa ficha (online: na fila do jogador; offline: carregada do banco)
async function onChar(target, fn) {
  return W.editChar(target.id, fn);
}

async function statusLines(t, full) {
  const p = W.players.get(t.id) || await W.loadShadow(t.id);
  const online = W.players.has(t.id);
  const cls = G.CLASSES[p.cls].name;
  const L = [
    `${p.name} · ${cls} · Nível ${p.level} · ${online ? 'online' : 'offline'}${full ? ` · conta ${t.username} (${ROLE_PT[t.role] || t.role})` : ''}`,
    `EXP ${fmt(p.exp)} / ${fmt(XP(p.level))} (faltam ${fmt(Math.max(0, XP(p.level) - p.exp))}) · Resets ${p.resets} · Master Reset ${p.masterResets}`,
    `${STATS.filter((k) => k !== 'cmd' || p.cls === 'dark_lord').map((k) => `${STAT_PT[k]} ${fmt(p.stats[k])}`).join(' · ')} · Pontos livres ${fmt(p.free)}`,
  ];
  if (full) {
    const eq = p.items.filter((i) => i.equipped).map((i) => `${G.ITEM_BASES[i.base] ? G.ITEM_BASES[i.base].name : i.base}${i.plus ? ' +' + i.plus : ''}`);
    L.push(`Zen ${fmt(p.zen)} · Bolsa ${G.INVENTORY_SIZE - bagFree(p)}/${G.INVENTORY_SIZE} (${bagFree(p)} livres)${p.mutedUntil > Date.now() ? ' · silenciado' : ''}`);
    L.push(`Equipado: ${eq.length ? eq.join(', ') : 'nada'}`);
  }
  return L;
}

async function run(p, raw, nonce) {
  // fila por administrador e proteção contra repetição do mesmo envio
  if (nonce) {
    p.cmdNonces = p.cmdNonces || [];
    if (p.cmdNonces.includes(String(nonce))) return undefined;
    p.cmdNonces.push(String(nonce)); if (p.cmdNonces.length > 50) p.cmdNonces.shift();
  }
  const job = (p.cmdQueue || Promise.resolve()).then(() => exec(p, raw));
  p.cmdQueue = job.catch(() => {});
  return job.catch((e) => { console.error('[cmd]', e); reply(p, false, 'Erro ao executar o comando.'); });
}

async function exec(p, raw) {
  let text = String(raw || '').trim().slice(0, 300);
  let reason = null;
  const ri = text.indexOf(' -- ');
  if (ri > 0) { reason = text.slice(ri + 4).trim().slice(0, 200) || null; text = text.slice(0, ri).trim(); }
  const parts = text.slice(1).split(/\s+/).filter(Boolean);
  let name = (parts.shift() || '').toLowerCase();
  name = ALIAS[name] || name;
  const def = CMDS[name];
  if (rank(p.role) < 1) {
    if (def) log(p, name, null, { text }, null, null, 'denied', 'Jogador sem permissão tentou um comando.', null);
    return reply(p, false, 'Comando desconhecido.');
  }
  if (!def) return reply(p, false, `Comando desconhecido: /${name}. Use /ajuda.`);
  if (rank(p.role) < rank(def.role)) {
    log(p, name, null, { text }, null, null, 'denied', 'Sem permissão.', reason);
    return reply(p, false, `Sem permissão: /${name} é de ${ROLE_PT[def.role]}.`);
  }
  try {
    return await handlers[name](p, parts, def, name, reason);
  } catch (e) {
    if (!e.user) throw e;
    log(p, name, null, { args: parts }, null, null, 'error', e.message, reason);
    return reply(p, false, e.usage ? [e.message, `Uso: ${def.usage}`] : [e.message]);
  }
}

// cria a confirmação e mostra o resumo (personagem, valor atual, alteração, valor final)
function ask(p, cmd, target, params, summary, doIt, reason) {
  const code = crypto.randomBytes(3).toString('hex').toUpperCase();
  const secs = cfg().confirmSecs;
  pending.set(code, { admin: p, adminChar: p.charId, cmd, target, params, doIt, reason, expires: Date.now() + secs * 1000 });
  log(p, cmd, target, params, null, null, 'pending', summary.join(' | '), reason);
  reply(p, true, [...summary, `Confirme em ${secs}s: /confirm ${code}  (ou /cancel ${code})`], { confirm: { code, secs } });
}

// executa numa ficha, registra antes/depois e responde
async function apply(p, cmd, target, params, fn, reason) {
  let before = null, after = null, msg = '';
  await onChar(target, async (c, online) => {
    before = snap(c);
    msg = await fn(c, online);
    after = snap(c);
  });
  log(p, cmd, target, params, before, after, 'ok', msg, reason);
  reply(p, true, `${target.name}: ${msg}`);
}

const need = (parts, n) => { if (parts.length < n) throw err('Faltam parâmetros.', true); };

const handlers = {
  async ajuda(p) {
    const lines = [`Seu papel: ${ROLE_PT[p.role]}. Comandos:`];
    for (const [k, d] of Object.entries(CMDS)) if (rank(p.role) >= rank(d.role) && !['confirm', 'cancel'].includes(k)) lines.push(`${d.usage} — ${d.desc}`);
    lines.push('Motivo opcional no fim: "/removegold Nome 100 -- motivo". Operações que removem ou reduzem pedem /confirm.');
    reply(p, true, lines);
  },
  async statusplayer(p, parts, def) { need(parts, 1, def); const t = await findChar(parts[0]); reply(p, true, await statusLines(t, false)); log(p, 'statusplayer', t, {}, null, null, 'ok', 'consulta', null); },
  async admplayer(p, parts, def) { need(parts, 1, def); const t = await findChar(parts[0]); reply(p, true, await statusLines(t, true)); log(p, 'admplayer', t, {}, null, null, 'ok', 'consulta', null); },
  async kick(p, parts, def, cmd, reason) {
    need(parts, 1, def);
    const t = await findChar(parts[0]);
    if (rank(t.role) >= rank(p.role) && p.role !== 'superadmin') throw err('Você não pode expulsar alguém com papel igual ou maior.');
    const live = W.players.get(t.id);
    if (!live) throw err(`${t.name} não está online.`);
    live.send({ type: 'kicked', reason: `Você foi retirado do mundo pela administração${reason ? ': ' + reason : '.'}` });
    await W.leave(live);
    log(p, cmd, t, {}, null, null, 'ok', 'expulso', reason);
    reply(p, true, `${t.name} foi retirado do mundo.`);
  },
  async mute(p, parts, def, cmd, reason) {
    need(parts, 2, def);
    const t = await findChar(parts[0]);
    const min = int(parts[1], 1, 10080, 'Minutos');
    if (rank(t.role) >= rank(p.role) && p.role !== 'superadmin') throw err('Você não pode silenciar alguém com papel igual ou maior.');
    const { rows } = await db.query("UPDATE accounts SET muted_until = now() + ($2 || ' minutes')::interval WHERE id = $1 RETURNING muted_until", [t.accountId, String(min)]);
    const until = new Date(rows[0].muted_until).getTime();
    for (const o of W.players.values()) if (o.accountId === t.accountId) { o.mutedUntil = until; o.send({ type: 'log', kind: 'warn', text: `Você foi silenciado no chat por ${min} min.` }); }
    log(p, cmd, t, { min }, null, { mutedUntil: rows[0].muted_until }, 'ok', `silenciado ${min} min`, reason);
    reply(p, true, `${t.name} silenciado por ${min} min.`);
  },
  async unmute(p, parts, def, cmd, reason) {
    need(parts, 1, def);
    const t = await findChar(parts[0]);
    await db.query('UPDATE accounts SET muted_until = NULL WHERE id = $1 RETURNING id', [t.accountId]);
    for (const o of W.players.values()) if (o.accountId === t.accountId) o.mutedUntil = 0;
    log(p, cmd, t, {}, null, null, 'ok', 'silêncio removido', reason);
    reply(p, true, `${t.name} pode falar no chat de novo.`);
  },
  async itens(p, parts) {
    const q = (parts.join(' ') || '').toLowerCase();
    const list = Object.entries(G.ITEM_BASES).filter(([k, b]) => !q || k.includes(q) || b.name.toLowerCase().includes(q));
    const lines = list.slice(0, 40).map(([k, b]) => `${k} — ${b.name} (${b.slot}${b.stack ? ', empilha' : ''}, nv. ${b.req})`);
    if (list.length > 40) lines.push(`… e mais ${list.length - 40}. Refine: /itens asa`);
    reply(p, true, lines.length ? lines : 'Nenhum item encontrado.');
  },
  async resetstatus(p, parts, def, cmd, reason) {
    need(parts, 1, def);
    const t = await findChar(parts[0]);
    const c = W.players.get(t.id) || await W.loadShadow(t.id);
    const base = baseStats(c.cls);
    const back = STATS.filter((k) => k !== 'cmd' || c.cls === 'dark_lord').reduce((a, k) => a + Math.max(0, c.stats[k] - (base[k] || 0)), 0);
    ask(p, cmd, t, {}, [`Personagem: ${t.name}`, `Atual: ${STATS.filter((k) => k !== 'cmd' || c.cls === 'dark_lord').map((k) => `${STAT_PT[k]} ${fmt(c.stats[k])}`).join(', ')} · livres ${fmt(c.free)}`,
      `Alteração: devolver ${fmt(back)} pontos distribuídos`, `Final previsto: atributos da classe, ${fmt(c.free + back)} pontos livres`],
    () => apply(p, cmd, t, {}, (x) => OPS.resetstatus(x), reason), reason);
  },
  async addpontos(p, parts, def, cmd, reason) {
    need(parts, 2, def);
    const t = await findChar(parts[0]);
    const n = int(parts[1], 1, cfg().maxAddPoints, 'Quantidade');
    await apply(p, cmd, t, { n }, (x) => OPS.addpontos(x, n), reason);
  },
  async giveitem(p, parts, def, cmd, reason) {
    need(parts, 3, def);
    const t = await findChar(parts[0]);
    const base = parts[1].toLowerCase();
    const b = itemCatalog(base);
    const qty = int(parts[2], 1, b.stack ? 9999 : G.INVENTORY_SIZE, 'Quantidade');
    await apply(p, cmd, t, { item: base, qty }, async (x) => `entregue ${await giveItems(x, base, qty, 0, b.rarity || 'common')}.`, reason);
  },
  async giveitemop(p, parts, def, cmd, reason) {
    need(parts, 5, def);
    const t = await findChar(parts[0]);
    const base = parts[1].toLowerCase();
    const b = itemCatalog(base);
    const qty = int(parts[2], 1, b.stack ? 9999 : G.INVENTORY_SIZE, 'Quantidade');
    const plus = int(parts[3], 0, 15, 'LEVEL');
    const opt = int(parts[4], 0, 5, 'OPCOES');
    if (b.stack && (plus || opt)) throw err('Materiais não têm level nem opções: use 0 0 ou /giveitem.');
    if (b.slot === 'wings' && opt) throw err('Asas e capas têm raridade fixa: use OPCOES 0 (o LEVEL +0 a +15 é permitido).');
    const rarity = b.stack || b.slot === 'wings' ? (b.rarity || 'common') : RARITY_ORDER[opt];
    await apply(p, cmd, t, { item: base, qty, plus, opt }, async (x) => `entregue ${await giveItems(x, base, qty, plus, rarity)}.`, reason);
  },
  async removeitem(p, parts, def, cmd, reason) {
    need(parts, 3, def);
    const t = await findChar(parts[0]);
    const base = parts[1].toLowerCase();
    const b = itemCatalog(base);
    const qty = int(parts[2], 1, 99999, 'Quantidade');
    const c = W.players.get(t.id) || await W.loadShadow(t.id);
    const have = c.items.filter((i) => i.base === base && !i.equipped).reduce((a, i) => a + (b.stack ? (Number(i.qty) || 1) : 1), 0);
    const what = describeRemoval(c, base, qty);
    ask(p, cmd, t, { item: base, qty }, [`Personagem: ${t.name}`, `Atual: ${fmt(have)}× ${b.name} na bolsa`, `Alteração: remover ${what}`, `Final previsto: ${fmt(have - qty)}× ${b.name}`],
      () => apply(p, cmd, t, { item: base, qty }, (x) => removeItems(x, base, qty), reason), reason);
  },
  async addgold(p, parts, def, cmd, reason) {
    need(parts, 2, def);
    const t = await findChar(parts[0]);
    const n = int(parts[1], 1, cfg().maxZen, 'Quantidade');
    await apply(p, cmd, t, { n }, (x) => OPS.addgold(x, n), reason);
  },
  async removegold(p, parts, def, cmd, reason) {
    need(parts, 2, def);
    const t = await findChar(parts[0]);
    const n = int(parts[1], 1, cfg().maxZen, 'Quantidade');
    const c = W.players.get(t.id) || await W.loadShadow(t.id);
    if (c.zen < n) throw err(`Saldo insuficiente: ${fmt(c.zen)} Zen.`);
    ask(p, cmd, t, { n }, [`Personagem: ${t.name}`, `Atual: ${fmt(c.zen)} Zen`, `Alteração: −${fmt(n)} Zen`, `Final previsto: ${fmt(c.zen - n)} Zen`],
      () => apply(p, cmd, t, { n }, (x) => OPS.removegold(x, n), reason), reason);
  },
  async setgold(p, parts, def, cmd, reason) {
    need(parts, 2, def);
    const t = await findChar(parts[0]);
    const n = int(parts[1], 0, cfg().maxZen, 'Quantidade');
    const c = W.players.get(t.id) || await W.loadShadow(t.id);
    ask(p, cmd, t, { n }, [`Personagem: ${t.name}`, `Atual: ${fmt(c.zen)} Zen`, `Alteração: definir saldo`, `Final previsto: ${fmt(n)} Zen`],
      () => apply(p, cmd, t, { n }, (x) => OPS.setgold(x, n), reason), reason);
  },
  async addxp(p, parts, def, cmd, reason) {
    need(parts, 2, def);
    const t = await findChar(parts[0]);
    const n = int(parts[1], 1, 1e15, 'Quantidade');
    await apply(p, cmd, t, { n }, (x) => OPS.addxp(x, n), reason);
  },
  async setxp(p, parts, def, cmd, reason) {
    need(parts, 2, def);
    const t = await findChar(parts[0]);
    const n = int(parts[1], 0, 1e15, 'Quantidade');
    const c = W.players.get(t.id) || await W.loadShadow(t.id);
    if (n >= XP(c.level)) throw err(`No nível ${c.level} a EXP vai de 0 a ${fmt(XP(c.level) - 1)} (EXP dentro do nível atual).`);
    ask(p, cmd, t, { n }, [`Personagem: ${t.name}`, `Atual: ${fmt(c.exp)} EXP no nível ${c.level}`, `Alteração: definir a EXP do nível atual`, `Final previsto: ${fmt(n)} / ${fmt(XP(c.level))}`],
      () => apply(p, cmd, t, { n }, (x) => OPS.setxp(x, n), reason), reason);
  },
  async setlevel(p, parts, def, cmd, reason) {
    need(parts, 2, def);
    const t = await findChar(parts[0]);
    const L = int(parts[1], 1, G.LIMITS.maxLevel, 'Level');
    const mode = (parts[2] || 'preservar').toLowerCase();
    if (!['preservar', 'recalcular'].includes(mode)) throw err('Política: preservar ou recalcular.');
    const policy = mode === 'recalcular' ? 'recalc' : 'preserve';
    return levelChange(p, cmd, t, L, policy, reason);
  },
  async addlevel(p, parts, def, cmd, reason) {
    need(parts, 2, def);
    const t = await findChar(parts[0]);
    const n = int(parts[1], 1, G.LIMITS.maxLevel, 'Quantidade');
    const c = W.players.get(t.id) || await W.loadShadow(t.id);
    if (c.level >= G.LIMITS.maxLevel) throw err(`Já está no nível máximo (${G.LIMITS.maxLevel}).`);
    return levelChange(p, cmd, t, Math.min(G.LIMITS.maxLevel, c.level + n), 'preserve', reason);
  },
  async removelevel(p, parts, def, cmd, reason) {
    need(parts, 2, def);
    const t = await findChar(parts[0]);
    const n = int(parts[1], 1, G.LIMITS.maxLevel, 'Quantidade');
    const c = W.players.get(t.id) || await W.loadShadow(t.id);
    if (c.level - n < 1) throw err(`O nível mínimo é 1 (está no ${c.level}).`);
    return levelChange(p, cmd, t, c.level - n, 'preserve', reason, true);
  },
  async resetplayer(p, parts, def, cmd, reason) {
    need(parts, 1, def);
    const t = await findChar(parts[0]);
    const force = (parts[1] || '').toLowerCase() === 'forcar';
    const c = W.players.get(t.id) || await W.loadShadow(t.id);
    const r = cfg().reset;
    if (!force && c.level < r.minLevel) throw err(`O reset exige nível ${r.minLevel} (está no ${c.level}). Para forçar: /resetplayer ${t.name} forcar`);
    ask(p, cmd, t, { force }, [`Personagem: ${t.name}`, `Atual: nível ${c.level}, ${c.resets} resets, ${fmt(c.free)} pontos livres`,
      `Alteração: reset normal${force ? ' (forçado)' : ''} (+${r.pointsPerReset} pontos${r.keepStats ? ', atributos mantidos' : ', atributos voltam aos da classe'})`,
      `Final previsto: nível 1, ${c.resets + 1} resets`], () => apply(p, cmd, t, { force }, async (x, online) => { const m = await OPS.resetplayer(x, force); if (online) W.adminMoved(x); return m; }, reason), reason);
  },
  async masterresetplayer(p, parts, def, cmd, reason) {
    need(parts, 1, def);
    const t = await findChar(parts[0]);
    const c = W.players.get(t.id) || await W.loadShadow(t.id);
    const m = cfg().master;
    if (c.resets < m.minResets) throw err(`O Master Reset exige ${m.minResets} resets (tem ${c.resets}).`);
    if (c.level < m.minLevel) throw err(`O Master Reset exige nível ${m.minLevel} (está no ${c.level}).`);
    ask(p, cmd, t, {}, [`Personagem: ${t.name}`, `Atual: nível ${c.level}, ${c.resets} resets, ${c.masterResets} MR`,
      `Alteração: Master Reset (resets zerados, atributos da classe, +${m.pointsPerMaster} pontos permanentes)`, `Final previsto: nível 1, 0 resets, ${c.masterResets + 1} MR`],
    () => apply(p, cmd, t, {}, async (x, online) => { const msg = await OPS.masterreset(x); if (online) W.adminMoved(x); return msg; }, reason), reason);
  },
  async admlog(p, parts) {
    let who = '', n = 15;
    for (const a of parts) { if (/^\d+$/.test(a)) n = Math.min(30, Math.max(1, Number(a))); else who = a; }
    const { rows } = await db.query(`SELECT created_at, admin_name, command, target_name, result, message FROM admin_log
      WHERE ($1 = '' OR lower(target_name) = lower($1) OR lower(admin_name) = lower($1)) ORDER BY id DESC LIMIT $2`, [who, n]);
    reply(p, true, rows.length ? rows.map((r) => `${new Date(r.created_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} · ${r.admin_name || '?'} · /${r.command}${r.target_name ? ' ' + r.target_name : ''} · ${r.result}${r.message ? ' · ' + r.message : ''}`) : 'Nenhum registro.');
  },
  async invasao(p, parts, def, cmd, reason) {
    const INV = W.invasion;
    const sub = (parts[0] || 'status').toLowerCase();
    const done = (lines, params) => { log(p, cmd, null, { sub, ...params }, null, null, 'ok', [].concat(lines).join(' | '), reason); reply(p, true, lines); };
    switch (sub) {
      case 'status': return reply(p, true, INV.statusText());
      case 'iniciar': case 'start':
        if (INV.isActive()) throw err('Já existe uma invasão em andamento.');
        await INV.start('admin');
        return done(['Invasão Dourada iniciada.', ...INV.statusText()], {});
      case 'parar': case 'stop':
        if (!INV.isActive()) throw err('Não há invasão em andamento.');
        await INV.end('admin');
        return done(['Invasão encerrada; os monstros dourados restantes sumiram.', ...INV.statusText()], {});
      case 'remover': {
        const n = INV.removeAll();
        return done(`${n} monstro(s) dourado(s) removido(s).`, { n });
      }
      case 'spawn': {
        need(parts, 3);
        const map = parts[1].toLowerCase();
        const n = int(parts[2], 1, 30, 'Quantidade');
        const room = parts[3] ? int(parts[3], 1, 4, 'Sala') : 0;
        let made;
        try { made = INV.spawnManual(map, n, room); } catch (e) { throw err(e.message); }
        return done(`${made} monstro(s) dourado(s) criado(s) em ${G.WORLD[map].name}${room ? ' (sala ' + room + ')' : ' (todas as salas)'}.`, { map, n, room });
      }
      case 'proxima': {
        need(parts, 2);
        const m = int(parts[1], 1, 1440, 'Minutos');
        try { await INV.setNext(m); } catch (e) { throw err(e.message); }
        return done(`Próxima invasão em ${m} min.`, { m });
      }
      case 'configurar': case 'config': {
        const c = INV.cfg();
        const T = c.tiers;
        return reply(p, true, [
          `Temporizador ${c.enabled ? 'LIGADO' : 'DESLIGADO'} · a cada ${c.intervalMin} min · dura ${c.durationMin} min · recompensa: ${{ contribution: 'compartilhada por contribuição', individual: 'individual', lasthit: 'último golpe' }[c.rewardMode]} (mín. ${c.minShare}% do dano)`,
          `Categorias pelo nível do monstro: Bronze < ${c.thresholds.prata} ≤ Prata < ${c.thresholds.ouro} ≤ Ouro (elites sobem uma)`,
          ...['bronze', 'prata', 'ouro'].map((k) => `${k}: vida ×${T[k].hp}, dano ×${T[k].dmg}, defesa ×${T[k].def}, EXP ×${T[k].exp} → ${G.ITEM_BASES[T[k].box].name}`),
          'Para mudar: Painel do administrador → Invasão Dourada.',
        ]);
      }
      case 'teste': {
        const tier = ['bronze', 'prata', 'ouro'].includes((parts[1] || '').toLowerCase()) ? parts[1].toLowerCase() : 'ouro';
        const n = parts[2] ? int(parts[2], 1, 100000, 'N') : 1000;
        const lv = parts[3] ? int(parts[3], 1, G.LIMITS.maxLevel, 'Nível') : p.level;
        const sim = require('./kundun').simulate(INV.cfg().tiers[tier].box, n, lv, p.cls);
        return done([`${sim.box}: ${fmt(sim.opens)} aberturas simuladas (nível ${sim.level}, nada foi entregue) · Zen médio ${fmt(sim.zenAvg)}`, ...sim.results.map((r) => `${r.name}: ${r.pct}%`)], { tier, n, lv });
      }
      default: throw err('Use: iniciar, parar, status, spawn, remover, configurar, teste ou proxima.', true);
    }
  },
  async setrole(p, parts, def, cmd, reason) {
    need(parts, 2, def);
    const t = await findChar(parts[0]);
    const role = parts[1].toLowerCase();
    if (!['player', 'moderator', 'admin'].includes(role)) throw err('Papel: player, moderator ou admin.');
    if (t.accountId === p.accountId) throw err('Você não pode mudar o próprio papel.');
    const ADMIN = require('./admin');
    if (ADMIN.isAdmin({ username: t.username, email: t.email })) throw err('A conta dona do jogo é sempre Super ADM.');
    ask(p, cmd, t, { role }, [`Conta: ${t.username} (personagem ${t.name})`, `Atual: ${ROLE_PT[t.role] || t.role}`, `Alteração: papel → ${ROLE_PT[role]}`, `Final previsto: ${ROLE_PT[role]}`],
      async () => {
        await db.query('UPDATE accounts SET role = $2 WHERE id = $1 RETURNING id', [t.accountId, role]);
        for (const o of W.players.values()) if (o.accountId === t.accountId) { o.role = role; o.send(o.charState()); o.send({ type: 'log', kind: 'info', text: `Seu papel agora é ${ROLE_PT[role]}.` }); }
        log(p, cmd, t, { role }, { role: t.role }, { role }, 'ok', `papel ${role}`, reason);
        reply(p, true, `${t.username} agora é ${ROLE_PT[role]}.`);
      }, reason);
  },
  async confirm(p, parts, def) {
    need(parts, 1, def);
    const code = parts[0].toUpperCase();
    const c = pending.get(code);
    if (!c || c.adminChar !== p.charId) throw err('Código inválido ou já usado.');
    pending.delete(code); // uso único
    if (Date.now() > c.expires) { log(p, c.cmd, c.target, c.params, null, null, 'expired', 'Confirmação expirou.', c.reason); throw err('A confirmação expirou. Envie o comando de novo.'); }
    if (rank(p.role) < rank(CMDS[c.cmd].role)) throw err('Sem permissão.');
    try { await c.doIt(); } catch (e) {
      if (!e.user) throw e;
      log(p, c.cmd, c.target, c.params, null, null, 'error', e.message, c.reason);
      reply(p, false, e.message);
    }
  },
  async cancel(p, parts, def) {
    need(parts, 1, def);
    const code = parts[0].toUpperCase();
    const c = pending.get(code);
    if (!c || c.adminChar !== p.charId) throw err('Código inválido ou já usado.');
    pending.delete(code);
    log(p, c.cmd, c.target, c.params, null, null, 'cancelled', 'Cancelado.', c.reason);
    reply(p, true, 'Operação cancelada.');
  },
};

async function levelChange(p, cmd, t, L, policy, reason, forceAsk) {
  const c = W.players.get(t.id) || await W.loadShadow(t.id);
  const params = { level: L, policy };
  const doIt = () => apply(p, cmd, t, params, async (x, online) => { const m = await OPS.setlevel(x, L, policy); if (online) W.adminMoved(x); return m; }, reason);
  if (L === c.level && policy === 'preserve') throw err(`${t.name} já está no nível ${L}.`);
  if (L < c.level || policy === 'recalc' || forceAsk) {
    const lose = (c.level - L) * ppl(c.cls);
    if (policy === 'preserve' && L < c.level && c.free < lose) throw err(`Para descer mantendo os atributos é preciso tirar ${fmt(lose)} pontos livres, mas só há ${fmt(c.free)}. Use: /setlevel ${t.name} ${L} recalcular`);
    const off = c.items.filter((i) => i.equipped && G.ITEM_BASES[i.base] && G.ITEM_BASES[i.base].req > L).map((i) => G.ITEM_BASES[i.base].name);
    return ask(p, cmd, t, params, [`Personagem: ${t.name}`, `Atual: nível ${c.level}, ${fmt(c.free)} pontos livres`,
      `Alteração: nível → ${L} (${policy === 'recalc' ? 'atributos voltam aos da classe e os pontos são refeitos' : L < c.level ? `−${fmt(lose)} pontos livres` : 'mantém atributos'})${off.length ? `; desequipa ${off.join(', ')}` : ''}`,
      `Final previsto: nível ${L}, ${fmt(policy === 'recalc' ? (L - 1) * ppl(c.cls) + c.bonusPoints : c.free - Math.max(0, lose))} pontos livres${policy === 'recalc' ? ' para distribuir' : ''}`], doIt, reason);
  }
  return doIt();
}

// regras de reset e limites (painel)
async function saveConfig(i) {
  const n = (v, a, b, label) => { const x = Math.round(Number(v)); if (!Number.isFinite(x) || x < a || x > b) throw err(`${label}: de ${a} a ${b}.`); return x; };
  const c = {
    confirmSecs: n(i.confirmSecs, 15, 600, 'Tempo de confirmação'),
    maxZen: n(i.maxZen, 1000, 9e15, 'Zen máximo'),
    maxFreePoints: n(i.maxFreePoints, 1000, 2e9, 'Pontos livres máximos'),
    maxAddPoints: n(i.maxAddPoints, 1, 2e9, 'Pontos por comando'),
    reset: { minLevel: n(i.reset.minLevel, 1, G.LIMITS.maxLevel, 'Reset: nível'), keepStats: !!i.reset.keepStats,
      pointsPerReset: n(i.reset.pointsPerReset, 0, 1e6, 'Reset: pontos'), maxResets: n(i.reset.maxResets, 1, 100000, 'Reset: máximo') },
    master: { minResets: n(i.master.minResets, 1, 100000, 'Master Reset: resets'), minLevel: n(i.master.minLevel, 1, G.LIMITS.maxLevel, 'Master Reset: nível'),
      pointsPerMaster: n(i.master.pointsPerMaster, 0, 1e7, 'Master Reset: pontos') },
  };
  await SET.save('admin_rules', c);
  return c;
}

async function history(limit = 100, name = '') {
  const { rows } = await db.query(`SELECT id, created_at, admin_name, role, command, target_name, params, before, after, result, message, reason FROM admin_log
    WHERE ($1 = '' OR lower(target_name) = lower($1) OR lower(admin_name) = lower($1)) ORDER BY id DESC LIMIT $2`, [String(name || ''), Math.min(300, Math.max(1, limit))]);
  return rows;
}

function help() { return Object.entries(CMDS).map(([k, d]) => ({ cmd: k, role: d.role, usage: d.usage, desc: d.desc })); }

module.exports = { init, run, cfg, saveConfig, history, help, log, ROLES, ROLE_PT, DEFAULTS, rank };
