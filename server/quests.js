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
  for (const [b, n] of r.mats || []) parts.push(`${n}× ${(G.ITEM_BASES[b] || {}).name || b}`);
  if (r.box) parts.push((G.ITEM_BASES[r.box] || {}).name || r.box);
  if (r.item) parts.push(`item ${{ rare: 'raro', epic: 'épico', legendary: 'lendário' }[r.item] || r.item}`);
  if (r.expPct) parts.push(`EXP (${Math.round(r.expPct * 100)}% do nível)`);
  return parts.join(' + ');
}

// semana do jogo: começa na segunda-feira (fuso do jogo)
const wdFmt = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short' });
const WD = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
function weekKey(d = new Date()) { const back = WD[wdFmt.format(d)] || 0; return today(new Date(d.getTime() - back * 86400000)); }
function msToWeek() { const back = WD[wdFmt.format(new Date())] || 0; return msToReset() + (6 - back) * 86400000; }
const daysBetween = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 86400000);

function genWeekly(charId, level, wk) {
  const pool = G.WEEKLY_POOL.filter((q) => !q.minLevel || level >= q.minLevel);
  const seed = hash(`w:${charId}:${wk}`);
  return pool.map((q, i) => [hash(`${seed}:${i}`), q]).sort((a, b) => a[0] - b[0]).slice(0, 4)
    .map(([, q]) => ({ id: q.id, goal: q.goal, prog: 0, claimed: false }));
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
  q.cycle = q.cycle || { step: 0, last: null, claimed: false };
  q.weekly = q.weekly || {};
  p.quests = q;
  const d = today();
  let changed = false;
  // semanais: renovam na segunda-feira
  const wk = weekKey();
  if (q.weekly.week !== wk) { q.weekly = { week: wk, list: genWeekly(p.charId, p.level, wk), bonus: false }; changed = true; }
  // ciclo de 7 etapas: um prêmio por dia; a etapa só avança quando o prêmio é pego (faltar não zera)
  if (q.cycle.last !== d) { q.cycle.last = d; q.cycle.claimed = false; changed = true; }
  // bem-vindo de volta: ausência de 7, 15 ou 30 dias (pelo último dia em que este herói entrou)
  if (q.login.last && q.login.last !== d) {
    const gap = daysBetween(q.login.last, d);
    const tier = gap >= 30 ? 30 : gap >= 15 ? 15 : gap >= 7 ? 7 : 0;
    if (tier && (!q.comeback || q.comeback.claimed || q.comeback.until < d)) {
      q.comeback = { tier, gap, until: today(new Date(Date.now() + 7 * 86400000)), claimed: false,
        list: G.COMEBACK[tier].list.map(([id, goal]) => ({ id, goal, prog: 0 })) };
      changed = true;
    }
  }
  if (q.comeback && !q.comeback.claimed && q.comeback.until < d) { q.comeback = null; changed = true; }
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
// ctx.map: mapa da caçada (missão "cace em N mapas diferentes" conta cada mapa uma vez)
function track(p, kind, amount = 1, ctx = {}) {
  const q = p.quests;
  const done = [];
  const bump = (m, where) => {
    if (m.id !== kind || m.claimed || m.prog >= m.goal) return;
    if (kind === 'explore') { m.maps = m.maps || []; if (!ctx.map || m.maps.includes(ctx.map)) return; m.maps.push(ctx.map); m.prog = m.maps.length; }
    else m.prog = Math.min(m.goal, m.prog + amount);
    if (m.prog >= m.goal) done.push({ ...m, where });
  };
  for (const m of q.daily.list || []) bump(m, 'daily');
  for (const m of (q.weekly && q.weekly.list) || []) bump(m, 'weekly');
  if (q.comeback && !q.comeback.claimed) for (const m of q.comeback.list) bump(m, 'comeback');
  return done;
}

function claimable(p) {
  const q = p.quests;
  let n = 0;
  for (const m of q.daily.list || []) if (m.prog >= m.goal && !m.claimed) n++;
  for (const m of (q.weekly && q.weekly.list) || []) if (m.prog >= m.goal && !m.claimed) n++;
  if (q.weekly && q.weekly.list && !q.weekly.bonus && q.weekly.list.length && q.weekly.list.every((m) => m.claimed)) n++;
  if (q.cycle && !q.cycle.claimed) n++;
  if (q.comeback && !q.comeback.claimed && q.comeback.list.every((m) => m.prog >= m.goal)) n++;
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
  const weekly = ((q.weekly && q.weekly.list) || []).map((m) => {
    const def = G.WEEKLY_POOL.find((d) => d.id === m.id) || { text: m.id, reward: {} };
    return { id: m.id, text: def.text.replace('{n}', m.goal.toLocaleString('pt-BR')), goal: m.goal, prog: m.prog, claimed: m.claimed, reward: rewardText(def.reward) };
  });
  const cyc = q.cycle || { step: 0, claimed: true };
  const cbDef = q.comeback ? G.COMEBACK[q.comeback.tier] : null;
  const cbText = { kill: 'Derrote {n} monstros', online: 'Jogue {n} minutos', elite: 'Derrote {n} elites ou chefes' };
  return {
    type: 'quests', resetIn: msToReset(), weekIn: msToWeek(), claimable: claimable(p),
    daily,
    weekly, weeklyBonus: { reward: rewardText(G.WEEKLY_BONUS(p.level)), ready: weekly.length > 0 && weekly.every((m) => m.claimed) && !(q.weekly && q.weekly.bonus), got: !!(q.weekly && q.weekly.bonus) },
    cycle: { step: cyc.step % G.CYCLE_REWARDS.length, claimed: !!cyc.claimed, rewards: G.CYCLE_REWARDS.map(rewardText) },
    comeback: q.comeback ? { tier: q.comeback.tier, gap: q.comeback.gap, until: q.comeback.until, claimed: q.comeback.claimed, reward: rewardText(cbDef.reward),
      list: q.comeback.list.map((m) => ({ id: m.id, text: (cbText[m.id] || m.id).replace('{n}', m.goal.toLocaleString('pt-BR')), goal: m.goal, prog: m.prog })) } : null,
    login: { streak, claimed: !!q.login.claimed, today: idx, rewards: G.LOGIN_REWARDS.map(rewardText) },
    ach: G.ACHIEVEMENTS.map((a) => ({ id: a.id, text: a.text, goal: a.goal, prog: Math.min(a.goal, statValue(p, a.stat)), state: q.ach[a.id] || 'open', reward: rewardText(a.reward) })),
  };
}

module.exports = { today, weekKey, normalize, track, checkAchievements, claimable, state, rewardText, msToReset, msToWeek };
