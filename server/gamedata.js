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
  { id: 'dungeon_2', name: 'Dungeon 2', type: 'Masmorra de lava', level: 35, playable: true },
  { id: 'dungeon_3', name: 'Dungeon 3', type: 'Coração da lava', level: 65, playable: true },
  { id: 'atlans', name: 'Atlans', type: 'Ruínas submersas', level: 45, playable: true },
  { id: 'lost_tower', name: 'Lost Tower', type: 'Torre amaldiçoada', level: 55, playable: true },
  { id: 'tarkan', name: 'Tarkan', type: 'Deserto de ossos', level: 75, playable: true },
  { id: 'icarus', name: 'Icarus', type: 'Ilhas no céu', level: 90, playable: true },
  { id: 'blood_castle', name: 'Blood Castle', type: 'Evento', level: 50 },
  { id: 'devil_square', name: 'Devil Square', type: 'Evento', level: 70 },
  { id: 'chaos_castle', name: 'Chaos Castle', type: 'Evento PvP', level: 90, pvp: true },
  { id: 'kalima', name: 'Kalima', type: 'Território demoníaco · Boss: Kundun', level: 130, playable: true },
  { id: 'crywolf', name: 'Crywolf', type: 'Floresta gelada · Boss: Balgass', level: 150, playable: true },
  { id: 'kantru', name: 'Kantru', type: 'Ruínas antigas', level: 250 },
  { id: 'aida', name: 'Aida', type: 'Floresta sombria', level: 110, playable: true },
  { id: 'kanturu_ruins', name: 'Kanturu Ruins', type: 'Ruínas de cristal', level: 310 },
  { id: 'barracks', name: 'Barracks', type: 'Quartel de guerra', level: 350 },
  { id: 'refuge', name: 'Refuge', type: 'Santuário sombrio', level: 380 },
  { id: 'swamp_of_peace', name: 'Swamp of Peace', type: 'Pântano', level: 410 },
  { id: 'vulcanus', name: 'Vulcanus', type: 'Zona PvP · Cão de Lava', level: 10, pvp: true, playable: true },
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
  ice_golem: { name: 'Golem de Gelo', sprite: 'ice_golem', level: 16, hp: 1500, dmg: 34, def: 18, exp: 520, zen: [150, 320], speed: 30, range: 28, atkMs: 1900, aggro: 90, drop: 0.3, size: 1, elite: true },
  lava_hound: { name: 'Cão de Lava', sprite: 'lava_hound', level: 18, hp: 640, dmg: 30, def: 10, exp: 250, zen: [60, 160], speed: 64, range: 22, atkMs: 1100, aggro: 120, drop: 0.14, size: 1 },
  // ---- Dungeon 2 (35+) ----
  flame_skeleton: { name: 'Esqueleto Flamejante', sprite: 'skeleton', tint: '#ff6a2a', level: 35, hp: 1250, dmg: 58, def: 24, exp: 520, zen: [110, 280], speed: 52, range: 22, atkMs: 1400, aggro: 110, drop: 0.14, size: 1 },
  hell_hound: { name: 'Cão Infernal', sprite: 'lava_hound', tint: '#7a1a3a', level: 38, hp: 1150, dmg: 62, def: 20, exp: 560, zen: [120, 300], speed: 66, range: 22, atkMs: 1100, aggro: 130, drop: 0.14, size: 1 },
  death_knight: { name: 'Cavaleiro da Morte', sprite: 'skeleton', tint: '#7a3aff', scale: 1.35, level: 42, hp: 5200, dmg: 92, def: 38, exp: 2300, zen: [500, 1100], speed: 46, range: 26, atkMs: 1500, aggro: 140, drop: 0.4, size: 1.4, elite: true },
  // ---- Atlans (45+) ----
  abyss_spider: { name: 'Aranha Abissal', sprite: 'spider', tint: '#2ad8ff', level: 45, hp: 1600, dmg: 74, def: 30, exp: 700, zen: [150, 380], speed: 60, range: 20, atkMs: 1250, aggro: 120, drop: 0.14, size: 1 },
  sea_slime: { name: 'Geleia do Mar', sprite: 'slime', tint: '#2a6aff', scale: 1.5, level: 48, hp: 2100, dmg: 70, def: 34, exp: 760, zen: [160, 400], speed: 34, range: 22, atkMs: 1500, aggro: 90, drop: 0.15, size: 1.3 },
  coral_golem: { name: 'Golem de Coral', sprite: 'ice_golem', tint: '#ff7aa0', scale: 1.3, level: 52, hp: 7800, dmg: 110, def: 50, exp: 3300, zen: [700, 1500], speed: 30, range: 30, atkMs: 1900, aggro: 110, drop: 0.4, size: 1.4, elite: true },
  // ---- Lost Tower (55+) ----
  cursed_skeleton: { name: 'Esqueleto Amaldiçoado', sprite: 'skeleton', tint: '#b05aff', level: 55, hp: 2400, dmg: 92, def: 40, exp: 900, zen: [200, 480], speed: 54, range: 22, atkMs: 1350, aggro: 130, drop: 0.14, size: 1 },
  shadow_goblin: { name: 'Goblin Sombrio', sprite: 'goblin', tint: '#4a2a7a', level: 58, hp: 2300, dmg: 98, def: 38, exp: 960, zen: [210, 500], speed: 58, range: 20, atkMs: 1200, aggro: 140, drop: 0.14, size: 1 },
  bone_mage: { name: 'Bruxo Esqueleto', sprite: 'skeleton', tint: '#3affd8', scale: 1.35, level: 64, hp: 10500, dmg: 140, def: 58, exp: 4400, zen: [900, 1900], speed: 42, range: 28, atkMs: 1600, aggro: 150, drop: 0.42, size: 1.4, elite: true },
  // ---- Dungeon 3 (65+) ----
  magma_hound: { name: 'Cão de Magma', sprite: 'lava_hound', tint: '#ffd36b', level: 65, hp: 3000, dmg: 115, def: 46, exp: 1150, zen: [250, 600], speed: 70, range: 22, atkMs: 1050, aggro: 150, drop: 0.14, size: 1 },
  obsidian_skeleton: { name: 'Esqueleto de Obsidiana', sprite: 'skeleton', tint: '#3a2a4a', level: 68, hp: 3500, dmg: 120, def: 54, exp: 1250, zen: [270, 640], speed: 52, range: 22, atkMs: 1350, aggro: 140, drop: 0.14, size: 1 },
  magma_golem: { name: 'Golem de Magma', sprite: 'ice_golem', tint: '#ff4a1a', scale: 1.35, level: 72, hp: 14000, dmg: 170, def: 70, exp: 5600, zen: [1100, 2300], speed: 30, range: 30, atkMs: 1900, aggro: 130, drop: 0.42, size: 1.45, elite: true },
  // ---- Tarkan (75+) ----
  sand_scorpion: { name: 'Escorpião do Deserto', sprite: 'spider', tint: '#d8a84a', level: 75, hp: 3900, dmg: 132, def: 58, exp: 1400, zen: [300, 720], speed: 62, range: 20, atkMs: 1200, aggro: 150, drop: 0.14, size: 1 },
  nomad_goblin: { name: 'Goblin Nômade', sprite: 'goblin', tint: '#c8945a', level: 78, hp: 4200, dmg: 138, def: 60, exp: 1500, zen: [320, 760], speed: 60, range: 20, atkMs: 1150, aggro: 150, drop: 0.14, size: 1 },
  sand_golem: { name: 'Golem de Areia', sprite: 'ice_golem', tint: '#e8c070', scale: 1.4, level: 84, hp: 18500, dmg: 205, def: 84, exp: 7200, zen: [1400, 2800], speed: 28, range: 32, atkMs: 1900, aggro: 140, drop: 0.45, size: 1.5, elite: true },
  // ---- Icarus (90+) ----
  sky_slime: { name: 'Geleia Celeste', sprite: 'slime', tint: '#e0f0ff', scale: 1.5, level: 90, hp: 5200, dmg: 160, def: 70, exp: 1800, zen: [380, 900], speed: 40, range: 22, atkMs: 1400, aggro: 120, drop: 0.15, size: 1.3 },
  storm_spider: { name: 'Aranha da Tempestade', sprite: 'spider', tint: '#9ad8ff', level: 94, hp: 5600, dmg: 172, def: 74, exp: 1950, zen: [400, 950], speed: 68, range: 20, atkMs: 1150, aggro: 160, drop: 0.14, size: 1 },
  cloud_golem: { name: 'Golem das Nuvens', sprite: 'ice_golem', tint: '#ffffff', scale: 1.45, level: 100, hp: 25000, dmg: 250, def: 100, exp: 9800, zen: [1800, 3600], speed: 30, range: 32, atkMs: 1850, aggro: 150, drop: 0.45, size: 1.5, elite: true },
  // ---- Aida (110+) ----
  mist_goblin: { name: 'Goblin da Névoa', sprite: 'goblin', tint: '#2a8a5a', level: 110, hp: 7200, dmg: 205, def: 92, exp: 2500, zen: [480, 1150], speed: 62, range: 20, atkMs: 1150, aggro: 160, drop: 0.14, size: 1 },
  venom_spider: { name: 'Aranha Venenosa', sprite: 'spider', tint: '#5aff3a', level: 115, hp: 7600, dmg: 215, def: 96, exp: 2650, zen: [500, 1200], speed: 70, range: 20, atkMs: 1100, aggro: 170, drop: 0.14, size: 1 },
  dark_treant: { name: 'Ent Sombrio', sprite: 'ice_golem', tint: '#3a5a2a', scale: 1.5, level: 122, hp: 34000, dmg: 310, def: 128, exp: 13000, zen: [2300, 4500], speed: 26, range: 34, atkMs: 1900, aggro: 160, drop: 0.48, size: 1.55, elite: true },
  // ---- Kalima (130+) ----
  void_skeleton: { name: 'Esqueleto do Vazio', sprite: 'skeleton', tint: '#5a3aff', level: 130, hp: 9800, dmg: 260, def: 120, exp: 3300, zen: [620, 1450], speed: 56, range: 22, atkMs: 1250, aggro: 170, drop: 0.15, size: 1 },
  demon_hound: { name: 'Cão Demoníaco', sprite: 'lava_hound', tint: '#a02aff', level: 135, hp: 9400, dmg: 275, def: 114, exp: 3450, zen: [640, 1500], speed: 74, range: 22, atkMs: 1000, aggro: 180, drop: 0.15, size: 1 },
  kundun: { name: 'Kundun', sprite: 'skeleton_king', tint: '#9a2aff', scale: 1.15, level: 160, hp: 420000, dmg: 520, def: 190, exp: 420000, zen: [60000, 110000], speed: 36, range: 36, atkMs: 1800, aggro: 190, drop: 1, size: 2.5, boss: true, respawnMs: 15 * 60 * 1000 },
  // ---- Crywolf (150+) ----
  frost_wolf: { name: 'Lobo Gélido', sprite: 'lava_hound', tint: '#bfe8ff', level: 150, hp: 13000, dmg: 330, def: 150, exp: 4300, zen: [800, 1850], speed: 76, range: 22, atkMs: 1000, aggro: 180, drop: 0.15, size: 1 },
  glacier_golem: { name: 'Golem Glacial', sprite: 'ice_golem', tint: '#5ab8ff', scale: 1.5, level: 160, hp: 56000, dmg: 470, def: 200, exp: 21000, zen: [3500, 6800], speed: 28, range: 34, atkMs: 1900, aggro: 170, drop: 0.5, size: 1.6, elite: true },
  balgass: { name: 'Balgass', sprite: 'skeleton_king', tint: '#ff3a3a', scale: 1.2, level: 190, hp: 900000, dmg: 760, def: 260, exp: 950000, zen: [120000, 220000], speed: 36, range: 38, atkMs: 1800, aggro: 200, drop: 1, size: 2.6, boss: true, respawnMs: 20 * 60 * 1000 },
  skeleton_king: { name: 'Rei Esqueleto', sprite: 'skeleton_king', level: 35, hp: 22000, dmg: 95, def: 30, exp: 26000, zen: [5000, 10000], speed: 38, range: 34, atkMs: 1800, aggro: 170, drop: 1, size: 2.2, boss: true, respawnMs: 10 * 60 * 1000 },
};

// Mapas abertos agora (os outros aparecem na galeria como "em breve")
const WORLD = {
  lorencia: { name: 'Lorencia', theme: 'town', w: 800, h: 560, safe: true, minLevel: 1, spawn: [400, 300],
    npcs: [{ id: 'shop', name: 'Mercadora Pasi', x: 470, y: 250, kind: 'shop' }, { id: 'chaos', name: 'Chaos Goblin', x: 335, y: 240, kind: 'chaos' },
      { id: 'marlon', name: 'Marlon', x: 250, y: 380, kind: 'marlon' }, { id: 'vault', name: 'Baú Pessoal', x: 565, y: 290, kind: 'vault' },
      { id: 'castle_guard', name: 'Guarda do Chaos Castle', x: 640, y: 360, kind: 'castle_guard' }, { id: 'smith', name: 'Ferreiro Mestre', x: 210, y: 195, kind: 'smith' }, { id: 'charon', name: 'Charon', x: 160, y: 300, kind: 'charon' }], groups: [] },
  noria: { name: 'Noria', theme: 'noria', w: 1200, h: 800, minLevel: 1, spawn: [120, 400],
    npcs: [{ id: 'vault', name: 'Baú Pessoal', x: 190, y: 330, kind: 'vault', optional: true }],
    groups: [{ type: 'slime', count: 14 }, { type: 'goblin', count: 7 }, { type: 'goblin_elite', count: 1 }] },
  devias: { name: 'Devias', theme: 'snow', w: 1200, h: 800, minLevel: 10, spawn: [120, 400],
    npcs: [{ id: 'sevina', name: 'Priestess Sevina', x: 210, y: 330, kind: 'sevina' }, { id: 'vault', name: 'Baú Pessoal', x: 170, y: 460, kind: 'vault', optional: true }],
    groups: [{ type: 'spider', count: 12 }, { type: 'ice_golem', count: 3 }] },
  dungeon: { name: 'Dungeon', theme: 'dungeon', w: 1200, h: 800, minLevel: 25, spawn: [120, 400],
    groups: [{ type: 'skeleton', count: 14 }], boss: { type: 'skeleton_king', x: 950, y: 400 } },
  vulcanus: { name: 'Vulcanus', theme: 'lava', w: 1200, h: 800, minLevel: 10, pvp: true, spawn: [600, 420],
    groups: [{ type: 'lava_hound', count: 10 }] },
  dungeon_2: { name: 'Dungeon 2', theme: 'lava', w: 1200, h: 800, minLevel: 35, spawn: [120, 400],
    groups: [{ type: 'flame_skeleton', count: 10 }, { type: 'hell_hound', count: 6 }, { type: 'death_knight', count: 2 }] },
  atlans: { name: 'Atlans', theme: 'water', w: 1300, h: 860, minLevel: 45, spawn: [120, 430],
    groups: [{ type: 'abyss_spider', count: 10 }, { type: 'sea_slime', count: 7 }, { type: 'coral_golem', count: 2 }] },
  lost_tower: { name: 'Lost Tower', theme: 'tower', w: 1200, h: 800, minLevel: 55, spawn: [120, 400],
    groups: [{ type: 'cursed_skeleton', count: 10 }, { type: 'shadow_goblin', count: 7 }, { type: 'bone_mage', count: 2 }] },
  dungeon_3: { name: 'Dungeon 3', theme: 'lava', w: 1300, h: 860, minLevel: 65, spawn: [120, 430],
    groups: [{ type: 'magma_hound', count: 9 }, { type: 'obsidian_skeleton', count: 8 }, { type: 'magma_golem', count: 2 }] },
  tarkan: { name: 'Tarkan', theme: 'desert', w: 1400, h: 900, minLevel: 75, spawn: [120, 450],
    groups: [{ type: 'sand_scorpion', count: 11 }, { type: 'nomad_goblin', count: 8 }, { type: 'sand_golem', count: 2 }] },
  icarus: { name: 'Icarus', theme: 'sky', w: 1300, h: 860, minLevel: 90, spawn: [120, 430],
    groups: [{ type: 'sky_slime', count: 9 }, { type: 'storm_spider', count: 9 }, { type: 'cloud_golem', count: 2 }] },
  aida: { name: 'Aida', theme: 'darkforest', w: 1400, h: 900, minLevel: 110, spawn: [120, 450],
    groups: [{ type: 'mist_goblin', count: 10 }, { type: 'venom_spider', count: 9 }, { type: 'dark_treant', count: 2 }] },
  kalima: { name: 'Kalima', theme: 'void', w: 1300, h: 860, minLevel: 130, spawn: [120, 430],
    groups: [{ type: 'void_skeleton', count: 10 }, { type: 'demon_hound', count: 8 }], boss: { type: 'kundun', x: 1050, y: 430 } },
  crywolf: { name: 'Crywolf', theme: 'snow', w: 1400, h: 900, minLevel: 150, spawn: [120, 450],
    groups: [{ type: 'frost_wolf', count: 12 }, { type: 'glacier_golem', count: 3 }], boss: { type: 'balgass', x: 1150, y: 450 } },
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
    { id: 'deathstab', name: 'Golpe Fatal', mult: 3.2, mana: 30, cd: 7000, range: 30, fx: 'slash', lvl: 1, evo: 1 },
    { id: 'masterfury', name: 'Fúria do Mestre', mult: 2.5, mana: 40, cd: 10000, range: 30, aoe: 72, self: true, fx: 'whirl', lvl: 1, evo: 2 },
  ],
  dark_wizard: [
    { id: 'basic', name: 'Bola de Energia', mult: 1, mana: 0, cd: 0, range: 130, fx: 'energy' },
    { id: 'fireball', name: 'Bola de Fogo', mult: 1.9, mana: 10, cd: 2500, range: 140, fx: 'fire', lvl: 1 },
    { id: 'meteor', name: 'Meteoro', mult: 1.4, mana: 18, cd: 6000, range: 140, aoe: 56, fx: 'meteor', lvl: 5 },
    { id: 'manashield', name: 'Escudo de Mana', buff: 'def', bmult: 1.5, dur: 20000, mana: 22, cd: 40000, fx: 'buff_def', lvl: 15 },
    { id: 'lightning', name: 'Relâmpago', mult: 2.6, mana: 28, cd: 8000, range: 150, aoe: 50, fx: 'lightning', lvl: 30 },
    { id: 'inferno', name: 'Inferno', mult: 2.3, mana: 34, cd: 8000, range: 140, aoe: 80, fx: 'fire', lvl: 1, evo: 1 },
    { id: 'arcanenova', name: 'Nova Arcana', mult: 3.0, mana: 44, cd: 11000, range: 150, aoe: 90, fx: 'lightning', lvl: 1, evo: 2 },
  ],
  fairy_elf: [
    { id: 'basic', name: 'Flecha', mult: 1, mana: 0, cd: 0, range: 135, fx: 'arrow' },
    { id: 'icearrow', name: 'Flecha de Gelo', mult: 1.7, mana: 8, cd: 3000, range: 140, fx: 'ice', lvl: 1 },
    { id: 'triple', name: 'Flecha Tripla', mult: 1.2, mana: 14, cd: 5000, range: 140, aoe: 44, fx: 'arrow3', lvl: 5 },
    { id: 'heal', name: 'Cura', heal: 0.25, mana: 20, cd: 10000, fx: 'heal', lvl: 15 },
    { id: 'rain', name: 'Chuva de Flechas', mult: 1.9, mana: 26, cd: 9000, range: 150, aoe: 70, fx: 'arrow3', lvl: 30 },
    { id: 'piercing', name: 'Flecha Penetrante', mult: 3.1, mana: 30, cd: 7000, range: 160, fx: 'arrow', lvl: 1, evo: 1 },
    { id: 'queenbless', name: 'Bênção da Rainha', buff: 'dmg', bmult: 1.35, dur: 20000, mana: 30, cd: 45000, fx: 'buff_dmg', lvl: 1, evo: 2 },
  ],
  magic_gladiator: [
    { id: 'basic', name: 'Golpe', mult: 1, mana: 0, cd: 0, range: 26, fx: 'slash' },
    { id: 'fireblade', name: 'Lâmina de Fogo', mult: 1.9, mana: 10, cd: 3000, range: 28, fx: 'fire', lvl: 1 },
    { id: 'arcane', name: 'Explosão Arcana', mult: 1.4, mana: 18, cd: 6000, range: 120, aoe: 54, fx: 'meteor', lvl: 5 },
    { id: 'double', name: 'Golpe Duplo', mult: 2.4, mana: 16, cd: 5000, range: 30, fx: 'slash', lvl: 15 },
    { id: 'fury', name: 'Fúria Elemental', mult: 2.0, mana: 28, cd: 9000, range: 120, aoe: 64, fx: 'dark', lvl: 30 },
    { id: 'spiral', name: 'Explosão Espiral', mult: 2.7, mana: 36, cd: 9000, range: 120, aoe: 74, fx: 'dark', lvl: 1, evo: 1 },
  ],
  dark_lord: [
    { id: 'basic', name: 'Golpe de Cetro', mult: 1, mana: 0, cd: 0, range: 34, fx: 'slash' },
    { id: 'darkfire', name: 'Fogo Sombrio', mult: 1.8, mana: 10, cd: 3000, range: 120, fx: 'dark', lvl: 1 },
    { id: 'storm', name: 'Tempestade Negra', mult: 1.4, mana: 18, cd: 6000, range: 120, aoe: 56, fx: 'lightning', lvl: 5 },
    { id: 'aura', name: 'Aura do Senhor', buff: 'dmg', bmult: 1.25, dur: 20000, mana: 20, cd: 40000, fx: 'buff_dmg', lvl: 15 },
    { id: 'imperial', name: 'Explosão Imperial', mult: 2.6, mana: 28, cd: 8000, range: 120, aoe: 50, fx: 'meteor', lvl: 30 },
    { id: 'emperorwrath', name: 'Ira do Imperador', mult: 2.9, mana: 38, cd: 9000, range: 120, aoe: 80, fx: 'meteor', lvl: 1, evo: 1 },
  ],
  summoner: [
    { id: 'basic', name: 'Espírito', mult: 1, mana: 0, cd: 0, range: 130, fx: 'spirit' },
    { id: 'chain', name: 'Corrente Etérea', mult: 1.8, mana: 10, cd: 3000, range: 135, fx: 'dark', lvl: 1 },
    { id: 'souls', name: 'Chamado das Almas', mult: 1.4, mana: 18, cd: 6000, range: 135, aoe: 56, fx: 'spirit', lvl: 5 },
    { id: 'weakness', name: 'Maldição da Fraqueza', mult: 2.3, mana: 16, cd: 5000, range: 140, fx: 'dark', lvl: 15 },
    { id: 'spiritstorm', name: 'Tempestade de Espíritos', mult: 2.0, mana: 28, cd: 9000, range: 140, aoe: 66, fx: 'spirit', lvl: 30 },
    { id: 'bloodchain', name: 'Corrente de Sangue', mult: 3.1, mana: 30, cd: 7000, range: 140, fx: 'dark', lvl: 1, evo: 1 },
    { id: 'dimension', name: 'Portal Dimensional', mult: 2.8, mana: 42, cd: 10000, range: 140, aoe: 90, fx: 'spirit', lvl: 1, evo: 2 },
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

const POINTS_PER_LEVEL = { dark_knight: 5, dark_wizard: 5, fairy_elf: 5, magic_gladiator: 7, dark_lord: 5, summoner: 5 };

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

  storm_helm: { name: 'Elmo da Tempestade', slot: 'helm', icon: 'helm', req: 50, def: 21, set: 'storm' },
  storm_armor: { name: 'Armadura da Tempestade', slot: 'armor', icon: 'armor', req: 50, def: 39, set: 'storm' },
  storm_gloves: { name: 'Luvas da Tempestade', slot: 'gloves', icon: 'gloves', req: 50, def: 14, set: 'storm' },
  storm_boots: { name: 'Botas da Tempestade', slot: 'boots', icon: 'boots', req: 50, def: 17, set: 'storm' },
  phoenix_helm: { name: 'Elmo da Fênix', slot: 'helm', icon: 'helm', req: 80, def: 31, set: 'phoenix' },
  phoenix_armor: { name: 'Armadura da Fênix', slot: 'armor', icon: 'armor', req: 80, def: 57, set: 'phoenix' },
  phoenix_gloves: { name: 'Luvas da Fênix', slot: 'gloves', icon: 'gloves', req: 80, def: 21, set: 'phoenix' },
  phoenix_boots: { name: 'Botas da Fênix', slot: 'boots', icon: 'boots', req: 80, def: 25, set: 'phoenix' },
  abyss_helm: { name: 'Elmo do Abismo', slot: 'helm', icon: 'helm', req: 120, def: 45, set: 'abyss' },
  abyss_armor: { name: 'Armadura do Abismo', slot: 'armor', icon: 'armor', req: 120, def: 82, set: 'abyss' },
  abyss_gloves: { name: 'Luvas do Abismo', slot: 'gloves', icon: 'gloves', req: 120, def: 30, set: 'abyss' },
  abyss_boots: { name: 'Botas do Abismo', slot: 'boots', icon: 'boots', req: 120, def: 35, set: 'abyss' },

  storm_blade: { name: 'Lâmina da Tempestade', slot: 'weapon', kind: 'sword', icon: 'sword', req: 50, dmg: [42, 60] },
  phoenix_sword: { name: 'Espada da Fênix', slot: 'weapon', kind: 'sword', icon: 'sword', req: 80, dmg: [66, 94] },
  abyss_sword: { name: 'Espada do Abismo', slot: 'weapon', kind: 'sword', icon: 'sword', req: 120, dmg: [98, 138] },
  storm_staff: { name: 'Cajado da Tempestade', slot: 'weapon', kind: 'staff', icon: 'staff', req: 50, dmg: [40, 57] },
  phoenix_staff: { name: 'Cajado da Fênix', slot: 'weapon', kind: 'staff', icon: 'staff', req: 80, dmg: [63, 90] },
  abyss_staff: { name: 'Cajado do Abismo', slot: 'weapon', kind: 'staff', icon: 'staff', req: 120, dmg: [94, 132] },
  storm_bow: { name: 'Arco da Tempestade', slot: 'weapon', kind: 'bow', icon: 'bow', req: 50, dmg: [40, 57] },
  phoenix_bow: { name: 'Arco da Fênix', slot: 'weapon', kind: 'bow', icon: 'bow', req: 80, dmg: [63, 90] },
  abyss_bow: { name: 'Arco do Abismo', slot: 'weapon', kind: 'bow', icon: 'bow', req: 120, dmg: [94, 132] },
  storm_scepter: { name: 'Cetro da Tempestade', slot: 'weapon', kind: 'scepter', icon: 'scepter', req: 50, dmg: [42, 60] },
  phoenix_scepter: { name: 'Cetro da Fênix', slot: 'weapon', kind: 'scepter', icon: 'scepter', req: 80, dmg: [66, 94] },
  abyss_scepter: { name: 'Cetro do Abismo', slot: 'weapon', kind: 'scepter', icon: 'scepter', req: 120, dmg: [98, 138] },
  storm_book: { name: 'Livro da Tempestade', slot: 'weapon', kind: 'book', icon: 'book', req: 50, dmg: [40, 57] },
  phoenix_book: { name: 'Livro da Fênix', slot: 'weapon', kind: 'book', icon: 'book', req: 80, dmg: [63, 90] },
  abyss_book: { name: 'Livro do Abismo', slot: 'weapon', kind: 'book', icon: 'book', req: 120, dmg: [94, 132] },
  ring_storm: { name: 'Anel da Tempestade', slot: 'ring', icon: 'ring', req: 55, hp: 260 },
  ring_abyss: { name: 'Anel do Abismo', slot: 'ring', icon: 'ring', req: 120, hp: 620 },

  ring_life: { name: 'Anel da Vida', slot: 'ring', icon: 'ring', req: 6, hp: 40 },
  ring_ice: { name: 'Anel de Gelo', slot: 'ring', icon: 'ring', req: 20, hp: 100 },

  // ---------- Chaos Machine ----------
  // special = não entra no sorteio comum de drops (só pela tabela de drop configurável ou pela Chaos Machine)
  // materiais empilham (stack) e não ocupam mais de um lugar na bolsa
  jewel_of_bless: { name: 'Jewel of Bless', slot: 'material', icon: 'jewel', ic: '#8ad8ff', req: 1, stack: 999, rarity: 'rare', value: 3000, special: true, desc: 'Arraste em cima de um equipamento da bolsa para aprimorar de +0 até +6. Também é usada no Ferreiro Mestre.' },
  jewel_of_soul: { name: 'Jewel of Soul', slot: 'material', icon: 'jewel', ic: '#d86aff', req: 1, stack: 999, rarity: 'epic', value: 6000, special: true, desc: 'Arraste em cima de um equipamento da bolsa para aprimorar de +6 até +9. Também é usada no Ferreiro Mestre.' },
  jewel_of_creation: { name: 'Jewel of Creation', slot: 'material', icon: 'jewel', ic: '#ffd84a', req: 1, stack: 999, rarity: 'epic', value: 12000, special: true, desc: 'Usada pelo Ferreiro Mestre para aprimorar equipamentos de +9 até +15.' },
  jewel_of_chaos: { name: 'Jewel of Chaos', slot: 'material', icon: 'jewel_chaos', req: 1, stack: 999, rarity: 'rare', value: 1500, special: true,
    desc: 'Joia usada na Chaos Machine para criar e evoluir asas e capas.' },
  // ---- convites de eventos (Chaos Castle e Devil Square) ----
  armor_of_guardsman: { name: 'Armor of Guardsman', slot: 'material', icon: 'guard', ic: '#ffcf4a', req: 1, stack: 999, rarity: 'rare', value: 5000, special: true, event: 'castle', desc: 'Entrada do Chaos Castle. Só é gasta quando a entrada no evento é confirmada.' },
  devil_eye_1: { name: "Devil's Eye +1", slot: 'material', icon: 'eye', ic: '#9ad8ff', req: 1, stack: 999, rarity: 'uncommon', value: 800, special: true, devil: 1, desc: "Junte com Devil's Key +1 e uma Jewel of Chaos na Chaos Machine para criar o Devil's Invitation +1." },
  devil_key_1: { name: "Devil's Key +1", slot: 'material', icon: 'key', ic: '#9ad8ff', req: 1, stack: 999, rarity: 'uncommon', value: 800, special: true, devil: 1, desc: "Junte com Devil's Eye +1 e uma Jewel of Chaos na Chaos Machine para criar o Devil's Invitation +1." },
  devil_inv_1: { name: "Devil's Invitation +1", slot: 'material', icon: 'scroll', ic: '#9ad8ff', req: 1, stack: 999, rarity: 'rare', value: 2500, special: true, devil: 1, event: 'devil', desc: 'Entrada do Devil Square +1. Só é gasto quando a entrada no evento é confirmada.' },
  devil_eye_2: { name: "Devil's Eye +2", slot: 'material', icon: 'eye', ic: '#7ab0ff', req: 1, stack: 999, rarity: 'uncommon', value: 3200, special: true, devil: 2, desc: "Junte com Devil's Key +2 e uma Jewel of Chaos na Chaos Machine para criar o Devil's Invitation +2." },
  devil_key_2: { name: "Devil's Key +2", slot: 'material', icon: 'key', ic: '#7ab0ff', req: 1, stack: 999, rarity: 'uncommon', value: 3200, special: true, devil: 2, desc: "Junte com Devil's Eye +2 e uma Jewel of Chaos na Chaos Machine para criar o Devil's Invitation +2." },
  devil_inv_2: { name: "Devil's Invitation +2", slot: 'material', icon: 'scroll', ic: '#7ab0ff', req: 1, stack: 999, rarity: 'rare', value: 10000, special: true, devil: 2, event: 'devil', desc: 'Entrada do Devil Square +2. Só é gasto quando a entrada no evento é confirmada.' },
  devil_eye_3: { name: "Devil's Eye +3", slot: 'material', icon: 'eye', ic: '#8a7aff', req: 1, stack: 999, rarity: 'uncommon', value: 7200, special: true, devil: 3, desc: "Junte com Devil's Key +3 e uma Jewel of Chaos na Chaos Machine para criar o Devil's Invitation +3." },
  devil_key_3: { name: "Devil's Key +3", slot: 'material', icon: 'key', ic: '#8a7aff', req: 1, stack: 999, rarity: 'uncommon', value: 7200, special: true, devil: 3, desc: "Junte com Devil's Eye +3 e uma Jewel of Chaos na Chaos Machine para criar o Devil's Invitation +3." },
  devil_inv_3: { name: "Devil's Invitation +3", slot: 'material', icon: 'scroll', ic: '#8a7aff', req: 1, stack: 999, rarity: 'rare', value: 22500, special: true, devil: 3, event: 'devil', desc: 'Entrada do Devil Square +3. Só é gasto quando a entrada no evento é confirmada.' },
  devil_eye_4: { name: "Devil's Eye +4", slot: 'material', icon: 'eye', ic: '#c06bff', req: 1, stack: 999, rarity: 'rare', value: 12800, special: true, devil: 4, desc: "Junte com Devil's Key +4 e uma Jewel of Chaos na Chaos Machine para criar o Devil's Invitation +4." },
  devil_key_4: { name: "Devil's Key +4", slot: 'material', icon: 'key', ic: '#c06bff', req: 1, stack: 999, rarity: 'rare', value: 12800, special: true, devil: 4, desc: "Junte com Devil's Eye +4 e uma Jewel of Chaos na Chaos Machine para criar o Devil's Invitation +4." },
  devil_inv_4: { name: "Devil's Invitation +4", slot: 'material', icon: 'scroll', ic: '#c06bff', req: 1, stack: 999, rarity: 'epic', value: 40000, special: true, devil: 4, event: 'devil', desc: 'Entrada do Devil Square +4. Só é gasto quando a entrada no evento é confirmada.' },
  devil_eye_5: { name: "Devil's Eye +5", slot: 'material', icon: 'eye', ic: '#ff6ad0', req: 1, stack: 999, rarity: 'rare', value: 20000, special: true, devil: 5, desc: "Junte com Devil's Key +5 e uma Jewel of Chaos na Chaos Machine para criar o Devil's Invitation +5." },
  devil_key_5: { name: "Devil's Key +5", slot: 'material', icon: 'key', ic: '#ff6ad0', req: 1, stack: 999, rarity: 'rare', value: 20000, special: true, devil: 5, desc: "Junte com Devil's Eye +5 e uma Jewel of Chaos na Chaos Machine para criar o Devil's Invitation +5." },
  devil_inv_5: { name: "Devil's Invitation +5", slot: 'material', icon: 'scroll', ic: '#ff6ad0', req: 1, stack: 999, rarity: 'epic', value: 62500, special: true, devil: 5, event: 'devil', desc: 'Entrada do Devil Square +5. Só é gasto quando a entrada no evento é confirmada.' },
  devil_eye_6: { name: "Devil's Eye +6", slot: 'material', icon: 'eye', ic: '#ff5a5a', req: 1, stack: 999, rarity: 'epic', value: 28800, special: true, devil: 6, desc: "Junte com Devil's Key +6 e uma Jewel of Chaos na Chaos Machine para criar o Devil's Invitation +6." },
  devil_key_6: { name: "Devil's Key +6", slot: 'material', icon: 'key', ic: '#ff5a5a', req: 1, stack: 999, rarity: 'epic', value: 28800, special: true, devil: 6, desc: "Junte com Devil's Eye +6 e uma Jewel of Chaos na Chaos Machine para criar o Devil's Invitation +6." },
  devil_inv_6: { name: "Devil's Invitation +6", slot: 'material', icon: 'scroll', ic: '#ff5a5a', req: 1, stack: 999, rarity: 'legendary', value: 90000, special: true, devil: 6, event: 'devil', desc: 'Entrada do Devil Square +6. Só é gasto quando a entrada no evento é confirmada.' },
  devil_eye_7: { name: "Devil's Eye +7", slot: 'material', icon: 'eye', ic: '#ffb43a', req: 1, stack: 999, rarity: 'epic', value: 39200, special: true, devil: 7, desc: "Junte com Devil's Key +7 e uma Jewel of Chaos na Chaos Machine para criar o Devil's Invitation +7." },
  devil_key_7: { name: "Devil's Key +7", slot: 'material', icon: 'key', ic: '#ffb43a', req: 1, stack: 999, rarity: 'epic', value: 39200, special: true, devil: 7, desc: "Junte com Devil's Eye +7 e uma Jewel of Chaos na Chaos Machine para criar o Devil's Invitation +7." },
  devil_inv_7: { name: "Devil's Invitation +7", slot: 'material', icon: 'scroll', ic: '#ffb43a', req: 1, stack: 999, rarity: 'legendary', value: 122500, special: true, devil: 7, event: 'devil', desc: 'Entrada do Devil Square +7. Só é gasto quando a entrada no evento é confirmada.' },
  loch_feather: { name: "Loch's Feather", slot: 'material', icon: 'feather', ic: '#ffb43a', req: 1, stack: 999, rarity: 'epic', value: 9000, special: true,
    desc: 'Pena rara. Necessária para evoluir asas para o nível 2 e para evoluir a capa do Dark Lord.' },
  // armas do Caos: usadas como base das receitas (o + e a raridade aumentam a chance)
  chaos_dragon_axe: { name: 'Chaos Dragon Axe', slot: 'weapon', kind: 'sword', icon: 'sword', req: 30, dmg: [30, 44], special: true, chaos: true },
  chaos_nature_bow: { name: 'Chaos Nature Bow', slot: 'weapon', kind: 'bow', icon: 'bow', req: 30, dmg: [28, 41], special: true, chaos: true },
  chaos_lightning_staff: { name: 'Chaos Lightning Staff', slot: 'weapon', kind: 'staff', icon: 'staff', req: 30, dmg: [28, 41], special: true, chaos: true },
  // asas de nível 1 (wdmg = % de dano a mais; absorb = % do dano recebido que a asa absorve)
  wings_satan: { name: 'Wings of Satan', slot: 'wings', cat: 'wings', tier: 1, icon: 'wings', ic: '#d0342a', req: 150, def: 12, wdmg: 12, absorb: 12, rarity: 'epic', value: 60000, special: true, classes: ['dark_knight', 'magic_gladiator'] },
  wings_heaven: { name: 'Wings of Heaven', slot: 'wings', cat: 'wings', tier: 1, icon: 'wings', ic: '#e8f4ff', req: 150, def: 12, wdmg: 12, absorb: 12, rarity: 'epic', value: 60000, special: true, classes: ['dark_wizard', 'magic_gladiator'] },
  wings_elf: { name: 'Wings of Elf', slot: 'wings', cat: 'wings', tier: 1, icon: 'wings', ic: '#8aff6a', req: 150, def: 12, wdmg: 12, absorb: 12, rarity: 'epic', value: 60000, special: true, classes: ['fairy_elf'] },
  wings_curse: { name: 'Wings of Curse', slot: 'wings', cat: 'wings', tier: 1, icon: 'wings', ic: '#b05aff', req: 150, def: 12, wdmg: 12, absorb: 12, rarity: 'epic', value: 60000, special: true, classes: ['summoner'] },
  // asas de nível 2
  wings_dragon: { name: 'Wings of Dragon', slot: 'wings', cat: 'wings', tier: 2, icon: 'wings', ic: '#ff5a2a', req: 150, def: 26, wdmg: 32, absorb: 25, rarity: 'legendary', value: 600000, special: true, classes: ['dark_knight'] },
  wings_soul: { name: 'Wings of Soul', slot: 'wings', cat: 'wings', tier: 2, icon: 'wings', ic: '#5ac8ff', req: 150, def: 26, wdmg: 32, absorb: 25, rarity: 'legendary', value: 600000, special: true, classes: ['dark_wizard'] },
  wings_spirit: { name: 'Wings of Spirit', slot: 'wings', cat: 'wings', tier: 2, icon: 'wings', ic: '#ffe08a', req: 150, def: 26, wdmg: 32, absorb: 25, rarity: 'legendary', value: 600000, special: true, classes: ['fairy_elf'] },
  wings_darkness: { name: 'Wings of Darkness', slot: 'wings', cat: 'wings', tier: 2, icon: 'wings', ic: '#8a4aff', req: 150, def: 26, wdmg: 32, absorb: 25, rarity: 'legendary', value: 600000, special: true, classes: ['magic_gladiator'] },
  wings_despair: { name: 'Wings of Despair', slot: 'wings', cat: 'wings', tier: 2, icon: 'wings', ic: '#ff6ab8', req: 150, def: 26, wdmg: 32, absorb: 25, rarity: 'legendary', value: 600000, special: true, classes: ['summoner'] },
  // capas do Dark Lord (ocupam o lugar das asas, mas são equipamento só do Dark Lord)
  cape_lord: { name: 'Cape of Lord', slot: 'wings', cat: 'cape', tier: 1, icon: 'cape', ic: '#9a4aff', req: 150, def: 18, wdmg: 20, absorb: 18, rarity: 'legendary', value: 150000, special: true, classes: ['dark_lord'] },
  cape_emperor: { name: 'Cape of Emperor', slot: 'wings', cat: 'cape', tier: 2, icon: 'cape', ic: '#ff3a3a', req: 150, def: 34, wdmg: 39, absorb: 30, rarity: 'ancestral', value: 1500000, special: true, classes: ['dark_lord'] },
};

// ---------- calças, escudos e colares (novos lugares do equipamento) ----------
const PANTS = { leather: ['Calças de Couro', 1, 3], bronze: ['Calças de Bronze', 10, 6], scale: ['Calças de Escamas', 22, 10], dragon: ['Calças do Dragão', 32, 15],
  storm: ['Calças da Tempestade', 50, 23], phoenix: ['Calças da Fênix', 80, 33], abyss: ['Calças do Abismo', 120, 48] };
for (const [set, [name, req, def]] of Object.entries(PANTS)) ITEM_BASES[`${set}_pants`] = { name, slot: 'pants', icon: 'pants', req, def, set };
Object.assign(ITEM_BASES, {
  oak_shield: { name: 'Escudo de Carvalho', slot: 'shield', kind: 'shield', icon: 'shield', req: 1, def: 4 },
  bronze_shield: { name: 'Escudo de Bronze', slot: 'shield', kind: 'shield', icon: 'shield', req: 20, def: 9 },
  dragon_shield: { name: 'Escudo do Dragão', slot: 'shield', kind: 'shield', icon: 'shield', req: 45, def: 16 },
  phoenix_shield: { name: 'Escudo da Fênix', slot: 'shield', kind: 'shield', icon: 'shield', req: 85, def: 26 },
  abyss_shield: { name: 'Escudo do Abismo', slot: 'shield', kind: 'shield', icon: 'shield', req: 120, def: 36 },
  necklace_wind: { name: 'Colar do Vento', slot: 'necklace', icon: 'necklace', req: 15, hp: 60, def: 2 },
  necklace_flame: { name: 'Colar da Chama', slot: 'necklace', icon: 'necklace', req: 60, hp: 220, def: 6 },
  necklace_abyss: { name: 'Colar do Abismo', slot: 'necklace', icon: 'necklace', req: 120, hp: 520, def: 12 },
});
// cajados e arcos ocupam as duas mãos (não deixam usar escudo)
for (const b of Object.values(ITEM_BASES)) if (b.slot === 'weapon' && (b.kind === 'staff' || b.kind === 'bow')) b.twoHand = true;

// ---------- itens de quest de evolução de classe ----------
Object.assign(ITEM_BASES, {
  scroll_of_emperor: { name: 'Scroll of the Emperor', slot: 'quest', icon: 'scroll', ic: '#e8d090', req: 1, stack: 5, rarity: 'epic', value: 1, special: true, quest: true,
    desc: 'Item da Quest of the Hero. Entregue à Priestess Sevina, em Devias.' },
  broken_sword: { name: 'Broken Sword', slot: 'quest', icon: 'sword', ic: '#9aa3b5', req: 1, stack: 5, rarity: 'epic', value: 1, special: true, quest: true, questClasses: ['dark_knight'],
    desc: 'Item da evolução do Dark Knight. Entregue à Priestess Sevina.' },
  soul_of_wizard: { name: 'Soul of Wizard', slot: 'quest', icon: 'jewel', ic: '#7ab8ff', req: 1, stack: 5, rarity: 'epic', value: 1, special: true, quest: true, questClasses: ['dark_wizard'],
    desc: 'Item da evolução do Dark Wizard. Entregue à Priestess Sevina.' },
  tear_of_elf: { name: 'Tear of Elf', slot: 'quest', icon: 'jewel', ic: '#8aff8a', req: 1, stack: 5, rarity: 'epic', value: 1, special: true, quest: true, questClasses: ['fairy_elf'],
    desc: 'Item da evolução da Fairy Elf. Entregue à Priestess Sevina.' },
  orb_of_summoning: { name: 'Orb of Summoning', slot: 'quest', icon: 'jewel', ic: '#ff7ad9', req: 1, stack: 5, rarity: 'epic', value: 1, special: true, quest: true, questClasses: ['summoner'],
    desc: 'Item da evolução da Summoner. Entregue à Priestess Sevina.' },
  flame_of_dbk: { name: 'Flame of Death Beam Knight', slot: 'quest', icon: 'jewel', ic: '#ff5a2a', req: 1, stack: 5, rarity: 'legendary', value: 1, special: true, quest: true,
    desc: 'Item da missão avançada de Marlon.' },
  horn_of_hell_maine: { name: 'Horn of Hell Maine', slot: 'quest', icon: 'jewel', ic: '#b05aff', req: 1, stack: 5, rarity: 'legendary', value: 1, special: true, quest: true,
    desc: 'Item da missão avançada de Marlon.' },
  feather_of_phoenix: { name: 'Feather of Phoenix of Darkness', slot: 'quest', icon: 'feather', ic: '#ff3a6a', req: 1, stack: 5, rarity: 'legendary', value: 1, special: true, quest: true,
    desc: 'Item da missão avançada de Marlon.' },
});

// nomes das classes em cada evolução
const EVOLUTIONS = {
  dark_knight: ['Dark Knight', 'Blade Knight', 'Blade Master'],
  dark_wizard: ['Dark Wizard', 'Soul Master', 'Grand Master'],
  fairy_elf: ['Fairy Elf', 'Muse Elf', 'High Elf'],
  summoner: ['Summoner', 'Bloody Summoner', 'Dimension Master'],
  magic_gladiator: ['Magic Gladiator', 'Duel Master'],
  dark_lord: ['Dark Lord', 'Lord Emperor'],
};
// lugares do corpo, na ordem da tela
const EQUIP_SLOTS = ['helm', 'armor', 'pants', 'gloves', 'boots', 'weapon', 'shield', 'wings', 'necklace', 'ring', 'ring2'];

// ---------- Invasão Dourada: caixas abertas na bolsa ----------
Object.assign(ITEM_BASES, {
  kundun_bronze: { name: 'Box Kundun Bronze', slot: 'box', icon: 'box', ic: '#d08a4a', req: 1, stack: 99, rarity: 'uncommon', value: 2000, special: true, tier: 1,
    desc: 'Caixa da Invasão Dourada. Pode ter Zen, poções, equipamentos comuns e incomuns, joias e uma pequena chance de equipamento raro.' },
  kundun_prata: { name: 'Box Kundun Prata', slot: 'box', icon: 'box', ic: '#d8e2f0', req: 1, stack: 99, rarity: 'rare', value: 9000, special: true, tier: 2,
    desc: 'Caixa da Invasão Dourada. Mais Zen, equipamentos raros com adicionais, joias, materiais de criação e chance de equipamento épico.' },
  kundun_ouro: { name: 'Box Kundun Ouro', slot: 'box', icon: 'box', ic: '#ffc83a', req: 1, stack: 99, rarity: 'epic', value: 40000, special: true, tier: 3,
    desc: 'Caixa da Invasão Dourada. Equipamentos épicos, lendários e ancestrais, asas e capas, joias raras e materiais poderosos.' },
});

// asa de nível 1 -> asa de nível 2 (o Magic Gladiator transforma Satan/Heaven em Darkness)
const WING_EVOLVE = { wings_satan: 'wings_dragon', wings_heaven: 'wings_soul', wings_elf: 'wings_spirit', wings_curse: 'wings_despair' };

const SETS = {
  leather: { name: 'Couro', bonus: 'Conjunto completo: +10% defesa e +5% dano' },
  bronze: { name: 'Bronze', bonus: 'Conjunto completo: +10% defesa e +5% dano' },
  scale: { name: 'Escamas', bonus: 'Conjunto completo: +10% defesa e +5% dano' },
  dragon: { name: 'Dragão', bonus: 'Conjunto completo: +10% defesa e +5% dano' },
  storm: { name: 'Tempestade', bonus: 'Conjunto completo: +10% defesa e +5% dano' },
  phoenix: { name: 'Fênix', bonus: 'Conjunto completo: +10% defesa e +5% dano' },
  abyss: { name: 'Abismo', bonus: 'Conjunto completo: +10% defesa e +5% dano' },
};

const RARITY_MULT = { common: 1, uncommon: 1.15, rare: 1.35, epic: 1.6, legendary: 2, ancestral: 2.6 };
const RARITY_WEIGHTS = {
  // itens bons são raros de verdade: Épico ~1 em 330 drops, Lendário ~1 em 3.300, Ancestral ~1 em 50.000
  normal: { common: 80, uncommon: 17, rare: 2.65, epic: 0.3, legendary: 0.03, ancestral: 0.002 },
  boss: { common: 0, uncommon: 52, rare: 36, epic: 9.5, legendary: 2.2, ancestral: 0.3 },
};

const SHOP = {
  pot_hp: { name: 'Poção de Vida', price: 20, desc: 'Recupera 35% da vida' },
  pot_mp: { name: 'Poção de Mana', price: 20, desc: 'Recupera 50% da mana' },
};

const INVENTORY_SIZE = 40;
const MAX_STACK = 999;

module.exports = {
  CLASSES, MAPS, RARITIES, ITEMS, LIMITS,
  MONSTERS, WORLD, SKILLS, POINTS_PER_LEVEL, CLASS_WEAPONS, ITEM_BASES, SETS,
  RARITY_MULT, RARITY_WEIGHTS, SHOP, INVENTORY_SIZE, MAX_STACK, WING_EVOLVE, EVOLUTIONS, EQUIP_SLOTS, GAME_MODE, DAILY_POOL, LOGIN_REWARDS, ACHIEVEMENTS,
};

