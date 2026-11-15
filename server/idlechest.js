'use strict';
// Sistemas para o jogador voltar ao jogo (jogo idle):
// 1) Baú de caça: enche sozinho com os monstros que o herói mata (online e offline). Cada 150 abates = 1 baú pronto.
//    Guarda no máximo 3 baús: com 3 prontos ele PARA de encher até o jogador abrir. Abrir dá Zen, poções, joias e caixas.
// 2) Marcos de nível: a cada 10 níveis o herói ganha um prêmio (a cada 50, também uma Box Kundun).
// Tudo fica salvo no personagem (quests.chest e quests.milestones) e é calculado só no servidor.
const G = require('./gamedata');

const NEED = 150;      // abates por baú
const MAX = 3;         // baús guardados no máximo
const STEP = 10;       // marco a cada 10 níveis

const rand = (a, b) => a + Math.random() * (b - a);
function st(p) {
  p.quests = p.quests || {};
  const c = p.quests.chest = p.quests.chest || { prog: 0, ready: 0, opened: 0 };
  c.prog = Math.max(0, Number(c.prog) || 0); c.ready = Math.max(0, Math.min(MAX, Number(c.ready) || 0));
  return c;
}
const boxFor = (L) => (L >= 300 ? 'kundun_3' : L >= 100 ? 'kundun_2' : 'kundun_1');
const jewelFor = (L) => (L >= 25 && Math.random() < 0.4 ? 'jewel_of_soul' : 'jewel_of_bless');

function view(p) {
  const c = st(p), L = p.level || 1;
  const next = Math.min(G.LIMITS.maxLevel, (Math.floor(L / STEP) + 1) * STEP);
  return { type: 'idlechest', prog: c.prog, need: NEED, ready: c.ready, max: MAX, opened: c.opened || 0, nextMilestone: L >= G.LIMITS.maxLevel ? null : next };
}
function send(p) { if (p.send) p.send(view(p)); }

// conta abates; devolve quantos baús ficaram prontos agora
function addKills(p, n) {
  const c = st(p);
  if (c.ready >= MAX || !(n > 0)) return 0;
  const before = c.ready;
  c.prog += Math.floor(n);
  while (c.prog >= NEED && c.ready < MAX) { c.prog -= NEED; c.ready++; }
  if (c.ready >= MAX) c.prog = 0;
  p.dirty = true;
  const got = c.ready - before;
  if (got && p.send) {
    p.send({ type: 'log', kind: 'quest', text: c.ready >= MAX
      ? `🎁 Baú de caça CHEIO (${MAX}/${MAX}): abra os baús para ele voltar a encher!`
      : `🎁 Baú de caça pronto! Você tem ${c.ready} para abrir.` });
  }
  send(p);
  return got;
}

function chestReward(p) {
  const L = p.level || 1;
  const r = { zen: Math.round((1500 + L * 250) * rand(0.8, 1.3)), pot_hp: 5 + Math.floor(L / 20), pot_mp: 3 + Math.floor(L / 30), mats: [] };
  if (Math.random() < 0.3) r.mats.push([jewelFor(L), 1]);
  if (Math.random() < 0.1) r.box = boxFor(L);
  if (Math.random() < 0.05) r.item = L >= 150 ? 'epic' : 'rare';
  return r;
}

// abre um baú pronto (W.grant entrega e avisa o jogador)
async function open(W, p) {
  const c = st(p);
  if (c.ready <= 0) {
    p.send({ type: 'log', kind: 'warn', text: `O baú de caça ainda está enchendo: ${c.prog}/${NEED} monstros.` });
    return send(p);
  }
  c.ready--; c.opened = (c.opened || 0) + 1; p.dirty = true;
  await W.grant(p, chestReward(p), '🎁 Baú de caça');
  p.send(p.charState());
  send(p);
}

// marcos de nível: entrega os que faltam (chamado ao subir de nível e ao entrar no jogo)
function milestones(W, p) {
  p.quests = p.quests || {};
  const done = p.quests.milestones = Array.isArray(p.quests.milestones) ? p.quests.milestones : [];
  const top = Math.floor((p.level || 1) / STEP) * STEP;
  let given = 0;
  for (let L = STEP; L <= top && given < 5; L += STEP) {
    if (done.includes(L)) continue;
    done.push(L); given++;
    const r = { zen: L * 400, pot_hp: 10, pot_mp: 10, mats: [[L >= 25 ? 'jewel_of_soul' : 'jewel_of_bless', L % 50 === 0 ? 2 : 1]] };
    if (L % 50 === 0) r.box = boxFor(L);
    W.grant(p, r, `🏅 Prêmio do nível ${L}`).then(() => send(p)).catch((e) => console.error('[marcos]', e.message));
  }
  if (given) p.dirty = true;
  return given;
}

module.exports = { NEED, MAX, view, send, addKills, open, milestones };
