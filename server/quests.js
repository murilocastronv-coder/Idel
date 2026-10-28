'use strict';
// Missões diárias, prêmio de login e conquistas. Tudo calculado no servidor e salvo no personagem.
const G = require('./gamedata');

const TZ = process.env.GAME_TZ || 'America/Sao_Paulo';
const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });

function today(d = new Date()) { return dayFmt.format(d); }
function yesterday() { return today(new Date(Date.now() - 24 * 3600 * 1000)); }

// milissegundos até a próxima meia-noite no fuso do jogo
function msToReset() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).formatToParts(now);
  const get = (t) => Number(parts.find((p) => p.type === t).value);
  const elapsed = ((get('hour') % 24) * 3600 + get('minute') * 60 + get('second')) * 1000;
  return 24 * 3600 * 1000 - elapsed;
}

function hash(str) {
  let h = 2166136261;
  for (const ch of str) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return h;
}

function rewardText(r) {
  const parts = [];
  if (r.zen) parts.push(`${r.zen.toLocaleString('pt-BR')} Zen`);
  if (r.pot_hp) parts.push(`${r.pot_hp} poções de vida`);
  if (r.pot_mp) parts.push(`${r.pot_mp} poções de mana`);
  if (r.item) parts.push(`item ${{ rare: 'raro', epic: 'épico', legendary: 'lendário' }[r.item] || r.item}`);
  return parts.join(' + ');
}

function genDaily(charId, level, day) {
  const pool = G.DAILY_POOL.filter((q) => !q.minLevel || level >= q.minLevel);
  const seed = hash(`${charId}:${day}`);
  const picked = [];
  const order = pool.map((q, i) => [hash(`${seed}:${i}`), q]).sort((a, b) => a[0] - b[0]);
  for (const [, q] of order) { if (picked.length < 3) picked.push(q); }
  return picked.map((q) => ({ id: q.id, goal: Math.round(q.base + q.per * level), prog: 0, claimed: false }));
}

// Garante a estrutura e faz a virada do dia (missões novas, sequência de login)
function normalize(p) {
  const q = p.quests && typeof p.quests === 'object' ? p.quests : {};
  q.daily = q.daily || {};
  q.login = q.login || { last: null, streak: 0, claimed: true };
  q.ach = q.ach || {};
  q.life = q.life || { legendary: 0 };
  p.quests = q;
  const d = today();
  let changed = false;
  if (q.daily.day !== d) {
    q.daily = { day: d, list: genDaily(p.charId, p.level, d) };
    changed = true;
  }
  if (q.login.last !== d) {
    q.login.streak = q.login.last === yesterday() ? (q.login.streak || 0) + 1 : 1;
    q.login.last = d;
    q.login.claimed = false;
    changed = true;
  }
  return changed;
}

function statValue(p, stat) {
  switch (stat) {
    case 'level': return p.level;
    case 'kills': return p.kills;
    case 'bosses': return p.bossesKilled;
    case 'legendary': return p.quests.life.legendary || 0;
    case 'zen': return p.zen;
    case 'streak': return p.quests.login.streak || 0;
    default: return 0;
  }
}

// Atualiza conquistas; devolve as recém-concluídas
function checkAchievements(p) {
  const done = [];
  for (const a of G.ACHIEVEMENTS) {
    if (p.quests.ach[a.id]) continue;
    if (statValue(p, a.stat) >= a.goal) { p.quests.ach[a.id] = 'done'; done.push(a); }
  }
  return done;
}

// Soma progresso em missões diárias do tipo; devolve as que acabaram de completar
function track(p, kind, amount = 1) {
  const list = p.quests.daily.list || [];
  const done = [];
  for (const m of list) {
    if (m.id !== kind || m.claimed || m.prog >= m.goal) continue;
    m.prog = Math.min(m.goal, m.prog + amount);
    if (m.prog >= m.goal) done.push(m);
  }
  return done;
}

function claimable(p) {
  const q = p.quests;
  let n = 0;
  for (const m of q.daily.list || []) if (m.prog >= m.goal && !m.claimed) n++;
  if (!q.login.claimed) n++;
  for (const v of Object.values(q.ach)) if (v === 'done') n++;
  return n;
}

function state(p) {
  const q = p.quests;
  const daily = (q.daily.list || []).map((m) => {
    const def = G.DAILY_POOL.find((d) => d.id === m.id);
    return { id: m.id, text: def.text.replace('{n}', m.goal.toLocaleString('pt-BR')), goal: m.goal, prog: m.prog, claimed: m.claimed, reward: rewardText(def.reward) };
  });
  const streak = q.login.streak || 1;
  const idx = (streak - 1) % G.LOGIN_REWARDS.length;
  return {
    type: 'quests', resetIn: msToReset(), claimable: claimable(p),
    daily,
    login: { streak, claimed: !!q.login.claimed, today: idx, rewards: G.LOGIN_REWARDS.map(rewardText) },
    ach: G.ACHIEVEMENTS.map((a) => ({ id: a.id, text: a.text, goal: a.goal, prog: Math.min(a.goal, statValue(p, a.stat)), state: q.ach[a.id] || 'open', reward: rewardText(a.reward) })),
  };
}

module.exports = { today, normalize, track, checkAchievements, claimable, state, rewardText, msToReset };
