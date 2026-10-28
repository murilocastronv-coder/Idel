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

// 30 áreas desbloqueáveis (nomes de inspiração clássica + áreas originais)
const MAPS = [
  { id: 'lorencia', name: 'Lorencia', type: 'Cidade inicial', level: 1, theme: 'town', safe: true },
  { id: 'lorencia_fields', name: 'Campos de Lorencia', type: 'Área de farm', level: 1, theme: 'grass' },
  { id: 'noria', name: 'Noria', type: 'Floresta dos elfos', level: 10, theme: 'forest', safe: true },
  { id: 'noria_grove', name: 'Bosque Encantado', type: 'Área de farm', level: 15, theme: 'forest' },
  { id: 'devias', name: 'Devias', type: 'Região congelada', level: 25, theme: 'snow', safe: true },
  { id: 'devias_peaks', name: 'Picos Gelados', type: 'Área de farm', level: 35, theme: 'snow' },
  { id: 'dungeon', name: 'Dungeon', type: 'Masmorra subterrânea', level: 40, theme: 'cave' },
  { id: 'dungeon_deep', name: 'Catacumbas Profundas', type: 'Boss: Rei Esqueleto', level: 60, theme: 'cave' },
  { id: 'lost_tower', name: 'Lost Tower', type: 'Torre de monstros', level: 70, theme: 'tower' },
  { id: 'lost_tower_top', name: 'Topo da Torre', type: 'Área de elite', level: 90, theme: 'tower' },
  { id: 'atlans', name: 'Atlans', type: 'Região aquática', level: 100, theme: 'water' },
  { id: 'atlans_abyss', name: 'Abismo de Atlans', type: 'Área de farm', level: 130, theme: 'water' },
  { id: 'tarkan', name: 'Tarkan', type: 'Deserto', level: 150, theme: 'desert' },
  { id: 'tarkan_ruins', name: 'Ruínas de Areia', type: 'Área de elite', level: 180, theme: 'desert' },
  { id: 'icarus', name: 'Icarus', type: 'Região aérea', level: 200, theme: 'sky' },
  { id: 'aida', name: 'Aida', type: 'Floresta sombria', level: 230, theme: 'darkforest' },
  { id: 'aida_heart', name: 'Coração de Aida', type: 'Área de elite', level: 260, theme: 'darkforest' },
  { id: 'kanturu', name: 'Kanturu', type: 'Ruínas antigas', level: 280, theme: 'ruins' },
  { id: 'kanturu_core', name: 'Núcleo de Kanturu', type: 'Boss: Guardião de Ferro', level: 320, theme: 'ruins' },
  { id: 'kalima', name: 'Kalima', type: 'Território demoníaco', level: 340, theme: 'demon' },
  { id: 'land_of_trials', name: 'Land of Trials', type: 'Área de desafios', level: 380, theme: 'ruins' },
  { id: 'crywolf', name: 'Crywolf', type: 'Fortaleza de guerra', level: 400, theme: 'fortress' },
  { id: 'barracks', name: 'Barracks', type: 'Zona de batalha', level: 450, theme: 'fortress' },
  { id: 'raklion', name: 'Raklion', type: 'Monstros congelados', level: 500, theme: 'snow' },
  { id: 'raklion_nest', name: 'Ninho de Raklion', type: 'Boss: Aranha de Gelo', level: 560, theme: 'snow' },
  { id: 'vulcanus', name: 'Vulcanus', type: 'Zona de PvP', level: 600, theme: 'lava', pvp: true },
  { id: 'illusion_temple', name: 'Illusion Temple', type: 'Desafios especiais', level: 650, theme: 'temple' },
  { id: 'arena', name: 'Arena', type: 'Combates e eventos', level: 50, theme: 'arena', pvp: true },
  { id: 'abyss_gate', name: 'Portão do Abismo', type: 'Área de elite', level: 800, theme: 'demon' },
  { id: 'celestial_spire', name: 'Pináculo Celestial', type: 'Endgame', level: 950, theme: 'sky' },
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

module.exports = { CLASSES, MAPS, RARITIES, ITEMS, LIMITS };
