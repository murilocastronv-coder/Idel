'use strict';
// Dados de jogo compartilhados entre servidor e página (via /api/gamedata).

const CLASSES = {
  dark_knight: {
    name: 'Dark Knight', role: 'Guerreiro corpo a corpo',
    desc: 'Mestre da espada e do escudo. Muita vida, golpes giratórios e grande resistência na linha de frente.',
    weapon: 'sword', base: { str: 28, agi: 20, vit: 25, ene: 10, cmd: 0 }, difficulty: 1,
    skills: ['Golpe Giratório', 'Corte Ascendente', 'Investida', 'Grito de Guerra', 'Lâmina Trovejante'],
    palette: { hair: '#5a3a1c', armor: '#8a93a6', armorDark: '#4c5366', cape: '#7a1e1e', pants: '#3b3f4d', boots: '#2a1d14', belt: '#c99a2e', accent: '#e8edf5' },
  },
  dark_wizard: {
    name: 'Dark Wizard', role: 'Mago elemental',
    desc: 'Canaliza fogo, gelo e energia arcana. Dano em área devastador, porém frágil em combate próximo.',
    weapon: 'staff', base: { str: 18, agi: 18, vit: 15, ene: 30, cmd: 0 }, difficulty: 2,
    skills: ['Bola de Fogo', 'Lança de Gelo', 'Relâmpago', 'Meteoro', 'Escudo de Mana'],
    palette: { hair: '#d8d8e8', armor: '#3b2a7a', armorDark: '#24184f', cape: '#24184f', pants: '#2b2060', boots: '#1d1430', belt: '#d4a73a', accent: '#59c7ff' },
  },
  fairy_elf: {
    name: 'Fairy Elf', role: 'Arqueira e suporte',
    desc: 'Flechas mágicas de longo alcance e bênçãos que fortalecem o grupo. Ideal para farm em grupo.',
    weapon: 'bow', base: { str: 22, agi: 25, vit: 20, ene: 15, cmd: 0 }, difficulty: 1,
    skills: ['Flecha Tripla', 'Chuva de Flechas', 'Bênção de Defesa', 'Cura', 'Flecha de Gelo'],
    palette: { hair: '#f2d36b', armor: '#3f8a4a', armorDark: '#25592d', cape: '#a7e07a', pants: '#2f6b3a', boots: '#5a3a1c', belt: '#c99a2e', accent: '#bff07f' },
  },
  magic_gladiator: {
    name: 'Magic Gladiator', role: 'Híbrido de magia e armas',
    desc: 'Combina lâmina e feitiço. Sem escudo, mas com combos rápidos e dano elemental na espada.',
    weapon: 'sword', base: { str: 26, agi: 26, vit: 26, ene: 26, cmd: 0 }, difficulty: 2,
    skills: ['Lâmina de Fogo', 'Corte de Energia', 'Explosão Arcana', 'Golpe Duplo', 'Fúria Elemental'],
    palette: { hair: '#c43a2a', armor: '#6b2a2a', armorDark: '#401818', cape: '#2a2a2a', pants: '#2a2a2a', boots: '#1a1a1a', belt: '#d4a73a', accent: '#ff7a3d' },
  },
  dark_lord: {
    name: 'Dark Lord', role: 'Comandante sombrio',
    desc: 'Lidera com o cetro e um corvo companheiro. Atributo Comando fortalece aliados e invocações.',
    weapon: 'scepter', base: { str: 26, agi: 20, vit: 20, ene: 15, cmd: 25 }, difficulty: 3,
    skills: ['Comando do Corvo', 'Fogo Sombrio', 'Explosão Imperial', 'Aura do Senhor', 'Tempestade Negra'],
    palette: { hair: '#1a1a1a', armor: '#2a2a33', armorDark: '#16161c', cape: '#5b1a6b', pants: '#1f1f26', boots: '#111', belt: '#e0b84a', accent: '#c06bff' },
  },
  summoner: {
    name: 'Summoner', role: 'Invocadora de espíritos',
    desc: 'Maldições, espíritos e magia sombria. Enfraquece inimigos e invoca aliados etéreos.',
    weapon: 'book', base: { str: 21, agi: 21, vit: 18, ene: 23, cmd: 0 }, difficulty: 3,
    skills: ['Espírito Sombrio', 'Maldição da Fraqueza', 'Corrente Etérea', 'Sono Profundo', 'Chamado das Almas'],
    palette: { hair: '#7a3fb8', armor: '#5a2b5e', armorDark: '#361a3a', cape: '#2e1a40', pants: '#3a1f3e', boots: '#24122a', belt: '#cfa04a', accent: '#ff7ad9' },
  },
};

// Mapas do mundo (imagens em public/assets/maps/<id>.jpg). "playable" = já dá para entrar e lutar.
const MAPS = [
  { id: 'lorencia', name: 'Lorencia', type: 'Cidade inicial', level: 1, safe: true, playable: true },
  { id: 'noria', name: 'Noria', type: 'Floresta dos elfos', level: 1, playable: true },
  { id: 'devias', name: 'Devias', type: 'Região congelada', level: 10, playable: true },
  { id: 'dungeon', name: 'Dungeon', type: 'Masmorra · Boss: Rei Esqueleto', level: 25, playable: true },
  { id: 'elbeland', name: 'Elbeland', type: 'Cidade nas nuvens', level: 30, safe: true },
  { id: 'dungeon_2', name: 'Dungeon 2', type: 'Masmorra de lava', level: 45 },
  { id: 'dungeon_3', name: 'Dungeon 3', type: 'Coração da lava', level: 60 },
  { id: 'atlans', name: 'Atlans', type: 'Ruínas submersas', level: 80 },
  { id: 'lost_tower', name: 'Lost Tower', type: 'Torre amaldiçoada', level: 100 },
  { id: 'tarkan', name: 'Tarkan', type: 'Deserto de ossos', level: 130 },
  { id: 'icarus', name: 'Icarus', type: 'Ilhas no céu', level: 160 },
  { id: 'blood_castle', name: 'Blood Castle', type: 'Evento', level: 50 },
  { id: 'devil_square', name: 'Devil Square', type: 'Evento', level: 70 },
  { id: 'chaos_castle', name: 'Chaos Castle', type: 'Evento PvP', level: 90, pvp: true },
  { id: 'kalima', name: 'Kalima', type: 'Território demoníaco', level: 190 },
  { id: 'crywolf', name: 'Crywolf', type: 'Floresta gelada', level: 220 },
  { id: 'kantru', name: 'Kantru', type: 'Ruínas antigas', level: 250 },
  { id: 'aida', name: 'Aida', type: 'Floresta sombria', level: 280 },
  { id: 'kanturu_ruins', name: 'Kanturu Ruins', type: 'Ruínas de cristal', level: 310 },
  { id: 'barracks', name: 'Barracks', type: 'Quartel de guerra', level: 350 },
  { id: 'refuge', name: 'Refuge', type: 'Santuário sombrio', level: 380 },
  { id: 'swamp_of_peace', name: 'Swamp of Peace', type: 'Pântano', level: 410 },
  { id: 'vulcanus', name: 'Vulcanus', type: 'Zona de PvP', level: 440, pvp: true },
  { id: 'raklion', name: 'Raklion', type: 'Deserto de pedra', level: 480 },
  { id: 'crywolf_fortress', name: 'Crywolf Fortress', type: 'Fortaleza de guerra', level: 520 },
  { id: 'land_of_trials', name: 'Land of Trials', type: 'Área de desafios', level: 560 },
  { id: 'acheron', name: 'Acheron', type: 'Abismo de cristais', level: 620 },
  { id: 'debenter', name: 'Debenter', type: 'Cidadela de pedra', level: 680 },
  { id: 'nars', name: 'Nars', type: 'Geleiras eternas', level: 750 },
];

const RARITIES = [
  { id: 'common', name: 'Comum', color: '#c8c8c8' },
  { id: 'uncommon', name: 'Incomum', color: '#5fd35f' },
  { id: 'rare', name: 'Raro', color: '#4aa3ff' },
  { id: 'epic', name: 'Épico', color: '#b45cff' },
  { id: 'legendary', name: 'Lendário', color: '#ffb02e' },
  { id: 'ancestral', name: 'Ancestral', color: '#ff4d4d' },
];

const ITEMS = [
  { name: 'Espada Curta', icon: 'sword', rarity: 'common', slot: 'Arma', stat: 'Dano 6–11' },
  { name: 'Escudo de Carvalho', icon: 'shield', rarity: 'common', slot: 'Escudo', stat: 'Defesa +8' },
  { name: 'Elmo de Bronze', icon: 'helm', rarity: 'uncommon', slot: 'Capacete', stat: 'Defesa +12' },
  { name: 'Cajado de Cristal', icon: 'staff', rarity: 'rare', slot: 'Arma', stat: 'Magia +18%' },
  { name: 'Arco Élfico', icon: 'bow', rarity: 'rare', slot: 'Arma', stat: 'Dano 22–30' },
  { name: 'Armadura do Dragão', icon: 'armor', rarity: 'epic', slot: 'Armadura', stat: 'Defesa +64' },
  { name: 'Anel do Vento', icon: 'ring', rarity: 'epic', slot: 'Anel', stat: 'Velocidade +7' },
  { name: 'Cetro Imperial', icon: 'scepter', rarity: 'legendary', slot: 'Arma', stat: 'Comando +40' },
  { name: 'Asas do Crepúsculo', icon: 'wings', rarity: 'legendary', slot: 'Asas', stat: 'Dano +25% / Absorção 15%' },
  { name: 'Joia da Bênção', icon: 'jewel', rarity: 'rare', slot: 'Joia', stat: 'Melhora item até +6' },
  { name: 'Colar Ancestral', icon: 'necklace', rarity: 'ancestral', slot: 'Colar', stat: 'Todos atributos +30' },
  { name: 'Lâmina Ancestral', icon: 'sword', rarity: 'ancestral', slot: 'Arma', stat: 'Dano 310–388' },
];

const LIMITS = { maxCharactersPerAccount: 5, maxLevel: 1000 };

// ======================= MUNDO JOGÁVEL =======================

// Monstros: atributos usados pelo servidor (autoridade do combate)
const MONSTERS = {
  slime: { name: 'Geleia Verde', sprite: 'slime', level: 1, hp: 40, dmg: 4, def: 0, exp: 14, zen: [5, 15], speed: 28, range: 18, atkMs: 1600, aggro: 0, drop: 0.08, size: 1 },
  goblin: { name: 'Goblin', sprite: 'goblin', level: 4, hp: 95, dmg: 8, def: 2, exp: 32, zen: [10, 30], speed: 42, range: 20, atkMs: 1400, aggro: 70, drop: 0.10, size: 1 },
  spider: { name: 'Aranha Sombria', sprite: 'spider', level: 10, hp: 280, dmg: 17, def: 6, exp: 100, zen: [30, 80], speed: 55, range: 20, atkMs: 1300, aggro: 90, drop: 0.12, size: 1 },
  goblin_elite: { name: 'Chefe Goblin', sprite: 'goblin', tint: 'elite', level: 14, hp: 900, dmg: 30, def: 12, exp: 380, zen: [120, 260], speed: 45, range: 24, atkMs: 1500, aggro: 110, drop: 0.35, size: 1.5, elite: true },
  skeleton: { name: 'Esqueleto Guerreiro', sprite: 'skeleton', level: 25, hp: 760, dmg: 40, def: 16, exp: 330, zen: [80, 200], speed: 50, range: 22, atkMs: 1400, aggro: 100, drop: 0.14, size: 1 },
  skeleton_king: { name: 'Rei Esqueleto', sprite: 'skeleton_king', level: 35, hp: 22000, dmg: 95, def: 30, exp: 26000, zen: [5000, 10000], speed: 38, range: 34, atkMs: 1800, aggro: 170, drop: 1, size: 2.2, boss: true, respawnMs: 10 * 60 * 1000 },
};

// Mapas abertos agora (os outros aparecem na galeria como "em breve")
const WORLD = {
  lorencia: { name: 'Lorencia', theme: 'town', w: 800, h: 560, safe: true, minLevel: 1, spawn: [400, 300],
    npcs: [{ id: 'shop', name: 'Mercadora Pasi', x: 470, y: 250 }], groups: [] },
  noria: { name: 'Noria', theme: 'noria', w: 1200, h: 800, minLevel: 1, spawn: [120, 400],
    groups: [{ type: 'slime', count: 14 }, { type: 'goblin', count: 7 }] },
  devias: { name: 'Devias', theme: 'snow', w: 1200, h: 800, minLevel: 10, spawn: [120, 400],
    groups: [{ type: 'spider', count: 12 }, { type: 'goblin_elite', count: 2 }] },
  dungeon: { name: 'Dungeon', theme: 'dungeon', w: 1200, h: 800, minLevel: 25, spawn: [120, 400],
    groups: [{ type: 'skeleton', count: 14 }], boss: { type: 'skeleton_king', x: 950, y: 400 } },
};

// Habilidades: ataque básico + 4 poderes por classe (níveis 1, 5, 15 e 30).
// mult = multiplicador de dano; aoe = raio; buff = reforço temporário (dmg ou def).
const SKILLS = {
  dark_knight: [
    { id: 'basic', name: 'Golpe', mult: 1, mana: 0, cd: 0, range: 26, fx: 'slash' },
    { id: 'uppercut', name: 'Corte Ascendente', mult: 1.8, mana: 8, cd: 3000, range: 28, fx: 'slash', lvl: 1 },
    { id: 'whirl', name: 'Golpe Giratório', mult: 1.3, mana: 14, cd: 6000, range: 28, aoe: 52, self: true, fx: 'whirl', lvl: 5 },
    { id: 'warcry', name: 'Grito de Guerra', buff: 'dmg', bmult: 1.25, dur: 20000, mana: 20, cd: 40000, fx: 'buff_dmg', lvl: 15 },
    { id: 'thunder', name: 'Lâmina Trovejante', mult: 2.6, mana: 26, cd: 8000, range: 30, aoe: 40, fx: 'lightning', lvl: 30 },
  ],
  dark_wizard: [
    { id: 'basic', name: 'Bola de Energia', mult: 1, mana: 0, cd: 0, range: 130, fx: 'energy' },
    { id: 'fireball', name: 'Bola de Fogo', mult: 1.9, mana: 10, cd: 2500, range: 140, fx: 'fire', lvl: 1 },
    { id: 'meteor', name: 'Meteoro', mult: 1.4, mana: 18, cd: 6000, range: 140, aoe: 56, fx: 'meteor', lvl: 5 },
    { id: 'manashield', name: 'Escudo de Mana', buff: 'def', bmult: 1.5, dur: 20000, mana: 22, cd: 40000, fx: 'buff_def', lvl: 15 },
    { id: 'lightning', name: 'Relâmpago', mult: 2.6, mana: 28, cd: 8000, range: 150, aoe: 50, fx: 'lightning', lvl: 30 },
  ],
  fairy_elf: [
    { id: 'basic', name: 'Flecha', mult: 1, mana: 0, cd: 0, range: 135, fx: 'arrow' },
    { id: 'icearrow', name: 'Flecha de Gelo', mult: 1.7, mana: 8, cd: 3000, range: 140, fx: 'ice', lvl: 1 },
    { id: 'triple', name: 'Flecha Tripla', mult: 1.2, mana: 14, cd: 5000, range: 140, aoe: 44, fx: 'arrow3', lvl: 5 },
    { id: 'heal', name: 'Cura', heal: 0.25, mana: 20, cd: 10000, fx: 'heal', lvl: 15 },
    { id: 'rain', name: 'Chuva de Flechas', mult: 1.9, mana: 26, cd: 9000, range: 150, aoe: 70, fx: 'arrow3', lvl: 30 },
  ],
  magic_gladiator: [
    { id: 'basic', name: 'Golpe', mult: 1, mana: 0, cd: 0, range: 26, fx: 'slash' },
    { id: 'fireblade', name: 'Lâmina de Fogo', mult: 1.9, mana: 10, cd: 3000, range: 28, fx: 'fire', lvl: 1 },
    { id: 'arcane', name: 'Explosão Arcana', mult: 1.4, mana: 18, cd: 6000, range: 120, aoe: 54, fx: 'meteor', lvl: 5 },
    { id: 'double', name: 'Golpe Duplo', mult: 2.4, mana: 16, cd: 5000, range: 30, fx: 'slash', lvl: 15 },
    { id: 'fury', name: 'Fúria Elemental', mult: 2.0, mana: 28, cd: 9000, range: 120, aoe: 64, fx: 'dark', lvl: 30 },
  ],
  dark_lord: [
    { id: 'basic', name: 'Golpe de Cetro', mult: 1, mana: 0, cd: 0, range: 34, fx: 'slash' },
    { id: 'darkfire', name: 'Fogo Sombrio', mult: 1.8, mana: 10, cd: 3000, range: 120, fx: 'dark', lvl: 1 },
    { id: 'storm', name: 'Tempestade Negra', mult: 1.4, mana: 18, cd: 6000, range: 120, aoe: 56, fx: 'lightning', lvl: 5 },
    { id: 'aura', name: 'Aura do Senhor', buff: 'dmg', bmult: 1.25, dur: 20000, mana: 20, cd: 40000, fx: 'buff_dmg', lvl: 15 },
    { id: 'imperial', name: 'Explosão Imperial', mult: 2.6, mana: 28, cd: 8000, range: 120, aoe: 50, fx: 'meteor', lvl: 30 },
  ],
  summoner: [
    { id: 'basic', name: 'Espírito', mult: 1, mana: 0, cd: 0, range: 130, fx: 'spirit' },
    { id: 'chain', name: 'Corrente Etérea', mult: 1.8, mana: 10, cd: 3000, range: 135, fx: 'dark', lvl: 1 },
    { id: 'souls', name: 'Chamado das Almas', mult: 1.4, mana: 18, cd: 6000, range: 135, aoe: 56, fx: 'spirit', lvl: 5 },
    { id: 'weakness', name: 'Maldição da Fraqueza', mult: 2.3, mana: 16, cd: 5000, range: 140, fx: 'dark', lvl: 15 },
    { id: 'spiritstorm', name: 'Tempestade de Espíritos', mult: 2.0, mana: 28, cd: 9000, range: 140, aoe: 66, fx: 'spirit', lvl: 30 },
  ],
};

// Modo do servidor. Hard XP: curva pesada e perda de EXP ao morrer.
const GAME_MODE = {
  name: 'Hard XP',
  expRate: Number(process.env.EXP_RATE || 1),
  deathExpLoss: 0.03,
};

// Missões diárias: 3 por dia, sorteadas por personagem. goal = base + per × nível.
const DAILY_POOL = [
  { id: 'kill', text: 'Derrote {n} monstros', base: 40, per: 2, reward: { zen: 1500, pot_hp: 10 } },
  { id: 'zen', text: 'Ganhe {n} Zen em combate', base: 1500, per: 120, reward: { pot_hp: 15, pot_mp: 10 } },
  { id: 'potion', text: 'Use {n} poções', base: 10, per: 0, reward: { zen: 1200 } },
  { id: 'skill', text: 'Use poderes {n} vezes', base: 40, per: 1, reward: { zen: 2000 } },
  { id: 'loot', text: 'Encontre {n} itens', base: 3, per: 0, reward: { item: 'rare' } },
  { id: 'online', text: 'Jogue {n} minutos', base: 20, per: 0, reward: { zen: 2500, pot_mp: 10 } },
  { id: 'elite', text: 'Derrote {n} chefes ou elites', base: 2, per: 0, reward: { item: 'rare', zen: 3000 }, minLevel: 10 },
];

// Prêmio por dias seguidos de login (o 7º é o melhor; depois recomeça)
const LOGIN_REWARDS = [
  { zen: 2000 }, { pot_hp: 25 }, { zen: 5000 }, { pot_mp: 30 }, { item: 'rare' }, { zen: 12000 }, { item: 'epic', zen: 10000 },
];

const ACHIEVEMENTS = [
  { id: 'lv5', text: 'Alcance o nível 5', stat: 'level', goal: 5, reward: { zen: 1000 } },
  { id: 'lv10', text: 'Alcance o nível 10', stat: 'level', goal: 10, reward: { zen: 3000, pot_hp: 20 } },
  { id: 'lv25', text: 'Alcance o nível 25', stat: 'level', goal: 25, reward: { zen: 10000, item: 'rare' } },
  { id: 'lv50', text: 'Alcance o nível 50', stat: 'level', goal: 50, reward: { zen: 30000, item: 'epic' } },
  { id: 'lv100', text: 'Alcance o nível 100', stat: 'level', goal: 100, reward: { zen: 100000, item: 'legendary' } },
  { id: 'k100', text: 'Derrote 100 monstros', stat: 'kills', goal: 100, reward: { zen: 1500 } },
  { id: 'k1000', text: 'Derrote 1.000 monstros', stat: 'kills', goal: 1000, reward: { zen: 8000, pot_hp: 50 } },
  { id: 'k10000', text: 'Derrote 10.000 monstros', stat: 'kills', goal: 10000, reward: { zen: 50000, item: 'epic' } },
  { id: 'boss1', text: 'Derrote o Rei Esqueleto', stat: 'bosses', goal: 1, reward: { zen: 20000, item: 'epic' } },
  { id: 'boss10', text: 'Derrote 10 bosses', stat: 'bosses', goal: 10, reward: { zen: 100000, item: 'legendary' } },
  { id: 'legend', text: 'Encontre um item lendário ou ancestral', stat: 'legendary', goal: 1, reward: { zen: 25000 } },
  { id: 'rich', text: 'Tenha 100.000 Zen', stat: 'zen', goal: 100000, reward: { pot_hp: 100, pot_mp: 100 } },
  { id: 'streak7', text: 'Entre 7 dias seguidos', stat: 'streak', goal: 7, reward: { item: 'epic' } },
];

const POINTS_PER_LEVEL = { dark_knight: 5, dark_wizard: 5, fairy_elf: 5, magic_gladiator: 7, dark_lord: 7, summoner: 5 };
// Distribuição automática de pontos (pode ser desligada pelo jogador)
const AUTO_STATS = {
  dark_knight: { str: 2, agi: 1, vit: 2 },
  dark_wizard: { ene: 3, agi: 1, vit: 1 },
  fairy_elf: { agi: 2, str: 2, vit: 1 },
  magic_gladiator: { str: 3, ene: 3, vit: 1 },
  dark_lord: { str: 3, cmd: 2, vit: 1, agi: 1 },
  summoner: { ene: 3, vit: 1, agi: 1 },
};

const CLASS_WEAPONS = {
  dark_knight: ['sword'], magic_gladiator: ['sword', 'staff'], dark_wizard: ['staff'],
  fairy_elf: ['bow'], dark_lord: ['scepter'], summoner: ['book'],
};

// Itens base. dmg = dano da arma; def = defesa; hp = vida extra
const ITEM_BASES = {
  short_sword: { name: 'Espada Curta', slot: 'weapon', kind: 'sword', icon: 'sword', req: 1, dmg: [4, 8] },
  kris: { name: 'Kris', slot: 'weapon', kind: 'sword', icon: 'sword', req: 8, dmg: [9, 14] },
  broad_blade: { name: 'Lâmina Larga', slot: 'weapon', kind: 'sword', icon: 'sword', req: 18, dmg: [16, 24] },
  legion_sword: { name: 'Espada da Legião', slot: 'weapon', kind: 'sword', icon: 'sword', req: 30, dmg: [26, 38] },
  skull_staff: { name: 'Cajado de Caveira', slot: 'weapon', kind: 'staff', icon: 'staff', req: 1, dmg: [4, 7] },
  serpent_staff: { name: 'Cajado da Serpente', slot: 'weapon', kind: 'staff', icon: 'staff', req: 10, dmg: [9, 14] },
  thunder_staff: { name: 'Cajado do Trovão', slot: 'weapon', kind: 'staff', icon: 'staff', req: 22, dmg: [17, 25] },
  short_bow: { name: 'Arco Curto', slot: 'weapon', kind: 'bow', icon: 'bow', req: 1, dmg: [4, 7] },
  elven_bow: { name: 'Arco Élfico', slot: 'weapon', kind: 'bow', icon: 'bow', req: 10, dmg: [9, 14] },
  silver_bow: { name: 'Arco de Prata', slot: 'weapon', kind: 'bow', icon: 'bow', req: 22, dmg: [17, 25] },
  small_scepter: { name: 'Cetro Pequeno', slot: 'weapon', kind: 'scepter', icon: 'scepter', req: 1, dmg: [4, 8] },
  lord_scepter: { name: 'Cetro do Senhor', slot: 'weapon', kind: 'scepter', icon: 'scepter', req: 14, dmg: [12, 19] },
  great_scepter: { name: 'Grande Cetro', slot: 'weapon', kind: 'scepter', icon: 'scepter', req: 26, dmg: [21, 31] },
  spirit_book: { name: 'Livro dos Espíritos', slot: 'weapon', kind: 'book', icon: 'book', req: 1, dmg: [4, 7] },
  curse_book: { name: 'Livro da Maldição', slot: 'weapon', kind: 'book', icon: 'book', req: 12, dmg: [10, 15] },
  souls_book: { name: 'Livro das Almas', slot: 'weapon', kind: 'book', icon: 'book', req: 24, dmg: [18, 26] },

  leather_helm: { name: 'Elmo de Couro', slot: 'helm', icon: 'helm', req: 1, def: 2, set: 'leather' },
  leather_armor: { name: 'Armadura de Couro', slot: 'armor', icon: 'armor', req: 1, def: 5, set: 'leather' },
  leather_gloves: { name: 'Luvas de Couro', slot: 'gloves', icon: 'gloves', req: 1, def: 1, set: 'leather' },
  leather_boots: { name: 'Botas de Couro', slot: 'boots', icon: 'boots', req: 1, def: 2, set: 'leather' },
  bronze_helm: { name: 'Elmo de Bronze', slot: 'helm', icon: 'helm', req: 10, def: 5, set: 'bronze' },
  bronze_armor: { name: 'Armadura de Bronze', slot: 'armor', icon: 'armor', req: 10, def: 10, set: 'bronze' },
  bronze_gloves: { name: 'Luvas de Bronze', slot: 'gloves', icon: 'gloves', req: 10, def: 3, set: 'bronze' },
  bronze_boots: { name: 'Botas de Bronze', slot: 'boots', icon: 'boots', req: 10, def: 4, set: 'bronze' },
  scale_helm: { name: 'Elmo de Escamas', slot: 'helm', icon: 'helm', req: 22, def: 9, set: 'scale' },
  scale_armor: { name: 'Armadura de Escamas', slot: 'armor', icon: 'armor', req: 22, def: 17, set: 'scale' },
  scale_gloves: { name: 'Luvas de Escamas', slot: 'gloves', icon: 'gloves', req: 22, def: 6, set: 'scale' },
  scale_boots: { name: 'Botas de Escamas', slot: 'boots', icon: 'boots', req: 22, def: 7, set: 'scale' },
  dragon_helm: { name: 'Elmo do Dragão', slot: 'helm', icon: 'helm', req: 32, def: 14, set: 'dragon' },
  dragon_armor: { name: 'Armadura do Dragão', slot: 'armor', icon: 'armor', req: 32, def: 26, set: 'dragon' },
  dragon_gloves: { name: 'Luvas do Dragão', slot: 'gloves', icon: 'gloves', req: 32, def: 9, set: 'dragon' },
  dragon_boots: { name: 'Botas do Dragão', slot: 'boots', icon: 'boots', req: 32, def: 11, set: 'dragon' },

  ring_life: { name: 'Anel da Vida', slot: 'ring', icon: 'ring', req: 6, hp: 40 },
  ring_ice: { name: 'Anel de Gelo', slot: 'ring', icon: 'ring', req: 20, hp: 100 },
};

const SETS = {
  leather: { name: 'Couro', bonus: 'Conjunto completo: +10% defesa e +5% dano' },
  bronze: { name: 'Bronze', bonus: 'Conjunto completo: +10% defesa e +5% dano' },
  scale: { name: 'Escamas', bonus: 'Conjunto completo: +10% defesa e +5% dano' },
  dragon: { name: 'Dragão', bonus: 'Conjunto completo: +10% defesa e +5% dano' },
};

const RARITY_MULT = { common: 1, uncommon: 1.15, rare: 1.35, epic: 1.6, legendary: 2, ancestral: 2.6 };
const RARITY_WEIGHTS = {
  normal: { common: 70, uncommon: 22, rare: 6.5, epic: 1.3, legendary: 0.19, ancestral: 0.01 },
  boss: { common: 0, uncommon: 30, rare: 45, epic: 18, legendary: 6, ancestral: 1 },
};

const SHOP = {
  pot_hp: { name: 'Poção de Vida', price: 20, desc: 'Recupera 35% da vida' },
  pot_mp: { name: 'Poção de Mana', price: 20, desc: 'Recupera 50% da mana' },
};

const INVENTORY_SIZE = 40;

module.exports = {
  CLASSES, MAPS, RARITIES, ITEMS, LIMITS,
  MONSTERS, WORLD, SKILLS, POINTS_PER_LEVEL, AUTO_STATS, CLASS_WEAPONS, ITEM_BASES, SETS,
  RARITY_MULT, RARITY_WEIGHTS, SHOP, INVENTORY_SIZE, GAME_MODE, DAILY_POOL, LOGIN_REWARDS, ACHIEVEMENTS,
};

