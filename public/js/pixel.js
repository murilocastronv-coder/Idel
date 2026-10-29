// MU Idle Legends — arte pixel original gerada em código (sem assets externos)
'use strict';
(function () {
  const OUTLINE = '#120c08';
  const HAIR = ['#5a3a1c', '#d8d8e8', '#f2d36b', '#c43a2a', '#1a1a1a', '#7a3fb8'];
  const SKIN = ['#f1c49b', '#d9a066', '#a8693f', '#6b4226'];

  // Corpo base 16x17. Legenda: H cabelo, S pele, E olho, A armadura, a armadura escura,
  // C capa, G cinto, P calça, B bota
  const BODY = [
    '......HHHH......',
    '.....HHHHHH.....',
    '.....HSSSSH.....',
    '.....SESSES.....',
    '.....SSSSSS.....',
    '......SSSS......',
    '....CAAAAAAC....',
    '...CAAaAAaAAC...',
    '...SAAaAAaAAS...',
    '...SAAAAAAAAS...',
    '...S.GGGGGG.S...',
    '....CPPPPPPC....',
    '....CPP..PPC....',
    '.....PP..PP.....',
    '.....PP..PP.....',
    '.....BB..BB.....',
    '....BBB..BBB....',
  ];
  const GRID_W = 22, GRID_H = 21, OX = 3, OY = 3; // margem para armas e contorno

  function weaponPixels(kind, accent, attack) {
    const px = []; // [x, y, cor] em coordenadas do corpo
    const lift = attack ? -2 : 0;
    const add = (x, y, c) => px.push([x, y + lift, c]);
    if (kind === 'sword') {
      for (let y = 2; y <= 9; y++) add(13, y, y === 2 ? '#ffffff' : '#d7dde8');
      add(14, 4, '#9aa3b5'); add(14, 6, '#9aa3b5'); add(14, 8, '#9aa3b5');
      add(12, 10, '#c99a2e'); add(13, 10, '#e8b84a'); add(14, 10, '#c99a2e');
      add(13, 11, '#5a3a1c');
    } else if (kind === 'firesword') {
      for (let y = 2; y <= 9; y++) add(13, y, y % 2 ? '#ff7a3d' : '#ffd36b');
      add(14, 3, '#ff4d1f'); add(12, 5, '#ff4d1f'); add(14, 7, '#ff4d1f');
      add(12, 10, '#c99a2e'); add(13, 10, '#e8b84a'); add(14, 10, '#c99a2e'); add(13, 11, '#2a2a2a');
    } else if (kind === 'staff') {
      for (let y = 2; y <= 16; y++) add(13, y, '#7a4a22');
      add(12, 1, accent); add(13, 0, '#ffffff'); add(14, 1, accent); add(13, 1, accent); add(13, 2, accent);
      add(12, 0, attack ? accent : null); add(14, 0, attack ? accent : null);
    } else if (kind === 'bow') {
      [[2, 3], [1, 4], [1, 5], [0, 6], [0, 7], [0, 8], [0, 9], [0, 10], [1, 11], [1, 12], [2, 13]].forEach(([x, y]) => px.push([x, y, '#8a5a2b']));
      for (let y = 4; y <= 12; y++) px.push([attack ? 2 : 2, y, '#efe4c8']);
      if (attack) { for (let x = 3; x <= 9; x++) px.push([x, 8, x > 7 ? accent : '#d7dde8']); }
    } else if (kind === 'scepter') {
      for (let y = 6; y <= 12; y++) add(13, y, '#e0b84a');
      add(12, 4, accent); add(13, 3, accent); add(14, 4, accent); add(13, 4, '#ffffff'); add(13, 5, '#e0b84a');
    } else if (kind === 'book') {
      for (let y = 9; y <= 12; y++) for (let x = 0; x <= 3; x++) px.push([x, y, x === 0 ? '#24122a' : '#5a2b5e']);
      px.push([2, 10, accent]); px.push([2, 11, accent]);
      if (attack) { px.push([1, 7, accent]); px.push([2, 6, accent]); px.push([3, 7, '#ffffff']); }
    }
    return px.filter((p) => p[2]);
  }

  function shieldPixels() {
    const px = [];
    for (let y = 7; y <= 12; y++) for (let x = 0; x <= 3; x++) {
      if ((y === 12 && (x === 0 || x === 3))) continue;
      px.push([x, y, x === 0 || y === 7 ? '#c99a2e' : '#7a1e1e']);
    }
    px.push([2, 9, '#e8b84a']); px.push([2, 10, '#e8b84a']);
    return px;
  }

  function ravenPixels(frame) {
    const y = frame ? 0 : 1;
    return [[15, y, '#1a1a1a'], [16, y, '#1a1a1a'], [17, y, '#1a1a1a'], [16, y - 1, '#1a1a1a'],
      [14, y - (frame ? 1 : 0), '#2a2a33'], [18, y - (frame ? 1 : 0), '#2a2a33'], [17, y - 1, '#ffcc33']];
  }

  function classWeapon(cls) {
    return { dark_knight: 'sword', dark_wizard: 'staff', fairy_elf: 'bow', magic_gladiator: 'firesword', dark_lord: 'scepter', summoner: 'book' }[cls] || 'sword';
  }

  // Monta a grade de cores de um personagem
  function buildCharacter(cls, palette, appearance, opts) {
    const ap = appearance || {};
    const colors = {
      H: HAIR[ap.hair || 0] || palette.hair, S: SKIN[ap.skin || 0], E: '#1b1b2a',
      A: palette.armor, a: palette.armorDark, C: palette.cape, G: palette.belt, P: palette.pants, B: palette.boots,
    };
    if (ap.hair === undefined) colors.H = palette.hair;
    const grid = Array.from({ length: GRID_H }, () => Array(GRID_W).fill(null));
    const put = (x, y, c) => {
      const gx = x + OX, gy = y + OY;
      if (gx >= 0 && gy >= 0 && gx < GRID_W && gy < GRID_H && c) grid[gy][gx] = c;
    };
    const bob = opts.bob ? 1 : 0;
    // asas (atrás do corpo)
    if (opts.wings) {
      const wc = opts.wings;
      const flap = opts.bob ? 0 : 1;
      for (let i = 0; i < 6; i++) {
        put(2 - Math.floor(i / 2), 6 + i - flap, wc); put(1 - Math.floor(i / 3), 7 + i - flap, wc);
        put(13 + Math.floor(i / 2), 6 + i - flap, wc); put(14 + Math.floor(i / 3), 7 + i - flap, wc);
      }
    }
    BODY.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        const k = row[x];
        if (k === '.') continue;
        // pernas não balançam; tronco/cabeça sobem 1px no "respiro"
        put(x, y + (y < 13 ? bob : 0), colors[k]);
      }
    });
    if (cls === 'dark_knight') shieldPixels().forEach(([x, y, c]) => put(x, y + bob, c));
    weaponPixels(classWeapon(cls), palette.accent, opts.attack).forEach(([x, y, c]) => put(x, y + bob, c));
    if (cls === 'dark_lord') ravenPixels(opts.bob).forEach(([x, y, c]) => put(x, y, c));
    return grid;
  }

  function drawGrid(ctx, grid, ox, oy, scale, flip) {
    const h = grid.length, w = grid[0].length;
    const at = (x, y) => (y >= 0 && y < h && x >= 0 && x < w ? grid[y][x] : null);
    ctx.fillStyle = OUTLINE;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (at(x, y)) continue;
      if (at(x - 1, y) || at(x + 1, y) || at(x, y - 1) || at(x, y + 1)) {
        const dx = flip ? w - 1 - x : x;
        ctx.fillRect(ox + dx * scale, oy + y * scale, scale, scale);
      }
    }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const c = grid[y][x];
      if (!c) continue;
      const dx = flip ? w - 1 - x : x;
      ctx.fillStyle = c;
      ctx.fillRect(ox + dx * scale, oy + y * scale, scale, scale);
    }
  }

  function drawCharacter(ctx, cls, palette, appearance, x, y, scale, opts = {}) {
    drawGrid(ctx, buildCharacter(cls, palette, appearance, opts), x, y, scale, opts.flip);
  }

  // ---- Monstros ----
  const SLIME = [
    '....GGGGG....',
    '..GGgggggGG..',
    '.GgggggggggG.',
    '.GgWKgggWKgG.',
    'GgggKgggKgggG',
    'GggggggggggggG'.slice(0, 13),
    'GgggggMMMgggG',
    '.GgggggggggG.',
    '..GGGGGGGGG..',
  ];
  const SKELETON = [
    '...WWWW...',
    '..WWWWWW..',
    '..WKWWKW..',
    '..WWWWWW..',
    '...WKKW...',
    '..W.WW.W..',
    '.W.WWWW.W.',
    '.W..WW..W.',
    '...WWWW...',
    '...W..W...',
    '..WW..WW..',
  ];
  const GOBLIN = [
    '...ggggg...',
    'g.ggKgKgg.g',
    '.ggggggggg.',
    '...gWWWg...',
    '...RRRRR...',
    '..gRRRRRg..',
    '..gRRBRRg..',
    '...RR.RR...',
    '...gg.gg...',
    '..BBB.BBB..',
  ];
  const SPIDER = [
    '..L.......L..',
    '...L.SSS.L...',
    'L...SSSSS...L',
    '.L.SSRSRSS.L.',
    '..LSSSSSSSL..',
    '.L.SSSSSSS.L.',
    'L...SSSSS...L',
    '...L.....L...',
  ];
  const KING = [
    '..Y.Y.Y...',
    '..YYYYYY..',
  ].concat(SKELETON.map((r) => r.replace(/K/g, 'E')));
  const MON = {
    slime: (o) => ({ rows: SLIME, pal: { G: '#2f7a3a', g: '#5fd35f', W: '#ffffff', K: '#1b1b2a', M: '#1b3a20' } }),
    skeleton: (o) => ({ rows: SKELETON, pal: { W: '#e6dfcc', K: '#1b1b2a' } }),
    skeleton_king: (o) => ({ rows: KING, pal: { W: '#d8cfb4', K: '#1b1b2a', E: '#ff3030', Y: '#e8b84a' } }),
    goblin: (o) => ({ rows: GOBLIN, pal: o.tint === 'elite'
      ? { g: '#4f8a2a', K: '#ff3030', W: '#ffffff', R: '#5a1a8a', B: '#3a2418' }
      : { g: '#6aa84f', K: '#1b1b2a', W: '#ffffff', R: '#8a3a1e', B: '#4a2c18' } }),
    spider: (o) => ({ rows: SPIDER, pal: { S: '#3a2a4a', R: '#ff4040', L: '#241830' } }),
  };
  function monsterSize(kind) { const r = (MON[kind] || MON.slime)({}).rows; return [r[0].length + 2, r.length + 2]; }
  function drawMonster(ctx, kind, x, y, scale, opts = {}) {
    const def = (MON[kind] || MON.slime)(opts);
    const squash = kind === 'slime' && opts.bob ? 1 : 0;
    let grid = def.rows.map((r) => Array.from(r).map((k) => (k === '.' ? null : (opts.hurt ? '#ffffff' : def.pal[k] || null))));
    if (opts.hurt) grid = grid.map((row, ry) => row.map((c, rx) => (c && (def.rows[ry][rx] === 'K' || def.rows[ry][rx] === 'E') ? def.pal[def.rows[ry][rx]] : c)));
    if (squash) grid = grid.slice(1);
    drawGrid(ctx, grid, x, y + squash * scale, scale, !!opts.flip);
  }

  // ---- Ícones de itens 12x12 ----
  const ICONS = {
    sword: ['..........WW', '.........WWw', '........WWw.', '.......WWw..', '......WWw...', '.....WWw....', '..g.WWw.....', '..ggWw......', '...gg.......', '..h.gg......', '.h...g......', 'h...........'],
    shield: ['.GGGGGGGGGG.', 'GRRRRRRRRRRG', 'GRRRRGGRRRRG', 'GRRRRGGRRRRG', 'GRRGGGGGGRRG', 'GRRGGGGGGRRG', 'GRRRRGGRRRRG', 'GRRRRGGRRRRG', '.GRRRRRRRRG.', '..GRRRRRRG..', '...GRRRRG...', '....GGGG....'],
    helm: ['....GGGG....', '..GGWWWWGG..', '.GWWWWWWWWG.', '.GWWWWWWWWG.', 'GWWWGGGGWWWG', 'GWWG....GWWG', 'GWWGKKKKGWWG', 'GWWG.KK.GWWG', 'GWWG.KK.GWWG', '.GWG....GWG.', '..GG....GG..', '............'],
    armor: ['..GG....GG..', '.GWWG..GWWG.', 'GWWWWGGWWWWG', 'GWWWWWWWWWWG', '.GWWwWWwWWG.', '.GWWwWWwWWG.', '.GWWWWWWWWG.', '.GWWWWWWWWG.', '.GGGGGGGGGG.', '.GWWWWWWWWG.', '.GWWWWWWWWG.', '..GGGGGGGG..'],
    staff: ['.........AA.', '........AWWA', '........AWWA', '.........AA.', '........h...', '.......h....', '......h.....', '.....h......', '....h.......', '...h........', '..h.........', '.h..........'],
    bow: ['...hh.......', '..h..s......', '.h....s.....', '.h.....s....', 'h.......s...', 'h........s..', 'h........s..', 'h.......s...', '.h.....s....', '.h....s.....', '..h..s......', '...hh.......'],
    ring: ['....AAA.....', '...AWWWA....', '....AAA.....', '...GGGGG....', '..GG...GG...', '.GG.....GG..', '.G.......G..', '.G.......G..', '.GG.....GG..', '..GG...GG...', '...GGGGG....', '............'],
    scepter: ['.....AA.....', '....AWWA....', '...GAWWAG...', '....GAAG....', '.....GG.....', '.....GG.....', '.....GG.....', '.....GG.....', '.....GG.....', '....GGGG....', '.....GG.....', '.....GG.....'],
    wings: ['A..........A', 'AA........AA', 'AWA......AWA', 'AWWA....AWWA', 'AWWWA..AWWWA', '.AWWWAAWWWA.', '.AWWWAAWWWA.', '..AWWA.AWWA.'.slice(0, 12), '..AWA..AWA..', '...AA..AA...', '....A..A....', '............'],
    jewel: ['............', '....AAAA....', '...AWWAAA...', '..AWWAAAAA..', '..AAAAAAAA..', '..AAAAAAAA..', '...AAAAAA...', '....AAAA....', '.....AA.....', '............', '............', '............'],
    gloves: ['............', '..W.W.W.....', '..W.W.W.W...', '..WWWWWWW...', '..WWWWWWW.W.', '..WWWWWWWWW.', '..WWWWWWWW..', '..WWWWWWW...', '...GGGGG....', '...GGGGG....', '............', '............'],
    boots: ['............', '...WWWW.....', '...WWWW.....', '...WWWW.....', '...WWWW.....', '...WWWW.....', '...WWWWWW...', '..WWWWWWWW..', '..WWWWWWWWW.', '..GGGGGGGGG.', '............', '............'],
    book: ['............', '..GGGGGGGG..', '..GRRRRRRG..', '..GRRAARRG..', '..GRAWWARG..', '..GRAWWARG..', '..GRRAARRG..', '..GRRRRRRG..', '..GRRRRRRG..', '..GGGGGGGG..', '...ssssss...', '............'],
    potion_hp: ['....hh......', '....WW......', '...W..W.....', '..WRRRRW....', '.WRRRRRRW...', '.WRRWRRRW...', '.WRRRRRRW...', '.WRRRRRRW...', '..WRRRRW....', '...WWWW.....', '............', '............'],
    potion_mp: ['....hh......', '....WW......', '...W..W.....', '..WAAAAW....', '.WAAAAAAW...', '.WAAWAAAW...', '.WAAAAAAW...', '.WAAAAAAW...', '..WAAAAW....', '...WWWW.....', '............', '............'],
    necklace: ['GG........GG', '.G........G.', '.GG......GG.', '..G......G..', '..GG....GG..', '...GG..GG...', '....GAAG....', '....AWWA....', '....AWWA....', '.....AA.....', '............', '............'],
    jewel_chaos: ['....KKKK....', '...KPPOOK...', '..KPPWOOYK..', '.KPPWPOOYYK.', '.KPPPPOOYYK.', '.KBBBPRRYYK.', '.KBBBBRRRRK.', '..KBBBRRRK..', '...KBBRRK...', '....KBRK....', '.....KK.....', '............'],
    feather: ['..........W.', '.........WA.', '........WAA.', '.......WAAA.', '......WAAAw.', '.....WAAAw..', '....WAAAw...', '...WAAAw....', '..WAAw......', '.hAw........', '.h..........', 'h...........'],
    cape: ['...GGGGGG...', '..GAAAAAAG..', '..GAAAAAAG..', '.GAAAwAAAAG.', '.GAAAwAAAAG.', '.GAAAwAAAAAG', 'GAAAAwAAAAAG', 'GAAAAwAAAAAG', 'GAAAAAAAAAAG', 'GAAAAAAAAAAG', '.GGG.GG.GGG.', '............'],
    box: ['............', '..GGGGGGGG..', '.GAAAAAAAAG.', 'GAAAAAAAAAAG', 'GGGGGGGGGGGG', 'GAAAAYYAAAAG', 'GAAAAYYAAAAG', 'GAAAAAAAAAAG', 'GAAAAAAAAAAG', 'GAAAAAAAAAAG', '.GGGGGGGGGG.', '............'],
    pants: ['............', '..GGGGGGGG..', '..WWWWWWWW..', '..WWWWWWWW..', '..WWWwwWWW..', '..WWW..WWW..', '..WWW..WWW..', '..WWW..WWW..', '..WWW..WWW..', '..WWW..WWW..', '..GGG..GGG..', '............'],
    scroll: ['............', '.hhhhhhhhhh.', '.hAAAAAAAAh.', '..AWWWWWWA..', '..AWwwwwWA..', '..AWWWWWWA..', '..AWwwwWWA..', '..AWWWWWWA..', '..AWwwwwWA..', '.hAAAAAAAAh.', '.hhhhhhhhhh.', '............'],
    zen: ['............', '....GGGG....', '...GggggG...', '...GggggG...', '....GGGG....', '..GGGG.GGGG.', '.GggggGggggG', '.GggggGggggG', '..GGGGGGGG..', '.GggggggggG.', '..GGGGGGGG..', '............'],
  };
  function drawIcon(ctx, icon, x, y, scale, accent) {
    const pal = { W: '#e8edf5', w: '#9aa3b5', G: '#c99a2e', g: '#e8b84a', h: '#7a4a22', R: icon === 'potion_hp' || icon === 'jewel_chaos' ? '#d0302a' : '#7a1e1e', K: '#1b1b2a', A: icon === 'potion_mp' ? '#3a7aff' : accent, s: '#efe4c8',
      P: '#9a4aff', O: '#ff8a2a', Y: '#ffe08a', B: '#3a7aff' };
    const rows = ICONS[icon] || ICONS.jewel;
    const grid = rows.map((r) => Array.from(r.padEnd(12, '.')).map((k) => (k === '.' ? null : pal[k] || null)));
    drawGrid(ctx, grid, x, y, scale, false);
  }

  // ---- Paisagens dos mapas (96x54) ----
  const THEMES = {
    town: { sky: ['#2b2550', '#5a3a6b', '#c96f4a'], ground: '#4f6b3a', ground2: '#3f5a2e', feats: ['castle', 'houses'] },
    grass: { sky: ['#3a6fb0', '#76a8d8', '#bfe0f0'], ground: '#5b8a3c', ground2: '#4a7530', feats: ['trees', 'flowers'] },
    forest: { sky: ['#1f4a3a', '#3f7a4a', '#9fd07a'], ground: '#3b6b2a', ground2: '#2d5520', feats: ['bigtrees', 'flowers'] },
    snow: { sky: ['#6a86b8', '#a8c0e0', '#e6f0fa'], ground: '#e8f0f8', ground2: '#c0d0e4', feats: ['pines', 'peaks'] },
    cave: { sky: ['#0d0b14', '#1c1626', '#2b2236'], ground: '#3a3040', ground2: '#2a2230', feats: ['stalactites', 'torches'] },
    tower: { sky: ['#1a1030', '#3a2050', '#6a3060'], ground: '#40384a', ground2: '#302a38', feats: ['tower', 'bats'] },
    water: { sky: ['#06263a', '#0b4a6a', '#1a7a9a'], ground: '#c8b878', ground2: '#a89858', feats: ['seaweed', 'bubbles'] },
    desert: { sky: ['#c86a2a', '#e8a04a', '#f8d890'], ground: '#e0b860', ground2: '#c89a48', feats: ['dunes', 'pyramid'] },
    sky: { sky: ['#4a8ad8', '#8ac0f0', '#e0f0ff'], ground: '#f4f8ff', ground2: '#c8d8f0', feats: ['clouds', 'islands'] },
    darkforest: { sky: ['#140a1e', '#2a1438', '#4a2050'], ground: '#2a2030', ground2: '#1e1624', feats: ['deadtrees', 'wisps'] },
    ruins: { sky: ['#4a4a5a', '#7a7a8a', '#b0a890'], ground: '#7a6a50', ground2: '#5a4c38', feats: ['columns', 'rubble'] },
    demon: { sky: ['#1a0408', '#4a0a10', '#8a1a14'], ground: '#3a1414', ground2: '#2a0c0c', feats: ['spikes', 'embers'] },
    fortress: { sky: ['#2a3040', '#4a5060', '#7a7a80'], ground: '#5a5a50', ground2: '#46463e', feats: ['walls', 'flags'] },
    lava: { sky: ['#1a0a06', '#4a1a0a', '#a8401a'], ground: '#2a1a14', ground2: '#ff6a1a', feats: ['volcano', 'lava'] },
    temple: { sky: ['#1a1440', '#3a2a7a', '#8a6ac8'], ground: '#5a4a7a', ground2: '#463a60', feats: ['columns', 'wisps'] },
    arena: { sky: ['#3a5a8a', '#7aa0c8', '#d0e0f0'], ground: '#c8a878', ground2: '#a88858', feats: ['stands', 'flags'] },
  };

  function rng(seed) {
    let s = 0;
    for (const ch of String(seed)) s = (s * 31 + ch.charCodeAt(0)) >>> 0;
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }

  function drawLandscape(ctx, themeId, seed, W, H, t = 0, horizonRatio = 0.62) {
    const th = THEMES[themeId] || THEMES.grass;
    const r = rng(seed);
    const horizon = Math.floor(H * horizonRatio);
    const band = Math.ceil(horizon / 3);
    th.sky.forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(0, i * band, W, band + 1); });
    // estrelas para temas noturnos
    if (['town', 'cave', 'tower', 'darkforest', 'demon', 'temple', 'lava'].includes(themeId)) {
      for (let i = 0; i < 18; i++) { ctx.fillStyle = r() > 0.5 ? '#f0e6cc' : '#8a8ab0'; ctx.fillRect(Math.floor(r() * W), Math.floor(r() * horizon * 0.6), 1, 1); }
    }
    ctx.fillStyle = th.ground; ctx.fillRect(0, horizon, W, H - horizon);
    for (let i = 0; i < W * 0.6; i++) { ctx.fillStyle = th.ground2; ctx.fillRect(Math.floor(r() * W), horizon + 1 + Math.floor(r() * (H - horizon)), 2, 1); }
    const px = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), w, h); };
    th.feats.forEach((f) => {
      const n = 3 + Math.floor(r() * 3);
      if (f === 'castle') {
        const cx = W * 0.55;
        px(cx, horizon - 22, 26, 22, '#5a5470'); px(cx - 6, horizon - 30, 8, 30, '#4a4460'); px(cx + 24, horizon - 30, 8, 30, '#4a4460');
        for (let i = 0; i < 4; i++) px(cx - 6 + i * 2 * (i < 2 ? 1 : 1) + (i > 1 ? 26 : 0), horizon - 32, 1, 2, '#4a4460');
        px(cx + 10, horizon - 10, 6, 10, '#2a2030'); px(cx + 2, horizon - 18, 2, 3, '#ffd36b'); px(cx + 20, horizon - 18, 2, 3, '#ffd36b');
        px(cx - 3, horizon - 38, 1, 8, '#2a2030'); px(cx - 2, horizon - 38, 4, 3, '#c8452c');
      } else if (f === 'houses') {
        for (let i = 0; i < 3; i++) { const hx = 6 + i * 14; px(hx, horizon - 8, 10, 8, '#8a6a4a'); px(hx - 1, horizon - 11, 12, 3, '#7a2a2a'); px(hx + 4, horizon - 5, 2, 5, '#3a2418'); px(hx + 1, horizon - 6, 2, 2, '#ffd36b'); }
      } else if (f === 'trees' || f === 'bigtrees') {
        for (let i = 0; i < n + 2; i++) { const x = r() * W, s = f === 'bigtrees' ? 1.6 : 1; const y = horizon - 2 + r() * 8; px(x + 3 * s, y - 4 * s, 2 * s, 6 * s, '#5a3a1c'); px(x, y - 12 * s, 8 * s, 8 * s, '#2d6a2a'); px(x + 1 * s, y - 13 * s, 6 * s, 2 * s, '#4a9a3a'); }
      } else if (f === 'pines') {
        for (let i = 0; i < n + 3; i++) { const x = r() * W, y = horizon + r() * 10; for (let k = 0; k < 4; k++) px(x - k, y - 14 + k * 3, 2 + k * 2, 3, k % 2 ? '#2a5a4a' : '#e8f0f8'); px(x, y - 2, 2, 3, '#5a3a1c'); }
      } else if (f === 'peaks' || f === 'volcano' || f === 'pyramid') {
        const baseX = W * (0.2 + r() * 0.5), h = 20 + r() * 8;
        const col = f === 'peaks' ? '#8aa0c8' : f === 'volcano' ? '#3a2018' : '#d0a050';
        for (let k = 0; k < h; k++) px(baseX - k, horizon - h + k, 2 * k + 1, 1, col);
        if (f === 'peaks') for (let k = 0; k < 5; k++) px(baseX - k, horizon - h + k, 2 * k + 1, 1, '#ffffff');
        if (f === 'volcano') { px(baseX - 2, horizon - h - 2, 5, 2, '#ff6a1a'); for (let k = 0; k < 4; k++) px(baseX - 1 + ((t / 200 + k) % 3), horizon - h - 4 - k * 3, 2, 2, '#8a8a8a'); }
      } else if (f === 'dunes') {
        for (let i = 0; i < 3; i++) { const dx = r() * W; for (let k = 0; k < 10; k++) px(dx - k * 2, horizon - 6 + k * 0.6, k * 4, 1, '#d8a850'); }
      } else if (f === 'stalactites') {
        for (let i = 0; i < 10; i++) { const x = r() * W, l = 4 + r() * 10; for (let k = 0; k < l; k++) px(x + k / 4, k, Math.max(1, 3 - k / 4), 1, '#3a3044'); }
      } else if (f === 'torches') {
        for (let i = 0; i < 3; i++) { const x = 10 + i * 34; px(x, horizon - 10, 1, 6, '#5a3a1c'); px(x - 1, horizon - 13 + ((t / 150 + i) % 2), 3, 3, '#ff8a2a'); px(x, horizon - 14, 1, 1, '#ffd36b'); }
      } else if (f === 'tower') {
        const x = W * 0.45; px(x, horizon - 44, 16, 44, '#4a4258'); px(x - 2, horizon - 46, 20, 3, '#3a3448');
        for (let k = 0; k < 4; k++) px(x + 6, horizon - 40 + k * 9, 3, 4, (k + Math.floor(t / 500)) % 2 ? '#c06bff' : '#2a2030');
      } else if (f === 'bats' || f === 'embers' || f === 'wisps' || f === 'bubbles') {
        const col = { bats: '#1a1020', embers: '#ff8a2a', wisps: '#9affd0', bubbles: '#a8e0ff' }[f];
        for (let i = 0; i < 8; i++) { const x = (r() * W + t / (f === 'bats' ? 40 : 90)) % W; const y = (r() * horizon + (f === 'bubbles' ? -t / 60 : Math.sin(t / 400 + i) * 2)) % horizon; px(x, (y + horizon) % horizon, f === 'bats' ? 3 : 1, 1, col); }
      } else if (f === 'seaweed') {
        for (let i = 0; i < 8; i++) { const x = r() * W; for (let k = 0; k < 8; k++) px(x + Math.round(Math.sin(t / 500 + k / 2 + i)), horizon + 6 - k * 2, 1, 2, '#2a8a5a'); }
      } else if (f === 'clouds') {
        for (let i = 0; i < 5; i++) { const x = (r() * W + t / 120) % (W + 20) - 20, y = r() * horizon * 0.7; px(x, y, 14, 3, '#ffffff'); px(x + 3, y - 2, 8, 2, '#ffffff'); }
      } else if (f === 'islands') {
        for (let i = 0; i < 2; i++) { const x = 10 + i * 50 + r() * 10, y = horizon - 16 - r() * 8; px(x, y, 18, 3, '#5b8a3c'); for (let k = 0; k < 4; k++) px(x + 2 + k, y + 3 + k, 14 - k * 2, 1, '#7a5a3a'); }
      } else if (f === 'deadtrees') {
        for (let i = 0; i < n + 1; i++) { const x = r() * W; px(x, horizon - 16, 2, 18, '#1a1020'); px(x - 4, horizon - 12, 5, 1, '#1a1020'); px(x + 2, horizon - 9, 5, 1, '#1a1020'); }
      } else if (f === 'columns') {
        for (let i = 0; i < n; i++) { const x = 8 + i * (W / n), hh = 14 + r() * 14; px(x, horizon - hh, 5, hh, '#b0a890'); px(x - 1, horizon - hh - 2, 7, 2, '#c8c0a8'); }
      } else if (f === 'rubble' || f === 'flowers') {
        const cols = f === 'flowers' ? ['#ffd36b', '#ff7ad9', '#ffffff'] : ['#8a7a60', '#6a5a44'];
        for (let i = 0; i < 20; i++) px(r() * W, horizon + 2 + r() * (H - horizon - 3), f === 'flowers' ? 1 : 3, f === 'flowers' ? 1 : 2, cols[i % cols.length]);
      } else if (f === 'spikes') {
        for (let i = 0; i < 8; i++) { const x = r() * W; for (let k = 0; k < 8; k++) px(x - k / 3, horizon - 8 + k, 1 + k * 0.6, 1, '#5a1a1a'); }
      } else if (f === 'walls') {
        px(0, horizon - 14, W, 14, '#6a6a60'); for (let x = 0; x < W; x += 6) px(x, horizon - 17, 3, 3, '#6a6a60'); px(W / 2 - 5, horizon - 10, 10, 10, '#2a2a26');
      } else if (f === 'flags') {
        for (let i = 0; i < 3; i++) { const x = 14 + i * 30; px(x, horizon - 30, 1, 14, '#3a2a1a'); px(x + 1, horizon - 30 + ((t / 300 + i) % 2), 6, 4, i % 2 ? '#c8452c' : '#e8b84a'); }
      } else if (f === 'stands') {
        for (let k = 0; k < 4; k++) px(0, horizon - 16 + k * 4, W, 3, k % 2 ? '#8a6a4a' : '#6a4a32');
      } else if (f === 'lava') {
        for (let x = 0; x < W; x += 2) px(x, H - 6 + Math.round(Math.sin(x / 6 + t / 300)), 2, 6, x % 4 ? '#ff6a1a' : '#ffb02e');
      }
    });
  }

  window.PixelArt = { drawCharacter, drawMonster, monsterSize, drawIcon, drawLandscape, drawGrid, HAIR, SKIN, GRID_W, GRID_H };
})();
