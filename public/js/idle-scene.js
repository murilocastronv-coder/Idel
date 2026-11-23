/* Cenário da tela idle (visão lateral) em pixel art próprio, todo gerado por código.
   Cada tema de mapa tem céu, montanhas, mata, campo com casas/props, trilha e primeiro plano em camadas
   que andam em velocidades diferentes (paralaxe). Tem ciclo de dia e noite (24 min), luzes que acendem à
   noite, tochas, fumaça, partículas do clima e vinheta.
   É só apresentação: posições do grupo, combate e regras continuam no game.js e no servidor.
   Desenho em baixa resolução (1 pixel de arte = 2 px de tela) e ampliado sem suavizar.
   Teste: game.html?tod=0.7 fixa a hora (0 = manhã, 0,55 = pôr do sol, 0,7 = noite). */
(function () {
  'use strict';
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

  // ---------- cores ----------
  const RGB = new Map();
  function rgb(h) {
    let v = RGB.get(h);
    if (!v) { const n = parseInt(h.slice(1, 7), 16); v = [n >> 16 & 255, n >> 8 & 255, n & 255]; RGB.set(h, v); }
    return v;
  }
  const hex = (r, g, b) => '#' + ((1 << 24) | (clamp(Math.round(r), 0, 255) << 16) | (clamp(Math.round(g), 0, 255) << 8) | clamp(Math.round(b), 0, 255)).toString(16).slice(1);
  function mix(a, b, t) { const A = rgb(a), B = rgb(b); return hex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t); }
  const lite = (c, k) => mix(c, '#ffffff', k);
  const dark = (c, k) => mix(c, '#000000', k);
  const rgbs = (h) => rgb(h).join(',');
  function grad(stops, t) {   // cor numa lista de paradas igualmente espaçadas
    t = clamp(t, 0, 1) * (stops.length - 1);
    const i = Math.min(stops.length - 2, Math.floor(t));
    return mix(stops[i], stops[i + 1], t - i);
  }

  // ---------- sorteio estável ----------
  function seedOf(s) { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rngOf(seed) {
    let s = (seed >>> 0) || 1;
    return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  }

  // ---------- temas ----------
  // sky/night: topo, meio, horizonte · meadow: campo (perto do horizonte → perto da câmera) · path: trilha
  const THEMES = {
    town: {
      sky: ['#3f8fdc', '#86c4f0', '#dcf0f4'], night: ['#060a20', '#121a40', '#2a335c'],
      far: { kind: 'mountains', c: '#7f9cc0', cap: '#eef5fc', amp: 0.62 },
      mid: { kind: 'castle', c: '#6d8f78', stone: '#8a96a6', roof: '#6a4a72' },
      line: { kind: 'round', c: '#3f7a3e' },
      back: 'town',
      meadow: { kind: 'grass', c: ['#9acb5e', '#7cb64c', '#64a03e', '#4f8a32'], flowers: ['#ffe066', '#ff8fa3', '#ffffff', '#a8d8ff'] },
      path: { kind: 'cobble', c: ['#8f857a', '#b3a998', '#d2c9b6', '#625a52'] },
      front: { kind: 'grass', c: ['#244a1c', '#3a6a2a'] },
      fx: ['leaf', 'butterfly', 'firefly'], rays: true,
    },
    grass: {
      sky: ['#3f8fdc', '#86c4f0', '#dcf0f4'], night: ['#060a20', '#121a40', '#2a335c'],
      far: { kind: 'mountains', c: '#86a2c2', cap: '#eef5fc', amp: 0.5 },
      mid: { kind: 'hills', c: '#6c9a6a' },
      line: { kind: 'round', c: '#3f7a3e' },
      back: 'forest',
      meadow: { kind: 'grass', c: ['#9acb5e', '#7cb64c', '#64a03e', '#4f8a32'], flowers: ['#ffe066', '#ff8fa3', '#ffffff'] },
      path: { kind: 'dirt', c: ['#b08e62', '#c8a678', '#8a6c48', '#6e5438'] },
      front: { kind: 'grass', c: ['#244a1c', '#3a6a2a'] },
      fx: ['leaf', 'butterfly', 'firefly'], rays: true,
    },
    noria: {
      sky: ['#36a0d8', '#8ed6ee', '#e6f8ea'], night: ['#071226', '#10284a', '#244a60'],
      far: { kind: 'hills', c: '#8cc0b0', amp: 0.42 },
      mid: { kind: 'worldtree', c: '#5f9a78', leaf: '#6fb07a' },
      line: { kind: 'blossom', c: '#3f8a4a', bloom: '#f2a6c8' },
      back: 'noria',
      meadow: { kind: 'grass', c: ['#a6dc64', '#86c852', '#6cb444', '#559c36'], flowers: ['#ffd1e8', '#ff8fc0', '#ffffff', '#ffe066', '#c8a8ff'] },
      path: { kind: 'dirt', c: ['#c4a676', '#dcc08e', '#a08458', '#806640'] },
      front: { kind: 'fern', c: ['#1f5a2a', '#3a8a3e'] },
      fx: ['petal', 'butterfly', 'firefly'], rays: true,
    },
    forest: {
      sky: ['#3a86c8', '#7fbede', '#cfe8e0'], night: ['#050a1a', '#0e1a34', '#20304a'],
      far: { kind: 'mountains', c: '#6f90a8', amp: 0.45 },
      mid: { kind: 'hills', c: '#4f7a5a' },
      line: { kind: 'round', c: '#2c5a2e' },
      back: 'forest',
      meadow: { kind: 'grass', c: ['#7ab04c', '#5e9a3c', '#4a8430', '#386c26'], flowers: ['#ffe066', '#ffffff'] },
      path: { kind: 'dirt', c: ['#9a7a52', '#b4946a', '#7a5e3e', '#5e4630'] },
      front: { kind: 'fern', c: ['#163a16', '#2a5a26'] },
      fx: ['leaf', 'firefly'], rays: true,
    },
    snow: {
      sky: ['#6aa2d6', '#a8cdea', '#e4eef6'], night: ['#060c24', '#121e42', '#2c3a62'],
      far: { kind: 'mountains', c: '#93a9c4', cap: '#ffffff', capAt: 0.42, amp: 0.68 },
      mid: { kind: 'pines', c: '#5a7486', snow: true },
      line: { kind: 'pine', c: '#3a5a52', snow: true },
      back: 'cabins',
      meadow: { kind: 'snow', c: ['#f2f7fc', '#e4edf6', '#d6e2ee', '#c4d4e4'] },
      path: { kind: 'snow', c: ['#cbd8e6', '#dde7f1', '#a9bacd', '#8fa2b8'] },
      front: { kind: 'snowrock', c: ['#2a3a4a', '#e8f0f8'] },
      fx: ['snow'],
    },
    glacier: {
      sky: ['#4a80c0', '#8cb8e0', '#d4ecfa'], night: ['#040a1e', '#0c1a3c', '#1c3058'],
      far: { kind: 'mountains', c: '#93bde0', lit: '#d4ecfa', cap: '#ffffff', capAt: 0.3, amp: 0.72 },
      mid: { kind: 'icespikes', c: '#78a4cc' },
      line: null,
      back: 'ice',
      meadow: { kind: 'snow', c: ['#e2f0fa', '#cfe4f4', '#bcd6ec', '#a6c6e2'] },
      path: { kind: 'ice', c: ['#b6d6ee', '#d8ecfa', '#8eb4d6', '#7aa0c4'] },
      front: { kind: 'icefront', c: ['#2a4a6a', '#a8d4f0'] },
      fx: ['snow'], aurora: true,
    },
    desert: {
      sky: ['#4f96d4', '#9cc8e6', '#f4e4c4'], night: ['#0a0a22', '#1a1a3e', '#3a3050'],
      far: { kind: 'dunes', c: '#e2b47c', pyramid: '#cfa06a' },
      mid: { kind: 'mesas', c: '#c48c56' },
      line: null,
      back: 'desert',
      meadow: { kind: 'sand', c: ['#f0d29a', '#e8c486', '#deb472', '#cfa262'] },
      path: { kind: 'sand', c: ['#cf9e62', '#dcb27a', '#b4844e', '#9a6e3e'] },
      front: { kind: 'dry', c: ['#5a3a1e', '#8a6a3a'] },
      fx: ['dust'],
    },
    lava: {
      cycle: false, dark: 0.75,
      sky: ['#140606', '#3a100c', '#8a2e14'],
      far: { kind: 'volcano', c: '#2a120e' },
      mid: { kind: 'crags', c: '#1c0c0a', lava: true },
      line: null,
      back: 'lava',
      meadow: { kind: 'ash', c: ['#4a2a22', '#3e221c', '#331c18', '#281612'] },
      path: { kind: 'basalt', c: ['#2e1c18', '#3e2620', '#1e1210', '#ff6a1a'] },
      front: { kind: 'crag', c: ['#120806', '#3a1a12'] },
      fx: ['ember', 'ash'],
    },
    cave: {
      cycle: false, indoor: true, dark: 0.85,
      sky: ['#0c0a12', '#16121e', '#221c2c'],
      far: { kind: 'cavewall', c: '#3a3246' },
      mid: null, line: null,
      back: 'petrified',
      meadow: { kind: 'rock', c: ['#3a3242', '#332c3a', '#2c2632', '#241f2a'] },
      path: { kind: 'gravel', c: ['#4a4252', '#5a5262', '#3a3442', '#2a2430'] },
      front: { kind: 'stalag', c: ['#0e0c12', '#2a2432'] },
      fx: ['spore', 'dust'],
    },
    dungeon: {
      cycle: false, indoor: true, dark: 0.85,
      sky: ['#0a080e', '#141018', '#1e1824'],
      far: { kind: 'brickwall', c: '#3a3444', mortar: '#26202e' },
      mid: null, line: null,
      back: 'dungeon',
      meadow: { kind: 'flag', c: ['#3e3846', '#38323f', '#322c38', '#2a2530'] },
      path: { kind: 'carpet', c: ['#6e1e22', '#8a2a2e', '#4e1418', '#d4a84a'] },
      front: { kind: 'rubble', c: ['#0c0a10', '#2a2430'] },
      fx: ['dust', 'ember'],
    },
    tower: {
      cycle: false, indoor: true, dark: 0.8,
      sky: ['#0a0a1a', '#141428', '#20203a'],
      far: { kind: 'towerwall', c: '#33335a', mortar: '#22223e' },
      mid: null, line: null,
      back: 'tower',
      meadow: { kind: 'checker', c: ['#2e2e4c', '#3a3a5c', '#26263e', '#20203a'] },
      path: { kind: 'carpet', c: ['#3e2462', '#56327e', '#2a1846', '#d4b45a'] },
      front: { kind: 'rubble', c: ['#0a0a16', '#26264a'] },
      fx: ['magic', 'dust'],
    },
    sky: {
      sky: ['#2e7fe0', '#7cbcf4', '#eaf6ff'], night: ['#040820', '#0e1a44', '#2a3a6a'],
      far: { kind: 'islands', c: '#7aa0c8', grass: '#9ad07a' },
      mid: { kind: 'cloudbank', c: '#e8f0fa' },
      line: null,
      back: 'skyruins',
      meadow: { kind: 'cloud', c: ['#ffffff', '#f2f6fc', '#e4ecf8', '#d4e0f2'] },
      path: { kind: 'marble', c: ['#e6dfcf', '#f6f0e2', '#c8bea8', '#d8b04a'] },
      front: { kind: 'cloudfront', c: ['#c8d6ec', '#ffffff'] },
      fx: ['feather', 'sparkle'],
    },
    water: {
      cycle: false, dark: 0.35, under: true,
      sky: ['#56c6d6', '#1c7e9c', '#0e4a68'],
      far: { kind: 'reefrocks', c: '#174f6a' },
      mid: { kind: 'sunkenruins', c: '#1d5f78' },
      line: null,
      back: 'water',
      meadow: { kind: 'seabed', c: ['#6a9a98', '#7a9a8a', '#6a8478', '#4a6460'] },
      path: { kind: 'seabed', c: ['#a8a88a', '#bcbc9a', '#8a8a6e', '#6e6e58'] },
      front: { kind: 'reef', c: ['#0a3042', '#1a5a5a'] },
      fx: ['bubble', 'fish'],
    },
    crystal: {
      cycle: false, dark: 0.7,
      sky: ['#0a1232', '#1e2a62', '#4a5aa6'],
      far: { kind: 'spires', c: '#34428a', glow: '#8ae8ff' },
      mid: { kind: 'crystals', c: '#2a5a8a', glow: '#7af0ff' },
      line: null,
      back: 'crystal',
      meadow: { kind: 'rock', c: ['#33456a', '#2c3c5e', '#253452', '#1e2c46'] },
      path: { kind: 'crystalstone', c: ['#3a4c6e', '#4c6086', '#2a3852', '#8ae8ff'] },
      front: { kind: 'shards', c: ['#0a1228', '#3a6aa0'] },
      fx: ['sparkle'],
    },
    abyss: {
      cycle: false, dark: 0.8,
      sky: ['#0e0206', '#320812', '#7a1a18'],
      far: { kind: 'hellspires', c: '#240810' },
      mid: { kind: 'ribs', c: '#3a1418', bone: '#8a7a6a' },
      line: null,
      back: 'abyss',
      meadow: { kind: 'ash', c: ['#3a1416', '#321014', '#2a0c10', '#20080c'] },
      path: { kind: 'basalt', c: ['#2a0e10', '#3a1416', '#1a0608', '#ff3a1a'] },
      front: { kind: 'crag', c: ['#0e0204', '#3a0e12'] },
      fx: ['ember', 'ash'],
    },
    darkforest: {
      cycle: false, dark: 0.75,
      sky: ['#0e0c20', '#221c3e', '#463a5c'],
      far: { kind: 'hills', c: '#26263e', amp: 0.4 },
      mid: { kind: 'deadwood', c: '#1c1c30' },
      line: { kind: 'dead', c: '#16182a' },
      back: 'darkforest',
      meadow: { kind: 'moss', c: ['#2e3e2e', '#283828', '#223022', '#1a261c'] },
      path: { kind: 'moss', c: ['#3a3428', '#4a4232', '#2a261c', '#1e1a14'] },
      front: { kind: 'fern', c: ['#0a140c', '#1e3220'] },
      fx: ['wisp', 'mist'],
    },
    void: {
      cycle: false, dark: 0.85, space: true,
      sky: ['#04030c', '#100822', '#261440'],
      far: { kind: 'floatrocks', c: '#1a1230', glow: '#b06aff' },
      mid: { kind: 'obelisks', c: '#221838', glow: '#c08aff' },
      line: null,
      back: 'void',
      meadow: { kind: 'rock', c: ['#261a3a', '#201632', '#1a122a', '#140e22'] },
      path: { kind: 'rune', c: ['#2a1e40', '#3a2a54', '#1c1430', '#c08aff'] },
      front: { kind: 'shards', c: ['#08040e', '#3a2a5a'] },
      fx: ['mote'],
    },
  };
  // temas que não aparecem na tela idle (arenas/eventos) caem num parecido
  const ALIAS = { castle: 'dungeon', devilsq: 'abyss' };
  // detalhes de mapas específicos
  const MAP_OVERRIDES = {
    devias: { back: 'cabins' },
    crywolf: { back: 'fort' },
    pantano_sombrio: { back: 'swamp', meadow: { kind: 'moss', c: ['#2a3a30', '#24342a', '#1e2c24', '#18241e'] } },
    deserto_escarlate: {
      sky: ['#c8604a', '#e8946a', '#f8cc9a'], far: { kind: 'dunes', c: '#c8704e', pyramid: '#a85a40' }, mid: { kind: 'mesas', c: '#9a4a34' },
      meadow: { kind: 'sand', c: ['#e8a47a', '#de946a', '#d2845c', '#c4744e'] }, path: { kind: 'sand', c: ['#b8664a', '#c87a5a', '#9a5038', '#7e402c'] },
    },
    torre_eclipse: { eclipse: true },
    dungeon_2: { indoor: true, far: { kind: 'brickwall', c: '#3e2a2a', mortar: '#241414' }, mid: null, back: 'dungeon', meadow: { kind: 'flag', c: ['#3a2e2e', '#342828', '#2e2222', '#261c1c'] }, front: { kind: 'rubble', c: ['#0e0606', '#2e1a16'] } },
    dungeon_3: { indoor: true, far: { kind: 'brickwall', c: '#3e2a2a', mortar: '#241414' }, mid: null, back: 'dungeon', meadow: { kind: 'flag', c: ['#3a2e2e', '#342828', '#2e2222', '#261c1c'] }, front: { kind: 'rubble', c: ['#0e0606', '#2e1a16'] } },
    ruinas_celestes: { back: 'skyruins' },
    trono_vazio: { back: 'void' },
  };
  function themeFor(theme, map) {
    const id = THEMES[theme] ? theme : ALIAS[theme] || 'grass';
    const base = THEMES[id];
    const ov = MAP_OVERRIDES[map] || null;
    const th = Object.assign({ cycle: true, dark: 0, indoor: false }, base, ov || {});
    th.key = id + (ov ? ':' + map : '');
    th.seed = seedOf(map || id);
    if (!th.night) th.night = th.sky;
    return th;
  }

  // ---------- hora do dia (ciclo de 24 minutos; igual para todo mundo pelo relógio) ----------
  let TOD = null;
  try { const q = new URLSearchParams(location.search).get('tod'); if (q != null && q !== '' && Number.isFinite(Number(q))) TOD = ((Number(q) % 1) + 1) % 1; } catch (_) { /* sem URL */ }
  const CYCLE_MS = 24 * 60 * 1000;
  function timeOfDay() {
    const ph = TOD != null ? TOD : (Date.now() % CYCLE_MS) / CYCLE_MS;
    // dia 0,94→0,50 · pôr do sol 0,50→0,60 · noite 0,60→0,86 · amanhecer 0,86→0,94
    const n = ph < 0.5 ? 0 : ph < 0.6 ? smooth(0.5, 0.6, ph) : ph < 0.86 ? 1 : ph < 0.94 ? 1 - smooth(0.86, 0.94, ph) : 0;
    const d = Math.max(0, 1 - Math.abs(ph - 0.55) / 0.07) + Math.max(0, 1 - Math.abs(ph - 0.9) / 0.06);
    const sunT = ((ph - 0.88 + 1) % 1) / 0.7;            // 0 nascer → 1 pôr
    const moonT = ((ph - 0.55 + 1) % 1) / 0.38;
    return { ph, n, d: Math.min(1, d), sunT, moonT };
  }

  // ---------- primitivas (desenho em pixels inteiros) ----------
  function kit(g) {
    const R = (x, y, w, h, c) => { if (c) g.fillStyle = c; w = Math.round(w); h = Math.round(h); if (w <= 0 || h <= 0) return; g.fillRect(Math.round(x), Math.round(y), w, h); };
    const disc = (cx, cy, r, c) => {
      r = Math.round(r); cx = Math.round(cx); cy = Math.round(cy); if (r <= 0) { R(cx, cy, 1, 1, c); return; }
      g.fillStyle = c;
      for (let dy = -r; dy <= r; dy++) { const w = Math.round(Math.sqrt(Math.max(0, r * r - dy * dy))); g.fillRect(cx - w, cy + dy, w * 2 + 1, 1); }
    };
    const oval = (cx, cy, rx, ry, c) => {
      rx = Math.max(1, Math.round(rx)); ry = Math.max(1, Math.round(ry)); cx = Math.round(cx); cy = Math.round(cy);
      g.fillStyle = c;
      for (let dy = -ry; dy <= ry; dy++) { const w = Math.round(rx * Math.sqrt(Math.max(0, 1 - (dy / ry) * (dy / ry)))); g.fillRect(cx - w, cy + dy, w * 2 + 1, 1); }
    };
    // triângulo com base em by, metade da largura hw e altura h; lit = cor do lado esquerdo (luz)
    const tri = (cx, by, hw, h, c, lit) => {
      cx = Math.round(cx); by = Math.round(by); h = Math.max(1, Math.round(h));
      for (let i = 0; i < h; i++) {
        const half = Math.round(hw * (1 - i / h));
        R(cx - half, by - 1 - i, half * 2 + 1, 1, c);
        if (lit && half > 0) R(cx - half, by - 1 - i, half, 1, lit);
      }
    };
    const line = (x0, y0, x1, y1, c, w = 1) => {
      const n = Math.max(1, Math.round(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
      g.fillStyle = c;
      for (let i = 0; i <= n; i++) g.fillRect(Math.round(x0 + (x1 - x0) * i / n), Math.round(y0 + (y1 - y0) * i / n), w, w);
    };
    // losango (cristais): base em by, topo em by - h, largura w
    const gem = (cx, by, w, h, c, lit, edge) => {
      cx = Math.round(cx); by = Math.round(by); h = Math.max(2, Math.round(h));
      const mid = Math.round(h * 0.35);
      for (let i = 0; i < h; i++) {
        const k = i < mid ? i / mid : 1 - (i - mid) / (h - mid);
        const half = Math.max(0, Math.round(w / 2 * (i < mid ? 0.6 + 0.4 * k : k)));
        R(cx - half, by - 1 - i, half * 2 + 1, 1, c);
        if (lit && half > 0) R(cx - half, by - 1 - i, Math.max(1, Math.round(half * 0.7)), 1, lit);
        if (edge) R(cx + half, by - 1 - i, 1, 1, edge);
      }
    };
    return { R, disc, oval, tri, line, gem, g };
  }
  // desenha nos dois lados da emenda (camadas repetem a cada P pixels)
  let WRAP_SEED = 1;
  function wrap(P, x, half, fn) {
    const sd = (WRAP_SEED = (Math.imul(WRAP_SEED, 1103515245) + 12345) >>> 0);
    const call = (xx) => fn(xx, rngOf(sd ^ 0x9e3779b9));
    call(x); if (x - half < 0) call(x + P); if (x + half > P) call(x - P);
  }

  // relevo periódico (0..1) com harmônicos inteiros: repete sem emenda a cada P
  function ridge(P, r, harm, sharp = 1) {
    const ph = harm.map(() => r() * TAU), hs = new Float32Array(P);
    let lo = Infinity, hi = -Infinity;
    for (let x = 0; x < P; x++) {
      let v = 0;
      for (let i = 0; i < harm.length; i++) v += harm[i][1] * Math.sin(TAU * harm[i][0] * x / P + ph[i]);
      hs[x] = v; if (v < lo) lo = v; if (v > hi) hi = v;
    }
    for (let x = 0; x < P; x++) hs[x] = Math.pow((hs[x] - lo) / (hi - lo || 1), sharp);
    return hs;
  }
  // montanha com faces de luz/sombra (sombra em diagonal descendo de cada pico) e neve no topo
  function drawRidge(K, P, base, hs, amp, o) {
    const { R } = K;
    const lit = o.lit || lite(o.c, 0.13), sh = o.shade || dark(o.c, 0.13);
    const sm = new Float32Array(P);
    for (let x = 0; x < P; x++) { let a = 0; for (let k = -4; k <= 4; k++) a += hs[(x + k + P) % P]; sm[x] = a / 9; }
    // lado que desce de cada pico: peak[x] = x do pico que faz sombra nesta coluna (ou -1)
    const peak = new Int32Array(P).fill(-1);
    if (o.facet !== false) {
      const isPeak = (x) => { for (let k = 1; k <= 5; k++) if (sm[(x + k) % P] > sm[x] || sm[(x - k + P) % P] > sm[x]) return false; return true; };
      for (let x = 0; x < P; x++) {
        if (!isPeak(x)) continue;
        for (let d = 1; d < P / 2; d++) { const xx = (x + d) % P; if (sm[(xx + 1) % P] > sm[xx] + 1e-4 && sm[(xx + 2) % P] > sm[xx]) break; peak[xx] = x; }
      }
    }
    for (let x = 0; x < P; x++) {
      const h = hs[x] * amp, top = Math.round(base - h), depth = Math.round(h * 0.6 + 2);
      R(x, top, 1, base - top + 1, o.c);
      if (o.facet !== false && h > 2) {
        const px = peak[x];
        if (px < 0) R(x, top, 1, depth, lit);
        else {
          const dx = (x - px + P) % P, topP = base - hs[px] * amp;
          const yb = Math.min(top + depth, Math.round(topP + dx * 1.8));
          if (yb > top) R(x, top, 1, yb - top, sh);
          if (top + depth > yb) R(x, Math.max(top, yb), 1, top + depth - Math.max(top, yb), lit);
          R(x, Math.max(top, yb), 1, 1, mix(lit, sh, 0.5));
        }
      }
      if (o.cap && hs[x] > (o.capAt || 0.6)) {
        const cd = Math.round((hs[x] - (o.capAt || 0.6)) * amp * 0.9 + ((x * 7) % 3));
        const shaded = peak[x] >= 0 && Math.round(base - hs[peak[x]] * amp + ((x - peak[x] + P) % P) * 1.8) > top;
        R(x, top, 1, cd, shaded ? mix(o.cap, sh, 0.35) : o.cap);
        R(x, top + cd, 1, 1, mix(o.cap, o.c, 0.5));
      }
      if (o.edge) R(x, top, 1, 1, o.edge);
    }
  }

  // ---------- árvores e props ----------
  function treeRound(K, x, base, s, c, r) {
    const { R, disc } = K;
    const th = Math.max(3, Math.round(5 * s)), tw = Math.max(2, Math.round(2.2 * s));
    R(x - (tw >> 1), base - th, tw, th, c.t); R(x - (tw >> 1) + tw - 1, base - th, 1, th, c.td);
    const rad = Math.max(3, Math.round(6.5 * s)), cy = base - th - Math.round(rad * 0.75);
    disc(x - rad * 0.45, cy + rad * 0.2, rad * 0.72 + 1, c.o); disc(x + rad * 0.5, cy + rad * 0.25, rad * 0.68 + 1, c.o); disc(x, cy - rad * 0.15, rad + 1, c.o);
    disc(x - rad * 0.45, cy + rad * 0.2, rad * 0.72, c.d); disc(x + rad * 0.5, cy + rad * 0.25, rad * 0.68, c.d); disc(x, cy - rad * 0.15, rad, c.d);
    disc(x - rad * 0.2, cy - rad * 0.32, rad * 0.68, c.m); disc(x - rad * 0.58, cy + rad * 0.05, rad * 0.42, c.m);
    disc(x - rad * 0.38, cy - rad * 0.55, rad * 0.32, c.l);
    for (let k = 0; k < rad * 1.5; k++) R(x + (r() - 0.5) * rad * 1.7, cy + (r() - 0.5) * rad * 1.5, 1, 1, r() < 0.5 ? c.l : c.d);
    if (c.bloom) for (let k = 0; k < rad * 1.2; k++) R(x + (r() - 0.55) * rad * 1.6, cy + (r() - 0.6) * rad * 1.4, 1, 1, r() < 0.6 ? c.bloom : lite(c.bloom, 0.4));
  }
  function treePine(K, x, base, s, c, snow) {
    const { R, tri } = K;
    const th = Math.max(2, Math.round(3 * s)), tw = Math.max(1, Math.round(1.6 * s));
    R(x - (tw >> 1), base - th, tw, th, c.t);
    const tiers = 4, tierH = Math.max(3, Math.round(6 * s)), step = Math.max(2, Math.round(tierH * 0.6));
    for (let k = 0; k < tiers; k++) {
      const by = base - th - k * step, hw = Math.max(1, Math.round((7 - k * 1.5) * s));
      tri(x, by + 1, hw + 1, tierH + 1, c.o);
      tri(x, by, hw, tierH, c.d, c.m);
      if (snow) {
        for (let i = 0; i < tierH; i++) {
          const half = Math.round(hw * (1 - i / tierH));
          if (i % 2 === 0 || i > tierH * 0.6) { R(x - half, by - 1 - i, 1, 1, '#f4f9ff'); if (half > 1) R(x + half, by - 1 - i, 1, 1, '#dbe7f3'); }
        }
        R(x - hw, by - 1, hw * 2 + 1, 1, '#e8f1fa');
      }
    }
    R(x, base - th - (tiers - 1) * step - tierH - 1, 1, 2, snow ? '#ffffff' : c.l);
  }
  function treeDead(K, x, base, s, c, r) {
    const { R, line } = K;
    const h = Math.round((14 + r() * 8) * s);
    for (let i = 0; i < h; i++) { const w = Math.max(1, Math.round((2.6 - 2 * i / h) * s)); R(x - (w >> 1) + Math.round(Math.sin(i * 0.25 + x) * 0.8), base - i, w, 1, c.t); }
    const top = base - h;
    for (let b = 0; b < 4; b++) {
      const y0 = top + Math.round(h * (0.1 + b * 0.18)), dir = b % 2 ? 1 : -1, len = Math.round((5 + r() * 6) * s);
      const x1 = x + dir * len, y1 = y0 - Math.round(len * (0.4 + r() * 0.5));
      line(x, y0, x1, y1, c.t);
      line(x1, y1, x1 + dir * Math.round(2 * s), y1 - Math.round(3 * s), c.t);
      if (c.leaf) for (let k = 0; k < 5; k++) R(x1 + (r() - 0.5) * 5 * s, y1 + (r() - 0.5) * 4 * s, 1 + (r() < 0.3), 1, k % 2 ? c.leaf : lite(c.leaf, 0.2));
    }
  }
  function bush(K, x, base, s, c, r) {
    const { disc, R } = K, rad = Math.max(2, Math.round(3.4 * s));
    const lobes = [[-0.75, 0.55, 0.62], [0.75, 0.55, 0.62], [0, 0.85, 0.85], [-0.4, 1.25, 0.55], [0.4, 1.2, 0.55]];
    if (r() < 0.5) lobes.push([1.15, 0.4, 0.42]); else lobes.push([-1.15, 0.4, 0.42]);
    for (const [dx, dy, k] of lobes) disc(x + dx * rad, base - dy * rad, k * rad + 1, c.o);
    for (const [dx, dy, k] of lobes) disc(x + dx * rad, base - dy * rad, k * rad, c.d);
    for (const [dx, dy, k] of lobes) if (dy > 0.5) disc(x + dx * rad - k * rad * 0.25, base - dy * rad - k * rad * 0.3, k * rad * 0.55, c.m);
    // folhas soltas: tira o aspecto liso
    for (let i = 0; i < rad * 5; i++) {
      const a = r() * TAU, d = r() * rad * 1.1, lx = x + Math.cos(a) * d * 1.2, ly = base - rad * 0.8 + Math.sin(a) * d * 0.75;
      R(lx, ly, 1, 1, ly < base - rad ? (r() < 0.6 ? c.l : c.m) : (r() < 0.6 ? c.o : c.d));
    }
    for (let i = 0; i < rad; i++) R(x + (r() - 0.5) * rad * 2.4, base - rad * (1.5 + r() * 0.4), 1, 1, c.o);
    R(x - rad * 1.2, base - 1, rad * 2.4, 1, c.o);
    if (c.flower) for (let k = 0; k < Math.max(3, rad); k++) { const fx = x + (r() - 0.5) * rad * 2, fy = base - rad * (0.5 + r()); R(fx, fy, 1, 1, c.flower); if (r() < 0.4) R(fx + 1, fy, 1, 1, lite(c.flower, 0.4)); }
  }
  function rock(K, x, base, s, c, snow) {
    const { R } = K, w = Math.max(2, Math.round(5 * s)), h = Math.max(2, Math.round(4 * s));
    const rows = [];
    for (let i = 0; i < h; i++) { const t = i / h; rows.push(Math.max(1, Math.round(w * (t < 0.45 ? 1 - t * 0.15 : Math.sqrt(Math.max(0, 1 - ((t - 0.45) / 0.55) ** 2)) * 0.93)) - ((i * 5 + x) % 3 === 0 ? 1 : 0))); }
    for (let i = 0; i < h; i++) { const y = base - 1 - i, hw = rows[i]; R(x - hw - 1, y, hw * 2 + 3, 1, c.o); }
    R(x - rows[h - 1], base - h - 1, rows[h - 1] * 2 + 1, 1, c.o);
    for (let i = 0; i < h; i++) {
      const y = base - 1 - i, hw = rows[i];
      R(x - hw, y, hw * 2 + 1, 1, c.d);
      R(x - hw, y, Math.max(1, Math.round(hw * 1.1)), 1, c.m);
      if (i > h * 0.55) R(x - hw + 1, y, Math.max(1, Math.round(hw * 0.7)), 1, c.l);
    }
    R(x - rows[0] + 1, base - 1, rows[0] * 2 - 1, 1, dark(c.d, 0.15));
    if (w > 4) K.line(x + Math.round(w * 0.2), base - h + 1, x + Math.round(w * 0.35), base - 2, dark(c.d, 0.2));
    if (snow) { const hw = rows[h - 1]; R(x - hw - 1, base - h - 1, hw * 2 + 3, 2, '#ffffff'); R(x - hw, base - h + 1, Math.max(1, hw), 1, '#e8f0f8'); }
  }
  const TREE_PAL = (base, o = {}) => ({ o: dark(base, 0.55), d: dark(base, 0.12), m: lite(base, 0.12), l: lite(base, 0.32), t: o.t || '#6a4a30', td: o.td || '#4a3220', bloom: o.bloom });

  function house(K, x, base, s, r, out, v = {}) {
    const { R } = K;
    const w = Math.round((15 + r() * 8) * s), h = Math.round((9 + r() * 4) * s);
    const L = x - (w >> 1), T = base - h;
    const wall = v.wall || ['#e8dcc0', '#d8c8a4', '#f2ead4'][(r() * 3) | 0], beam = v.beam || '#5a3e28';
    const roof = v.roof || ['#a8483a', '#8a5a3a', '#5a6a8a', '#7a3a4a'][(r() * 4) | 0];
    R(L, T, w, h, wall); R(L, T, 1, h, lite(wall, 0.2)); R(L + w - 2, T, 2, h, dark(wall, 0.18));
    if (!v.logs) {
      R(L, T, w, 1, beam); R(L, T + (h >> 1), w, 1, beam);
      for (const vx of [L, L + Math.round(w / 3), L + Math.round(2 * w / 3), L + w - 1]) R(vx, T, 1, h, beam);
    } else for (let y = T + 1; y < base; y += 2) R(L, y, w, 1, dark(wall, 0.25));
    // telhado com beiral
    const rh = Math.round(w * 0.42), over = 2;
    for (let i = 0; i <= rh; i++) {
      const half = Math.round((w / 2 + over) * (1 - i / (rh + 1)));
      const y = T - 1 - i;
      R(x - half, y, half * 2, 1, i % 3 === 0 ? dark(roof, 0.12) : roof);
      R(x - half, y, Math.max(1, half >> 1), 1, lite(roof, 0.14));
    }
    R(L - over, T - 1, w + over * 2, 1, dark(roof, 0.35));
    if (v.snowRoof) for (let i = 0; i <= rh; i++) { const half = Math.round((w / 2 + over) * (1 - i / (rh + 1))); R(x - half, T - 1 - i, 2, 1, '#f4f9ff'); R(x + half - 2, T - 1 - i, 2, 1, '#e2ecf6'); if (i < 2) R(x - half, T - 2 - i, half * 2, 1, '#f4f9ff'); }
    // chaminé
    if (r() < 0.75) {
      const cx = x + Math.round(w * 0.22), cy = T - Math.round(rh * 0.55);
      R(cx, cy - 4, 3, 5, v.logs ? '#6a5a50' : '#7a5a4a'); R(cx, cy - 4, 3, 1, '#4a3a30');
      out.emit.push({ x: cx + 1, y: cy - 5, kind: 'smoke' });
    }
    // porta e janelas
    const dw = Math.max(3, Math.round(3 * s)), dh = Math.max(4, Math.round(5 * s));
    R(x - (dw >> 1), base - dh, dw, dh, '#4a2e1c'); R(x - (dw >> 1), base - dh, dw, 1, '#2e1a10');
    out.lights.push({ x, y: base - (dh >> 1), r: 14, col: '255,190,110', a: 0.5, fl: 0.08, night: true });
    for (const wx of [L + 2, L + w - 5]) {
      if (wx < L + 1 || wx + 3 > L + w - 1) continue;
      const wy = T + 2;
      R(wx - 1, wy - 1, 5, 5, beam); R(wx, wy, 3, 3, '#3a4a6a'); R(wx, wy, 1, 1, '#6a7a9a');
      out.wins.push([wx, wy, 3, 3]);
      out.lights.push({ x: wx + 1.5, y: wy + 1.5, r: 10, col: '255,200,120', a: 0.45, fl: 0.05, night: true });
    }
  }
  function lamp(K, x, base, out, col = '255,200,120') {
    const { R } = K;
    R(x, base - 15, 1, 15, '#2a2a32'); R(x - 1, base - 1, 3, 1, '#2a2a32');
    R(x - 1, base - 19, 3, 4, '#3a3a44'); R(x, base - 18, 1, 2, '#ffd27a'); R(x - 2, base - 20, 5, 1, '#2a2a32');
    out.wins.push([x, base - 18, 1, 2]);
    out.lights.push({ x: x + 0.5, y: base - 17, r: 24, col, a: 0.7, fl: 0.12, night: true });
  }
  function fence(K, x0, len, base, c) {
    const { R } = K;
    for (let x = x0; x <= x0 + len; x += 4) { R(x, base - 6, 1, 6, c); R(x, base - 6, 1, 1, lite(c, 0.25)); }
    R(x0, base - 5, len + 1, 1, c); R(x0, base - 3, len + 1, 1, dark(c, 0.15));
  }
  function torch(K, x, y, out, col = '255,150,60', flame = '#ffb02e') {
    const { R } = K;
    R(x - 1, y, 3, 1, '#3a3036'); R(x, y + 1, 1, 4, '#4a3a30');
    out.flames.push({ x, y: y - 1, c: flame });
    out.lights.push({ x: x + 0.5, y: y - 2, r: 30, col, a: 0.75, fl: 0.25 });
  }
  function barrel(K, x, base, s) {
    const { R } = K, w = Math.round(6 * s), h = Math.round(8 * s), L = x - (w >> 1);
    R(L, base - h, w, h, '#7a5232'); R(L, base - h, 1, h, '#9a6a42'); R(L + w - 1, base - h, 1, h, '#5a3a22');
    R(L, base - h + 1, w, 1, '#3a3a40'); R(L, base - 2, w, 1, '#3a3a40'); R(L, base - h, w, 1, '#5a3a22');
  }
  function crate(K, x, base, s) {
    const { R, line } = K, w = Math.round(7 * s), L = x - (w >> 1);
    R(L, base - w, w, w, '#8a6a42'); R(L, base - w, w, 1, '#a8845a'); R(L, base - 1, w, 1, '#5a4228');
    R(L, base - w, 1, w, '#5a4228'); R(L + w - 1, base - w, 1, w, '#5a4228');
    line(L + 1, base - w + 1, L + w - 2, base - 2, '#6a4e30'); line(L + w - 2, base - w + 1, L + 1, base - 2, '#6a4e30');
  }
  function cactus(K, x, base, s, r) {
    const { R } = K, h = Math.round((12 + r() * 8) * s), w = Math.max(2, Math.round(3 * s));
    const c = '#4a8a3a', l = '#6aaa4a', d = '#2e6a2a';
    R(x - (w >> 1), base - h, w, h, c); R(x - (w >> 1), base - h, 1, h, l); R(x + (w >> 1), base - h, 1, h, d);
    R(x - (w >> 1), base - h - 1, w, 1, c);
    const ay = base - Math.round(h * 0.55), ah = Math.round(h * 0.35);
    R(x - w - 2, ay, 3, 2, c); R(x - w - 2, ay - ah, 2, ah, c); R(x - w - 2, ay - ah, 1, ah, l);
    if (r() < 0.7) { const by = base - Math.round(h * 0.4); R(x + (w >> 1), by, 3, 2, c); R(x + (w >> 1) + 2, by - ah + 2, 2, ah - 2, c); R(x + (w >> 1) + 3, by - ah + 2, 1, ah - 2, d); }
    for (let k = 0; k < h / 3; k++) R(x - (w >> 1) + (k % w), base - h + k * 3, 1, 1, '#e8e0a0');
  }
  function palm(K, x, base, s, r) {
    const { R, line } = K, h = Math.round((18 + r() * 8) * s), lean = (r() < 0.5 ? -1 : 1) * (2 + r() * 3) * s;
    let tx = x, ty = base;
    for (let i = 0; i < h; i++) { const px = Math.round(x + lean * Math.pow(i / h, 2)); R(px - 1, base - i, 2 + (i < 3), 1, i % 3 ? '#8a6a3e' : '#6a4e2c'); tx = px; ty = base - i; }
    const fr = [[-9, 3], [-7, -2], [-3, -5], [3, -5], [7, -2], [9, 3]];
    for (const [dx, dy] of fr) {
      const ex = tx + dx * s, ey = ty + dy * s;
      line(tx, ty, (tx + ex) / 2, ty + Math.min(dy, -3) * s * 0.6, '#3a8a3a', 2);
      line((tx + ex) / 2, ty + Math.min(dy, -3) * s * 0.6, ex, ey + 2 * s, '#2e6e2e', 1);
    }
    R(tx - 1, ty, 3, 2, '#5a3a1e');
  }
  function column(K, x, base, s, c, broken) {
    const { R } = K, w = Math.round(6 * s), h = Math.round((broken ? 10 + (x % 7) : 26) * s), L = x - (w >> 1);
    R(L - 1, base - 2, w + 2, 2, dark(c, 0.15)); R(L - 1, base - 3, w + 2, 1, c);
    R(L, base - h, w, h - 3, c);
    for (let f = L + 1; f < L + w - 1; f += 2) R(f, base - h, 1, h - 3, dark(c, 0.12));
    R(L, base - h, 1, h - 3, lite(c, 0.25));
    if (!broken) { R(L - 1, base - h - 2, w + 2, 2, lite(c, 0.1)); R(L - 2, base - h - 3, w + 4, 1, c); }
    else for (let k = 0; k < w; k++) R(L + k, base - h - ((k * 3) % 3), 1, 1 + ((k * 3) % 3), c);
  }
  function crystalCluster(K, x, base, s, c, glow, r, out) {
    const { gem } = K;
    const n = 2 + Math.floor(r() * 3);
    for (let i = 0; i < n; i++) {
      const dx = Math.round((i - (n - 1) / 2) * 4 * s + (r() - 0.5) * 2), h = Math.round((8 + r() * 12) * s * (i === (n >> 1) ? 1.3 : 0.9));
      gem(x + dx, base, Math.round((3 + r() * 2) * s), h, c, lite(c, 0.35), lite(glow, 0.3));
    }
    out.lights.push({ x, y: base - 8 * s, r: 26 * s, col: rgbs(glow), a: 0.55, fl: 0.15 });
  }
  function mushroom(K, x, base, s, cap, glow, out) {
    const { R, oval } = K, h = Math.round(6 * s), rw = Math.round(4 * s);
    R(x, base - h, Math.max(1, Math.round(s)), h, '#d8ccb0');
    oval(x, base - h, rw, Math.max(1, Math.round(2 * s)), cap);
    R(x - rw + 1, base - h - 1, Math.max(1, rw), 1, lite(cap, 0.3));
    if (glow) { R(x - 1, base - h - 1, 1, 1, '#ffffff'); out.lights.push({ x, y: base - h, r: 16 * s, col: rgbs(glow), a: 0.6, fl: 0.2 }); }
  }
  function seaweed(K, x, base, s, r, c) {
    const { R } = K, h = Math.round((10 + r() * 16) * s), ph = r() * 6;
    for (let i = 0; i < h; i++) R(x + Math.round(Math.sin(i * 0.35 + ph) * 1.5), base - i, 2, 1, i % 4 ? c : lite(c, 0.2));
  }
  function coral(K, x, base, s, r, c) {
    const { line, R } = K;
    const arms = 3 + Math.floor(r() * 3);
    for (let i = 0; i < arms; i++) {
      const a = -Math.PI / 2 + (i - (arms - 1) / 2) * 0.45, len = (6 + r() * 6) * s;
      const ex = x + Math.cos(a) * len, ey = base + Math.sin(a) * len;
      line(x, base, ex, ey, c, 2);
      R(ex - 1, ey - 1, 3, 2, lite(c, 0.25));
    }
  }
  function bones(K, x, base, c) {
    const { R } = K;
    R(x - 4, base - 2, 8, 1, c); R(x - 5, base - 3, 2, 2, c); R(x + 3, base - 3, 2, 2, c);
    R(x - 1, base - 5, 4, 3, c); R(x, base - 4, 1, 1, '#1a1214'); R(x + 2, base - 4, 1, 1, '#1a1214');
  }
  function spike(K, x, base, s, c, r) {
    const { tri } = K, h = Math.round((10 + r() * 14) * s), w = Math.round((2 + r() * 2) * s);
    tri(x, base, w + 1, h + 1, dark(c, 0.4)); tri(x, base, w, h, c, lite(c, 0.18));
  }
  function bookshelf(K, x, base, s, r) {
    const { R } = K, w = Math.round(14 * s), h = Math.round(20 * s), L = x - (w >> 1);
    R(L, base - h, w, h, '#4a2e1e'); R(L, base - h, w, 1, '#6a4a30');
    const BK = ['#8a2a2a', '#2a5a8a', '#3a7a3a', '#8a7a2a', '#6a3a7a', '#a86a3a'];
    for (let sh = 0; sh < 4; sh++) {
      const y = base - h + 2 + sh * Math.round(h / 4.2);
      R(L + 1, y + Math.round(h / 4.2) - 2, w - 2, 1, '#2e1a10');
      for (let bx = L + 2; bx < L + w - 2; bx += 1 + (r() < 0.3)) R(bx, y + (r() < 0.3 ? 1 : 0), 1, Math.round(h / 4.2) - 3, BK[(r() * BK.length) | 0]);
    }
  }
  function statue(K, x, base, s, c) {
    const { R, disc } = K;
    R(x - 4 * s, base - 4 * s, 8 * s, 4 * s, dark(c, 0.15)); R(x - 4 * s, base - 4 * s, 8 * s, 1, lite(c, 0.2));
    R(x - 2 * s, base - 14 * s, 4 * s, 10 * s, c); R(x - 2 * s, base - 14 * s, 1, 10 * s, lite(c, 0.2));
    disc(x, base - 16 * s, 2 * s, c);
    R(x + 2 * s, base - 16 * s, 1, 12 * s, dark(c, 0.2)); R(x + 1 * s, base - 18 * s, 3, 2, dark(c, 0.2));
  }

  // ---------- camadas ----------
  function newLayer(P, h) {
    const c = document.createElement('canvas'); c.width = P; c.height = h;
    const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
    return { c, g, K: kit(g), lights: [], wins: [], flames: [], emit: [] };
  }
  // montanhas / relevo de fundo
  function buildFar(L, geo, th, r) {
    const { P, hz } = geo, K = L.K, f = th.far; if (!f) return;
    const amp = Math.min(hz * (f.amp || 0.6), 130);
    if (f.kind === 'mountains') {
      const back = ridge(P, r, [[2, 1], [3, 0.7], [5, 0.4], [9, 0.18]], 1.3);
      drawRidge(K, P, hz, back, amp * 1.05, { c: lite(f.c, 0.14), lit: f.lit && lite(f.lit, 0.1), cap: f.cap && lite(f.cap, 0.05), capAt: (f.capAt || 0.6) + 0.05 });
      const front = ridge(P, r, [[3, 1], [4, 0.6], [8, 0.35], [16, 0.12]], 1.6);
      drawRidge(K, P, hz, front, amp * 0.72, { c: f.c, lit: f.lit, cap: f.cap, capAt: f.capAt || 0.62 });
    } else if (f.kind === 'hills') {
      const hs = ridge(P, r, [[2, 1], [5, 0.4], [9, 0.15]], 1);
      drawRidge(K, P, hz, hs, amp * 0.6, { c: f.c, facet: false, edge: lite(f.c, 0.1) });
    } else if (f.kind === 'dunes') {
      const hs = ridge(P, r, [[2, 1], [3, 0.5], [6, 0.2]], 1.2);
      drawRidge(K, P, hz, hs, amp * 0.45, { c: lite(f.c, 0.1), lit: lite(f.c, 0.25), shade: f.c });
      for (let i = 0; i < 2; i++) {
        const x = Math.round(P * (0.25 + i * 0.45 + r() * 0.1)), w = Math.round(amp * (0.5 - i * 0.12)), h = Math.round(w * 0.75);
        wrap(P, x, w, (xx) => { K.tri(xx, hz - Math.round(amp * 0.12), w, h, f.pyramid, lite(f.pyramid, 0.16)); for (let k = 2; k < h; k += 3) K.R(xx - Math.round(w * (1 - k / h)), hz - Math.round(amp * 0.12) - k, Math.round(w * (1 - k / h)) * 2, 1, dark(f.pyramid, 0.08)); });
      }
      const near = ridge(P, r, [[3, 1], [5, 0.5], [11, 0.15]], 1.1);
      drawRidge(K, P, hz, near, amp * 0.25, { c: lite(f.c, 0.04), lit: lite(f.c, 0.2), shade: dark(f.c, 0.06) });
    } else if (f.kind === 'volcano') {
      const hs = ridge(P, r, [[2, 1], [4, 0.6], [9, 0.25]], 1.4);
      drawRidge(K, P, hz, hs, amp * 0.55, { c: lite(f.c, 0.08) });
      for (let i = 0; i < 2; i++) {
        const x = Math.round(P * (0.2 + i * 0.5 + r() * 0.1)), w = Math.round(amp * 0.9), h = Math.round(amp * (0.95 - i * 0.2));
        wrap(P, x, w, (xx, r) => {
          for (let k = 0; k < h; k++) { const half = Math.round(w * (1 - k / h) + 3); K.R(xx - half, hz - k, half * 2, 1, k % 4 ? f.c : lite(f.c, 0.05)); K.R(xx - half, hz - k, Math.round(half * 0.6), 1, lite(f.c, 0.1)); }
          K.R(xx - 3, hz - h, 7, 2, '#ff7a2a'); K.R(xx - 2, hz - h, 5, 1, '#ffd36b');
          let lx = xx + 1;
          for (let k = h - 1; k > h * 0.25; k--) { lx += (r() < 0.5 ? -1 : 1) * (r() < 0.4 ? 1 : 0); K.R(lx, hz - k, 1, 1, k % 3 ? '#ff5a1a' : '#ffb02e'); }
        });
        L.lights.push({ x, y: hz - h, r: 44, col: '255,110,40', a: 0.8, fl: 0.2 });
        L.emit.push({ x, y: hz - h - 2, kind: 'volsmoke' });
      }
    } else if (f.kind === 'icecliffs') {
      const hs = ridge(P, r, [[2, 1], [5, 0.5], [7, 0.3]], 1);
      for (let x = 0; x < P; x++) hs[x] = Math.round(hs[x] * 6) / 6;   // degraus de gelo
      drawRidge(K, P, hz, hs, amp * 0.8, { c: f.c, lit: '#e8f6ff', shade: dark(f.c, 0.12), cap: '#ffffff', capAt: 0.5 });
      for (let x = 0; x < P; x += 3 + ((x * 13) % 4)) K.R(x, hz - hs[x] * amp * 0.8 + 3, 1, Math.max(0, hs[x] * amp * 0.5), dark(f.c, 0.1));
    } else if (f.kind === 'islands') {
      // mar de nuvens + ilhas voando com cachoeiras
      for (let i = 0; i < 4; i++) {
        const x = Math.round(P * (i / 4 + r() * 0.12)), w = Math.round(14 + r() * 22), y = Math.round(hz - amp * (0.35 + r() * 0.5));
        wrap(P, x, w + 2, (xx, r) => {
          for (let k = 0; k < w * 0.8; k++) { const half = Math.round(w * (1 - k / (w * 0.8))); K.R(xx - half, y + k, half * 2 + 1, 1, k % 3 ? f.c : dark(f.c, 0.1)); }
          K.R(xx - w, y - 2, w * 2 + 1, 3, f.grass); K.R(xx - w, y - 3, w * 2 + 1, 1, lite(f.grass, 0.2));
          for (let t = 0; t < 3; t++) { const tx = xx - w + 4 + Math.round(r() * (w * 2 - 8)); K.disc(tx, y - 5, 3, '#4a8a4a'); K.R(tx, y - 3, 1, 2, '#6a4a30'); }
          if (r() < 0.7) { const wx = xx + Math.round((r() - 0.5) * w); K.R(wx, y + 1, 2, hz - y, 'rgba(220,240,255,0.55)'); }
        });
      }
      const sea = ridge(P, r, [[4, 1], [9, 0.5], [17, 0.25]], 1);
      for (let x = 0; x < P; x++) { const h = Math.round(6 + sea[x] * amp * 0.22); K.R(x, hz - h, 1, h + 1, '#f4f8ff'); K.R(x, hz - h, 1, 1, '#ffffff'); K.R(x, hz - Math.round(h * 0.4), 1, Math.round(h * 0.4) + 1, '#dbe6f6'); }
    } else if (f.kind === 'reefrocks') {
      const hs = ridge(P, r, [[2, 1], [5, 0.6], [11, 0.3]], 1.3);
      drawRidge(K, P, hz, hs, amp * 0.75, { c: f.c, facet: false });
      for (let i = 0; i < 3; i++) {   // arcos de pedra
        const x = Math.round(P * (i / 3 + r() * 0.15)), w = Math.round(18 + r() * 12), h = Math.round(amp * (0.55 + r() * 0.3));
        wrap(P, x, w + 4, (xx) => { K.R(xx - w, hz - h, 5, h, dark(f.c, 0.05)); K.R(xx + w - 5, hz - h, 5, h, dark(f.c, 0.05)); for (let k = -w; k <= w; k++) K.R(xx + k, hz - h - Math.round(Math.sqrt(Math.max(0, w * w - k * k)) * 0.35), 1, 5, dark(f.c, 0.05)); });
      }
    } else if (f.kind === 'spires') {
      const hs = ridge(P, r, [[2, 1], [5, 0.4]], 1);
      drawRidge(K, P, hz, hs, amp * 0.35, { c: f.c, facet: false });
      for (let x = 4; x < P; x += 10 + Math.floor(r() * 16)) {
        const h = Math.round(amp * (0.25 + r() * 0.6)), w = Math.round(6 + r() * 8);
        wrap(P, x, w, (xx) => K.gem(xx, hz, w, h, f.c, lite(f.c, 0.15), mix(f.c, f.glow, 0.4)));
      }
    } else if (f.kind === 'hellspires') {
      for (let x = 2; x < P; x += 4 + Math.floor(r() * 9)) {
        const h = Math.round(amp * (0.25 + r() * 0.75)), w = Math.round(3 + r() * 6);
        wrap(P, x, w, (xx) => { K.tri(xx, hz + 1, w, h, f.c, lite(f.c, 0.08)); K.R(xx, hz - h - 2, 1, 3, f.c); });
      }
      for (let i = 0; i < 3; i++) { const x = Math.round(P * (i / 3 + r() * 0.2)); L.lights.push({ x, y: hz - 4, r: 40, col: '255,60,30', a: 0.5, fl: 0.25 }); }
    } else if (f.kind === 'floatrocks') {
      for (let i = 0; i < 9; i++) {
        const x = Math.round(r() * P), w = Math.round(4 + r() * 12), y = Math.round(hz - amp * (0.15 + r() * 0.85));
        wrap(P, x, w, (xx, r) => {
          for (let k = 0; k < w; k++) { const half = Math.round(w * (1 - k / w)); K.R(xx - half, y + k, half * 2 + 1, 1, f.c); }
          K.R(xx - w, y - 1, w * 2 + 1, 1, lite(f.c, 0.2));
          if (r() < 0.5) K.R(xx - 1, y + 1, 2, 1, f.glow);
        });
      }
      const hs = ridge(P, r, [[3, 1], [7, 0.4]], 1.5);
      drawRidge(K, P, hz, hs, amp * 0.25, { c: f.c, facet: false, edge: mix(f.c, f.glow, 0.3) });
    } else if (f.kind === 'brickwall' || f.kind === 'towerwall' || f.kind === 'cavewall') {
      buildWall(L, geo, th, r);
    }
  }
  // parede do fundo (lugares fechados): tijolos, janelas da torre ou rocha de caverna
  function buildWall(L, geo, th, r) {
    const { P, hz } = geo, K = L.K, f = th.far, { R } = K;
    if (f.kind === 'cavewall') {
      for (let y = 0; y < hz; y++) R(0, y, P, 1, grad([dark(f.c, 0.45), dark(f.c, 0.2), f.c], y / hz));
      for (let i = 0; i < P * hz / 30; i++) { const x = r() * P, y = r() * hz; R(x, y, 1 + (r() < 0.4), 1, r() < 0.5 ? lite(f.c, 0.08) : dark(f.c, 0.15)); }
      for (let x = 0; x < P; x += 3 + Math.floor(r() * 7)) {   // estalactites
        const h = Math.round(4 + r() * hz * 0.18), w = Math.round(1 + r() * 3);
        wrap(P, x, w, (xx) => { for (let k = 0; k < h; k++) { const half = Math.round(w * (1 - k / h)); R(xx - half, k, half * 2 + 1, 1, k % 3 ? dark(f.c, 0.3) : dark(f.c, 0.2)); } });
      }
      for (let i = 0; i < 6; i++) { const x = Math.round(r() * P), y = Math.round(hz * (0.4 + r() * 0.5)); wrap(P, x, 2, (xx) => { R(xx, y, 2, 1, '#6ae8c8'); R(xx, y + 1, 1, 1, '#bfffee'); }); L.lights.push({ x, y, r: 14, col: '100,230,200', a: 0.5, fl: 0.3 }); }
      return;
    }
    const tower = f.kind === 'towerwall';
    const bw = tower ? 16 : 10, bh = tower ? 7 : 5;
    for (let y = 0; y < hz; y += bh) {
      const off = ((y / bh) % 2) * (bw >> 1);
      for (let x = -off; x < P; x += bw) {
        const c = mix(f.c, r() < 0.5 ? lite(f.c, 0.12) : dark(f.c, 0.12), r());
        R(x + 1, y + 1, bw - 1, bh - 1, c); R(x + 1, y + 1, bw - 1, 1, lite(c, 0.12));
      }
      R(0, y, P, 1, f.mortar);
    }
    for (let x = 0; x < P; x += bw) for (let y = 0; y < hz; y += bh) if (r() < 0.08) R(x + 2 + r() * (bw - 4), y + 2, 2, 1, dark(f.c, 0.3));   // rachaduras
    R(0, 0, P, Math.round(hz * 0.12), 'rgba(0,0,0,0.35)');   // teto escuro
    // janelas em arco (torre: céu estrelado e a lua; masmorra: grades) e pilares com tochas
    const gap = tower ? 96 : 80, n = Math.max(2, Math.round(P / gap)), step = P / n;
    for (let i = 0; i < n; i++) {
      const cx = Math.round(i * step + step / 2), ww = tower ? 14 : 10, wh = Math.round(hz * (tower ? 0.5 : 0.28)), wy = Math.round(hz * (tower ? 0.18 : 0.3));
      if (tower) {
        R(cx - ww / 2 - 2, wy - 2, ww + 4, wh + 4, dark(f.c, 0.3));
        for (let y = 0; y < wh; y++) R(cx - ww / 2, wy + y, ww, 1, grad(['#0a0a2a', '#1a2050', '#2a3070'], y / wh));
        for (let k = 0; k < ww / 2; k++) { const cut = Math.round(ww / 2 - Math.sqrt(Math.max(0, (ww / 2) ** 2 - k * k))); R(cx - ww / 2, wy + k - ww / 2, cut, 1, dark(f.c, 0.3)); R(cx + ww / 2 - cut, wy + k - ww / 2, cut, 1, dark(f.c, 0.3)); }
        for (let k = 0; k < 6; k++) R(cx - ww / 2 + 1 + r() * (ww - 2), wy + 1 + r() * (wh - 2), 1, 1, '#ffffff');
        if (i % 2 === 0) { if (th.eclipse) { K.disc(cx + 2, wy + 6, 4, '#ffd36b'); K.disc(cx + 2, wy + 6, 3, '#0a0a1a'); } else { K.disc(cx + 2, wy + 6, 3, '#f0f0d8'); K.R(cx + 1, wy + 5, 1, 1, '#c8c8b0'); } }
        R(cx - 1, wy, 2, wh, dark(f.c, 0.35)); R(cx - ww / 2, wy + Math.round(wh * 0.45), ww, 1, dark(f.c, 0.35));
        L.lights.push({ x: cx, y: wy + wh * 0.5, r: 26, col: '120,140,255', a: 0.35, fl: 0.02 });
      } else {
        R(cx - ww / 2 - 1, wy - 1, ww + 2, wh + 2, dark(f.c, 0.4)); R(cx - ww / 2, wy, ww, wh, '#0c0a10');
        for (let bx = cx - ww / 2 + 1; bx < cx + ww / 2; bx += 3) R(bx, wy, 1, wh, '#4a4a52');
      }
      // pilar entre as janelas
      const px = Math.round(cx + step / 2), pw = tower ? 10 : 8;
      R(px - pw / 2, 0, pw, hz, dark(f.c, 0.05)); R(px - pw / 2, 0, 2, hz, lite(f.c, 0.1)); R(px + pw / 2 - 2, 0, 2, hz, dark(f.c, 0.25));
      R(px - pw / 2 - 1, hz - 4, pw + 2, 4, dark(f.c, 0.15));
      torch(K, px, Math.round(hz * 0.55), L, tower ? '120,160,255' : '255,150,60', tower ? '#8ab4ff' : '#ffb02e');
      if (!tower && i % 2) { R(px - 3 - pw, Math.round(hz * 0.12), 6, Math.round(hz * 0.3), '#6a1e22'); R(px - 3 - pw, Math.round(hz * 0.12), 6, 1, '#d4a84a'); R(px - pw, Math.round(hz * 0.2), 1, 2, '#d4a84a'); }
    }
    R(0, hz - 2, P, 2, dark(f.c, 0.35));
  }
  // segunda camada (colinas, castelo, pinheirais...)
  function buildMid(L, geo, th, r) {
    const { P, hz } = geo, K = L.K, m = th.mid; if (!m) return;
    const { R } = K, amp = Math.min(hz * 0.4, 70);
    if (m.kind === 'hills' || m.kind === 'castle' || m.kind === 'worldtree') {
      const hs = ridge(P, r, [[3, 1], [5, 0.5], [11, 0.2]], 1);
      drawRidge(K, P, hz, hs, amp * 0.42, { c: m.c, facet: false, edge: lite(m.c, 0.12) });
      for (let i = 0; i < P / 9; i++) { const x = Math.round(r() * P), y = Math.round(hz - hs[x] * amp * 0.42 + 2 + r() * 4); K.disc(x, y, 1 + (r() < 0.4), dark(m.c, 0.18)); }
      if (m.kind === 'castle') {
        const x = Math.round(P * (0.3 + r() * 0.2)), base = Math.round(hz - hs[x] * amp * 0.42 + 2);
        wrap(P, x, 40, (xx) => castle(K, xx, base, m, L));
      }
      if (m.kind === 'worldtree') {
        const x = Math.round(P * (0.55 + r() * 0.1)), base = hz;
        wrap(P, x, 70, (xx, r) => {
          const h = Math.round(Math.min(hz * 0.8, 110)), bark = '#6a5440';
          for (let i = 0; i < h * 0.75; i++) {   // tronco com raízes e casca
            const t = i / (h * 0.75), w = Math.round(9 + 16 * Math.pow(1 - t, 3) + 4 * (1 - t));
            R(xx - (w >> 1), base - i, w, 1, bark); R(xx - (w >> 1), base - i, Math.max(1, w >> 2), 1, lite(bark, 0.12)); R(xx + (w >> 1) - 2, base - i, 2, 1, dark(bark, 0.2));
            if (i % 4 === 0) R(xx - 2 + ((i * 3) % 5), base - i, 1, 3, dark(bark, 0.25));
          }
          const cyc = base - h * 0.78, blobs = [];
          for (let k = 0; k < 14; k++) { const a = r() * Math.PI, d = r() * h * 0.45; blobs.push([xx + Math.cos(a) * d * 1.3, cyc - Math.sin(a) * d * 0.55 + 4, 9 + r() * 10]); }
          for (const [cx, cy, rad] of blobs) K.disc(cx, cy + 2, rad + 1, dark(m.leaf, 0.35));
          for (const [cx, cy, rad] of blobs) K.disc(cx, cy, rad, m.leaf);
          for (const [cx, cy, rad] of blobs) K.disc(cx - rad * 0.3, cy - rad * 0.35, rad * 0.5, lite(m.leaf, 0.14));
          for (let k = 0; k < 70; k++) R(xx + (r() - 0.5) * h * 1.2, cyc + (r() - 0.6) * h * 0.4, 1, 1, r() < 0.7 ? '#f6b0d0' : '#ffffff');
        });
      }
    } else if (m.kind === 'pines') {
      for (let x = 0; x < P; x += 3 + Math.floor(r() * 3)) {
        const s = 0.55 + r() * 0.35, by = hz + 1 - Math.round(r() * 3);
        wrap(P, x, 8, (xx) => treePine(K, xx, by, s, { o: dark(m.c, 0.3), d: m.c, m: lite(m.c, 0.12), l: lite(m.c, 0.3), t: dark(m.c, 0.3) }, m.snow));
      }
    } else if (m.kind === 'mesas') {
      for (let i = 0; i < 4; i++) {
        const x = Math.round(P * (i / 4 + r() * 0.15)), w = Math.round(16 + r() * 26), h = Math.round(amp * (0.3 + r() * 0.4));
        wrap(P, x, w + 6, (xx) => {
          for (let k = 0; k < h; k++) { const half = Math.round(w + (k < 4 ? 0 : (h - k) * 0.25 - h * 0.25)); R(xx - half, hz - k, half * 2, 1, k % 5 ? m.c : dark(m.c, 0.1)); R(xx - half, hz - k, Math.round(half * 0.5), 1, lite(m.c, 0.1)); }
          R(xx - w, hz - h, w * 2, 2, lite(m.c, 0.18));
        });
      }
    } else if (m.kind === 'crags') {
      for (let x = 0; x < P; x += 5 + Math.floor(r() * 10)) {
        const h = Math.round(amp * (0.2 + r() * 0.5)), w = Math.round(3 + r() * 6);
        wrap(P, x, w, (xx) => K.tri(xx, hz + 1, w, h, m.c, lite(m.c, 0.08)));
      }
      for (let i = 0; i < 3; i++) {
        const x = Math.round(P * (i / 3 + r() * 0.2)), h = Math.round(amp * 0.5);
        wrap(P, x, 3, (xx) => { for (let k = 0; k < h; k++) R(xx + Math.round(Math.sin(k * 0.3) * 1), hz - h + k, 2, 1, k % 3 ? '#ff6a1a' : '#ffb02e'); });
        L.lights.push({ x, y: hz - h * 0.5, r: 28, col: '255,110,40', a: 0.55, fl: 0.2 });
      }
    } else if (m.kind === 'icespikes') {
      for (let x = 0; x < P; x += 6 + Math.floor(r() * 12)) {
        const h = Math.round(amp * (0.2 + r() * 0.6)), w = Math.round(2 + r() * 4);
        wrap(P, x, w, (xx) => K.gem(xx, hz + 1, w, h, m.c, lite(m.c, 0.4), '#ffffff'));
      }
    } else if (m.kind === 'cloudbank') {
      const hs = ridge(P, r, [[5, 1], [11, 0.5], [23, 0.25]], 1);
      for (let x = 0; x < P; x++) { const h = Math.round(4 + hs[x] * amp * 0.3); R(x, hz - h, 1, h + 1, m.c); R(x, hz - h, 1, 1, '#ffffff'); }
    } else if (m.kind === 'sunkenruins') {
      for (let i = 0; i < 6; i++) {
        const x = Math.round(P * (i / 6 + r() * 0.1));
        wrap(P, x, 8, (xx, q) => column(K, xx, hz + 1, 0.9 + q() * 0.5, m.c, q() < 0.5));
      }
      for (let x = 0; x < P; x += 8 + Math.floor(r() * 10)) wrap(P, x, 4, (xx, q) => seaweed(K, xx, hz + 1, 0.8, q, dark(m.c, 0.1)));
    } else if (m.kind === 'crystals') {
      for (let i = 0; i < 6; i++) {
        const x = Math.round(P * (i / 6 + r() * 0.12));
        wrap(P, x, 16, (xx, q) => crystalCluster(K, xx, hz + 1, 1.3 + q() * 0.8, m.c, m.glow, q, xx === x ? L : { lights: [] }));
      }
    } else if (m.kind === 'ribs') {
      for (let i = 0; i < 3; i++) {
        const x = Math.round(P * (i / 3 + r() * 0.15)), h = Math.round(amp * 0.7);
        wrap(P, x, 44, (xx) => {
          R(xx - 34, hz - h - 2, 68, 3, dark(m.bone, 0.15));   // espinha
          for (let k = 0; k < 6; k++) {   // costelas em arco
            const cx = xx - 28 + k * 11, w = 7, hh = h - Math.abs(k - 2.5) * 3;
            for (let a = 0; a <= 24; a++) { const t = a / 24 * Math.PI; R(cx + Math.round(Math.cos(t) * w), hz - Math.round(Math.sin(t) * hh), 2, 2, a % 6 ? m.bone : dark(m.bone, 0.25)); }
          }
        });
      }
    } else if (m.kind === 'deadwood') {
      for (let x = 0; x < P; x += 10 + Math.floor(r() * 14)) wrap(P, x, 16, (xx, q) => treeDead(K, xx, hz + 1, 1.2 + q() * 0.6, { t: m.c }, q));
    } else if (m.kind === 'obelisks') {
      for (let i = 0; i < 5; i++) {
        const x = Math.round(P * (i / 5 + r() * 0.1)), h = Math.round(amp * (0.5 + r() * 0.5)), w = 4;
        wrap(P, x, w + 2, (xx) => {
          R(xx - w, hz - h, w * 2, h, m.c); R(xx - w, hz - h, 1, h, lite(m.c, 0.15)); K.tri(xx, hz - h, w, 4, m.c);
          for (let k = hz - h + 4; k < hz - 3; k += 5) R(xx - 1, k, 2, 2, m.glow);
        });
        L.lights.push({ x, y: hz - h * 0.6, r: 22, col: rgbs(m.glow), a: 0.5, fl: 0.15 });
      }
    }
  }
  function castle(K, x, base, m, L) {
    const { R, tri } = K, c = m.stone, roof = m.roof;
    const wallH = 12, wallW = 70;
    R(x - wallW / 2, base - wallH, wallW, wallH, dark(c, 0.06));
    for (let k = x - wallW / 2; k < x + wallW / 2; k += 4) R(k, base - wallH - 2, 2, 2, dark(c, 0.06));
    const towers = [[-wallW / 2, 22, 6], [-12, 34, 8], [0, 44, 10], [12, 30, 7], [wallW / 2, 24, 6]];
    for (const [dx, h, w] of towers) {
      const tx = x + dx;
      R(tx - w / 2, base - h, w, h, c); R(tx - w / 2, base - h, 1, h, lite(c, 0.18)); R(tx + w / 2 - 1, base - h, 1, h, dark(c, 0.2));
      tri(tx, base - h, w / 2 + 1, Math.round(w * 1.1), roof, lite(roof, 0.15));
      R(tx, base - h - Math.round(w * 1.1) - 4, 1, 4, '#3a3a3a'); R(tx + 1, base - h - Math.round(w * 1.1) - 4, 3, 2, '#c84a3a');
      for (let wy = base - h + 4; wy < base - 4; wy += 7) { R(tx - 1, wy, 2, 3, '#2a2a3a'); L.wins.push([tx - 1, wy, 2, 3]); }
    }
    R(x - 3, base - 8, 6, 8, '#2a1e18'); R(x - 3, base - 9, 6, 1, dark(c, 0.3));
  }
  // linha de árvores no horizonte
  function buildLine(L, geo, th, r) {
    const { P, hz } = geo, K = L.K, ln = th.line; if (!ln) return;
    const pal = TREE_PAL(ln.c, { t: '#4a3a2a', td: '#3a2a1e', bloom: ln.bloom });
    if (ln.kind === 'round' || ln.kind === 'blossom') {
      for (let x = 0; x < P; x += 3 + Math.floor(r() * 4)) {
        const s = 0.6 + r() * 0.5, by = hz + 2;
        wrap(P, x, 9, (xx) => { const rr = rngOf(x * 7 + 1); treeRound(K, xx, by, s, pal, rr); });
      }
    } else if (ln.kind === 'pine') {
      for (let x = 0; x < P; x += 3 + Math.floor(r() * 4)) {
        const s = 0.6 + r() * 0.5;
        wrap(P, x, 8, (xx) => treePine(K, xx, hz + 2, s, pal, ln.snow));
      }
    } else if (ln.kind === 'dead') {
      for (let x = 0; x < P; x += 4 + Math.floor(r() * 6)) {
        const s = 0.5 + r() * 0.4;
        wrap(P, x, 10, (xx) => { const rr = rngOf(x * 13 + 5); treeDead(K, xx, hz + 1, s, { t: ln.c, leaf: '#3a2a4a' }, rr); });
      }
      K.R(0, hz - 2, P, 3, ln.c);
    }
  }

  // campo entre o horizonte e a trilha (anda junto com os props do fundo)
  function meadowRow(th, t) { return grad(th.meadow.c, t); }
  function paintBands(K, P, y0, y1, colorAt, r) {
    const { R } = K, n = y1 - y0; if (n <= 0) return;
    for (let y = y0; y < y1; y++) {
      const t = (y - y0) / Math.max(1, n - 1), q = Math.round(t * 7) / 7, frac = t * 7 - Math.floor(t * 7);
      R(0, y, P, 1, colorAt(q));
      if (frac > 0.35 && frac < 0.65) { const c2 = colorAt(Math.min(1, q + 1 / 7)); K.g.fillStyle = c2; for (let x = (y % 2); x < P; x += 2) K.g.fillRect(x, y, 1, 1); }
    }
  }
  function texture(K, P, y0, y1, th, r, density, near) {
    const { R } = K, m = th.meadow, kind = m.kind;
    const N = Math.round(P * (y1 - y0) * density);
    for (let i = 0; i < N; i++) {
      const x = Math.floor(r() * P), y = y0 + Math.floor(r() * (y1 - y0)), depth = near ? 1 : (y - y0) / Math.max(1, y1 - y0);
      const base = near ? grad(m.c, 0.7 + 0.3 * ((y - y0) / Math.max(1, y1 - y0))) : meadowRow(th, depth);
      if (kind === 'grass' || kind === 'moss') {
        const h = 1 + Math.round(depth * 2 + r() * 1.5);
        R(x, y - h + 1, 1, h, r() < 0.5 ? lite(base, 0.14) : dark(base, 0.16));
      } else if (kind === 'snow' || kind === 'cloud') {
        R(x, y, 1 + (r() < 0.3), 1, r() < 0.6 ? lite(base, 0.5) : dark(base, 0.06));
      } else if (kind === 'sand') {
        R(x, y, 2 + Math.floor(r() * 3), 1, r() < 0.5 ? lite(base, 0.12) : dark(base, 0.08));
      } else if (kind === 'seabed') {
        R(x, y, 1 + (r() < 0.4), 1, r() < 0.5 ? lite(base, 0.12) : dark(base, 0.12));
      } else {
        R(x, y, 1 + (r() < 0.3), 1, r() < 0.5 ? lite(base, 0.08) : dark(base, 0.18));
      }
    }
    if (kind === 'grass' && m.flowers) {
      for (let i = 0; i < N * 0.06; i++) {
        const x = Math.floor(r() * P), y = y0 + Math.floor(r() * (y1 - y0)), c = m.flowers[(r() * m.flowers.length) | 0];
        R(x, y, 1, 1, c); if (near && r() < 0.5) { R(x, y + 1, 1, 2, '#3a7a2a'); R(x - 1, y, 1, 1, lite(c, 0.3)); }
      }
    }
  }
  function buildBack(L, geo, th, r) {
    const { P, hz, pT } = geo, K = L.K;
    // chão do campo (mais claro/enevoado perto do horizonte)
    if (th.indoor && th.meadow.kind !== 'rock') {
      paintFloor(K, P, hz, pT + 2, th, r);
    } else {
      paintBands(K, P, hz, pT + 2, (t) => meadowRow(th, t * 0.6), r);
      texture(K, P, hz, pT + 2, th, r, 0.05, false);
    }
    // props, do fundo para a frente
    const items = [];
    const span = Math.max(2, pT - hz - 2);
    let x = Math.floor(r() * 20);
    while (x < P) {
      const depth = r(), y = Math.round(hz + 2 + depth * span * 0.85);
      items.push({ x, y, s: 0.75 + depth * 0.45, k: r() });
      x += 14 + Math.floor(r() * 30);
    }
    items.sort((a, b) => a.y - b.y);
    const kind = th.back, tp = TREE_PAL('#4a8a3e'), pine = TREE_PAL('#2f5a4a'), autumn = TREE_PAL('#c8843a');
    for (const it of items) {
      const k = it.k;
      const put = (half, fn) => wrap(P, it.x, half, (xx, q) => fn(xx, q));
      switch (kind) {
        case 'town':
          if (k < 0.32) put(26, (xx, q) => house(K, xx, it.y, it.s, q, xx === it.x ? L : { lights: [], wins: [], emit: [] }));
          else if (k < 0.5) put(12, (xx, q) => treeRound(K, xx, it.y, it.s * 1.2, k < 0.4 ? tp : autumn, q));
          else if (k < 0.62) put(3, (xx) => lamp(K, xx, it.y, xx === it.x ? L : { lights: [], wins: [] }));
          else if (k < 0.75) put(14, (xx) => fence(K, xx - 10, 20, it.y, '#8a6a42'));
          else if (k < 0.86) put(6, (xx, q) => bush(K, xx, it.y, it.s, { ...tp, flower: '#ff8fa3' }, q));
          else if (k < 0.93) put(5, (xx) => barrel(K, xx, it.y, it.s * 0.9));
          else put(6, (xx) => crate(K, xx, it.y, it.s * 0.9));
          break;
        case 'forest':
          if (k < 0.55) put(12, (xx, q) => treeRound(K, xx, it.y, it.s * (1.1 + k), tp, q));
          else if (k < 0.75) put(10, (xx) => treePine(K, xx, it.y, it.s * 1.2, pine));
          else if (k < 0.9) put(6, (xx, q) => bush(K, xx, it.y, it.s, tp, q));
          else put(6, (xx) => rock(K, xx, it.y, it.s, { o: '#3a3a3a', d: '#7a7a7a', m: '#9a9a9a', l: '#c8c8c8' }));
          break;
        case 'noria':
          if (k < 0.28) put(16, (xx, q) => elfHut(K, xx, it.y, it.s, q, xx === it.x ? L : { lights: [], wins: [] }));
          else if (k < 0.5) put(12, (xx, q) => treeRound(K, xx, it.y, it.s * 1.15, TREE_PAL('#4f9a4a', { bloom: '#f6b0d0' }), q));
          else if (k < 0.66) put(6, (xx, q) => giantFlower(K, xx, it.y, it.s, q));
          else if (k < 0.82) put(6, (xx) => mushroom(K, xx, it.y, it.s * 1.4, '#e0504a', null, L));
          else put(6, (xx, q) => bush(K, xx, it.y, it.s, { ...TREE_PAL('#4a9a46'), flower: '#ffd1e8' }, q));
          break;
        case 'cabins':
          if (k < 0.3) put(26, (xx, q) => house(K, xx, it.y, it.s, q, xx === it.x ? L : { lights: [], wins: [], emit: [] }, { wall: '#8a5a3a', beam: '#5a3a22', roof: '#6a4a3a', logs: true, snowRoof: true }));
          else if (k < 0.75) put(10, (xx) => treePine(K, xx, it.y, it.s * 1.3, pine, true));
          else if (k < 0.87) put(3, (xx) => lamp(K, xx, it.y, xx === it.x ? L : { lights: [], wins: [] }));
          else put(14, (xx) => fence(K, xx - 10, 20, it.y, '#6a4a32'));
          break;
        case 'fort':
          if (k < 0.3) put(22, (xx) => palisade(K, xx, it.y, it.s));
          else if (k < 0.7) put(10, (xx) => treePine(K, xx, it.y, it.s * 1.3, pine, true));
          else if (k < 0.85) put(4, (xx) => banner(K, xx, it.y, '#3a5a8a'));
          else put(6, (xx) => rock(K, xx, it.y, it.s, { o: '#2a3440', d: '#8a9aac', m: '#b4c4d4', l: '#ffffff' }));
          break;
        case 'ice':
          if (k < 0.5) put(10, (xx, q) => crystalCluster(K, xx, it.y, it.s * 0.9, '#8cc4ec', '#e8f8ff', q, { lights: [] }));
          else if (k < 0.8) put(10, (xx) => treePine(K, xx, it.y, it.s * 1.2, TREE_PAL('#6a9ab8'), true));
          else put(6, (xx) => rock(K, xx, it.y, it.s, { o: '#2a4060', d: '#a8c8e4', m: '#cfe4f4', l: '#ffffff' }));
          break;
        case 'desert':
          if (k < 0.3) put(8, (xx, q) => cactus(K, xx, it.y, it.s, q));
          else if (k < 0.5) put(14, (xx, q) => palm(K, xx, it.y, it.s, q));
          else if (k < 0.65) put(8, (xx) => column(K, xx, it.y, it.s, '#d8c098', true));
          else if (k < 0.8) put(6, (xx) => rock(K, xx, it.y, it.s, { o: '#6a4a2a', d: '#b48a5a', m: '#cca070', l: '#e8c890' }));
          else put(6, (xx) => bones(K, xx, it.y, '#e8dcc0'));
          break;
        case 'lava':
          if (k < 0.45) put(8, (xx, q) => spike(K, xx, it.y, it.s, '#2a1814', q));
          else if (k < 0.7) put(10, (xx) => lavaPool(K, xx, it.y, it.s, xx === it.x ? L : { lights: [] }));
          else put(6, (xx) => rock(K, xx, it.y, it.s, { o: '#0e0606', d: '#3a2420', m: '#4a2e26', l: '#6a3a2a' }));
          break;
        case 'abyss':
          if (k < 0.4) put(8, (xx, q) => spike(K, xx, it.y, it.s * 1.2, '#3a1014', q));
          else if (k < 0.6) put(10, (xx) => lavaPool(K, xx, it.y, it.s, xx === it.x ? L : { lights: [] }, true));
          else if (k < 0.8) put(6, (xx) => bones(K, xx, it.y, '#b8a890'));
          else put(4, (xx) => torch(K, xx, it.y - 10, xx === it.x ? L : { lights: [], flames: [] }, '255,70,40', '#ff5a2a'));
          break;
        case 'crystal':
          if (k < 0.55) put(12, (xx) => crystalCluster(K, xx, it.y, it.s, k < 0.3 ? '#3a7ab0' : '#7a4ab0', k < 0.3 ? '#8ae8ff' : '#e08aff', rngOf(it.x * 31 + it.y), xx === it.x ? L : { lights: [] }));
          else if (k < 0.8) put(8, (xx) => column(K, xx, it.y, it.s, '#4a5a7a', true));
          else put(6, (xx) => rock(K, xx, it.y, it.s, { o: '#10182a', d: '#3a4a6a', m: '#4a5c80', l: '#7a90b8' }));
          break;
        case 'skyruins':
          if (k < 0.45) put(8, (xx) => column(K, xx, it.y, it.s, '#f2ece0', k < 0.2));
          else if (k < 0.6) put(8, (xx) => statue(K, xx, it.y, Math.max(1, Math.round(it.s)), '#e8e0cc'));
          else put(12, (xx) => { K.oval(xx, it.y - 3, 10 * it.s, 3 * it.s, '#ffffff'); K.oval(xx - 4, it.y - 5, 5 * it.s, 3 * it.s, '#ffffff'); K.R(xx - 10 * it.s, it.y - 1, 20 * it.s, 1, '#dce8f6'); });
          break;
        case 'water':
          if (k < 0.4) put(4, (xx, q) => seaweed(K, xx, it.y, it.s * 1.2, q, '#2a8a5a'));
          else if (k < 0.65) put(8, (xx, q) => coral(K, xx, it.y, it.s, q, ['#ff7a8a', '#ffa05a', '#c87aff', '#ff5aa8'][(q() * 4) | 0]));
          else if (k < 0.8) put(8, (xx) => column(K, xx, it.y, it.s, '#6a9aa0', true));
          else put(6, (xx) => rock(K, xx, it.y, it.s, { o: '#0e2a34', d: '#3a6a74', m: '#4a8088', l: '#7ab0b0' }));
          break;
        case 'dungeon':
          if (k < 0.3) put(5, (xx) => barrel(K, xx, it.y, it.s));
          else if (k < 0.5) put(6, (xx) => crate(K, xx, it.y, it.s));
          else if (k < 0.68) put(6, (xx) => bones(K, xx, it.y, '#c8bca0'));
          else if (k < 0.82) put(6, (xx) => brazier(K, xx, it.y, xx === it.x ? L : { lights: [], flames: [] }));
          else put(6, (xx) => rock(K, xx, it.y, it.s * 0.8, { o: '#141018', d: '#4a4450', m: '#5a5462', l: '#7a7482' }));
          break;
        case 'tower':
          if (k < 0.3) put(9, (xx, q) => bookshelf(K, xx, it.y, it.s, q));
          else if (k < 0.5) put(6, (xx) => candles(K, xx, it.y, xx === it.x ? L : { lights: [], flames: [] }));
          else if (k < 0.7) put(6, (xx) => statue(K, xx, it.y, Math.max(1, Math.round(it.s)), '#6a6a8a'));
          else if (k < 0.85) put(6, (xx) => orb(K, xx, it.y, xx === it.x ? L : { lights: [] }));
          else put(6, (xx) => crate(K, xx, it.y, it.s));
          break;
        case 'petrified':
          if (k < 0.45) put(12, (xx, q) => treeRound(K, xx, it.y, it.s * 1.1, TREE_PAL('#6a6670', { t: '#5a5660', td: '#3a3640' }), q));
          else if (k < 0.65) put(8, (xx, q) => spike(K, xx, it.y, it.s, '#3a3444', q));
          else if (k < 0.85) put(6, (xx) => mushroom(K, xx, it.y, it.s * 1.3, '#3a8a9a', '#7af0e0', xx === it.x ? L : { lights: [] }));
          else put(8, (xx) => crystalCluster(K, xx, it.y, it.s * 0.7, '#4a6a8a', '#8ae8ff', rngOf(it.x * 31 + it.y), xx === it.x ? L : { lights: [] }));
          break;
        case 'darkforest':
        case 'swamp':
          if (k < 0.45) put(14, (xx, q) => treeDead(K, xx, it.y, it.s * 1.5, { t: '#2a2234', leaf: '#4a3a6a' }, q));
          else if (k < 0.65) put(6, (xx) => mushroom(K, xx, it.y, it.s * 1.3, '#7a3a9a', '#c08aff', xx === it.x ? L : { lights: [] }));
          else if (k < 0.82 && kind === 'swamp') put(14, (xx) => pool(K, xx, it.y, it.s));
          else put(6, (xx, q) => bush(K, xx, it.y, it.s, TREE_PAL('#2a4a3a'), q));
          break;
        case 'void':
          if (k < 0.4) put(8, (xx) => crystalCluster(K, xx, it.y, it.s * 0.9, '#3a2a5a', '#c08aff', rngOf(it.x * 31 + it.y), xx === it.x ? L : { lights: [] }));
          else if (k < 0.7) put(8, (xx) => column(K, xx, it.y, it.s, '#3a2e52', true));
          else put(8, (xx) => runeStone(K, xx, it.y, it.s, xx === it.x ? L : { lights: [] }));
          break;
        default:
          put(12, (xx, q) => treeRound(K, xx, it.y, it.s, tp, q));
      }
    }
  }
  function elfHut(K, x, base, s, r, out) {
    const { R, disc } = K, rad = Math.round(9 * s);
    for (let dy = 0; dy <= rad; dy++) { const w = Math.round(Math.sqrt(rad * rad - dy * dy)); R(x - w, base - dy, w * 2 + 1, 1, dy % 3 ? '#e8d8b0' : '#d8c498'); }
    for (let k = 0; k < 9; k++) { const a = Math.PI * (0.05 + k / 9 * 0.9), lx = x - Math.cos(a) * rad, ly = base - Math.sin(a) * rad; disc(lx, ly, 3 * s, '#3f8a3e'); disc(lx - 1, ly - 1, 1.6 * s, '#6ab84e'); }
    disc(x, base - rad - 2, 3 * s, '#3f8a3e');
    R(x - 2, base - 5 * s, 4, 5 * s, '#5a3a22'); R(x - 1, base - 5 * s - 1, 2, 1, '#5a3a22');
    const wx = x + Math.round(rad * 0.45), wy = base - Math.round(rad * 0.55);
    disc(wx, wy, 1.5, '#3a4a6a'); out.wins.push([wx - 1, wy - 1, 3, 3]);
    out.lights.push({ x: wx, y: wy, r: 14, col: '255,210,140', a: 0.5, fl: 0.05, night: true });
  }
  function giantFlower(K, x, base, s, r) {
    const { R, disc } = K, h = Math.round((10 + r() * 8) * s), c = ['#ff8fc0', '#ffd34a', '#c8a8ff', '#ff7a6a'][(r() * 4) | 0];
    for (let i = 0; i < h; i++) R(x + Math.round(Math.sin(i * 0.2) * 1), base - i, 1, 1, '#3a8a3a');
    R(x - 3, base - Math.round(h * 0.4), 3, 1, '#4aa04a');
    for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; disc(x + Math.cos(a) * 3 * s, base - h + Math.sin(a) * 3 * s, 2 * s, c); }
    disc(x, base - h, 1.5 * s, '#ffe066');
  }
  function palisade(K, x, base, s) {
    const { R, tri } = K, n = 7;
    for (let i = 0; i < n; i++) { const px = x - n * 2 + i * 4, h = Math.round((16 + (i % 3) * 2) * s); R(px, base - h, 3, h, '#6a4a32'); R(px, base - h, 1, h, '#8a6a4a'); tri(px + 1, base - h, 1, 2, '#6a4a32'); R(px, base - h - 1, 3, 1, '#f4f9ff'); }
    R(x - n * 2, base - Math.round(10 * s), n * 4, 1, '#4a3222');
  }
  function banner(K, x, base, c) {
    const { R } = K;
    R(x, base - 22, 1, 22, '#4a3a2a'); R(x + 1, base - 21, 6, 9, c); R(x + 1, base - 12, 2, 1, c); R(x + 5, base - 12, 2, 1, c); R(x + 3, base - 18, 2, 2, '#d4a84a');
  }
  function lavaPool(K, x, base, s, out, red) {
    const { oval } = K, w = Math.round(9 * s);
    oval(x, base - 1, w + 1, 3, '#1a0a08'); oval(x, base - 1, w, 2, red ? '#c8241a' : '#e85a1a'); oval(x - 1, base - 1, Math.round(w * 0.55), 1, red ? '#ff6a3a' : '#ffb02e');
    out.lights.push({ x, y: base - 2, r: 22 * s, col: red ? '255,60,30' : '255,120,40', a: 0.6, fl: 0.2 });
  }
  function pool(K, x, base, s) {
    const { oval, R } = K, w = Math.round(10 * s);
    oval(x, base - 1, w + 1, 3, '#141c18'); oval(x, base - 1, w, 2, '#24343a'); R(x - w * 0.5, base - 2, w * 0.4, 1, '#4a6a6a');
    for (let k = -w; k < w; k += 3) R(x + k, base - 5 - (k & 3), 1, 4 + (k & 3), '#4a5a2a');
  }
  function brazier(K, x, base, out) {
    const { R } = K;
    R(x - 1, base - 8, 2, 8, '#3a3a40'); R(x - 3, base - 1, 6, 1, '#3a3a40'); R(x - 4, base - 10, 8, 2, '#4a4a52'); R(x - 3, base - 8, 6, 1, '#2a2a30');
    out.flames.push({ x, y: base - 11, c: '#ffb02e', big: true });
    out.lights.push({ x, y: base - 12, r: 34, col: '255,150,60', a: 0.8, fl: 0.25 });
  }
  function candles(K, x, base, out) {
    const { R } = K;
    R(x, base - 12, 1, 12, '#8a7a4a'); R(x - 4, base - 1, 9, 1, '#8a7a4a'); R(x - 4, base - 12, 9, 1, '#8a7a4a');
    for (const dx of [-4, 0, 4]) { R(x + dx, base - 15, 1, 3, '#f0e8d0'); out.flames.push({ x: x + dx, y: base - 16, c: '#ffd36b' }); }
    out.lights.push({ x, y: base - 16, r: 26, col: '255,200,110', a: 0.65, fl: 0.15 });
  }
  function orb(K, x, base, out) {
    const { R, disc } = K;
    R(x - 2, base - 8, 4, 8, '#4a4a6a'); R(x - 3, base - 1, 6, 1, '#4a4a6a'); R(x - 3, base - 9, 6, 1, '#6a6a8a');
    disc(x, base - 12, 3, '#6a8aff'); disc(x - 1, base - 13, 1, '#d8e4ff');
    out.lights.push({ x, y: base - 12, r: 24, col: '110,140,255', a: 0.7, fl: 0.1 });
  }
  function runeStone(K, x, base, s, out) {
    const { R } = K, w = Math.round(5 * s), h = Math.round(10 * s);
    R(x - w, base - h, w * 2, h, '#2a2240'); R(x - w, base - h, w * 2, 1, '#3a3254'); R(x - w, base - h, 1, h, '#3a3254');
    R(x - 1, base - h + 2, 2, 1, '#c08aff'); R(x - 2, base - h + 4, 1, 3, '#c08aff'); R(x + 1, base - h + 4, 1, 3, '#c08aff'); R(x - 1, base - h + 7, 2, 1, '#c08aff');
    out.lights.push({ x, y: base - h / 2, r: 18, col: '190,130,255', a: 0.55, fl: 0.2 });
  }

  // chão de lugar fechado (lajotas, xadrez)
  function paintFloor(K, P, y0, y1, th, r) {
    const { R } = K, c = th.meadow.c, checker = th.meadow.kind === 'checker';
    paintBands(K, P, y0, y1, (t) => grad(c, t * 0.8), r);
    let y = y0, row = 0;
    while (y < y1) {
      const h = 3 + Math.round((y - y0) / Math.max(1, y1 - y0) * 4), w = checker ? 8 : 12 + (row % 2) * 4;
      for (let x = (row % 2) * (w >> 1) - w; x < P; x += w) {
        const col = checker ? ((Math.floor(x / w) + row) % 2 ? c[0] : c[1]) : mix(grad(c, (y - y0) / Math.max(1, y1 - y0)), r() < 0.5 ? '#ffffff' : '#000000', r() * 0.08);
        R(x + 1, y + 1, w - 1, h - 1, col); R(x + 1, y + 1, w - 1, 1, lite(col, 0.08));
      }
      R(0, y, P, 1, dark(c[2], 0.35));
      y += h; row++;
    }
  }

  // trilha (camada que anda junto com o grupo) + chão abaixo dela
  function buildGround(L, geo, th, r) {
    const { P, ah, pT, pB } = geo, K = L.K, { R } = K;
    const p = th.path, c = p.c, ph = pB - pT;
    // chão abaixo da trilha (perto da câmera)
    if (th.indoor && th.meadow.kind !== 'rock') paintFloor(K, P, pB, ah, th, r);
    else { paintBands(K, P, pB, ah, (t) => grad(th.meadow.c, 0.55 + t * 0.45), r); texture(K, P, pB, ah, th, r, 0.08, true); }
    // trilha
    paintBands(K, P, pT, pB, (t) => mix(c[0], c[2], t * 0.35), r);
    if (p.kind === 'cobble') {
      let y = pT, row = 0;
      while (y < pB - 1) {
        const sh = 2 + Math.round((y - pT) / ph * 2), sw = 8;
        for (let x = (row % 2) * 4 - sw; x < P; x += sw) {
          const w = sw - 1 - (r() < 0.3), col = mix(c[1], r() < 0.5 ? c[2] : c[0], r() * 0.5);
          R(x + 1, y + 1, w, sh, col); R(x + 1, y + 1, w - 1, 1, lite(col, 0.18)); R(x + 1, y + sh, w, 1, dark(col, 0.2));
        }
        R(0, y, P, 1, c[3]); y += sh + 1; row++;
      }
    } else if (p.kind === 'dirt' || p.kind === 'moss') {
      for (const k of [0.32, 0.7]) { const yy = pT + Math.round(ph * k); for (let x = 0; x < P; x++) R(x, yy + Math.round(Math.sin(TAU * 3 * x / P) * 1.2), 1, 1 + (x % 5 === 0), dark(c[0], 0.14)); }
      for (let i = 0; i < P * ph * 0.025; i++) { const x = r() * P, y = pT + 1 + r() * (ph - 2); R(x, y, 1 + (r() < 0.3), 1, r() < 0.5 ? c[1] : c[2]); }
      for (let i = 0; i < P / 18; i++) { const x = r() * P, y = pT + 2 + r() * (ph - 4); R(x, y, 2, 1, dark(c[0], 0.3)); R(x, y - 1, 2, 1, lite(c[1], 0.15)); }
      if (p.kind === 'moss') for (let i = 0; i < P / 12; i++) { const x = r() * P, y = pT + r() * ph; K.line(x, y, x + 6 + r() * 8, y + (r() - 0.5) * 3, '#2a2016'); }
    } else if (p.kind === 'snow') {
      for (let x = 2; x < P; x += 7) { const y = pT + Math.round(ph * 0.55) + (Math.floor(x / 7) % 2 ? 2 : 0); R(x, y, 2, 1, c[2]); R(x, y + 1, 2, 1, lite(c[2], 0.2)); }
      for (const k of [0.25, 0.8]) { const yy = pT + Math.round(ph * k); R(0, yy, P, 1, c[2]); }
      for (let i = 0; i < P * ph * 0.02; i++) R(r() * P, pT + r() * ph, 1, 1, '#ffffff');
    } else if (p.kind === 'sand') {
      for (let y = pT + 2; y < pB - 1; y += 3) for (let x = 0; x < P; x++) if ((x + y * 3) % 9 < 5) R(x, y + Math.round(Math.sin(TAU * 4 * x / P + y) * 1), 1, 1, dark(c[0], 0.08));
      for (let i = 0; i < P / 10; i++) { const x = r() * P, y = pT + 2 + r() * (ph - 4); R(x, y, 2, 1, c[2]); R(x, y - 1, 1, 1, c[1]); }
    } else if (p.kind === 'carpet') {
      const t0 = pT + Math.round(ph * 0.12), t1 = pB - Math.round(ph * 0.12);
      R(0, t0, P, t1 - t0, c[0]);
      R(0, t0, P, 1, c[3]); R(0, t0 + 2, P, 1, dark(c[3], 0.2)); R(0, t1 - 1, P, 1, c[3]); R(0, t1 - 3, P, 1, dark(c[3], 0.2));
      for (let x = 0; x < P; x += 16) { const cy = Math.round((t0 + t1) / 2), hh = Math.round((t1 - t0) * 0.28); for (let k = 0; k <= hh; k++) { R(x + 8 - (hh - k), cy - k, (hh - k) * 2 + 1, 1, c[1]); R(x + 8 - (hh - k), cy + k, (hh - k) * 2 + 1, 1, c[1]); } R(x + 8, cy, 1, 1, c[3]); }
      for (let x = 0; x < P; x += 2) { R(x, t0 - 1, 1, 1, c[3]); R(x, t1, 1, 1, c[3]); }
      R(0, t1 + 1, P, 1, 'rgba(0,0,0,0.3)');
    } else if (p.kind === 'basalt') {
      for (let i = 0; i < P * ph / 30; i++) { const x = r() * P, y = pT + r() * ph; R(x, y, 2 + r() * 3, 1, r() < 0.5 ? c[1] : c[2]); }
      for (let n = 0; n < P / 40; n++) {
        let x = r() * P, y = pT + 2 + r() * (ph - 4);
        const len = 10 + r() * 20;
        for (let i = 0; i < len; i++) { R(x, y, 1, 1, i % 4 ? c[3] : lite(c[3], 0.4)); x += 1; y += r() < 0.3 ? (r() < 0.5 ? -1 : 1) : 0; y = clamp(y, pT + 1, pB - 2); }
        if (n % 2 === 0) L.lights.push({ x: x - len / 2, y, r: 16, col: rgbs(c[3]), a: 0.4, fl: 0.25 });
      }
    } else if (p.kind === 'ice') {
      for (let i = 0; i < P / 8; i++) { const x = r() * P, y = pT + 1 + r() * (ph - 3), l = 3 + r() * 8; K.line(x, y, x + l, y - 1, '#ffffff'); }
      for (let i = 0; i < P / 20; i++) { const x = r() * P, y = pT + r() * ph; K.line(x, y, x + 5 + r() * 6, y + (r() - 0.5) * 4, c[2]); }
    } else if (p.kind === 'marble') {
      for (let x = 0; x < P; x += 16) R(x, pT, 1, ph, c[2]);
      R(0, pT + Math.round(ph / 2), P, 1, c[2]);
      R(0, pT, P, 1, c[3]); R(0, pT + 1, P, 1, lite(c[3], 0.3)); R(0, pB - 1, P, 1, c[3]);
      for (let i = 0; i < P / 6; i++) R(r() * P, pT + 2 + r() * (ph - 3), 2, 1, lite(c[1], 0.4));
    } else if (p.kind === 'seabed') {
      for (let y = pT + 2; y < pB - 1; y += 3) for (let x = 0; x < P; x++) if ((x * 7 + y * 5) % 11 < 4) R(x, y + Math.round(Math.sin(TAU * 5 * x / P + y) * 1), 1, 1, dark(c[0], 0.1));
      for (let i = 0; i < P / 14; i++) { const x = r() * P, y = pT + 2 + r() * (ph - 4); if (r() < 0.5) { R(x, y, 3, 1, '#f0d8c8'); R(x + 1, y - 1, 1, 1, '#ffe8d8'); } else R(x, y, 2, 1, c[2]); }
    } else if (p.kind === 'crystalstone' || p.kind === 'rune' || p.kind === 'gravel') {
      let y = pT, row = 0;
      while (y < pB - 1) {
        const sh = 3 + Math.round((y - pT) / ph * 2), sw = 12;
        for (let x = (row % 2) * 6 - sw; x < P; x += sw) { const col = mix(c[1], c[2], r() * 0.6); R(x + 1, y + 1, sw - 1, sh, col); R(x + 1, y + 1, sw - 2, 1, lite(col, 0.12)); }
        R(0, y, P, 1, c[2]); y += sh + 1; row++;
      }
      if (p.kind === 'crystalstone') for (let i = 0; i < P / 24; i++) { const x = r() * P, y = pT + 2 + r() * (ph - 3); K.gem(x, y, 2, 3 + r() * 3, c[3], '#ffffff'); if (i % 3 === 0) L.lights.push({ x, y: y - 2, r: 10, col: rgbs(c[3]), a: 0.45, fl: 0.2 }); }
      if (p.kind === 'rune') { const yy = pT + Math.round(ph * 0.5); for (let x = 0; x < P; x += 10) { R(x + 2, yy, 5, 1, c[3]); R(x + 4, yy - 1, 1, 3, c[3]); if (x % 40 === 0) L.lights.push({ x: x + 4, y: yy, r: 12, col: rgbs(c[3]), a: 0.4, fl: 0.2 }); } }
      if (p.kind === 'gravel') for (let i = 0; i < P * ph / 25; i++) R(r() * P, pT + r() * ph, 1, 1, r() < 0.5 ? c[1] : c[3]);
    }
    // bordas: capim ou neve caindo por cima da trilha; sombra logo abaixo da borda de cima
    R(0, pT + 1, P, 1, 'rgba(0,0,0,0.18)');
    const mk = th.meadow.kind, topC = th.indoor ? null : grad(th.meadow.c, 0.62), botC = th.indoor ? null : grad(th.meadow.c, 0.6);
    if (!th.indoor) {
      for (let x = 0; x < P; x++) {
        if (mk === 'grass' || mk === 'moss') {
          if (r() < 0.55) R(x, pT, 1, 1 + Math.floor(r() * 2.5), r() < 0.3 ? lite(topC, 0.15) : topC);
          if (r() < 0.55) R(x, pB - 1 - Math.floor(r() * 2.5), 1, 2 + Math.floor(r() * 2), r() < 0.3 ? lite(botC, 0.15) : botC);
        } else {
          R(x, pT, 1, 1 + (Math.sin(x * 0.9) > 0.3), topC);
          R(x, pB - 1 - (Math.sin(x * 0.7 + 1) > 0.4), 1, 2, botC);
        }
      }
    } else {
      R(0, pT, P, 1, dark(th.meadow.c[2], 0.4)); R(0, pB, P, 1, dark(th.meadow.c[2], 0.3));
    }
    // beira da trilha: tufos e flores logo abaixo dela
    if (mk === 'grass' || mk === 'moss') {
      const fl = th.meadow.flowers || ['#ffffff'];
      for (let x = 0; x < P; x += 2 + Math.floor(r() * 5)) {
        const y = pB + 2 + Math.floor(r() * 5), h = 2 + Math.floor(r() * 4), c = grad(th.meadow.c, 0.75 + r() * 0.25);
        R(x, y - h, 1, h, dark(c, 0.12)); R(x + 1, y - h + 1, 1, h - 1, lite(c, 0.1));
        if (r() < 0.18) { const f = fl[(r() * fl.length) | 0]; R(x, y - h - 1, 1, 1, f); R(x - 1, y - h, 1, 1, f); R(x + 1, y - h, 1, 1, f); R(x, y - h, 1, 1, '#ffe066'); }
      }
    }
    decorNear(L, geo, th, r);
  }
  function rockPal(th) {
    const b = th.meadow.c[3];
    return { o: dark(b, 0.65), d: mix(b, '#6e6e76', 0.6), m: mix(b, '#9a9aa4', 0.6), l: mix(b, '#dcdce4', 0.6) };
  }
  // enfeites do chão perto da câmera (abaixo da trilha), por tipo de chão
  function decorNear(L, geo, th, r) {
    const { P, ah, pB } = geo, K = L.K, { R } = K, mk = th.meadow.kind;
    const y0 = pB + 5, y1 = ah - 6; if (y1 - y0 < 6) return;
    const items = [];
    for (let x = Math.floor(r() * 10); x < P; x += 12 + Math.floor(r() * 28)) { const d = r(); items.push({ x, y: Math.round(y0 + d * (y1 - y0)), k: r(), s: (1 + d * 1.4) * (0.8 + r() * 0.4) }); }
    items.sort((a, b) => a.y - b.y);
    const green = mk === 'moss' ? TREE_PAL('#2a4a34') : TREE_PAL(grad(th.meadow.c, 1));
    const flowers = th.meadow.flowers || ['#ffe066', '#ffffff'];
    for (const it of items) {
      const { x, y, k, s } = it;
      const own = (xx) => (xx === x ? L : { lights: [], wins: [], flames: [], emit: [] });
      if (mk === 'grass' || mk === 'moss') {
        if (k < 0.22) wrap(P, x, 10, (xx, q) => { for (let i = 0; i < 9; i++) { const fx = xx + Math.round((q() - 0.5) * 14), fy = y + Math.round((q() - 0.5) * 4), c = flowers[(q() * flowers.length) | 0]; R(fx, fy - 2, 1, 3, dark(green.d, 0.1)); R(fx, fy - 3, 1, 1, c); if (q() < 0.5) R(fx - 1, fy - 3, 3, 1, c); } });
        else if (k < 0.42) wrap(P, x, 12, (xx, q) => bush(K, xx, y, s, { ...green, flower: mk === 'moss' ? null : flowers[(q() * flowers.length) | 0] }, q));
        else if (k < 0.56) wrap(P, x, 9, (xx, q) => rock(K, xx, y, s * 0.8, rockPal(th)));
        else if (k < 0.64) wrap(P, x, 8, (xx) => stump(K, xx, y, s));
        else if (k < 0.7) wrap(P, x, 14, (xx) => log(K, xx, y, s));
        else if (k < 0.76 && th.back === 'town') wrap(P, x, 4, (xx) => signpost(K, xx, y));
        else if (k < 0.84 && (th.back === 'noria' || th.back === 'forest' || mk === 'moss')) wrap(P, x, 6, (xx) => mushroom(K, xx, y, s * 1.1, mk === 'moss' ? '#7a3a9a' : '#e0504a', mk === 'moss' ? '#c08aff' : null, own(xx)));
        else wrap(P, x, 8, (xx, q) => { for (let i = 0; i < 7; i++) { const bx = xx + Math.round((q() - 0.5) * 8), h = 3 + Math.round(q() * 5 * s); for (let j = 0; j < h; j++) R(bx + (j > h * 0.6 ? (i % 2 ? 1 : -1) : 0), y - j, 1, 1, j > h * 0.6 ? green.m : green.d); } });
      } else if (mk === 'snow') {
        if (k < 0.35) wrap(P, x, 9 * s, (xx) => rock(K, xx, y, s * 0.9, { o: '#2a3442', d: '#6a7a8e', m: '#8a9aae', l: '#b4c2d2' }, true));
        else if (k < 0.6) wrap(P, x, 10, (xx) => treePine(K, xx, y, s * 0.9, TREE_PAL('#2f5a4a'), true));
        else if (k < 0.7) wrap(P, x, 6, (xx) => snowman(K, xx, y));
        else wrap(P, x, 8, (xx) => { K.oval(xx, y - 1, Math.round(6 * s), 2, '#ffffff'); K.R(xx - 4, y, 8, 1, '#cbd8e6'); });
      } else if (mk === 'sand') {
        if (k < 0.3) wrap(P, x, 9, (xx) => rock(K, xx, y, s * 0.8, { o: '#6a4a2a', d: '#b48a5a', m: '#cca070', l: '#ecc890' }));
        else if (k < 0.5) wrap(P, x, 6, (xx, q) => cactus(K, xx, y, s * 0.55, q));
        else if (k < 0.62) wrap(P, x, 6, (xx) => bones(K, xx, y, '#efe4c8'));
        else if (k < 0.75) wrap(P, x, 5, (xx) => urn(K, xx, y));
        else wrap(P, x, 8, (xx, q) => { for (let i = 0; i < 6; i++) K.line(xx, y, xx + (q() - 0.5) * 10, y - 3 - q() * 5, '#9a7a42'); });
      } else if (mk === 'ash') {
        const red = th.key.startsWith('abyss');
        if (k < 0.35) wrap(P, x, 9, (xx) => { rock(K, xx, y, s, { o: '#0a0404', d: '#2e1c18', m: '#3e2620', l: '#5a3428' }); R(xx - 2, y - 2, 3, 1, red ? '#ff3a1a' : '#ff7a1a'); });
        else if (k < 0.55) wrap(P, x, 10, (xx) => lavaPool(K, xx, y, s * 0.7, own(xx), red));
        else if (k < 0.75) wrap(P, x, 6, (xx, q) => spike(K, xx, y, s * 0.6, red ? '#3a1014' : '#2a1814', q));
        else wrap(P, x, 6, (xx) => bones(K, xx, y, '#b8a890'));
      } else if (mk === 'seabed') {
        if (k < 0.25) wrap(P, x, 8, (xx, q) => coral(K, xx, y, s * 0.8, q, ['#ff7a8a', '#ffa05a', '#c87aff', '#ff5aa8'][(q() * 4) | 0]));
        else if (k < 0.45) wrap(P, x, 4, (xx, q) => seaweed(K, xx, y, s, q, '#2a8a5a'));
        else if (k < 0.6) wrap(P, x, 4, (xx) => starfish(K, xx, y));
        else if (k < 0.75) wrap(P, x, 4, (xx) => { R(xx - 2, y - 1, 5, 1, '#f0d8c8'); R(xx - 1, y - 2, 3, 1, '#ffe8d8'); R(xx, y - 3, 1, 1, '#ffe8d8'); });
        else wrap(P, x, 9, (xx) => rock(K, xx, y, s * 0.8, { o: '#0e2a34', d: '#3a6a74', m: '#4a8088', l: '#7ab0b0' }));
      } else if (mk === 'cloud') {
        if (k < 0.45) wrap(P, x, 14, (xx) => { K.oval(xx, y - 2, Math.round(9 * s), 3, '#ffffff'); K.oval(xx - 3, y - 4, Math.round(4 * s), 2, '#ffffff'); K.R(xx - 8, y, 16, 1, '#d4e0f2'); });
        else if (k < 0.7) wrap(P, x, 7, (xx) => column(K, xx, y, s * 0.6, '#f2ece0', true));
        else wrap(P, x, 3, (xx) => { R(xx, y - 4, 1, 4, '#d8b04a'); R(xx - 1, y - 4, 3, 1, '#ffe08a'); });
      } else if (mk === 'rock') {
        const glow = th.key.startsWith('void') ? '#c08aff' : th.key.startsWith('cave') ? '#7af0e0' : '#8ae8ff';
        if (k < 0.3) wrap(P, x, 9, (xx) => rock(K, xx, y, s, rockPal(th)));
        else if (k < 0.55) wrap(P, x, 8, (xx, q) => crystalCluster(K, xx, y, s * 0.55, mix(th.meadow.c[0], glow, 0.35), glow, q, own(xx)));
        else if (k < 0.75) wrap(P, x, 6, (xx) => mushroom(K, xx, y, s, '#3a8a9a', glow, own(xx)));
        else wrap(P, x, 6, (xx) => bones(K, xx, y, '#8a8090'));
      } else {   // pisos de lugares fechados
        if (k < 0.25) wrap(P, x, 6, (xx) => bones(K, xx, y, '#b8ac94'));
        else if (k < 0.45) wrap(P, x, 9, (xx) => rock(K, xx, y, s * 0.7, { o: '#0c0a10', d: '#4a4450', m: '#5a5462', l: '#7a7482' }));
        else if (k < 0.6) wrap(P, x, 5, (xx) => barrel(K, xx, y, s * 0.9));
        else if (k < 0.72) wrap(P, x, 6, (xx) => candles(K, xx, y, own(xx)));
        else if (k < 0.85) wrap(P, x, 8, (xx) => crate(K, xx, y, s * 0.9));
        else wrap(P, x, 10, (xx) => { for (let i = 0; i < 8; i++) R(xx - 6 + i * 2, y - (i % 3), 2, 1, i % 2 ? '#5a5a62' : '#3a3a42'); });
      }
    }
  }
  function stump(K, x, base, s) {
    const { R, oval } = K, w = Math.round(5 * s), h = Math.round(4 * s);
    R(x - w, base - h, w * 2, h, '#6a4a2e'); R(x - w, base - h, 1, h, '#8a6a42'); R(x + w - 1, base - h, 1, h, '#4a3220');
    oval(x, base - h, w, 1, '#c8a46a'); K.R(x - 1, base - h, 2, 1, '#8a6a42');
    R(x - w - 1, base - 1, 2, 1, '#6a4a2e'); R(x + w - 1, base - 1, 2, 1, '#6a4a2e');
  }
  function log(K, x, base, s) {
    const { R, oval } = K, w = Math.round(12 * s), h = Math.max(3, Math.round(3 * s));
    R(x - w, base - h, w * 2, h, '#6a4a2e'); R(x - w, base - h, w * 2, 1, '#8a6a42'); R(x - w, base - 1, w * 2, 1, '#4a3220');
    oval(x + w, base - Math.ceil(h / 2), 1, Math.ceil(h / 2), '#c8a46a');
    R(x - w + 3, base - h - 1, 2, 1, '#4a8a3a'); R(x + 2, base - h - 1, 1, 1, '#4a8a3a');
  }
  function signpost(K, x, base) {
    const { R } = K;
    R(x, base - 12, 1, 12, '#6a4a2e'); R(x - 5, base - 11, 9, 3, '#a8845a'); R(x - 5, base - 11, 9, 1, '#c8a47a'); R(x + 4, base - 10, 1, 1, '#a8845a');
    R(x - 4, base - 6, 8, 3, '#a8845a'); R(x - 5, base - 5, 1, 1, '#a8845a'); R(x - 3, base - 10, 5, 1, '#5a3a22'); R(x - 2, base - 5, 4, 1, '#5a3a22');
  }
  function snowman(K, x, base) {
    const { disc, R } = K;
    disc(x, base - 3, 3, '#f4f9ff'); disc(x, base - 8, 2, '#ffffff'); R(x - 1, base - 9, 1, 1, '#2a2a2a'); R(x + 1, base - 9, 1, 1, '#2a2a2a'); R(x + 1, base - 8, 2, 1, '#ff8a2a');
    R(x - 2, base - 11, 5, 1, '#2a2a3a'); R(x - 1, base - 13, 3, 2, '#2a2a3a'); R(x - 2, base - 6, 5, 1, '#c84a3a');
  }
  function urn(K, x, base) {
    const { R, oval } = K;
    oval(x, base - 3, 3, 3, '#b8643a'); R(x - 1, base - 7, 3, 2, '#a8542a'); R(x - 2, base - 8, 5, 1, '#c87a4a'); R(x - 2, base - 4, 1, 2, '#d88a5a'); R(x - 3, base - 3, 7, 1, '#8a4a2a');
  }
  function starfish(K, x, base) {
    const { R } = K;
    R(x - 1, base - 3, 3, 3, '#ff8a5a'); R(x, base - 5, 1, 2, '#ff8a5a'); R(x - 3, base - 3, 2, 1, '#ff8a5a'); R(x + 2, base - 3, 2, 1, '#ff8a5a'); R(x - 2, base - 1, 1, 1, '#ff8a5a'); R(x + 2, base - 1, 1, 1, '#ff8a5a'); R(x, base - 2, 1, 1, '#ffc08a');
  }

  // primeiro plano: capim alto, rochas e silhuetas escuras perto da câmera (anda mais rápido)
  function buildFront(L, geo, th, r) {
    const { P, ah } = geo, K = L.K, { R } = K, f = th.front, c0 = f.c[0], c1 = f.c[1];
    let x = Math.floor(r() * 30);
    while (x < P) {
      const s = 0.8 + r() * 0.8, k = r();
      wrap(P, x, 30, (xx) => {
        const rr = rngOf(x * 17 + 3);
        if (f.kind === 'grass' || f.kind === 'fern' || f.kind === 'dry') {
          const n = 6 + Math.floor(rr() * 10);
          for (let i = 0; i < n; i++) {
            const bx = xx + Math.round((rr() - 0.5) * 18 * s), h = Math.round((8 + rr() * 22) * s), lean = (rr() - 0.5) * 6;
            for (let j = 0; j < h; j++) R(bx + Math.round(lean * (j / h) * (j / h)), ah - j, f.kind === 'fern' ? 2 : 1 + (j < h * 0.4), 1, j > h * 0.7 ? c1 : c0);
            if (f.kind === 'fern') for (let j = 4; j < h; j += 3) { R(bx + Math.round(lean * (j / h) * (j / h)) - 2, ah - j, 2, 1, c0); R(bx + Math.round(lean * (j / h) * (j / h)) + 2, ah - j + 1, 2, 1, c0); }
          }
          if (k < 0.25 && f.kind !== 'dry') { K.disc(xx, ah - 6 * s, 8 * s, c0); K.disc(xx - 4 * s, ah - 9 * s, 4 * s, c1); }
        } else if (f.kind === 'snowrock' || f.kind === 'crag' || f.kind === 'rubble' || f.kind === 'stalag' || f.kind === 'icefront' || f.kind === 'shards') {
          if (f.kind === 'stalag' || f.kind === 'shards' || (f.kind === 'icefront' && k < 0.5)) {
            for (let i = 0; i < 3; i++) K.gem(xx + (i - 1) * 6 * s, ah + 2, Math.round((4 + rr() * 3) * s), Math.round((12 + rr() * 22) * s), c0, f.kind === 'stalag' ? null : mix(c0, c1, 0.5), f.kind === 'stalag' ? null : c1);
          } else {
            rock(K, xx, ah + 2, 3 * s, { o: dark(c0, 0.3), d: c0, m: mix(c0, c1, 0.18), l: mix(c0, c1, 0.32) }, f.kind === 'snowrock');
            if (k < 0.5) rock(K, xx + 12 * s, ah + 2, 1.6 * s, { o: dark(c0, 0.3), d: c0, m: mix(c0, c1, 0.15), l: mix(c0, c1, 0.28) }, f.kind === 'snowrock');
            if (f.kind === 'rubble' && k < 0.5) { R(xx - 16 * s, ah - 10 * s, 6 * s, 10 * s, c0); R(xx - 16 * s, ah - 10 * s, 6 * s, 1, c1); }
          }
        } else if (f.kind === 'reef') {
          for (let i = 0; i < 3; i++) seaweed(K, xx + (i - 1) * 5, ah + 1, 1.6 * s, rr, c0);
          coral(K, xx + 8, ah + 1, 1.4 * s, rr, c1);
        } else if (f.kind === 'cloudfront') {
          K.oval(xx, ah, 18 * s, 8 * s, c0); K.oval(xx - 6 * s, ah - 4 * s, 9 * s, 6 * s, c1); K.oval(xx + 8 * s, ah - 2 * s, 8 * s, 5 * s, c1);
        }
      });
      x += 26 + Math.floor(r() * 50);
    }
  }

  // nuvens (sprites gerados uma vez)
  function makeClouds(r) {
    const list = [];
    for (let i = 0; i < 5; i++) {
      const w = 30 + Math.floor(r() * 34), h = 12 + Math.floor(r() * 8);
      const c = document.createElement('canvas'); c.width = w + 8; c.height = h + 6;
      const K = kit(c.getContext('2d'));
      const blobs = [];
      const n = 4 + Math.floor(r() * 3);
      for (let b = 0; b < n; b++) { const t = b / (n - 1), rad = Math.round(3 + (h * 0.5 - 3) * Math.sin(Math.PI * (0.15 + t * 0.7)) * (0.7 + r() * 0.4)); blobs.push([4 + Math.round((w - 4) * t), h + 1 - rad, rad]); }
      for (const [bx, by, rad] of blobs) K.disc(bx, by, rad, '#c9d6e6');                 // sombra de baixo
      K.R(4, h - 1, w - 4, 2, '#c9d6e6');
      for (const [bx, by, rad] of blobs) K.disc(bx, by - 2, rad, '#ffffff');             // corpo branco
      for (const [bx, by, rad] of blobs) if (rad > 3) K.disc(bx - 1, by - rad * 0.45 - 2, Math.round(rad * 0.4), '#ffffff');
      list.push(c);
    }
    return list;
  }

  const CLOUD_TINT = new Map();
  function cloudOf(i, tint) {
    const c = ST.clouds[i]; if (!tint) return c;
    const k = i + tint; let t = CLOUD_TINT.get(k);
    if (!t) {
      t = document.createElement('canvas'); t.width = c.width; t.height = c.height;
      const g = t.getContext('2d'); g.drawImage(c, 0, 0); g.globalCompositeOperation = 'source-atop'; g.fillStyle = tint; g.globalAlpha = 0.85; g.fillRect(0, 0, t.width, t.height);
      CLOUD_TINT.set(k, t);
    }
    return t;
  }

  // ---------- estado ----------
  const ST = { key: '', layers: null, buf: null, bg: null, buf2: null, b2: null, P: 0, A: 2, aw: 0, ah: 0, th: null, geo: null,
    clouds: null, stars: null, parts: [], lastScroll: null, lastT: 0, skyKey: '', skyC: null, emitAcc: 0 };
  function ensure(o) {
    const A = Math.max(2, Math.round(2 * o.dpr));
    const aw = Math.ceil(o.W / A), ah = Math.ceil(o.H / A);
    const pT = Math.round(o.pathTop / A), pB = Math.max(pT + 8, Math.round((o.pathTop + o.pathH) / A));
    const hz = clamp(Math.round(o.horizonY / A), 16, pT - 4);
    const th = themeFor(o.theme, o.map);
    const P = Math.max(768, Math.ceil((aw + 16) / 32) * 32);
    const key = [th.key, aw, ah, hz, pT, pB, P].join('|');
    if (key === ST.key) return;
    ST.key = key; ST.A = A; ST.aw = aw; ST.ah = ah; ST.P = P; ST.th = th;
    const geo = ST.geo = { P, aw, ah, hz, pT, pB };
    if (!ST.buf) { ST.buf = document.createElement('canvas'); ST.buf2 = document.createElement('canvas'); }
    ST.buf.width = aw; ST.buf.height = ah; ST.buf2.width = aw; ST.buf2.height = ah;
    ST.bg = ST.buf.getContext('2d'); ST.b2 = ST.buf2.getContext('2d');
    ST.bg.imageSmoothingEnabled = false; ST.b2.imageSmoothingEnabled = false;
    const r = rngOf(th.seed);
    const far = newLayer(P, ah), mid = newLayer(P, ah), line = newLayer(P, ah), back = newLayer(P, ah), ground = newLayer(P, ah), front = newLayer(P, ah);
    buildFar(far, geo, th, rngOf(th.seed + 1));
    buildMid(mid, geo, th, rngOf(th.seed + 2));
    buildLine(line, geo, th, rngOf(th.seed + 3));
    buildBack(back, geo, th, rngOf(th.seed + 4));
    buildGround(ground, geo, th, rngOf(th.seed + 5));
    buildFront(front, geo, th, rngOf(th.seed + 6));
    ST.frontH = Math.min(ah, 84);   // altura máxima do primeiro plano (capim alto, rochas, recifes)
    const indoorK = th.indoor ? 0.3 : 1;
    ST.layers = [
      { L: far, f: (th.indoor ? 0.3 : 0.05), haze: th.indoor ? 0 : 0.38 },
      { L: mid, f: 0.15 * indoorK + (th.indoor ? 0.2 : 0), haze: 0.14 },
      { L: line, f: 0.3, haze: 0.1 },
      { L: back, f: 0.6, haze: 0 },
      { L: ground, f: 1, haze: 0 },
    ];
    ST.front = { L: front, f: 1.45 };
    ST.clouds = ST.clouds || makeClouds(r);
    const sr = rngOf(th.seed + 9);
    ST.stars = Array.from({ length: th.space ? 160 : 90 }, () => ({ x: sr(), y: sr(), s: sr() < 0.12 ? 2 : 1, tw: sr() * 6, c: sr() < 0.2 ? '#bfd8ff' : sr() < 0.1 ? '#ffe0b0' : '#ffffff' }));
    ST.nebula = null;
    ST.parts = []; ST.skyKey = '';
  }

  function offOf(scroll, f) { const P = ST.P; return (((Math.floor(scroll * f)) % P) + P) % P; }
  function blit(g, layer, off) { g.drawImage(layer.c, -off, 0); if (ST.P - off < ST.aw) g.drawImage(layer.c, ST.P - off, 0); }

  // céu (refeito quando a cor muda)
  function skyColors(th, tod) {
    if (!th.cycle) return th.sky;
    const s = th.sky.map((c, i) => mix(c, th.night[i], tod.n));
    if (tod.d > 0) { const dusk = ['#3a3a7a', '#d0708a', '#ffb070']; return s.map((c, i) => mix(c, dusk[i], tod.d * (i === 0 ? 0.35 : 0.65))); }
    return s;
  }
  function drawSky(g, th, tod, aw, hz, ah) {
    const cols = skyColors(th, tod), key = cols.join() + aw + 'x' + hz;
    if (key !== ST.skyKey) {
      ST.skyKey = key;
      const c = ST.skyC || (ST.skyC = document.createElement('canvas'));
      c.width = 2; c.height = Math.max(1, hz + 4);
      const k = c.getContext('2d'), N = 12;
      for (let y = 0; y < c.height; y++) {
        const t = clamp(y / Math.max(1, hz), 0, 1) * N, lo = Math.floor(t), fr = t - lo;
        const a = grad(cols, lo / N), b = grad(cols, Math.min(N, lo + 1) / N);
        // xadrez só no meio da faixa (pixel art, sem riscas)
        for (let x = 0; x < 2; x++) { const use = fr > 0.66 || (fr > 0.33 && (x + y) % 2 === 0); k.fillStyle = use ? b : a; k.fillRect(x, y, 1, 1); }
      }
      ST.skyPat = g.createPattern(c, 'repeat-x');
    }
    g.fillStyle = ST.skyPat; g.fillRect(0, 0, aw, ST.skyC.height);
    g.fillStyle = cols[2]; g.fillRect(0, hz + 4, aw, ah - hz - 4);
    return cols;
  }
  function drawCelestial(g, th, tod, aw, hz, t, scroll) {
    const K = kit(g);
    const nightK = th.cycle ? tod.n : (th.space || th.indoor ? 1 : th.dark > 0.6 ? 0.6 : 0);
    // estrelas
    if (nightK > 0.05 && !th.under) {
      for (const s of ST.stars) {
        const x = Math.round(((s.x * aw * 1.5 - scroll * 0.01) % aw + aw) % aw), y = Math.round(s.y * hz * 0.85);
        const a = nightK * (0.55 + 0.45 * Math.sin(t * 2 + s.tw));
        g.globalAlpha = clamp(a, 0, 1); K.R(x, y, s.s, s.s, s.c);
      }
      g.globalAlpha = 1;
    }
    if (th.space) {   // nebulosa
      if (!ST.nebula) {
        const c = ST.nebula = document.createElement('canvas'); c.width = aw; c.height = hz; const k = c.getContext('2d'), r = rngOf(th.seed + 11);
        for (let i = 0; i < 40; i++) { const x = r() * aw, y = r() * hz * 0.8, rad = 8 + r() * 30; const gr = k.createRadialGradient(x, y, 0, x, y, rad); const col = r() < 0.5 ? '176,106,255' : '255,90,170'; gr.addColorStop(0, `rgba(${col},0.10)`); gr.addColorStop(1, `rgba(${col},0)`); k.fillStyle = gr; k.fillRect(x - rad, y - rad, rad * 2, rad * 2); }
      }
      g.drawImage(ST.nebula, 0, 0);
    }
    if (th.aurora && tod.n > 0.2) {   // aurora boreal
      g.globalCompositeOperation = 'lighter';
      for (let x = 0; x < aw; x += 1) {
        const w = Math.sin(x * 0.03 + t * 0.4) * 6 + Math.sin(x * 0.011 - t * 0.25) * 10, y0 = Math.round(hz * 0.18 + w), h = Math.round(hz * 0.22 + Math.sin(x * 0.05 + t) * 5);
        g.globalAlpha = tod.n * 0.10 * (0.6 + 0.4 * Math.sin(x * 0.02 + t * 0.7));
        g.fillStyle = x % 3 ? '#5affb0' : '#8a7aff'; g.fillRect(x, y0, 1, h);
      }
      g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    }
    if (th.cycle) {
      // sol
      if (tod.sunT >= 0 && tod.sunT <= 1) {
        const x = Math.round(aw * (0.08 + 0.84 * tod.sunT)), y = Math.round(hz - Math.sin(Math.PI * tod.sunT) * hz * 0.78 + 4);
        const warm = Math.max(tod.d, 1 - Math.sin(Math.PI * tod.sunT) * 1.6);
        g.globalAlpha = 0.25; K.disc(x, y, 11, mix('#fff6c8', '#ffb060', warm)); g.globalAlpha = 0.45; K.disc(x, y, 8, mix('#fff6c8', '#ffb060', warm)); g.globalAlpha = 1;
        K.disc(x, y, 6, mix('#fffbe6', '#ffc07a', warm)); K.disc(x - 1, y - 1, 3, '#ffffff');
      }
      // lua
      if (tod.moonT >= 0 && tod.moonT <= 1 && tod.n > 0.1) {
        const x = Math.round(aw * (0.1 + 0.8 * tod.moonT)), y = Math.round(hz - Math.sin(Math.PI * tod.moonT) * hz * 0.7 + 6);
        g.globalAlpha = tod.n * 0.25; K.disc(x, y, 9, '#c8d8ff'); g.globalAlpha = tod.n;
        K.disc(x, y, 5, '#eef0e0'); K.disc(x + 2, y - 1, 4, mix(skyColors(th, tod)[0], '#000000', 0.1)); K.R(x - 3, y, 1, 1, '#c8c8b0'); K.R(x - 1, y + 2, 2, 1, '#c8c8b0');
        g.globalAlpha = 1;
      }
    } else if (!th.indoor && !th.under && !th.space) {
      // céus fixos: lua vermelha (lava/abismo) ou lua fria
      const x = Math.round(aw * 0.72), y = Math.round(hz * 0.28);
      const col = th.key.startsWith('lava') || th.key.startsWith('abyss') ? '#ff8a5a' : th.key.startsWith('crystal') ? '#bfe8ff' : '#d8d0f0';
      g.globalAlpha = 0.2; K.disc(x, y, 12, col); g.globalAlpha = 0.9; K.disc(x, y, 6, col); g.globalAlpha = 1;
    }
    // nuvens (passam com o vento e um pouco com a caminhada)
    if (!th.indoor && !th.under && !th.space && ST.clouds) {
      const n = th.key.startsWith('sky') ? 7 : 5;
      // céus fixos escuros: nuvens tingidas (as do ciclo escurecem junto com a noite, na passada de luz)
      const tint = th.cycle ? null : th.key.startsWith('lava') ? '#6a2a1e' : th.key.startsWith('abyss') ? '#4a1418' : th.key.startsWith('crystal') ? '#3a4a8a' : '#3a3456';
      for (let i = 0; i < n; i++) {
        const c = cloudOf(i % ST.clouds.length, tint), span = aw + c.width * 2;
        const x = Math.round(((i * 0.37 * span + t * (1.2 + (i % 3) * 0.5) + scroll * 0.03) % span + span) % span - c.width);
        const y = Math.round(hz * (0.08 + (i * 0.17) % 0.5));
        g.globalAlpha = th.cycle ? 0.92 : 0.6;
        g.drawImage(c, x, y);
      }
      g.globalAlpha = 1;
    }
  }

  // partículas do clima (em pixels de arte; andam junto com o mundo)
  const FX_SPEC = {
    leaf: { n: 10, day: true }, petal: { n: 16 }, butterfly: { n: 4, day: true }, firefly: { n: 18, night: true }, snow: { n: 70 },
    dust: { n: 26 }, ember: { n: 34 }, ash: { n: 26 }, bubble: { n: 22 }, fish: { n: 3 }, feather: { n: 6 }, sparkle: { n: 26 },
    spore: { n: 24 }, magic: { n: 22 }, mote: { n: 30 }, wisp: { n: 16 }, mist: { n: 5 },
  };
  function spawn(kind, aw, ah, hz, pB, first) {
    const p = { k: kind, x: Math.random() * aw, y: 0, vx: 0, vy: 0, ph: Math.random() * TAU, life: 0, max: 6 + Math.random() * 8, f: 0.9 + Math.random() * 0.3 };
    switch (kind) {
      case 'leaf': case 'petal': case 'snow': case 'ash': case 'feather':
        p.y = first ? Math.random() * ah : -4; p.vy = kind === 'snow' ? 8 + Math.random() * 10 : 6 + Math.random() * 6; p.vx = -3 - Math.random() * 5; p.max = 40; break;
      case 'ember': case 'spore': case 'magic': case 'mote': case 'bubble':
        p.y = first ? hz + Math.random() * (ah - hz) : ah + 2; p.vy = -(kind === 'bubble' ? 10 : 5) - Math.random() * 8; p.vx = (Math.random() - 0.5) * 3; p.max = 30; break;
      case 'butterfly': case 'firefly': case 'wisp': case 'dust': case 'sparkle':
        p.y = hz - 10 + Math.random() * (pB - hz + 20); p.vx = (Math.random() - 0.5) * 4; p.max = 8 + Math.random() * 10; break;
      case 'fish':
        p.y = hz * (0.4 + Math.random() * 0.6); p.x = first ? Math.random() * aw : aw + 10; p.vx = -6 - Math.random() * 6; p.max = 60; p.n = 3 + Math.floor(Math.random() * 4); break;
      case 'mist':
        p.y = hz + Math.random() * (pB - hz + 10); p.x = Math.random() * aw; p.vx = -1 - Math.random() * 2; p.max = 30; p.w = 30 + Math.random() * 50; break;
      default: break;
    }
    if (first) p.life = Math.random() * p.max * 0.8;
    return p;
  }
  function stepParts(g, th, tod, dt, dScroll, t, q) {
    const { aw, ah, geo } = ST, hz = geo.hz, pB = geo.pB;
    const want = {};
    const k = q === 'baixa' ? 0.3 : q === 'media' ? 0.65 : q === 'ultra' ? 1.4 : 1;
    const night = th.cycle ? tod.n : th.dark;
    for (const kind of th.fx || []) {
      const sp = FX_SPEC[kind]; if (!sp) continue;
      let n = sp.n * k * (aw / 420);
      if (sp.night) n *= clamp((night - 0.25) * 2, 0, 1); if (sp.day) n *= clamp(1 - night * 1.5, 0, 1);
      want[kind] = Math.round(n);
    }
    const have = {};
    for (const p of ST.parts) have[p.k] = (have[p.k] || 0) + 1;
    for (const kind in want) for (let i = have[kind] || 0; i < want[kind]; i++) ST.parts.push(spawn(kind, aw, ah, hz, pB, !ST.partsInit));
    ST.partsInit = true;
    const K = kit(g), keep = [];
    for (const p of ST.parts) {
      p.life += dt;
      if (p.life > p.max || (want[p.k] || 0) < (have[p.k] || 0) && Math.random() < dt * 0.5) { have[p.k]--; continue; }
      p.x += p.vx * dt - dScroll * p.f;
      p.y += p.vy * dt;
      const fade = Math.min(1, p.life / 0.6, (p.max - p.life) / 0.8);
      if (p.x < -60) p.x += aw + 70; if (p.x > aw + 60) p.x -= aw + 70;
      if (p.y > ah + 6 || p.y < -10) { p.life = p.max + 1; }
      let x = p.x, y = p.y;
      switch (p.k) {
        case 'leaf': x += Math.sin(t * 2 + p.ph) * 4; g.globalAlpha = fade; K.R(x, y, 2, 1, Math.sin(p.ph) > 0 ? '#e0a040' : '#7ab04a'); K.R(x + (Math.sin(t * 6 + p.ph) > 0), y - 1, 1, 1, '#c88030'); break;
        case 'petal': x += Math.sin(t * 2 + p.ph) * 5; g.globalAlpha = fade; K.R(x, y, 2, 1, '#ffc0dc'); K.R(x + 1, y + (Math.sin(t * 5 + p.ph) > 0 ? 1 : -1), 1, 1, '#ff9ac8'); break;
        case 'snow': x += Math.sin(t * 1.5 + p.ph) * 3; g.globalAlpha = 0.9 * fade; K.R(x, y, p.ph > 4 ? 2 : 1, p.ph > 4 ? 2 : 1, '#ffffff'); break;
        case 'ash': x += Math.sin(t + p.ph) * 4; g.globalAlpha = 0.6 * fade; K.R(x, y, 1, 1, '#8a8080'); break;
        case 'feather': x += Math.sin(t * 1.2 + p.ph) * 8; g.globalAlpha = fade; K.R(x, y, 3, 1, '#ffffff'); K.R(x + 1, y - 1, 1, 1, '#e8f0ff'); break;
        case 'butterfly': {
          x += Math.sin(t * 0.9 + p.ph) * 14; y += Math.sin(t * 1.7 + p.ph * 2) * 6;
          const flap = Math.sin(t * 18 + p.ph) > 0, col = p.ph > 3 ? '#ffd34a' : '#ff9ad0';
          g.globalAlpha = fade; K.R(x, y, 1, 2, '#3a2a2a'); K.R(x - 1, y - (flap ? 1 : 0), 1, flap ? 2 : 1, col); K.R(x + 1, y - (flap ? 1 : 0), 1, flap ? 2 : 1, col);
          break;
        }
        case 'dust': x += Math.sin(t * 0.4 + p.ph) * 8; y += Math.sin(t * 0.6 + p.ph) * 4; g.globalAlpha = 0.35 * fade; K.R(x, y, 1, 1, th.key.startsWith('desert') ? '#fff0c8' : '#f0e8d8'); break;
        case 'bubble': x += Math.sin(t * 2 + p.ph) * 2; g.globalAlpha = 0.7 * fade; K.R(x, y, 2, 1, '#bff4ff'); K.R(x - 1, y + 1, 1, 1, '#bff4ff'); K.R(x + 2, y + 1, 1, 1, '#bff4ff'); K.R(x, y + 2, 2, 1, '#8ad8f0'); break;
        case 'fish': {
          g.globalAlpha = 0.55 * fade;
          for (let i = 0; i < p.n; i++) { const fx = x + i * 5 + Math.sin(t * 3 + i) * 1.5, fy = y + ((i * 7) % 5) - 2 + Math.sin(t * 2 + i) * 1; K.R(fx, fy, 3, 1, '#0e3a50'); K.R(fx + 3, fy - 1, 1, 3, '#0e3a50'); }
          break;
        }
        default: {
          // brilhos (somam luz): vaga-lumes, brasas, esporos, magia, poeira mágica
          const col = { firefly: '#d8ff6a', ember: '#ffb02e', spore: '#7af0d0', magic: '#9ab4ff', mote: '#c08aff', wisp: '#9affc0', sparkle: '#bff4ff' }[p.k] || '#ffffff';
          if (p.k === 'firefly' || p.k === 'wisp') { x += Math.sin(t * 0.8 + p.ph) * 10; y += Math.sin(t * 1.3 + p.ph * 2) * 5; }
          else if (p.k === 'ember') x += Math.sin(t * 3 + p.ph) * 2;
          else if (p.k === 'sparkle') { y += Math.sin(t + p.ph) * 2; }
          if (p.k === 'mist') {
            g.globalAlpha = 0.07 * fade; g.fillStyle = '#b8b0d8'; g.fillRect(Math.round(x), Math.round(y), Math.round(p.w), 3); g.fillRect(Math.round(x + 6), Math.round(y - 2), Math.round(p.w * 0.6), 2);
            break;
          }
          const tw = p.k === 'sparkle' || p.k === 'firefly' ? 0.5 + 0.5 * Math.sin(t * (p.k === 'sparkle' ? 7 : 3) + p.ph * 3) : 1;
          g.globalCompositeOperation = 'lighter';
          g.globalAlpha = fade * tw * 0.35; K.R(x - 1, y - 1, 3, 3, col);
          g.globalAlpha = fade * tw; K.R(x, y, 1, 1, p.k === 'sparkle' && tw > 0.8 ? '#ffffff' : col);
          if (p.k === 'sparkle' && tw > 0.85) { K.R(x - 2, y, 5, 1, col); K.R(x, y - 2, 1, 5, col); }
          g.globalCompositeOperation = 'source-over';
        }
      }
      g.globalAlpha = 1;
      keep.push(p);
    }
    ST.parts = keep;
  }

  // fumaça de chaminé/vulcão (emissores das camadas)
  function smoke(g, t, dt, scroll) {
    const K = kit(g);
    for (const ly of ST.layers) {
      const off = offOf(scroll, ly.f);
      for (const e of ly.L.emit) {
        for (const dx of [0, ST.P]) {
          const x0 = e.x - off + dx; if (x0 < -20 || x0 > ST.aw + 20) continue;
          const big = e.kind === 'volsmoke';
          for (let i = 0; i < (big ? 7 : 4); i++) {
            const age = ((t * (big ? 0.15 : 0.3) + i / (big ? 7 : 4)) % 1);
            const x = x0 + age * (big ? 24 : 10) + Math.sin(t + i) * 1.5, y = e.y - age * (big ? 40 : 16), rad = (big ? 3 : 1) + age * (big ? 7 : 3);
            g.globalAlpha = (1 - age) * (big ? 0.35 : 0.4);
            K.disc(x, y, rad, big ? '#3a2a2a' : '#d8d8d8');
          }
        }
      }
    }
    g.globalAlpha = 1;
  }

  // ---------- desenho por quadro ----------
  function draw(ctx, o) {
    ensure(o);
    const { A, aw, ah, th, geo, bg } = ST, t = o.now / 1000;
    const scroll = o.scroll / ST.A;
    const dt = ST.lastT ? clamp(t - ST.lastT, 0, 0.1) : 0; ST.lastT = t;
    const dScroll = ST.lastScroll == null ? 0 : clamp(scroll - ST.lastScroll, -50, 50); ST.lastScroll = scroll;
    ST.dScroll = dScroll; ST.dt = dt;
    const tod = timeOfDay(); ST.tod = tod;
    const cols = drawSky(bg, th, tod, aw, geo.hz, ah);
    drawCelestial(bg, th, tod, aw, geo.hz, t, scroll);
    for (const ly of ST.layers) {
      blit(bg, ly.L, offOf(scroll, ly.f));
      if (ly.haze) { bg.globalAlpha = ly.haze * (th.cycle ? 1 - tod.n * 0.4 : 0.6); bg.fillStyle = cols[2]; bg.fillRect(0, 0, aw, geo.hz + 2); bg.globalAlpha = 1; }
    }
    smoke(bg, t, dt, scroll);
    // raios de luz debaixo d'água
    if (th.under) {
      bg.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 5; i++) {
        const x = ((i * 97 + t * 4 - scroll * 0.1) % (aw + 80) + aw + 80) % (aw + 80) - 40, w = 10 + (i % 3) * 6;
        bg.globalAlpha = 0.05 + 0.03 * Math.sin(t * 0.7 + i);
        bg.fillStyle = '#bff4ff';
        for (let y = 0; y < geo.pB; y += 2) bg.fillRect(Math.round(x + y * 0.35), y, w, 2);
      }
      bg.globalAlpha = 1; bg.globalCompositeOperation = 'source-over';
    }
    if (th.under) { bg.globalAlpha = 0.16; bg.fillStyle = '#0e5a7a'; bg.fillRect(0, 0, aw, ah); bg.globalAlpha = 1; }
    // noite / pôr do sol / ambiente escuro
    const night = th.cycle ? tod.n : 0;
    if (night > 0) { bg.globalCompositeOperation = 'multiply'; bg.globalAlpha = night * 0.62; bg.fillStyle = '#3a4888'; bg.fillRect(0, 0, aw, ah); bg.globalAlpha = 1; bg.globalCompositeOperation = 'source-over'; }
    if (th.cycle && tod.d > 0) { bg.globalCompositeOperation = 'multiply'; bg.globalAlpha = tod.d * 0.35; bg.fillStyle = '#ffa87a'; bg.fillRect(0, 0, aw, ah); bg.globalAlpha = 1; bg.globalCompositeOperation = 'source-over'; }
    // janelas acesas, chamas
    const lightK = th.cycle ? clamp((tod.n - 0.25) * 1.6, 0, 1) : 1;
    for (const ly of ST.layers) {
      const off = offOf(scroll, ly.f);
      if (lightK > 0) {
        bg.globalAlpha = lightK; bg.fillStyle = '#ffd27a';
        for (const w of ly.L.wins) for (const dx of [0, ST.P]) { const x = w[0] - off + dx; if (x > -4 && x < aw + 4) bg.fillRect(Math.round(x), w[1], w[2], w[3]); }
        bg.globalAlpha = 1;
      }
      for (const fl of ly.L.flames) for (const dx of [0, ST.P]) {
        const x = Math.round(fl.x - off + dx); if (x < -4 || x > aw + 4) continue;
        const f = Math.sin(t * 17 + fl.x) > 0, h = (fl.big ? 4 : 2) + (f ? 1 : 0);
        bg.fillStyle = fl.c; bg.fillRect(x - (fl.big ? 2 : 0), fl.y - h + 1, fl.big ? 4 : 1, h);
        bg.fillStyle = '#fff2c0'; bg.fillRect(x - (fl.big && f ? 1 : 0), fl.y - 1, 1, 1);
        if (fl.big) { bg.fillStyle = '#ff6a1a'; bg.fillRect(x - 3, fl.y - 1, 1, 1); bg.fillRect(x + 2, fl.y - 2 + (f ? 1 : 0), 1, 1); }
      }
    }
    // amplia o cenário
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(ST.buf, 0, 0, aw, ah, 0, 0, aw * A, ah * A);
    // brilho das luzes (em resolução cheia, suave)
    if (o.lights !== false) {
      ctx.globalCompositeOperation = 'lighter';
      let count = 0;
      const max = o.quality === 'baixa' ? 8 : o.quality === 'media' ? 18 : 40;
      for (const ly of ST.layers) {
        const off = offOf(scroll, ly.f);
        for (const l of ly.L.lights) {
          const k = l.night ? lightK : th.cycle ? Math.max(0.25, lightK) : 1;
          if (k <= 0.02) continue;
          for (const dx of [0, ST.P]) {
            const x = (l.x - off + dx), y = l.y;
            if (x < -l.r || x > aw + l.r || count >= max) continue;
            count++;
            const a = l.a * k * (1 - l.fl * 0.5 + l.fl * 0.5 * Math.sin(t * 9 + l.x * 1.7) * Math.sin(t * 5.3 + l.y));
            const X = x * A, Y = y * A, Rr = l.r * A;
            const gr = ctx.createRadialGradient(X, Y, 0, X, Y, Rr);
            gr.addColorStop(0, `rgba(${l.col},${clamp(a * 0.55, 0, 1)})`); gr.addColorStop(0.4, `rgba(${l.col},${clamp(a * 0.18, 0, 1)})`); gr.addColorStop(1, `rgba(${l.col},0)`);
            ctx.fillStyle = gr; ctx.fillRect(X - Rr, Y - Rr, Rr * 2, Rr * 2);
          }
        }
      }
    }
    ctx.restore();
    return { pathTop: geo.pT * A, pathH: (geo.pB - geo.pT) * A, horizon: geo.hz * A, night: th.cycle ? tod.n : th.dark };
  }

  // depois dos personagens: primeiro plano, partículas, luz do grupo à noite e vinheta
  function front(ctx, o) {
    if (!ST.layers) return;
    const { A, aw, ah, th, b2 } = ST, t = o.now / 1000, tod = ST.tod || timeOfDay();
    const scroll = o.scroll / A;
    // só a faixa de baixo tem primeiro plano: copia só ela
    const y0 = Math.max(0, ah - ST.frontH);
    b2.clearRect(0, y0, aw, ah - y0);
    blit(b2, ST.front.L, offOf(scroll, ST.front.f));
    const night = th.cycle ? tod.n : th.dark * 0.6;
    if (night > 0) { b2.globalCompositeOperation = 'source-atop'; b2.globalAlpha = night * 0.5; b2.fillStyle = '#0a0e22'; b2.fillRect(0, y0, aw, ah - y0); b2.globalAlpha = 1; b2.globalCompositeOperation = 'source-over'; }
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    if (ah > y0) ctx.drawImage(ST.buf2, 0, y0, aw, ah - y0, 0, y0 * A, aw * A, (ah - y0) * A);
    // partículas do clima direto na tela, em blocos de pixel de arte
    ctx.save(); ctx.scale(A, A);
    stepParts(ctx, th, tod, ST.dt || 0, ST.dScroll || 0, t, o.quality);
    ctx.restore();
    // luz em volta do grupo (lanterna) quando escurece
    const dk = th.cycle ? tod.n : th.dark;
    if (o.hero && dk > 0.15) {
      ctx.globalCompositeOperation = 'lighter';
      const X = o.hero.x, Y = o.hero.y - o.hero.h * 0.45, Rr = o.hero.h * 2.2;
      const gr = ctx.createRadialGradient(X, Y, 0, X, Y, Rr);
      gr.addColorStop(0, `rgba(255,214,150,${0.16 * dk})`); gr.addColorStop(1, 'rgba(255,214,150,0)');
      ctx.fillStyle = gr; ctx.fillRect(X - Rr, Y - Rr, Rr * 2, Rr * 2);
      ctx.globalCompositeOperation = 'source-over';
    }
    // raios de sol entre as árvores (de dia)
    if (th.rays && th.cycle && tod.n < 0.5 && o.quality !== 'baixa') {
      ctx.globalCompositeOperation = 'lighter';
      const k = (1 - tod.n * 2) * 0.05;
      for (let i = 0; i < 4; i++) {
        const x0 = ((i * 0.27 + 0.1) * o.W + Math.sin(t * 0.2 + i) * 20 * o.dpr), w = (40 + i * 18) * o.dpr;
        const gr = ctx.createLinearGradient(0, 0, 0, o.H * 0.8);
        gr.addColorStop(0, `rgba(255,246,200,${k * (1 + 0.4 * Math.sin(t * 0.5 + i * 2))})`); gr.addColorStop(1, 'rgba(255,246,200,0)');
        ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(x0, 0); ctx.lineTo(x0 + w, 0); ctx.lineTo(x0 + w + o.H * 0.45, o.H * 0.8); ctx.lineTo(x0 + o.H * 0.45, o.H * 0.8); ctx.closePath(); ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    // vinheta (não na qualidade baixa)
    if (o.quality === 'baixa') { ctx.restore(); return; }
    const vg = ctx.createRadialGradient(o.W / 2, o.H * 0.55, Math.min(o.W, o.H) * 0.35, o.W / 2, o.H * 0.55, Math.max(o.W, o.H) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, `rgba(0,0,0,${0.28 + dk * 0.22})`);
    ctx.fillStyle = vg; ctx.fillRect(0, 0, o.W, o.H);
    ctx.restore();
  }

  window.IdleScene = { draw, front, timeOfDay, themeFor };
})();
