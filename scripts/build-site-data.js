'use strict';
// Gera site/data.js a partir dos arquivos de dados do jogo (classes, mapas, monstros, asas, skills),
// para o site sempre mostrar o que existe no jogo. Roda no build (npm install) depois do jogo.
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'game', 'website', 'src', 'gameplay');
const ASSETS = path.join(__dirname, '..', 'game', 'assets');
const GAME_URL = '/jogar/assets';

const { literal, wingShop } = require('./game-data');

function southImage(characterId) {
  const dir = path.join(ASSETS, 'characters', characterId);
  if (!fs.existsSync(dir)) return null;
  for (const state of fs.readdirSync(dir)) {
    const f = path.join(dir, state, 'rotations', 'south.png');
    if (fs.existsSync(f)) return `${GAME_URL}/characters/${characterId}/${state}/rotations/south.png`;
  }
  return null;
}

const heroes = literal('HeroRoster.ts', 'HEROES');
const unarmed = literal('UnarmedHeroes.ts', 'UNARMED_HEROES');
const powers = literal('HeroPowers.ts', 'HERO_POWERS');
const maps = literal('WorldDestinations.ts', 'WORLD_DESTINATIONS');
const monsters = literal('ClassicMonsterRoster.ts', 'CLASSIC_MONSTERS');
const wings = literal('WingCatalog.ts', 'WING_CATALOG');
const shop = wingShop();

const data = {
  heroes: heroes.map((h) => ({
    name: h.name, description: h.description,
    image: southImage(h.id) || southImage(unarmed[h.name]),
    skills: (powers[h.name] || []).map((p) => ({ name: p.name, cost: p.cost, cooldown: p.cooldown, color: `#${p.color.toString(16).padStart(6, '0')}` })),
  })),
  maps: maps.map((m) => {
    // Preferência: print real do jogo (site/img/maps/<id>.jpg); senão, o rascunho do terreno.
    const shot = path.join(__dirname, '..', 'site', 'img', 'maps', `${m.id}.jpg`);
    const img = path.join(ASSETS, 'maps', m.id, 'map-composite.png');
    const mobs = monsters.filter((x) => x.map === m.name);
    return {
      name: m.name, theme: m.theme,
      image: fs.existsSync(shot) ? `/img/maps/${m.id}.jpg` : fs.existsSync(img) ? `${GAME_URL}/maps/${m.id}/map-composite.png` : null,
      levels: mobs.length ? [Math.min(...mobs.map((x) => x.level)), Math.max(...mobs.map((x) => x.level))] : null,
      monsters: mobs.length,
    };
  }),
  monsters: monsters.map((m) => ({ name: m.name, map: m.map, level: m.level, hp: m.hp, exp: m.exp, boss: !!m.boss, ranged: !!m.ranged, image: southImage(m.id) })),
  wings: shop.map((w) => ({ family: w.family, level: w.level, price: w.gold, cents: w.cents, image: `${GAME_URL}/${w.file}` })),
};
const out = path.join(__dirname, '..', 'site', 'data.js');
fs.writeFileSync(out, `// Gerado por scripts/build-site-data.js — não edite à mão.\nwindow.SITE_DATA = ${JSON.stringify(data)};\n`);
console.log(`[site] data.js: ${data.heroes.length} classes, ${data.maps.length} mapas, ${data.monsters.length} monstros, ${data.wings.length} asas`);
