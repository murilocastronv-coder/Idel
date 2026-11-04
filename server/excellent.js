'use strict';
// Excellent semi-full gear: rolls happen on the server and the selected options are stored on each item.
const SET = require('./settings');
const G = require('./gamedata');

const DEFINITIONS = {
  defense_success: { name: 'Sucesso de defesa', unit: '%', min: 2, max: 8, effect: 'defenseSuccess' },
  defense_add: { name: 'Defesa adicional', unit: '', min: 2, max: 12, effect: 'def' },
  damage_reduction: { name: 'Diminui o dano recebido', unit: '%', min: 1, max: 4, effect: 'reduction' },
  reflect_damage: { name: 'Reflete dano recebido', unit: '%', min: 1, max: 5, effect: 'reflect' },
  max_hp: { name: 'Vida máxima', unit: '', min: 10, max: 80, effect: 'hp' },
  hp_recovery: { name: 'Recuperação de HP ao derrotar monstros', unit: '%', min: 1, max: 5, effect: 'hpRecovery' },
  attack_speed: { name: 'Velocidade de ataque', unit: '', min: 2, max: 8, effect: 'attackSpeed' },
  critical_damage: { name: 'Dano crítico', unit: '%', min: 2, max: 10, effect: 'critDamage' },
  critical_chance: { name: 'Chance de dano crítico', unit: '%', min: 1, max: 5, effect: 'critChance' },
  excellent_damage: { name: 'Dano excelente', unit: '%', min: 2, max: 10, effect: 'damagePct' },
  excellent_chance: { name: 'Chance de dano excelente', unit: '%', min: 1, max: 5, effect: 'excellentChance' },
  hp_on_kill: { name: 'Recupera HP ao derrotar monstros', unit: '%', min: 1, max: 5, effect: 'hpOnKill' },
  mana_on_kill: { name: 'Recupera Mana ao derrotar monstros', unit: '%', min: 1, max: 5, effect: 'mpOnKill' },
  shield_luck: { name: 'Luck: sucesso com joias', unit: '%', min: 5, max: 25, effect: 'jewelLuck' },
  shield_crit: { name: 'Luck: dano crítico', unit: '%', min: 3, max: 5, effect: 'critDamage' },
  defense_skill: { name: 'Defense Skill (Mana: 30)', unit: '', min: 3, max: 15, effect: 'def' },
  shield_success: { name: 'Chance de sucesso na defesa', unit: '', min: 10, max: 35, effect: 'defenseSuccess' },
};
const DEF_IDS = Object.keys(DEFINITIONS);
const POOLS = {
  armor: ['defense_success', 'defense_add', 'damage_reduction', 'reflect_damage', 'max_hp', 'hp_recovery'],
  gloves: ['attack_speed', 'critical_damage', 'critical_chance', 'excellent_damage', 'excellent_chance', 'mana_on_kill'],
  boots: ['max_hp', 'hp_recovery', 'damage_reduction', 'defense_success', 'reflect_damage', 'mana_on_kill'],
  shield: ['defense_success', 'defense_add', 'damage_reduction', 'reflect_damage', 'shield_luck', 'shield_crit', 'defense_skill', 'shield_success', 'max_hp'],
  weapon: ['critical_damage', 'critical_chance', 'excellent_damage', 'excellent_chance', 'attack_speed', 'hp_on_kill', 'mana_on_kill'],
};
const DEFAULTS = { enabled: true, minOptions: 2, maxOptions: 4, pools: Object.fromEntries(Object.entries(POOLS).map(([k, ids]) => [k, ids.map((id) => ({ id, weight: 1, min: DEFINITIONS[id].min, max: DEFINITIONS[id].max }))])) };
let H = null;
const config = () => SET.get('excellent_options', DEFAULTS);
const category = (slot) => slot === 'weapon' ? 'weapon' : slot === 'shield' ? 'shield' : slot === 'gloves' ? 'gloves' : slot === 'boots' ? 'boots' : ['helm', 'armor', 'pants'].includes(slot) ? 'armor' : null;

function cleanConfig(input) {
  const n = (v, lo, hi, label) => { const x = Math.round(Number(v)); if (!Number.isFinite(x) || x < lo || x > hi) throw new Error(`${label}: escolha um valor entre ${lo} e ${hi}.`); return x; };
  const minOptions = n(input.minOptions ?? DEFAULTS.minOptions, 2, 4, 'Mínimo de opções');
  const maxOptions = n(input.maxOptions ?? DEFAULTS.maxOptions, minOptions, 4, 'Máximo de opções');
  const pools = {};
  for (const [slot, ids] of Object.entries(POOLS)) {
    const submitted = Array.isArray(input.pools?.[slot]) ? input.pools[slot] : DEFAULTS.pools[slot];
    const byId = new Map(submitted.map((x) => [String(x.id), x]));
    pools[slot] = ids.map((id) => {
      const x = byId.get(id) || {};
      return { id, weight: n(x.weight ?? 1, 0, 1000, `${DEFINITIONS[id].name} peso`), min: n(x.min ?? DEFINITIONS[id].min, 0, 10000, `${DEFINITIONS[id].name} mínimo`), max: n(x.max ?? DEFINITIONS[id].max, n(x.min ?? DEFINITIONS[id].min, 0, 10000, `${DEFINITIONS[id].name} mínimo`), 10000, `${DEFINITIONS[id].name} máximo`) };
    });
    if (pools[slot].filter((x) => x.weight > 0).length < minOptions) throw new Error(`A categoria ${slot} precisa ter pelo menos ${minOptions} opções ativas.`);
  }
  return { enabled: input.enabled !== false, minOptions, maxOptions, pools };
}
async function init(helpers) { H = helpers; await SET.load('excellent_options', DEFAULTS); }
function roll(base) {
  const c = config();
  const slot = category((G.ITEM_BASES[base] || {}).slot);
  if (!c.enabled || !slot) return [];
  const pool = (c.pools[slot] || []).filter((x) => x.weight > 0);
  if (!pool.length) return [];
  const count = Math.min(pool.length, c.minOptions + Math.floor(Math.random() * (c.maxOptions - c.minOptions + 1)));
  const remaining = pool.slice(), out = [];
  while (out.length < count && remaining.length) {
    const total = remaining.reduce((s, x) => s + x.weight, 0);
    let r = Math.random() * total, at = remaining.length - 1;
    for (let i = 0; i < remaining.length; i++) { r -= remaining[i].weight; if (r < 0) { at = i; break; } }
    const choice = remaining.splice(at, 1)[0];
    const def = DEFINITIONS[choice.id];
    out.push({ id: choice.id, name: def.name, value: choice.min + Math.floor(Math.random() * (choice.max - choice.min + 1)), unit: def.unit, effect: def.effect });
  }
  return out;
}
// set do ADM: 6 opções excelentes no valor máximo, para qualquer peça (inclui anel, pendente e asa)
const FULL6 = {
  armor: POOLS.armor,
  gloves: POOLS.gloves,
  boots: POOLS.boots,
  weapon: ['critical_damage', 'critical_chance', 'excellent_damage', 'excellent_chance', 'attack_speed', 'hp_on_kill'],
  shield: ['defense_success', 'defense_add', 'damage_reduction', 'reflect_damage', 'max_hp', 'shield_luck'],
  ring: ['max_hp', 'defense_success', 'damage_reduction', 'reflect_damage', 'hp_recovery', 'defense_add'],
  necklace: ['excellent_damage', 'critical_damage', 'critical_chance', 'excellent_chance', 'attack_speed', 'mana_on_kill'],
  wings: ['max_hp', 'damage_reduction', 'defense_add', 'reflect_damage', 'excellent_damage', 'critical_damage'],
};
function full6(base) {
  const slot = (G.ITEM_BASES[base] || {}).slot;
  const ids = FULL6[category(slot) || slot];
  if (!ids) return [];
  return ids.map((id) => { const d = DEFINITIONS[id]; return { id, name: d.name, value: d.max, unit: d.unit, effect: d.effect }; });
}
function effects(options) {
  const out = {};
  for (const x of Array.isArray(options) ? options : []) {
    const id = DEF_IDS.includes(x.id) ? x.id : null;
    if (!id) continue;
    const def = DEFINITIONS[id], value = Math.max(0, Number(x.value) || 0);
    const effect = def.effect === 'hpRecovery' ? 'hpOnKill' : def.effect === 'excellentChance' ? 'critChance' : def.effect;
    out[effect] = (out[effect] || 0) + value;
  }
  return out;
}
function adminView() { return { config: config(), definitions: DEFINITIONS, pools: POOLS }; }
async function save(input) { const c = cleanConfig(input || {}); await SET.save('excellent_options', c); return c; }
module.exports = { init, roll, full6, effects, adminView, save, cleanConfig, DEFAULTS };
