'use strict';
// Guildas: criação no Mestre de Guildas (Devias), patentes, recrutamento, doações de Zen, missões de contribuição,
// guerras entre guildas, ranking e o nome da guilda acima da cabeça dos membros. Tudo validado e salvo no servidor.
const db = require('./db');
const G = require('./gamedata');

const ROLES = ['leader', 'submaster', 'captain', 'subcaptain', 'member'];
const ROLE_NAME = { leader: 'Mestre', submaster: 'Submestre', captain: 'Capitão', subcaptain: 'Subcapitão', member: 'Membro' };
const RANK = { leader: 5, submaster: 4, captain: 3, subcaptain: 2, member: 1 };
const MAX_MEMBERS = 40;
const CREATE_COST = 100000;             // Zen para fundar a guilda
const CREATE_LEVEL = 20;                // nível mínimo do fundador
const WAR_MINUTES = 30, WAR_GOAL = Number(process.env.GUILD_WAR_GOAL) || 30; // guerra termina com 30 eliminações ou em 30 minutos
const ZEN_PER_POINT = 10000;            // cada 10.000 Zen doados = 1 ponto de contribuição
// missões diárias de contribuição (zeram todo dia)
const MISSIONS = [
  { id: 'mobs', name: 'Caçada da guilda', desc: 'Derrote 300 monstros', need: 300, pts: 30 },
  { id: 'elite', name: 'Elites em queda', desc: 'Derrote 15 monstros elite ou raros', need: 15, pts: 40 },
  { id: 'boss', name: 'Caçador de chefes', desc: 'Ajude a derrotar 1 chefe', need: 1, pts: 60 },
  { id: 'war', name: 'Honra na guerra', desc: 'Elimine 5 inimigos em guerra de guildas', need: 5, pts: 50 },
];

let W = null;
const memberOf = new Map();   // charId -> { gid, name, role }
const wars = new Map();       // war id -> guerra ativa
const send = (p, type, data) => { if (p && p.send) p.send({ type, ...data }); };
const online = (id) => W && W.players.get(String(id));
const today = () => new Date().toISOString().slice(0, 10);
const evoName = (cls, evo) => (G.EVOLUTIONS[cls] || [])[evo || 0] || (G.CLASSES[cls] || {}).name || cls;
const clean = (s, n) => String(s || '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().replace(/\s+/g, ' ').slice(0, n);
const fail = (m) => { const e = new Error(m); e.user = true; throw e; };
const score = (g) => Number(g.points) + Number(g.wins) * 200 + Number(g.members || 0) * 10 + Math.floor(Number(g.zen_fund) / 100000);

// ---------- quem é de qual guilda (em memória para o nome acima da cabeça) ----------
async function loadMember(charId) {
  const { rows } = await db.query(`SELECT gm.guild_id, gm.role, g.name FROM guild_members gm JOIN guilds g ON g.id = gm.guild_id WHERE gm.character_id = $1`, [charId]);
  const r = rows[0];
  if (r) memberOf.set(String(charId), { gid: String(r.guild_id), name: r.name, role: r.role });
  else memberOf.delete(String(charId));
  const p = online(charId);
  if (p) { p.guild = memberOf.get(String(charId)) || null; refreshLook(p); }
  return memberOf.get(String(charId)) || null;
}
function refreshLook(p) {
  if (!p.map || !W) return;
  const info = W.pinfo(p);
  for (const o of p.map.players.values()) send(o, 'pj', info);
}
const tagOf = (p) => (p && p.guild ? { guild: p.guild.name, gid: p.guild.gid } : {});

// ---------- dados da guilda ----------
async function guildRow(gid) {
  const { rows } = await db.query(`SELECT g.*, c.name AS leader_name, (SELECT count(*)::int FROM guild_members m WHERE m.guild_id = g.id) AS members
    FROM guilds g JOIN characters c ON c.id = g.leader_character_id WHERE g.id = $1`, [gid]);
  return rows[0] || null;
}
async function rankingRows() {
  const { rows } = await db.query(`SELECT g.id, g.name, g.points, g.wins, g.losses, g.draws, g.zen_fund, c.name AS leader_name,
      (SELECT count(*)::int FROM guild_members m WHERE m.guild_id = g.id) AS members,
      (SELECT coalesce(sum(contribution),0) FROM guild_members m WHERE m.guild_id = g.id) AS contrib
    FROM guilds g JOIN characters c ON c.id = g.leader_character_id`);
  return rows.map((g) => ({ id: String(g.id), name: g.name, leader: g.leader_name, members: g.members, score: score(g), wins: g.wins, losses: g.losses, draws: g.draws,
    contrib: Number(g.contrib), zen: Number(g.zen_fund) }))
    .sort((a, b) => b.score - a.score || b.wins - a.wins || a.name.localeCompare(b.name))
    .map((g, i) => ({ ...g, pos: i + 1 }));
}
async function membersOf(gid) {
  const { rows } = await db.query(`SELECT c.id, c.name, c.class, c.level, c.evo, gm.role, gm.contribution, gm.zen_donated, gm.joined_at
    FROM guild_members gm JOIN characters c ON c.id = gm.character_id WHERE gm.guild_id = $1`, [gid]);
  return rows.map((r) => {
    const o = online(r.id);
    return { id: String(r.id), name: r.name, cls: r.class, className: evoName(r.class, o ? o.evo : r.evo), level: o ? o.level : r.level, role: r.role, roleName: ROLE_NAME[r.role],
      online: !!o, contribution: Number(r.contribution), zen: Number(r.zen_donated), joined: r.joined_at };
  }).sort((a, b) => RANK[b.role] - RANK[a.role] || (b.online - a.online) || b.contribution - a.contribution || a.name.localeCompare(b.name));
}
async function warsOf(gid) {
  const { rows } = await db.query(`SELECT * FROM guild_wars WHERE (a_id = $1 OR b_id = $1) ORDER BY created_at DESC LIMIT 25`, [gid]);
  return rows.map((w) => warView(w, gid));
}
function warView(w, gid) {
  const mine = String(w.a_id) === String(gid);
  return { id: String(w.id), status: w.status, me: mine ? w.a_name : w.b_name, them: mine ? w.b_name : w.a_name, themId: String(mine ? w.b_id : w.a_id),
    myKills: mine ? w.a_kills : w.b_kills, theirKills: mine ? w.b_kills : w.a_kills, attacker: mine, declaredBy: w.declared_by,
    endsAt: w.ends_at ? new Date(w.ends_at).getTime() : null, result: w.status === 'ended' ? (!w.winner_id ? 'draw' : String(w.winner_id) === String(gid) ? 'win' : 'loss') : null,
    created: w.created_at, goal: WAR_GOAL };
}
function missionState(raw) {
  const m = raw && raw.day === today() ? raw : { day: today(), done: [] };
  return MISSIONS.map((x) => ({ ...x, have: Math.min(x.need, Number(m[x.id]) || 0), claimed: (m.done || []).includes(x.id) }));
}
async function state(p) {
  const me = await loadMember(p.charId);
  const ranking = await rankingRows();
  if (!me) return send(p, 'guild', { action: 'state', guild: null, ranking: ranking.slice(0, 50), canCreateHere: atCreateNpc(p), createCost: CREATE_COST, createLevel: CREATE_LEVEL });
  const g = await guildRow(me.gid);
  const [members, donations, wl, mrow] = await Promise.all([
    membersOf(me.gid),
    db.query(`SELECT char_name, kind, zen, points, note, created_at FROM guild_donations WHERE guild_id = $1 ORDER BY created_at DESC LIMIT 30`, [me.gid]),
    warsOf(me.gid),
    db.query('SELECT missions FROM guild_members WHERE character_id = $1', [p.charId]),
  ]);
  const pos = (ranking.find((r) => r.id === String(me.gid)) || {}).pos || null;
  const myRole = me.role;
  send(p, 'guild', {
    action: 'state', createCost: CREATE_COST,
    guild: { id: String(g.id), name: g.name, description: g.description, leader: g.leader_name, members: g.members, max: MAX_MEMBERS, zen: Number(g.zen_fund), points: Number(g.points),
      wins: g.wins, losses: g.losses, draws: g.draws, score: score(g), pos, created: g.created_at, subcapInvite: g.subcap_invite },
    me: { role: myRole, roleName: ROLE_NAME[myRole], perms: perms(myRole, g) },
    members, donations: donations.rows.map((d) => ({ name: d.char_name, kind: d.kind, zen: Number(d.zen), points: d.points, note: d.note, t: d.created_at })),
    top: [...members].sort((a, b) => b.contribution - a.contribution).slice(0, 5).filter((m) => m.contribution > 0),
    missions: missionState((mrow.rows[0] || {}).missions || (p.guildMis || null)),
    wars: wl, ranking: ranking.slice(0, 50), roles: ROLES.map((r) => ({ id: r, name: ROLE_NAME[r] })), warGoal: WAR_GOAL, warMinutes: WAR_MINUTES,
  });
}
function perms(role, g) {
  const r = RANK[role] || 0;
  return {
    invite: r >= 3 || (role === 'subcaptain' && g.subcap_invite),
    kick: r >= 4, roles: role === 'leader', war: role === 'leader', warAnswer: r >= 4, edit: role === 'leader', transfer: role === 'leader', disband: role === 'leader',
  };
}
async function pushGuild(gid) {
  const { rows } = await db.query('SELECT character_id FROM guild_members WHERE guild_id = $1', [gid]);
  for (const r of rows) { const o = online(r.character_id); if (o) state(o).catch(() => {}); }
}
async function notifyGuild(gid, text, kind = 'info') {
  const { rows } = await db.query('SELECT character_id FROM guild_members WHERE guild_id = $1', [gid]);
  for (const r of rows) send(online(r.character_id), 'log', { kind, text });
}

// ---------- NPC de criação (Devias) ----------
function atCreateNpc(p) {
  if (!p.map || (p.map.id || p.map.def.id) !== 'devias') return false;
  const npc = (p.map.def.npcs || []).find((n) => n.kind === 'guild');
  return !!npc && Math.hypot(p.x - npc.x, p.y - npc.y) <= 140;
}

// ---------- ações ----------
async function myGuild(p) {
  const me = memberOf.get(p.charId) || await loadMember(p.charId);
  if (!me) fail('Você não pertence a nenhuma guilda.');
  const g = await guildRow(me.gid);
  if (!g) { memberOf.delete(p.charId); fail('Você não pertence a nenhuma guilda.'); }
  return { me, g, perm: perms(me.role, g) };
}
function targetOnline(msg) {
  const id = String(msg.id || '').replace(/^p/, '');
  if (id && online(id)) return online(id);
  const name = String(msg.target || msg.name || '').trim().toLowerCase();
  if (!name) return null;
  for (const o of W.players.values()) if (o.name.toLowerCase() === name) return o;
  return null;
}

async function act(world, p, msg) {
  W = world;
  const a = String(msg.action || 'state');
  const ok = (text) => send(p, 'guild', { action: 'result', ok: true, text });
  try {
    if (a === 'state' || a === 'info') return state(p);
    if (a === 'ranking') return send(p, 'guild', { action: 'ranking', ranking: await rankingRows() });
    if (a === 'profile') {
      const gid = String(msg.id || '');
      const g = await guildRow(gid);
      if (!g) fail('Guilda não encontrada.');
      const rk = await rankingRows();
      const mem = await membersOf(gid);
      return send(p, 'guild', { action: 'profile', profile: { id: String(g.id), name: g.name, description: g.description, leader: g.leader_name, members: mem.map((m) => ({ name: m.name, className: m.className, level: m.level, roleName: m.roleName, online: m.online })),
        pos: (rk.find((r) => r.id === String(g.id)) || {}).pos, wins: g.wins, losses: g.losses, draws: g.draws, contrib: mem.reduce((s, m) => s + m.contribution, 0), zen: Number(g.zen_fund), score: score(g) } });
    }
    if (a === 'create') {
      if (await loadMember(p.charId)) fail('Você já pertence a uma guilda.');
      if (!atCreateNpc(p)) fail('A criação de guildas é feita com o Mestre de Guildas em Devias.');
      if (p.level < CREATE_LEVEL) fail(`É preciso ter nível ${CREATE_LEVEL} para fundar uma guilda.`);
      const name = clean(msg.name, 20), desc = clean(msg.description, 200);
      if (!/^[\p{L}\p{N} _-]{3,20}$/u.test(name)) fail('Use um nome de 3 a 20 letras ou números.');
      if (p.zen < CREATE_COST) fail(`Fundar uma guilda custa ${CREATE_COST.toLocaleString('pt-BR')} Zen.`);
      if ((await db.query('SELECT 1 FROM guilds WHERE lower(name) = lower($1)', [name])).rows[0]) fail('Já existe uma guilda com esse nome.');
      let g;
      try {
        g = await db.tx(async (q) => {
          const row = (await q('INSERT INTO guilds (name, leader_character_id, description) VALUES ($1, $2, $3) RETURNING id, name', [name, p.charId, desc])).rows[0];
          await q(`INSERT INTO guild_members (guild_id, character_id, role) VALUES ($1, $2, 'leader')`, [row.id, p.charId]);
          await q('DELETE FROM guild_invites WHERE character_id = $1', [p.charId]);
          return row;
        });
      } catch (e) { if (/unique|duplicate/i.test(e.message)) fail('Já existe uma guilda com esse nome.'); throw e; }
      p.zen -= CREATE_COST; p.dirty = true; if (p.charState) p.send(p.charState());
      await loadMember(p.charId);
      ok(`Guilda ${g.name} fundada! Você é o Mestre.`);
      if (world.system) world.system(`${p.name} fundou a guilda ${g.name}.`);
      return state(p);
    }
    if (a === 'invite') {
      const { me, g, perm } = await myGuild(p);
      if (!perm.invite) fail('Sua patente não pode recrutar jogadores.');
      const t = targetOnline(msg);
      if (!t || t.charId === p.charId) fail('Jogador não encontrado ou desconectado.');
      if (memberOf.get(t.charId) || await loadMember(t.charId)) fail(`${t.name} já pertence a uma guilda.`);
      if (g.members >= MAX_MEMBERS) fail(`A guilda já tem o máximo de ${MAX_MEMBERS} membros.`);
      const dup = (await db.query(`SELECT 1 FROM guild_invites WHERE guild_id = $1 AND character_id = $2 AND expires_at > now()`, [me.gid, t.charId])).rows[0];
      if (dup) fail(`${t.name} já tem um convite da sua guilda. Aguarde a resposta.`);
      await db.query(`INSERT INTO guild_invites (guild_id, character_id, invited_by, expires_at) VALUES ($1, $2, $3, now() + interval '10 minutes')
        ON CONFLICT (guild_id, character_id) DO UPDATE SET invited_by = EXCLUDED.invited_by, expires_at = EXCLUDED.expires_at`, [me.gid, t.charId, p.charId]);
      send(t, 'socialInvite', { kind: 'guild', from: p.name, guildId: me.gid, guildName: g.name });
      return ok(`Convite da guilda enviado para ${t.name}.`);
    }
    if (a === 'accept') {
      if (await loadMember(p.charId)) fail('Você já pertence a uma guilda.');
      const inv = (await db.query(`SELECT guild_id FROM guild_invites WHERE character_id = $1 AND expires_at > now() ORDER BY expires_at DESC LIMIT 1`, [p.charId])).rows[0];
      if (!inv) fail('Você não tem convite de guilda válido.');
      const g = await guildRow(inv.guild_id);
      if (!g) fail('Essa guilda não existe mais.');
      if (g.members >= MAX_MEMBERS) fail('A guilda está cheia.');
      await db.tx(async (q) => {
        await q(`INSERT INTO guild_members (guild_id, character_id, role) VALUES ($1, $2, 'member')`, [inv.guild_id, p.charId]);
        await q('DELETE FROM guild_invites WHERE character_id = $1', [p.charId]);
      });
      await loadMember(p.charId);
      await notifyGuild(inv.guild_id, `${p.name} entrou na guilda ${g.name}.`);
      return pushGuild(inv.guild_id);
    }
    if (a === 'decline') {
      const inv = (await db.query('DELETE FROM guild_invites WHERE character_id = $1 RETURNING invited_by', [p.charId])).rows[0];
      if (inv) send(online(inv.invited_by), 'log', { kind: 'warn', text: `${p.name} recusou o convite da guilda.` });
      return ok('Convite recusado.');
    }
    if (a === 'leave') {
      const { me } = await myGuild(p);
      if (me.role === 'leader') fail('O Mestre precisa transferir a liderança (ou desfazer a guilda) antes de sair.');
      await db.query('DELETE FROM guild_members WHERE character_id = $1', [p.charId]);
      await loadMember(p.charId);
      await notifyGuild(me.gid, `${p.name} saiu da guilda.`);
      pushGuild(me.gid);
      ok('Você saiu da guilda.');
      return state(p);
    }
    if (a === 'disband') {
      const { me, g, perm } = await myGuild(p);
      if (!perm.disband) fail('Somente o Mestre pode desfazer a guilda.');
      if (String(msg.confirm || '').trim().toLowerCase() !== g.name.toLowerCase()) fail('Digite o nome da guilda para confirmar.');
      const { rows } = await db.query('SELECT character_id FROM guild_members WHERE guild_id = $1', [me.gid]);
      for (const w of [...wars.values()]) if (w.a_id === me.gid || w.b_id === me.gid) wars.delete(w.id);
      await db.query('DELETE FROM guilds WHERE id = $1', [me.gid]);
      for (const r of rows) { await loadMember(r.character_id); const o = online(r.character_id); if (o) { send(o, 'log', { kind: 'warn', text: `A guilda ${g.name} foi desfeita.` }); state(o); } }
      return undefined;
    }
    if (a === 'kick') {
      const { me, perm } = await myGuild(p);
      if (!perm.kick) fail('Sua patente não pode expulsar membros.');
      const id = String(msg.id || '');
      const t = (await db.query('SELECT gm.role, c.name FROM guild_members gm JOIN characters c ON c.id = gm.character_id WHERE gm.guild_id = $1 AND gm.character_id = $2', [me.gid, id])).rows[0];
      if (!t) fail('Esse jogador não é da sua guilda.');
      if (t.role === 'leader') fail('O Mestre não pode ser expulso. Transfira a liderança primeiro.');
      if (RANK[t.role] >= RANK[me.role]) fail('Você só pode expulsar patentes abaixo da sua.');
      await db.query('DELETE FROM guild_members WHERE guild_id = $1 AND character_id = $2', [me.gid, id]);
      await loadMember(id);
      send(online(id), 'log', { kind: 'warn', text: 'Você foi removido da guilda.' });
      if (online(id)) state(online(id));
      await notifyGuild(me.gid, `${t.name} foi expulso da guilda por ${p.name}.`);
      return pushGuild(me.gid);
    }
    if (a === 'setRole') {
      const { me, perm } = await myGuild(p);
      if (!perm.roles) fail('Somente o Mestre pode nomear ou remover cargos.');
      const role = String(msg.role || '');
      if (!ROLES.includes(role) || role === 'leader') fail('Patente inválida. Para passar o comando use "Transferir liderança".');
      const id = String(msg.id || '');
      if (id === p.charId) fail('Você não pode mudar a própria patente.');
      const t = (await db.query('SELECT role, (SELECT name FROM characters WHERE id = $2) AS name FROM guild_members WHERE guild_id = $1 AND character_id = $2', [me.gid, id])).rows[0];
      if (!t) fail('Esse jogador não é da sua guilda.');
      if (t.role === 'leader') fail('Não é possível alterar a patente do Mestre.');
      if (role === 'submaster') {
        const n = (await db.query(`SELECT count(*)::int AS n FROM guild_members WHERE guild_id = $1 AND role = 'submaster' AND character_id <> $2`, [me.gid, id])).rows[0].n;
        if (n >= 2) fail('A guilda pode ter no máximo 2 Submestres.');
      }
      await db.query('UPDATE guild_members SET role = $3 WHERE guild_id = $1 AND character_id = $2', [me.gid, id, role]);
      await loadMember(id);
      await notifyGuild(me.gid, `${t.name} agora é ${ROLE_NAME[role]} da guilda.`);
      return pushGuild(me.gid);
    }
    if (a === 'transfer') {
      const { me, g, perm } = await myGuild(p);
      if (!perm.transfer) fail('Somente o Mestre pode transferir a liderança.');
      const id = String(msg.id || '');
      if (id === p.charId) fail('Escolha outro membro.');
      const t = (await db.query('SELECT (SELECT name FROM characters WHERE id = $2) AS name FROM guild_members WHERE guild_id = $1 AND character_id = $2', [me.gid, id])).rows[0];
      if (!t) fail('Esse jogador não é da sua guilda.');
      await db.tx(async (q) => {
        await q(`UPDATE guild_members SET role = 'submaster' WHERE guild_id = $1 AND character_id = $2`, [me.gid, p.charId]);
        await q(`UPDATE guild_members SET role = 'leader' WHERE guild_id = $1 AND character_id = $2`, [me.gid, id]);
        await q('UPDATE guilds SET leader_character_id = $2 WHERE id = $1', [me.gid, id]);
      });
      await loadMember(id); await loadMember(p.charId);
      await notifyGuild(me.gid, `${t.name} é o novo Mestre da guilda ${g.name}.`);
      return pushGuild(me.gid);
    }
    if (a === 'edit') {
      const { me, perm } = await myGuild(p);
      if (!perm.edit) fail('Somente o Mestre pode alterar as informações.');
      const desc = clean(msg.description, 200);
      await db.query('UPDATE guilds SET description = $2, subcap_invite = $3 WHERE id = $1', [me.gid, desc, msg.subcapInvite !== false]);
      ok('Informações da guilda atualizadas.');
      return pushGuild(me.gid);
    }
    if (a === 'donate') {
      const { me, g } = await myGuild(p);
      const zen = Math.floor(Number(msg.zen) || 0);
      if (zen < 1000) fail('A doação mínima é de 1.000 Zen.');
      if (zen > p.zen) fail('Você não tem esse Zen.');
      const pts = Math.floor(zen / ZEN_PER_POINT);
      p.zen -= zen; p.dirty = true;
      await db.tx(async (q) => {
        await q('UPDATE guilds SET zen_fund = zen_fund + $2, points = points + $3 WHERE id = $1', [me.gid, zen, pts]);
        await q('UPDATE guild_members SET zen_donated = zen_donated + $2, contribution = contribution + $3 WHERE character_id = $1', [p.charId, zen, pts]);
        await q(`INSERT INTO guild_donations (guild_id, character_id, char_name, kind, zen, points) VALUES ($1, $2, $3, 'zen', $4, $5)`, [me.gid, p.charId, p.name, zen, pts]);
      });
      if (p.charState) p.send(p.charState());
      await notifyGuild(me.gid, `${p.name} doou ${zen.toLocaleString('pt-BR')} Zen para a guilda ${g.name}.`);
      return pushGuild(me.gid);
    }
    if (a === 'claim') {
      const { me } = await myGuild(p);
      const M = MISSIONS.find((x) => x.id === msg.mission);
      if (!M) fail('Missão inválida.');
      await flushMissions(p);
      const raw = (await db.query('SELECT missions FROM guild_members WHERE character_id = $1', [p.charId])).rows[0].missions || {};
      const st = raw.day === today() ? raw : { day: today(), done: [] };
      if ((st.done || []).includes(M.id)) fail('Você já entregou essa missão hoje.');
      if ((Number(st[M.id]) || 0) < M.need) fail('Missão ainda não concluída.');
      st.done = [...(st.done || []), M.id];
      await db.tx(async (q) => {
        await q('UPDATE guild_members SET missions = $2, contribution = contribution + $3 WHERE character_id = $1', [p.charId, st, M.pts]);
        await q('UPDATE guilds SET points = points + $2 WHERE id = $1', [me.gid, M.pts]);
        await q(`INSERT INTO guild_donations (guild_id, character_id, char_name, kind, points, note) VALUES ($1, $2, $3, 'mission', $4, $5)`, [me.gid, p.charId, p.name, M.pts, M.name]);
      });
      p.guildMis = st;
      ok(`Missão "${M.name}" entregue: +${M.pts} pontos para a guilda.`);
      return pushGuild(me.gid);
    }
    if (a === 'warDeclare') {
      const { me, g, perm } = await myGuild(p);
      if (!perm.war) fail('Somente o Mestre pode declarar guerra.');
      const name = clean(msg.name, 20);
      const t = (await db.query('SELECT id, name FROM guilds WHERE lower(name) = lower($1)', [name])).rows[0];
      if (!t) fail('Guilda não encontrada.');
      if (String(t.id) === me.gid) fail('Você não pode declarar guerra contra a sua própria guilda.');
      const busy = (await db.query(`SELECT 1 FROM guild_wars WHERE status IN ('pending','active') AND (a_id IN ($1,$2) OR b_id IN ($1,$2))`, [me.gid, t.id])).rows[0];
      if (busy) fail('Uma das guildas já está em guerra ou com uma declaração pendente.');
      await db.query(`INSERT INTO guild_wars (a_id, b_id, a_name, b_name, declared_by) VALUES ($1, $2, $3, $4, $5)`, [me.gid, t.id, g.name, t.name, p.name]);
      await notifyGuild(me.gid, `${p.name} declarou guerra contra a guilda ${t.name}. Aguardando resposta.`, 'quest');
      await notifyGuild(t.id, `A guilda ${g.name} declarou guerra contra vocês! O Mestre ou um Submestre pode aceitar ou recusar na aba Guerra.`, 'warn');
      const { rows } = await db.query(`SELECT character_id FROM guild_members WHERE guild_id = $1 AND role IN ('leader','submaster')`, [t.id]);
      for (const r of rows) send(online(r.character_id), 'guild', { action: 'warInvite', from: g.name });
      pushGuild(t.id);
      return pushGuild(me.gid);
    }
    if (a === 'warAnswer') {
      const { me, perm } = await myGuild(p);
      if (!perm.warAnswer) fail('Somente o Mestre ou um Submestre pode responder.');
      const w = (await db.query(`SELECT * FROM guild_wars WHERE id = $1 AND b_id = $2 AND status = 'pending'`, [msg.id, me.gid])).rows[0];
      if (!w) fail('Essa declaração de guerra não existe mais.');
      if (!msg.accept) {
        await db.query(`UPDATE guild_wars SET status = 'declined', ended_at = now() WHERE id = $1`, [w.id]);
        await notifyGuild(w.a_id, `A guilda ${w.b_name} recusou a guerra.`, 'warn');
        await notifyGuild(w.b_id, `${p.name} recusou a guerra contra ${w.a_name}.`);
      } else {
        const r = (await db.query(`UPDATE guild_wars SET status = 'active', started_at = now(), ends_at = now() + make_interval(mins => $2) WHERE id = $1 RETURNING *`, [w.id, WAR_MINUTES])).rows[0];
        wars.set(String(r.id), toMem(r));
        const txt = `GUERRA! ${r.a_name} × ${r.b_name} começou: ${WAR_GOAL} eliminações ou ${WAR_MINUTES} minutos. Fora das cidades os membros podem se atacar.`;
        await notifyGuild(r.a_id, txt, 'quest'); await notifyGuild(r.b_id, txt, 'quest');
        if (W.system) W.system(`Guerra de guildas: ${r.a_name} × ${r.b_name}!`);
        broadcastWar(wars.get(String(r.id)));
      }
      pushGuild(w.a_id);
      return pushGuild(w.b_id);
    }
    if (a === 'warCancel') {
      const { me, perm } = await myGuild(p);
      if (!perm.war) fail('Somente o Mestre pode cancelar a declaração.');
      const r = (await db.query(`UPDATE guild_wars SET status = 'cancelled', ended_at = now() WHERE id = $1 AND a_id = $2 AND status = 'pending' RETURNING b_id`, [msg.id, me.gid])).rows[0];
      if (!r) fail('Declaração não encontrada.');
      pushGuild(r.b_id);
      return pushGuild(me.gid);
    }
    return fail('Ação de guilda inválida.');
  } catch (e) {
    if (!e.user) console.error('[guild]', e.message);
    return send(p, 'guild', { action: 'result', ok: false, text: e.user ? e.message : 'Não foi possível concluir agora. Tente de novo.' });
  }
}

// ---------- missões (progresso em memória, salvo de tempos em tempos) ----------
function bump(p, key, n = 1) {
  if (!p || !p.guild) return;
  const st = p.guildMis && p.guildMis.day === today() ? p.guildMis : { day: today(), done: (p.guildMis && p.guildMis.day === today() && p.guildMis.done) || [] };
  st[key] = (Number(st[key]) || 0) + n;
  p.guildMis = st; p.guildMisDirty = (p.guildMisDirty || 0) + 1;
  if (p.guildMisDirty >= 25) flushMissions(p).catch(() => {});
}
async function flushMissions(p) {
  if (!p.guildMis) {
    const r = (await db.query('SELECT missions FROM guild_members WHERE character_id = $1', [p.charId])).rows[0];
    p.guildMis = r && r.missions && r.missions.day === today() ? r.missions : { day: today(), done: [] };
    return;
  }
  if (!p.guildMisDirty) return;
  p.guildMisDirty = 0;
  // mantém o maior progresso já salvo (outro aparelho/sessão) e a lista de entregues
  const r = (await db.query('SELECT missions FROM guild_members WHERE character_id = $1', [p.charId])).rows[0];
  if (!r) return;
  const saved = r.missions && r.missions.day === today() ? r.missions : { day: today(), done: [] };
  const merged = { day: today(), done: [...new Set([...(saved.done || []), ...(p.guildMis.done || [])])] };
  for (const M of MISSIONS) merged[M.id] = Math.max(Number(saved[M.id]) || 0, Number(p.guildMis[M.id]) || 0);
  p.guildMis = merged;
  await db.query('UPDATE guild_members SET missions = $2 WHERE character_id = $1', [p.charId, merged]);
}
function onMonsterKill(p, T, opts = {}) {
  if (!p || !p.guild || !T) return;
  if (opts.boss || T.boss) return bump(p, 'boss');
  bump(p, 'mobs');
  if (T.elite || opts.elite) bump(p, 'elite');
}

// ---------- guerras ----------
function toMem(r) { return { id: String(r.id), a_id: String(r.a_id), b_id: String(r.b_id), a_name: r.a_name, b_name: r.b_name, a_kills: r.a_kills, b_kills: r.b_kills, ends: new Date(r.ends_at).getTime() }; }
function warBetween(ga, gb) {
  if (!ga || !gb || ga === gb) return null;
  for (const w of wars.values()) if ((w.a_id === ga && w.b_id === gb) || (w.a_id === gb && w.b_id === ga)) return w;
  return null;
}
function atWar(a, b) { return !!(a && b && a.guild && b.guild && warBetween(a.guild.gid, b.guild.gid)); }
function enemiesOf(gid) { const out = []; for (const w of wars.values()) { if (w.a_id === gid) out.push(w.b_id); else if (w.b_id === gid) out.push(w.a_id); } return out; }
function broadcastWar(w) {
  for (const o of W.players.values()) {
    if (!o.guild || (o.guild.gid !== w.a_id && o.guild.gid !== w.b_id)) continue;
    const mine = o.guild.gid === w.a_id;
    send(o, 'guild', { action: 'war', war: { id: w.id, me: mine ? w.a_name : w.b_name, them: mine ? w.b_name : w.a_name, myKills: mine ? w.a_kills : w.b_kills, theirKills: mine ? w.b_kills : w.a_kills, endsAt: w.ends, goal: WAR_GOAL }, enemies: enemiesOf(o.guild.gid) });
  }
}
async function onWarKill(world, k, v) {
  W = world;
  const w = warBetween(k.guild && k.guild.gid, v.guild && v.guild.gid);
  if (!w) return false;
  if (k.guild.gid === w.a_id) w.a_kills++; else w.b_kills++;
  bump(k, 'war');
  await db.query('UPDATE guild_wars SET a_kills = $2, b_kills = $3 WHERE id = $1', [w.id, w.a_kills, w.b_kills]);
  for (const o of W.players.values()) if (o.guild && (o.guild.gid === w.a_id || o.guild.gid === w.b_id)) send(o, 'log', { kind: 'quest', text: `Guerra: ${k.name} (${k.guild.name}) eliminou ${v.name} (${v.guild.name}). ${w.a_name} ${w.a_kills} × ${w.b_kills} ${w.b_name}` });
  broadcastWar(w);
  if (w.a_kills >= WAR_GOAL || w.b_kills >= WAR_GOAL) await endWar(w);
  return true;
}
async function endWar(w) {
  if (!wars.has(w.id)) return;
  wars.delete(w.id);
  const winner = w.a_kills > w.b_kills ? w.a_id : w.b_kills > w.a_kills ? w.b_id : null;
  const loser = winner ? (winner === w.a_id ? w.b_id : w.a_id) : null;
  await db.tx(async (q) => {
    await q(`UPDATE guild_wars SET status = 'ended', ended_at = now(), winner_id = $2, a_kills = $3, b_kills = $4 WHERE id = $1`, [w.id, winner, w.a_kills, w.b_kills]);
    if (winner) {
      await q('UPDATE guilds SET wins = wins + 1, points = points + 100 WHERE id = $1', [winner]);
      await q('UPDATE guilds SET losses = losses + 1 WHERE id = $1', [loser]);
    } else await q('UPDATE guilds SET draws = draws + 1 WHERE id IN ($1, $2)', [w.a_id, w.b_id]);
  });
  const res = winner ? `${winner === w.a_id ? w.a_name : w.b_name} venceu a guerra` : 'A guerra terminou empatada';
  const txt = `Fim da guerra ${w.a_name} ${w.a_kills} × ${w.b_kills} ${w.b_name}: ${res}!`;
  await notifyGuild(w.a_id, txt, 'quest'); await notifyGuild(w.b_id, txt, 'quest');
  if (W.system) W.system(txt);
  for (const o of W.players.values()) if (o.guild && (o.guild.gid === w.a_id || o.guild.gid === w.b_id)) send(o, 'guild', { action: 'war', war: null, enemies: enemiesOf(o.guild.gid) });
  pushGuild(w.a_id); pushGuild(w.b_id);
}
async function tick() {
  const now = Date.now();
  for (const w of [...wars.values()]) if (now >= w.ends) await endWar(w).catch((e) => console.error('[guild] fim da guerra', e.message));
  // declarações sem resposta por 30 min expiram
  await db.query(`UPDATE guild_wars SET status = 'cancelled', ended_at = now() WHERE status = 'pending' AND created_at < now() - interval '30 minutes'`).catch(() => {});
}

async function init(world) {
  W = world;
  try {
    const { rows } = await db.query(`SELECT * FROM guild_wars WHERE status = 'active'`);
    for (const r of rows) wars.set(String(r.id), toMem(r));
  } catch (e) { console.error('[guild] init', e.message); }
  setInterval(() => tick().catch(() => {}), 5000).unref();
}
async function onJoin(world, p) {
  W = world;
  try {
    await loadMember(p.charId);
    if (p.guild) {
      const w = warBetween(p.guild.gid, enemiesOf(p.guild.gid)[0]);
      send(p, 'guild', { action: 'war', war: null, enemies: enemiesOf(p.guild.gid) });
      if (w) broadcastWar(w);
    }
  } catch (e) { console.error('[guild] join', e.message); }
}
function onLeave(p) { if (p.guildMisDirty) flushMissions(p).catch(() => {}); }

module.exports = { init, act, onJoin, onLeave, onMonsterKill, onWarKill, atWar, tagOf, ROLE_NAME, rankingRows };
