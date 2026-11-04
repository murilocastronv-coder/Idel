'use strict';
const db = require('./db');
let W = null;
const parties = new Map();       // leader charId -> Set<charId>
const partyOf = new Map();       // charId -> leader charId
const partyInvites = new Map();  // target charId -> { leader, expiresAt }
const SOCIAL_CHANNELS = new Set(['local', 'global', 'private', 'guild', 'party']);

function onlineByName(name) {
  const key = String(name || '').trim().toLowerCase();
  return key ? [...W.players.values()].find((p) => p.name.toLowerCase() === key) : null;
}
function send(p, type, extra = {}) { if (p && p.send) p.send({ type, ...extra }); }
function activeParty(charId) {
  const leader = partyOf.get(String(charId));
  return leader ? { leader, members: parties.get(leader) } : null;
}
function broadcastParty(leader, type, payload) {
  const members = parties.get(leader);
  if (!members) return;
  for (const id of members) send(W.players.get(id), type, payload);
}
function pruneParty(leader) {
  const members = parties.get(leader);
  if (!members || members.size) return;
  parties.delete(leader);
}
function cleanName(s) { return String(s || '').trim().replace(/\s+/g, ' '); }

async function info(p) {
  const { rows } = await db.query(`SELECT g.id, g.name, g.leader_character_id AS "leaderId",
      c.name AS "leaderName", (SELECT count(*)::int FROM guild_members gm WHERE gm.guild_id = g.id) AS members
    FROM guild_members mine JOIN guilds g ON g.id = mine.guild_id
    JOIN characters c ON c.id = g.leader_character_id WHERE mine.character_id = $1`, [p.charId]);
  const party = activeParty(p.charId);
  const partyNames = party ? [...party.members].map((id) => W.players.get(id)?.name || 'Offline') : [];
  send(p, 'social', { action: 'info', guild: rows[0] || null, party: party ? { leader: party.leader, members: partyNames } : null });
}

async function guildAct(p, action, targetName) {
  const existing = (await db.query('SELECT guild_id FROM guild_members WHERE character_id=$1', [p.charId])).rows[0];
  if (action === 'create') {
    if (existing) throw new Error('Você já pertence a uma guilda.');
    const name = cleanName(targetName);
    if (!/^[\p{L}\p{N} _-]{3,20}$/u.test(name)) throw new Error('Use um nome de guilda de 3 a 20 caracteres.');
    const made = await db.tx(async q => {
      const g = (await q('INSERT INTO guilds (name, leader_character_id) VALUES ($1,$2) RETURNING id,name', [name, p.charId])).rows[0];
      await q('INSERT INTO guild_members (guild_id, character_id, role) VALUES ($1,$2,\'leader\')', [g.id, p.charId]);
      return g;
    });
    send(p, 'log', { kind: 'info', text: `Guilda ${made.name} criada.` });
    return info(p);
  }
  if (action === 'invite') {
    if (!existing) throw new Error('Crie ou entre em uma guilda primeiro.');
    const { rows } = await db.query('SELECT leader_character_id FROM guilds WHERE id=$1', [existing.guild_id]);
    if (!rows[0] || String(rows[0].leader_character_id) !== p.charId) throw new Error('Somente o líder pode convidar jogadores.');
    const target = onlineByName(targetName);
    if (!target || target.charId === p.charId) throw new Error('Jogador não encontrado ou offline.');
    if ((await db.query('SELECT 1 FROM guild_members WHERE character_id=$1', [target.charId])).rows.length) throw new Error('Esse jogador já pertence a uma guilda.');
    await db.query(`INSERT INTO guild_invites (guild_id, character_id, invited_by, expires_at)
      VALUES ($1,$2,$3,now()+interval '10 minutes') ON CONFLICT (guild_id,character_id) DO UPDATE
      SET invited_by=EXCLUDED.invited_by, expires_at=EXCLUDED.expires_at`, [existing.guild_id,target.charId,p.charId]);
    const g = (await db.query('SELECT name FROM guilds WHERE id=$1',[existing.guild_id])).rows[0];
    send(target,'socialInvite',{kind:'guild',from:p.name,guildId:existing.guild_id,guildName:g.name});
    return send(p,'log',{kind:'info',text:`Convite enviado para ${target.name}.`});
  }
  if (action === 'accept') {
    if (existing) throw new Error('Você já pertence a uma guilda.');
    const invited = (await db.query(`SELECT guild_id FROM guild_invites WHERE character_id=$1 AND expires_at>now()
      ORDER BY expires_at DESC LIMIT 1`,[p.charId])).rows[0];
    if (!invited) throw new Error('Você não tem convite de guilda válido.');
    await db.tx(async q => {
      await q('INSERT INTO guild_members (guild_id,character_id,role) VALUES ($1,$2,\'member\')',[invited.guild_id,p.charId]);
      await q('DELETE FROM guild_invites WHERE character_id=$1',[p.charId]);
    });
    await info(p);
    const { rows }=await db.query('SELECT name FROM guilds WHERE id=$1',[invited.guild_id]);
    return send(p,'log',{kind:'info',text:`Você entrou na guilda ${rows[0]?.name || ''}.`});
  }
  if (action === 'leave') {
    if (!existing) throw new Error('Você não pertence a uma guilda.');
    const g=(await db.query('SELECT leader_character_id FROM guilds WHERE id=$1',[existing.guild_id])).rows[0];
    if (g && String(g.leader_character_id)===p.charId) {
      await db.query('DELETE FROM guilds WHERE id=$1',[existing.guild_id]);
      return send(p,'log',{kind:'info',text:'Guilda desfeita.'});
    }
    await db.query('DELETE FROM guild_members WHERE guild_id=$1 AND character_id=$2',[existing.guild_id,p.charId]);
    return send(p,'log',{kind:'info',text:'Você saiu da guilda.'});
  }
  if (action === 'decline') {
    await db.query('DELETE FROM guild_invites WHERE character_id=$1',[p.charId]);
    return send(p,'log',{kind:'info',text:'Convite recusado.'});
  }
  throw new Error('Ação de guilda inválida.');
}

function partyAct(p, action, targetName) {
  const id = p.charId;
  const party = activeParty(id);
  if (action === 'create') {
    if (party) throw new Error('Você já está em uma party.');
    parties.set(id,new Set([id])); partyOf.set(id,id);
    return info(p);
  }
  if (action === 'quickInvite') {
    // menu do jogador: se ainda não tem party, cria uma (você vira líder) e manda o convite normal
    if (!party) { parties.set(id,new Set([id])); partyOf.set(id,id); }
    return partyAct(p, 'invite', targetName);
  }
  if (action === 'invite') {
    if (!party || party.leader !== id) throw new Error('Somente o líder da party pode convidar.');
    const target=onlineByName(targetName);
    if (!target || target.charId===id) throw new Error('Jogador não encontrado ou offline.');
    if (partyOf.has(target.charId)) throw new Error('Esse jogador já está em uma party.');
    partyInvites.set(target.charId,{leader:id,expiresAt:Date.now()+600000});
    send(target,'socialInvite',{kind:'party',from:p.name});
    return send(p,'log',{kind:'info',text:`Convite de party enviado para ${target.name}.`});
  }
  if (action === 'accept') {
    const invite=partyInvites.get(id);
    if (!invite || invite.expiresAt<Date.now() || !parties.has(invite.leader)) throw new Error('Você não tem convite de party válido.');
    partyInvites.delete(id); parties.get(invite.leader).add(id); partyOf.set(id,invite.leader);
    broadcastParty(invite.leader,'social',{action:'partyChanged'});
    return info(p);
  }
  if (action === 'leave') {
    if (!party) throw new Error('Você não pertence a uma party.');
    party.members.delete(id); partyOf.delete(id);
    if (id===party.leader) {
      const next=party.members.values().next().value;
      if (next) {
        parties.delete(party.leader); partyOf.delete(next); parties.set(next,party.members);
        for (const member of party.members) partyOf.set(member,next);
        broadcastParty(next,'social',{action:'partyChanged'});
      } else parties.delete(party.leader);
    } else broadcastParty(party.leader,'social',{action:'partyChanged'});
    return info(p);
  }
  if (action === 'decline') { partyInvites.delete(id); return; }
  throw new Error('Ação de party inválida.');
}

async function act(world,p,msg) {
  W=world;
  try {
    if (msg.action === 'info') return await info(p);
    if (msg.area === 'guild') await guildAct(p,String(msg.action||''),msg.target);
    else partyAct(p,String(msg.action||''),msg.target);
  } catch(e) { send(p,'log',{kind:'warn',text:e.message||'Não foi possível concluir a ação.'}); }
}

async function chat(world,p,request) {
  W=world;
  let text=String(request.text||'').replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,120);
  let channel=SOCIAL_CHANNELS.has(request.channel)?request.channel:'global';
  let targetName=String(request.target||'').trim();
  const privateCommand=text.match(/^\/\/([^\s]{1,20})\s+([\s\S]+)$/);
  if(privateCommand){ targetName=privateCommand[1]; text=privateCommand[2].trim().slice(0,120); channel='private'; }
  if (channel === 'information') return send(p,'log',{kind:'warn',text:'O canal Informações é reservado ao servidor.'});
  if (!text) return;
  if (text.startsWith('/') && !text.startsWith('//')) return world.commands ? world.commands.run(p,text) : undefined;
  const now=Date.now();
  if (p.mutedUntil>now) return send(p,'log',{kind:'warn',text:`Você está silenciado no chat por mais ${Math.ceil((p.mutedUntil-now)/60000)} min.`});
  if (p.lastChat && now-p.lastChat<1200) return send(p,'log',{kind:'warn',text:'Calma: espere um pouco para enviar outra mensagem.'});
  p.lastChat=now;
  if (channel==='private') {
    const target=onlineByName(targetName);
    if (!target || target.charId===p.charId) return send(p,'log',{kind:'warn',text:'Informe o nome de um jogador online para a mensagem privada.'});
    const line={from:p.name,cls:p.cls,vipTier:p.vip().tier,text,t:now,channel:'private',to:target.name};
    send(p,'chat',line); send(target,'chat',line); return;
  }
  if (channel==='guild') {
    const {rows}=await db.query('SELECT guild_id FROM guild_members WHERE character_id=$1',[p.charId]);
    if (!rows[0]) return send(p,'log',{kind:'warn',text:'Você não pertence a uma guilda.'});
    const members=(await db.query('SELECT character_id FROM guild_members WHERE guild_id=$1',[rows[0].guild_id])).rows;
    const line={from:p.name,cls:p.cls,vipTier:p.vip().tier,text,t:now,channel:'guild'};
    for (const m of members) send(W.players.get(String(m.character_id)),'chat',line);
    return;
  }
  if (channel==='party') {
    const party=activeParty(p.charId);
    if (!party) return send(p,'log',{kind:'warn',text:'Você não pertence a uma party.'});
    const line={from:p.name,cls:p.cls,vipTier:p.vip().tier,text,t:now,channel:'party'};
    for (const id of party.members) send(W.players.get(id),'chat',line);
    return;
  }
  const line={from:p.name,cls:p.cls,vipTier:p.vip().tier,text,t:now,channel};
  if (channel==='local') {
    if (!p.map) return;
    for (const o of p.map.players.values()) if (Math.hypot(p.x-o.x,p.y-o.y)<=240) send(o,'chat',line);
    return;
  }
  world.chat.push(line); if (world.chat.length>60) world.chat.shift();
  for (const o of world.players.values()) send(o,'chat',line);
}

function messageInfo(world,text,en) {
  const line={from:null,text,t:Date.now(),channel:'information'};
  if (en) line.en=en;
  world.chat.push(line); if (world.chat.length>60) world.chat.shift();
  for (const p of world.players.values()) send(p,'chat',line);
}
function onLeave(p) {
  const party = activeParty(p.charId);
  if (!party) return;
  party.members.delete(p.charId); partyOf.delete(p.charId);
  if (party.leader === p.charId) {
    const next = party.members.values().next().value;
    parties.delete(party.leader);
    if (next) {
      parties.set(next, party.members);
      for (const member of party.members) partyOf.set(member, next);
      broadcastParty(next, 'social', { action: 'partyChanged' });
    }
  } else broadcastParty(party.leader, 'social', { action: 'partyChanged' });
  pruneParty(party.leader);
}
module.exports={init(world){W=world;},act,chat,messageInfo,info,onLeave};
