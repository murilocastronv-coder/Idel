'use strict';
// Equipamentos por classe: regras por item (classes, evolução, nível, atributos, lugar no corpo), validadas no servidor.
//  • ItemClassCompatibility / EquipmentRequirementService: regra padrão do catálogo + ajustes do administrador (tabela item_rules)
//  • EquipmentSlotManager: em que lugar cada item entra (anéis: esquerdo ou direito; duas mãos x escudo)
//  • EquipmentValidationService / EquipmentSecurity: todas as checagens antes de equipar e registro das recusas
const db = require('./db');
const G = require('./gamedata');

const CLASSES = Object.keys(G.CLASSES);
const SLOTS = G.EQUIP_SLOTS;
const SLOT_PT = { helm: 'Elmo', armor: 'Armadura', pants: 'Calças', gloves: 'Luvas', boots: 'Botas', weapon: 'Arma', shield: 'Escudo', wings: 'Asas/Capa', necklace: 'Colar', ring: 'Anel', ring2: 'Anel' };
// grupos em que o administrador pode trocar o lugar de um item
const SLOT_GROUPS = [['helm', 'armor', 'pants', 'gloves', 'boots'], ['necklace', 'ring'], ['weapon'], ['shield'], ['wings']];
const SHIELD_CLASSES = ['dark_knight', 'dark_wizard', 'dark_lord'];
const STAT_OF_KIND = { sword: 'str', scepter: 'str', staff: 'ene', book: 'ene', bow: 'agi', shield: 'str' };
const STAT_PT = { str: 'Força', agi: 'Agilidade', ene: 'Energia', vit: 'Vitalidade', cmd: 'Comando' };

let overrides = new Map();

const equipable = (b) => b && SLOTS.includes(b.slot === 'ring' ? 'ring' : b.slot);

// regra padrão, tirada do catálogo
function defaultRule(base) {
  const b = G.ITEM_BASES[base];
  const r = { classes: CLASSES.slice(), minEvo: 0, level: b.req || 1, str: 0, agi: 0, ene: 0, vit: 0, cmd: 0, slot: b.slot, enabled: true };
  if (b.slot === 'weapon') {
    r.classes = CLASSES.filter((c) => (G.CLASS_WEAPONS[c] || []).includes(b.kind));
    const st = STAT_OF_KIND[b.kind];
    if (st) r[st] = Math.round((b.req || 1) * 2 + 10);
  } else if (b.slot === 'shield') {
    r.classes = SHIELD_CLASSES.slice();
    r.str = Math.round((b.req || 1) * 1.5 + 10);
  } else if (b.classes) {
    r.classes = b.classes.slice();   // asas e capas
  }
  return r;
}

function rule(base) {
  const d = defaultRule(base);
  const o = overrides.get(base);
  return o ? { ...d, ...o } : d;
}

// o que a dica do item mostra (o navegador compara com o personagem só para exibir; quem decide é o servidor)
function reqs(base) {
  const b = G.ITEM_BASES[base];
  if (!equipable(b)) return null;
  const r = rule(base);
  return { classes: r.classes, minEvo: r.minEvo, level: r.level, str: r.str, agi: r.agi, ene: r.ene, vit: r.vit, cmd: r.cmd, slot: r.slot, enabled: r.enabled, twoHand: !!b.twoHand };
}

const eqSlotOf = (it) => it.eq_slot || (G.ITEM_BASES[it.base] ? G.ITEM_BASES[it.base].slot : null);

// em quais lugares o item pode entrar
function slotsFor(base) {
  const r = rule(base);
  return r.slot === 'ring' ? ['ring', 'ring2'] : [r.slot];
}

// requisitos do item x personagem (sem olhar o resto do corpo); devolve o motivo ou null
function meets(p, it) {
  const b = G.ITEM_BASES[it.base];
  if (!b) return 'Item desconhecido.';
  if (it.vault) return 'Retire o item do baú antes de equipar.';
  if (b.slot === 'material' || b.slot === 'box' || b.slot === 'quest') return b.slot === 'box' ? 'Toque na caixa e em Abrir para ver o prêmio.' : b.slot === 'quest' ? 'Itens de missão são entregues ao NPC da missão.' : 'Este item é um material: use na Chaos Machine, com o Chaos Goblin em Lorencia.';
  if (!equipable(b)) return 'Este item não pode ser equipado.';
  const r = rule(it.base);
  if (!r.enabled) return 'Este item está desativado no momento.';
  if (it.locked) return 'Este item está bloqueado e não pode ser equipado.';
  if (!r.classes.includes(p.cls)) return b.cat === 'cape' ? 'Só o Dark Lord usa capas.' : 'Sua classe não pode utilizar este equipamento.';
  if ((p.evo || 0) < r.minEvo) return `Você precisa evoluir sua classe para ${G.EVOLUTIONS[p.cls][Math.min(r.minEvo, G.EVOLUTIONS[p.cls].length - 1)]} para utilizar este item.`;
  if (p.level < r.level) return `Nível insuficiente para equipar este equipamento (precisa do nível ${r.level}).`;
  for (const k of ['str', 'agi', 'ene', 'vit', 'cmd']) if (r[k] && (p.stats[k] || 0) < r[k]) return `${STAT_PT[k]} insuficiente (precisa de ${r[k]}).`;
  return null;
}

// todas as checagens; devolve { ok, slot } ou { ok: false, reason }
function check(p, it, wanted) {
  const b = G.ITEM_BASES[it.base];
  if (!b) return { ok: false, reason: 'Item desconhecido.' };
  if (!p.items.includes(it)) return { ok: false, reason: 'Este item não está na sua bolsa.' };
  const why = meets(p, it);
  if (why) return { ok: false, reason: why };
  const allowed = slotsFor(it.base);
  let slot = wanted;
  if (slot && !allowed.includes(slot)) return { ok: false, reason: 'Este item não pode ser equipado neste lugar.' };
  if (!slot) {
    // anel: o lugar vazio primeiro
    slot = allowed.find((s) => !p.items.some((i) => i.equipped && eqSlotOf(i) === s)) || allowed[0];
  }
  // duas mãos x escudo
  if (slot === 'shield') {
    const w = p.items.find((i) => i.equipped && eqSlotOf(i) === 'weapon');
    if (w && G.ITEM_BASES[w.base] && G.ITEM_BASES[w.base].twoHand) return { ok: false, reason: 'Sua arma usa as duas mãos: tire a arma de duas mãos para usar um escudo.' };
  }
  if (slot === 'weapon' && b.twoHand && p.items.some((i) => i.equipped && eqSlotOf(i) === 'shield')) {
    return { ok: false, reason: 'Esta arma usa as duas mãos: tire o escudo antes de equipá-la.' };
  }
  return { ok: true, slot };
}

function logDenial(p, base, reason) {
  db.query('INSERT INTO equip_log (character_id, char_name, item, reason) VALUES ($1,$2,$3,$4) RETURNING id', [p.charId, p.name, base, reason]).catch(() => {});
}

async function init() {
  try {
    const { rows } = await db.query('SELECT * FROM item_rules');
    overrides = new Map(rows.filter((r) => G.ITEM_BASES[r.base]).map((r) => [r.base, fromRow(r)]));
  } catch (e) { console.error('[equip] regras:', e.message); }
}

function fromRow(r) {
  return { classes: String(r.classes || '').split(',').filter((c) => CLASSES.includes(c)), minEvo: r.min_evo, level: r.min_level ?? G.ITEM_BASES[r.base].req,
    str: r.req_str, agi: r.req_agi, ene: r.req_ene, vit: r.req_vit, cmd: r.req_cmd, slot: r.slot || G.ITEM_BASES[r.base].slot, enabled: r.enabled };
}

// ---------- administração ----------
function sanitize(base, i) {
  const b = G.ITEM_BASES[base];
  if (!equipable(b)) throw new Error(`${base}: não é um item equipável.`);
  const n = (v, a, z, f) => { const x = Math.round(Number(v)); if (!Number.isFinite(x) || x < a || x > z) throw new Error(`${b.name}: ${f} de ${a} a ${z}.`); return x; };
  const classes = (Array.isArray(i.classes) ? i.classes : String(i.classes || '').split(',')).map((c) => String(c).trim()).filter((c) => CLASSES.includes(c));
  if (!classes.length) throw new Error(`${b.name}: escolha pelo menos uma classe.`);
  if (b.cat === 'cape' && classes.some((c) => c !== 'dark_lord')) throw new Error(`${b.name}: capas são só do Dark Lord.`);
  const slot = i.slot || b.slot;
  const group = SLOT_GROUPS.find((g) => g.includes(b.slot));
  if (!group || !group.includes(slot)) throw new Error(`${b.name}: o lugar "${SLOT_PT[slot] || slot}" não combina com este tipo de item.`);
  if (b.set && slot !== b.slot) throw new Error(`${b.name}: peças de conjunto ficam no lugar original (a aparência depende disso).`);
  return { classes, minEvo: n(i.minEvo || 0, 0, 2, 'evolução'), level: n(i.level ?? b.req, 1, G.LIMITS.maxLevel, 'nível'),
    str: n(i.str || 0, 0, 65000, 'força'), agi: n(i.agi || 0, 0, 65000, 'agilidade'), ene: n(i.ene || 0, 0, 65000, 'energia'),
    vit: n(i.vit || 0, 0, 65000, 'vitalidade'), cmd: n(i.cmd || 0, 0, 65000, 'comando'), slot, enabled: i.enabled !== false };
}

async function saveRule(base, input) {
  const r = sanitize(base, input);
  await db.query(`INSERT INTO item_rules (base, classes, min_evo, min_level, req_str, req_agi, req_ene, req_vit, req_cmd, slot, enabled, updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, now())
    ON CONFLICT (base) DO UPDATE SET classes=EXCLUDED.classes, min_evo=EXCLUDED.min_evo, min_level=EXCLUDED.min_level, req_str=EXCLUDED.req_str, req_agi=EXCLUDED.req_agi,
      req_ene=EXCLUDED.req_ene, req_vit=EXCLUDED.req_vit, req_cmd=EXCLUDED.req_cmd, slot=EXCLUDED.slot, enabled=EXCLUDED.enabled, updated_at=now() RETURNING base`,
  [base, r.classes.join(','), r.minEvo, r.level, r.str, r.agi, r.ene, r.vit, r.cmd, r.slot, r.enabled]);
  overrides.set(base, r);
  return r;
}

async function resetRule(base) {
  await db.query('DELETE FROM item_rules WHERE base = $1 RETURNING base', [base]);
  overrides.delete(base);
}

// importação em lote: [{ base, classes, minEvo, level, str, ... }] — valida tudo antes de gravar qualquer coisa
async function importRules(list) {
  if (!Array.isArray(list) || !list.length) throw new Error('Envie uma lista de regras.');
  if (list.length > 500) throw new Error('No máximo 500 regras por vez.');
  const clean = list.map((x) => { if (!G.ITEM_BASES[x.base]) throw new Error(`Item desconhecido: ${x.base}`); return [x.base, sanitize(x.base, x)]; });
  for (const [base, r] of clean) await saveRule(base, r);
  return clean.length;
}

// teste: este item, com esta classe/evolução/nível/atributos
function test(base, cls, evo, level, stats) {
  const b = G.ITEM_BASES[base];
  if (!b) throw new Error('Item desconhecido.');
  const fake = { cls, evo: Number(evo) || 0, level: Number(level) || 1, stats: { str: 0, agi: 0, ene: 0, vit: 0, cmd: 0, ...stats }, items: [] };
  const it = { base, equipped: false };
  fake.items.push(it);
  const r = check(fake, it);
  return { ok: r.ok, reason: r.ok ? `Pode equipar (${SLOT_PT[r.slot] || r.slot}).` : r.reason, rule: rule(base) };
}

function adminView() {
  return {
    classes: CLASSES.map((c) => ({ id: c, name: G.CLASSES[c].name, evos: G.EVOLUTIONS[c] })), slots: SLOTS.filter((s) => s !== 'ring2'), slotNames: SLOT_PT,
    items: Object.entries(G.ITEM_BASES).filter(([, b]) => equipable(b)).map(([id, b]) => ({ id, name: b.name, slot: b.slot, kind: b.kind || null, req: b.req, custom: overrides.has(id), rule: rule(id), def: defaultRule(id) })),
  };
}

async function denials(limit = 80) {
  const { rows } = await db.query('SELECT char_name, item, reason, created_at FROM equip_log ORDER BY id DESC LIMIT $1', [Math.min(300, limit)]);
  return rows;
}

module.exports = { init, check, meets, rule, reqs, slotsFor, eqSlotOf, logDenial, saveRule, resetRule, importRules, test, adminView, denials, SLOT_PT, SLOTS, equipable };
