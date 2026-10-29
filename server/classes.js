'use strict';
// Classes e evolução de classe por missão (Quest of the Hero com a Priestess Sevina, missões avançadas com Marlon).
//  • CharacterClassService: nomes por evolução e regras de criação (MG e DL desbloqueados por nível na conta)
//  • ClassQuestManager / ClassRequirementService: iniciar, entregar itens por etapa e concluir, tudo validado no servidor
//  • ClassEvolutionDatabase: evolução gravada numa transação junto com o consumo dos itens e o histórico
//  • QuestItemDropService: itens de missão só caem para quem está precisando deles (ver drops.js)
const db = require('./db');
const G = require('./gamedata');
const SET = require('./settings');

const ALL = Object.keys(G.CLASSES);
const DEFAULTS = {
  // classes que exigem um herói de certo nível na mesma conta (0 = livre)
  creation: { dark_knight: 0, dark_wizard: 0, fairy_elf: 0, summoner: 0, magic_gladiator: 100, dark_lord: 150 },
  classItems: { dark_knight: 'broken_sword', dark_wizard: 'soul_of_wizard', fairy_elf: 'tear_of_elf', summoner: 'orb_of_summoning' },
  quests: {
    hero: { name: 'Quest of the Hero', npc: 'sevina', fromEvo: 0, toEvo: 1, classes: ['dark_knight', 'dark_wizard', 'fairy_elf', 'summoner'], level: 150, zen: 0,
      steps: [{ item: 'scroll_of_emperor', qty: 1 }, { item: '@class', qty: 1 }], enabled: true },
    emperor: { name: 'Quest of the Emperor', npc: 'marlon', fromEvo: 1, toEvo: 2, classes: ['dark_knight', 'dark_wizard', 'fairy_elf', 'summoner'], level: 250, zen: 2000000,
      steps: [{ item: 'flame_of_dbk', qty: 1 }, { item: 'horn_of_hell_maine', qty: 1 }, { item: 'feather_of_phoenix', qty: 1 }], enabled: true },
    lord: { name: 'Missão de Marlon', npc: 'marlon', fromEvo: 0, toEvo: 1, classes: ['magic_gladiator', 'dark_lord'], level: 200, zen: 1000000,
      steps: [{ item: 'flame_of_dbk', qty: 1 }, { item: 'horn_of_hell_maine', qty: 1 }], enabled: true },
  },
};
const NPC_NAME = { sevina: 'Priestess Sevina', marlon: 'Marlon' };
const QUEST_ITEMS = Object.keys(G.ITEM_BASES).filter((k) => G.ITEM_BASES[k].quest);

let H = null;
function cfg() { return SET.get('classes', DEFAULTS); }
async function init(helpers) { H = helpers; await SET.load('classes', DEFAULTS); }

const evoName = (cls, evo) => (G.EVOLUTIONS[cls] || [])[evo] || G.CLASSES[cls].name;

// ---------- criação de personagem ----------
async function creationCheck(accountId, cls) {
  const need = Number(cfg().creation[cls] || 0);
  if (!need) return null;
  const { rows } = await db.query('SELECT COALESCE(max(level), 0)::int AS lv FROM characters WHERE account_id = $1', [accountId]);
  if (rows[0].lv >= need) return null;
  return `${G.CLASSES[cls].name} é desbloqueado quando um herói da sua conta chega ao nível ${need} (o seu maior é ${rows[0].lv}).`;
}

// ---------- missões ----------
function stepItem(step, cls) { return step.item === '@class' ? cfg().classItems[cls] : step.item; }
function questFor(p, npc) {
  const q = cfg().quests;
  if (p.classQuest && q[p.classQuest.id]) return [p.classQuest.id, q[p.classQuest.id]];
  return Object.entries(q).find(([, x]) => x.enabled && x.classes.includes(p.cls) && x.fromEvo === p.evo && (!npc || x.npc === npc)) || null;
}
const count = (p, base) => p.items.filter((i) => i.base === base && !i.equipped && !i.vault).reduce((a, i) => a + (Number(i.qty) || 1), 0);
function atNpc(p, npc) { return !!(p.map && (p.map.def.npcs || []).some((n) => n.kind === npc)); }

// o item de missão ainda faz falta para este jogador? (só então ele pode cair)
function needs(p, base) {
  const cq = p.classQuest;
  if (!cq) return false;
  const q = cfg().quests[cq.id];
  if (!q) return false;
  let need = 0;
  q.steps.forEach((st, i) => { if (i >= cq.step && stepItem(st, p.cls) === base) need += st.qty; });
  return need > count(p, base);
}

function info(p, npc, sources) {
  const found = questFor(p, npc);
  const maxEvo = (G.EVOLUTIONS[p.cls] || []).length - 1;
  const base = { type: 'cqInfo', npc, npcName: NPC_NAME[npc] || npc, atNpc: atNpc(p, npc), cls: p.cls, evo: p.evo, className: evoName(p.cls, p.evo), maxEvo };
  if (!found) {
    const other = Object.values(cfg().quests).find((x) => x.enabled && x.classes.includes(p.cls) && x.fromEvo === p.evo);
    return { ...base, quest: null, msg: p.evo >= maxEvo ? `Você já é ${evoName(p.cls, p.evo)}, a evolução máxima da sua classe.` : other ? `Sua próxima evolução é com ${NPC_NAME[other.npc]}${other.npc === 'sevina' ? ', em Devias' : ', em Lorencia'}.` : 'Não há missão de evolução para você agora.' };
  }
  const [id, q] = found;
  const cq = p.classQuest && p.classQuest.id === id ? p.classQuest : null;
  const steps = q.steps.map((st, i) => {
    const item = stepItem(st, p.cls);
    const b = G.ITEM_BASES[item] || { name: item };
    return { i, item, name: b.name, icon: b.icon, ic: b.ic, rarity: b.rarity, qty: st.qty, have: count(p, item), done: !!cq && cq.step > i, current: !!cq && cq.step === i,
      where: (sources && sources.list[item]) || [] };
  });
  const reqs = [
    { text: `Nível ${q.level}`, ok: p.level >= q.level, now: `nível ${p.level}` },
    { text: `Classe ${evoName(p.cls, q.fromEvo)}`, ok: p.evo === q.fromEvo },
    { text: 'Personagem vivo', ok: !p.dead },
  ];
  if (q.zen) reqs.push({ text: `${q.zen.toLocaleString('pt-BR')} Zen na conclusão`, ok: p.zen >= q.zen });
  const allDelivered = !!cq && cq.step >= q.steps.length;
  return { ...base, quest: { id, name: q.name, npc: q.npc, npcName: NPC_NAME[q.npc], level: q.level, zen: q.zen, from: evoName(p.cls, q.fromEvo), to: evoName(p.cls, q.toEvo),
    started: !!cq, step: cq ? cq.step : 0, steps, reqs, allDelivered, canComplete: allDelivered && reqs.every((r) => r.ok) && atNpc(p, q.npc),
    canStart: !cq && reqs.slice(0, 3).every((r) => r.ok) && atNpc(p, q.npc), wrongNpc: q.npc !== npc } };
}

async function act(world, p, action, npc, sources) {
  const say = (ok, text) => p.send({ type: 'cqResult', ok, text });
  const found = questFor(p, npc);
  if (!found) return say(false, 'Não há missão de evolução para você aqui.');
  const [id, q] = found;
  if (p.dead) return say(false, 'Você está derrotado.');
  if (!atNpc(p, q.npc)) return say(false, `Fale com ${NPC_NAME[q.npc]}${q.npc === 'sevina' ? ', em Devias' : ', em Lorencia'}.`);
  if (p.evoBusy) return say(false, 'Espere a ação anterior terminar.');
  p.evoBusy = true;
  try {
    if (action === 'start') {
      if (p.classQuest) return say(false, 'Você já tem uma missão de evolução em andamento.');
      if (!q.classes.includes(p.cls) || p.evo !== q.fromEvo) return say(false, 'Esta missão não é para a sua classe.');
      if (p.level < q.level) return say(false, `Você precisa do nível ${q.level} para esta missão.`);
      p.classQuest = { id, step: 0, started: Date.now(), delivered: [] };
      await db.query('UPDATE characters SET class_quest = $2 WHERE id = $1 RETURNING id', [p.charId, JSON.stringify(p.classQuest)]);
      say(true, `Missão iniciada: ${q.name}. Traga ${q.steps.map((st) => `${st.qty}× ${G.ITEM_BASES[stepItem(st, p.cls)].name}`).join(', depois ')}.`);
    } else if (action === 'deliver') {
      const cq = p.classQuest;
      if (!cq || cq.id !== id) return say(false, 'Inicie a missão primeiro.');
      if (cq.step >= q.steps.length) return say(false, 'Todos os itens já foram entregues. Conclua a evolução.');
      const st = q.steps[cq.step];
      const item = stepItem(st, p.cls);
      const iq = G.ITEM_BASES[item];
      if (iq.questClasses && !iq.questClasses.includes(p.cls)) return say(false, 'Este item é da missão de outra classe.');
      const stacks = p.items.filter((i) => i.base === item && !i.equipped && !i.vault).sort((a, b) => Number(a.id) - Number(b.id));
      if (count(p, item) < st.qty) return say(false, `Você ainda não tem ${st.qty}× ${iq.name}.`);
      const plan = []; let need = st.qty;
      for (const it of stacks) { if (need <= 0) break; const qq = Number(it.qty) || 1; const t = Math.min(qq, need); plan.push({ it, take: t, left: qq - t }); need -= t; }
      const next = { ...cq, step: cq.step + 1, delivered: [...(cq.delivered || []), { item, qty: st.qty }] };
      await db.tx(async (qq) => {
        for (const t of plan) {
          const d = t.left > 0
            ? await qq('UPDATE items SET qty = qty - $3 WHERE id = $1 AND character_id = $2 AND qty > $3 RETURNING id', [t.it.id, p.charId, t.take])
            : await qq('DELETE FROM items WHERE id = $1 AND character_id = $2 AND equipped = FALSE RETURNING id', [t.it.id, p.charId]);
          if (!d.rows[0]) throw new Error('A bolsa mudou. Tente de novo.');
        }
        // a etapa só avança se ainda for a mesma (impede entregar duas vezes)
        const u = await qq("UPDATE characters SET class_quest = $2 WHERE id = $1 AND (class_quest->>'step')::int = $3 RETURNING id", [p.charId, JSON.stringify(next), cq.step]);
        if (!u.rows[0]) throw new Error('A missão mudou. Tente de novo.');
      });
      for (const t of plan) { if (t.left > 0) t.it.qty = t.left; else p.items = p.items.filter((i) => i !== t.it); }
      p.classQuest = next;
      say(true, next.step >= q.steps.length ? `Itens entregues! Agora conclua a evolução para ${evoName(p.cls, q.toEvo)}.` : `Entregou ${st.qty}× ${iq.name}. Próximo: ${G.ITEM_BASES[stepItem(q.steps[next.step], p.cls)].name}.`);
    } else if (action === 'complete') {
      const cq = p.classQuest;
      if (!cq || cq.id !== id || cq.step < q.steps.length) return say(false, 'Entregue todos os itens da missão primeiro.');
      if (p.level < q.level) return say(false, `Você precisa do nível ${q.level}.`);
      if (p.evo !== q.fromEvo) return say(false, 'Sua classe já mudou.');
      if (q.zen && p.zen < q.zen) return say(false, `Faltam ${(q.zen - p.zen).toLocaleString('pt-BR')} Zen para concluir.`);
      const toName = evoName(p.cls, q.toEvo);
      p.zen -= q.zen;
      try {
        await db.tx(async (qq) => {
          const u = await qq('UPDATE characters SET evo = $2, class_quest = NULL, zen = $4 WHERE id = $1 AND evo = $3 RETURNING id', [p.charId, q.toEvo, q.fromEvo, Math.round(p.zen)]);
          if (!u.rows[0]) throw new Error('Sua classe já mudou.');
          await qq('INSERT INTO class_evolutions (character_id, char_name, class, from_evo, to_evo, class_name, quest, items, zen) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id',
            [p.charId, p.name, p.cls, q.fromEvo, q.toEvo, toName, id, JSON.stringify(cq.delivered || []), q.zen]);
        });
      } catch (e) { p.zen += q.zen; throw e; }
      p.evo = q.toEvo; p.classQuest = null;
      p.recalc(); p.dirty = true;
      say(true, `Parabéns! Você agora é ${toName}. Novos poderes e equipamentos liberados.`);
      p.send({ type: 'evolved', className: toName, evo: p.evo });
      world.system(`${p.name} evoluiu para ${toName}!`);
      if (p.map) for (const o of p.map.players.values()) if (o !== p) o.send({ type: 'pj', ...world.pinfo(p) });
    } else if (action === 'abandon') {
      if (!p.classQuest) return say(false, 'Nenhuma missão em andamento.');
      p.classQuest = null;
      await db.query('UPDATE characters SET class_quest = NULL WHERE id = $1 RETURNING id', [p.charId]);
      say(true, 'Missão abandonada. Os itens já entregues não voltam.');
    } else return say(false, 'Ação inválida.');
  } catch (e) {
    console.error('[classes]', p.name, e.message);
    say(false, /mudou|bolsa/i.test(e.message) ? e.message : 'Não foi possível concluir agora. Nada foi gasto.');
  } finally { p.evoBusy = false; }
  p.send(p.charState());
  p.send(info(p, npc, sources));
  return undefined;
}

// ---------- administração ----------
function sanitize(i) {
  const out = { creation: {}, classItems: { ...DEFAULTS.classItems, ...(i.classItems || {}) }, quests: {} };
  for (const c of ALL) { const n = Math.round(Number((i.creation || {})[c] || 0)); if (!(n >= 0 && n <= G.LIMITS.maxLevel)) throw new Error(`${G.CLASSES[c].name}: nível de criação de 0 a ${G.LIMITS.maxLevel}.`); out.creation[c] = n; }
  for (const [k, cls] of Object.entries(out.classItems)) if (!ALL.includes(k) || !G.ITEM_BASES[cls] || !G.ITEM_BASES[cls].quest) throw new Error('Item de classe inválido.');
  for (const id of Object.keys(DEFAULTS.quests)) {
    const d = DEFAULTS.quests[id], q = (i.quests || {})[id] || d;
    const lv = Math.round(Number(q.level)), zen = Math.round(Number(q.zen));
    if (!(lv >= 1 && lv <= G.LIMITS.maxLevel)) throw new Error(`${d.name}: nível de 1 a ${G.LIMITS.maxLevel}.`);
    if (!(zen >= 0 && zen <= 1e12)) throw new Error(`${d.name}: Zen inválido.`);
    const steps = (Array.isArray(q.steps) ? q.steps : d.steps).map((st) => ({ item: st.item === '@class' ? '@class' : String(st.item), qty: Math.max(1, Math.min(10, Math.round(Number(st.qty) || 1))) }));
    if (!steps.length || steps.length > 6) throw new Error(`${d.name}: de 1 a 6 etapas.`);
    for (const st of steps) if (st.item !== '@class' && !(G.ITEM_BASES[st.item] && G.ITEM_BASES[st.item].quest)) throw new Error(`${d.name}: ${st.item} não é item de missão.`);
    out.quests[id] = { ...d, level: lv, zen, steps, enabled: q.enabled !== false };
  }
  return out;
}
async function saveConfig(i) { const c = sanitize(i); await SET.save('classes', c); return c; }
async function history(limit = 60) {
  const { rows } = await db.query('SELECT char_name, class, from_evo, to_evo, class_name, quest, items, zen, created_at FROM class_evolutions ORDER BY id DESC LIMIT $1', [Math.min(300, limit)]);
  return rows;
}
function publicRules() { return { creation: cfg().creation, evolutions: G.EVOLUTIONS }; }

module.exports = { init, cfg, creationCheck, info, act, needs, saveConfig, history, publicRules, evoName, QUEST_ITEMS, NPC_NAME, DEFAULTS };
