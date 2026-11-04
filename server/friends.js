'use strict';
// Amizades: solicitação → aceitar/recusar → os dois ficam na lista um do outro (salvo no banco).
// Tudo validado no servidor; status online é atualizado para os amigos quando alguém entra ou sai.
const db = require('./db');
const G = require('./gamedata');

const MAX_FRIENDS = 100;
let W = null;
const send = (p, type, data) => { if (p) p.send({ type, ...data }); };
const online = (id) => W && W.players.get(String(id));
const evoName = (cls, evo) => (G.EVOLUTIONS[cls] || [])[evo || 0] || (G.CLASSES[cls] || {}).name || cls;

async function list(charId) {
  const { rows } = await db.query(`SELECT c.id, c.name, c.class, c.level, c.evo, c.last_seen_at FROM friends f JOIN characters c ON c.id = f.friend_id
    WHERE f.character_id = $1 ORDER BY lower(c.name)`, [charId]);
  const reqs = (await db.query(`SELECT c.id, c.name, c.class, c.level FROM friend_requests r JOIN characters c ON c.id = r.from_id WHERE r.to_id = $1 ORDER BY r.created_at`, [charId])).rows;
  const sent = (await db.query(`SELECT c.id, c.name FROM friend_requests r JOIN characters c ON c.id = r.to_id WHERE r.from_id = $1 ORDER BY r.created_at`, [charId])).rows;
  return {
    friends: rows.map((r) => {
      const o = online(r.id);
      return { id: String(r.id), name: r.name, cls: r.class, className: evoName(r.class, o ? o.evo : r.evo), level: o ? o.level : r.level, online: !!o,
        map: o && o.map ? o.map.def.name : null, lastSeen: r.last_seen_at };
    }),
    requests: reqs.map((r) => ({ id: String(r.id), name: r.name, cls: r.class, className: evoName(r.class, 0), level: r.level })),
    sent: sent.map((r) => ({ id: String(r.id), name: r.name })),
  };
}
async function push(charId) { const p = online(charId); if (p) send(p, 'friends', { action: 'list', ...(await list(charId)) }); }

function targetOf(msg) {
  const id = String(msg.id || '').replace(/^p/, '');
  if (id) return online(id) || null;
  const name = String(msg.name || '').trim().toLowerCase();
  if (!name) return null;
  for (const o of W.players.values()) if (o.name.toLowerCase() === name) return o;
  return null;
}

async function act(world, p, msg) {
  W = world;
  const say = (ok, text) => send(p, 'friends', { action: 'result', ok, text });
  const a = String(msg.action || 'list');
  try {
    if (a === 'list') return push(p.charId);
    if (a === 'request') {
      const t = targetOf(msg);
      if (!t) return say(false, 'Jogador não encontrado ou desconectado.');
      if (t.charId === p.charId) return say(false, 'Você não pode adicionar você mesmo.');
      if ((await db.query('SELECT 1 FROM friends WHERE character_id = $1 AND friend_id = $2', [p.charId, t.charId])).rows[0]) return say(false, `${t.name} já é seu amigo.`);
      // ele já tinha pedido para você? então vira amizade na hora
      if ((await db.query('SELECT 1 FROM friend_requests WHERE from_id = $1 AND to_id = $2', [t.charId, p.charId])).rows[0]) return accept(p, t.charId, say);
      const n = (await db.query('SELECT count(*)::int AS n FROM friends WHERE character_id = $1', [p.charId])).rows[0].n;
      if (n >= MAX_FRIENDS) return say(false, `Sua lista de amigos está cheia (${MAX_FRIENDS}).`);
      const ins = await db.query('INSERT INTO friend_requests (from_id, to_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING from_id', [p.charId, t.charId]);
      if (!ins.rows[0]) return say(false, `Você já enviou uma solicitação para ${t.name}. Aguarde a resposta.`);
      send(t, 'friends', { action: 'request', from: { id: String(p.charId), name: p.name, cls: p.cls, className: evoName(p.cls, p.evo), level: p.level } });
      say(true, `Solicitação de amizade enviada para ${t.name}.`);
      push(p.charId); push(t.charId);
      return undefined;
    }
    if (a === 'answer') {
      const fromId = String(msg.from || '').replace(/^p/, '');
      if (msg.accept) return accept(p, fromId, say);
      const d = await db.query('DELETE FROM friend_requests WHERE from_id = $1 AND to_id = $2 RETURNING from_id', [fromId, p.charId]);
      if (d.rows[0]) { const o = online(fromId); if (o) send(o, 'friends', { action: 'result', ok: false, text: `${p.name} recusou sua solicitação de amizade.` }); push(fromId); }
      say(true, 'Solicitação recusada.');
      return push(p.charId);
    }
    if (a === 'cancel') {
      const toId = String(msg.id || '').replace(/^p/, '');
      await db.query('DELETE FROM friend_requests WHERE from_id = $1 AND to_id = $2', [p.charId, toId]);
      push(toId);
      return push(p.charId);
    }
    if (a === 'remove') {
      const fid = String(msg.id || '').replace(/^p/, '');
      const d = await db.query('DELETE FROM friends WHERE (character_id = $1 AND friend_id = $2) OR (character_id = $2 AND friend_id = $1) RETURNING friend_id', [p.charId, fid]);
      if (!d.rows.length) return say(false, 'Esse jogador não está na sua lista.');
      say(true, 'Amigo removido.');
      push(fid);
      return push(p.charId);
    }
    return say(false, 'Ação inválida.');
  } catch (e) {
    console.error('[friends]', e.message);
    return say(false, 'Não foi possível concluir agora. Tente de novo.');
  }
}

async function accept(p, fromId, say) {
  const ok = await db.tx(async (q) => {
    const d = await q('DELETE FROM friend_requests WHERE from_id = $1 AND to_id = $2 RETURNING from_id', [fromId, p.charId]);
    if (!d.rows[0]) return false;
    await q('DELETE FROM friend_requests WHERE from_id = $1 AND to_id = $2', [p.charId, fromId]);
    await q('INSERT INTO friends (character_id, friend_id) VALUES ($1, $2), ($2, $1) ON CONFLICT DO NOTHING', [p.charId, fromId]);
    return true;
  });
  if (!ok) { say(false, 'Essa solicitação não existe mais.'); return push(p.charId); }
  const o = online(fromId);
  const name = o ? o.name : ((await db.query('SELECT name FROM characters WHERE id = $1', [fromId])).rows[0] || {}).name || '';
  say(true, `Agora você e ${name} são amigos.`);
  if (o) send(o, 'friends', { action: 'result', ok: true, text: `${p.name} aceitou sua solicitação. Agora vocês são amigos.` });
  await push(p.charId);
  return push(fromId);
}

// entrou/saiu: avisa os amigos online (status automático) e entrega solicitações pendentes
async function notifyFriends(p, on) {
  try {
    const { rows } = await db.query('SELECT friend_id FROM friends WHERE character_id = $1', [p.charId]);
    for (const r of rows) {
      const o = online(r.friend_id);
      if (!o) continue;
      send(o, 'friends', { action: 'status', id: String(p.charId), name: p.name, online: on, level: p.level });
    }
  } catch (e) { console.error('[friends] status', e.message); }
}
function onJoin(world, p) {
  W = world;
  notifyFriends(p, true);
  push(p.charId).catch(() => {});
}
function onLeave(world, p) { W = world; notifyFriends(p, false); }

module.exports = { act, onJoin, onLeave, list };
