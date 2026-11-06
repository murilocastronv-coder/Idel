// Fenrir Dourado (montaria): pixel art desenhado em código, de perfil e olhando para a direita.
// Fenrir.draw(ctx, x, y, p, flip, moving, now): (x, y) = chão no meio da montaria; p = tamanho de cada pixel.
// Fenrir.SEAT(p): quanto o herói sobe para ficar sentado nas costas. Fenrir.icon(ctx, x, y, size): ícone do item.
(function () {
  'use strict';
  const PALS = {
    gold: { K: '#4a2e06', D: '#b8861c', G: '#e8b84a', L: '#ffe08a', M: '#ffd36b', W: '#fff6c8', E: '#ff3a1a', R: '#ff9a3a', glow: '255,214,90' },
    red: { K: '#3a0604', D: '#a01a14', G: '#d8362a', L: '#ff7a5a', M: '#ff5a3a', W: '#ffc8b8', E: '#ffd36b', R: '#ffb02e', glow: '255,70,50' },
  };
  const BODY = [
    '...........................K....',
    '..........................KLK...',
    '......................KK.KGGK...',
    '.....................KMMKGGGGK..',
    '...................KKMMGGGGEGGK.',
    '..KK.............KKMMMGGGGGGGGKK',
    '.KLLK..........KKMMMLGGGGGGLLLLK',
    'KLGGLK.......KKGGGGLLGGGGGKKKKK.',
    'KGDGGKK....KKGGGGGGGGLGGGK......',
    '.KDDGGGKKKKGGGGGGGGGGGGGGK......',
    '..KDDGGGGGGGGGGGGGGGGGGGDK......',
    '...KDDGGGGGGGGGGGGGGGGGDDK......',
    '....KDDDGGGGGGGGGGGGGDDDK.......',
    '.....KDDDDDDDDDDDDDDDDDK........',
  ];
  const LEGS = [
    [ // passada aberta
      '.....KDDK.KDK......KDDK.KDK.....',
      '....KDDK...KDK.....KDK...KDK....',
      '...KDDK.....KDK...KDK.....KDK...',
      '...KLK.......KLK..KLK......KLK..',
      '..KKK.........KKK.KKK.......KKK.',
    ],
    [ // pernas juntas
      '......KDDKKDK.......KDDKKDK.....',
      '......KDK.KDK.......KDK.KDK.....',
      '......KDK.KDK.......KDK.KDK.....',
      '......KLK.KLK.......KLK.KLK.....',
      '......KKK.KKK.......KKK.KKK.....',
    ],
  ];
  const W = 32, H = BODY.length + LEGS[0].length;
  const cache = new Map();
  function frame(i, v = 'gold') {
    const key = v + i, PAL = PALS[v] || PALS.gold;
    if (cache.has(key)) return cache.get(key);
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    BODY.concat(LEGS[i]).forEach((row, y) => { for (let x = 0; x < W; x++) { const k = row[x]; if (k && k !== '.') { g.fillStyle = PAL[k]; g.fillRect(x, y, 1, 1); } } });
    cache.set(key, c);
    return c;
  }
  // altura do assento (topo das costas) em pixels do desenho, a partir do chão
  const SEAT_ROWS = H - 8;
  function draw(ctx, x, y, p, flip, moving, now, v = 'gold') {
    const f = moving ? Math.floor(now / 110) % 2 : 1;
    const img = frame(f, v), glow = (PALS[v] || PALS.gold).glow;
    const bob = moving ? (f ? -1 : 0) * p : 0;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.translate(Math.round(x), Math.round(y + bob));
    if (flip) ctx.scale(-1, 1);
    // brilho dourado suave em volta
    ctx.globalAlpha = 0.28 + 0.12 * Math.sin(now / 260);
    const gr = ctx.createRadialGradient(0, -H * p * 0.5, 2, 0, -H * p * 0.5, W * p * 0.6);
    gr.addColorStop(0, `rgba(${glow},.9)`); gr.addColorStop(1, `rgba(${glow},0)`);
    ctx.fillStyle = gr; ctx.fillRect(-W * p * 0.6, -H * p * 1.1, W * p * 1.2, H * p * 1.2);
    ctx.globalAlpha = 1;
    ctx.drawImage(img, Math.round(-W * p / 2), Math.round(-H * p), Math.round(W * p), Math.round(H * p));
    ctx.restore();
  }
  function icon(ctx, x, y, size, v = 'gold') {
    const img = frame(1, v), p = size / (W + 2), glow = (PALS[v] || PALS.gold).glow;
    ctx.save(); ctx.imageSmoothingEnabled = false;
    const g = ctx.createRadialGradient(x + size / 2, y + size / 2, 2, x + size / 2, y + size / 2, size / 2);
    g.addColorStop(0, `rgba(${glow},.35)`); g.addColorStop(1, `rgba(${glow},0)`);
    ctx.fillStyle = g; ctx.fillRect(x, y, size, size);
    ctx.drawImage(img, Math.round(x + p), Math.round(y + (size - H * p) / 2), Math.round(W * p), Math.round(H * p));
    ctx.restore();
  }
  // ---- pets que voam ao lado do personagem: Imp e Fadinha (Guardian Angel) ----
  const PETS = {
    pet_imp: { pal: { K: '#2a0806', R: '#d8362a', Y: '#ffd36b', W: '#5a2a6a' }, glow: '255,70,40', rows: [
      '..K......K..', '.KRK....KRK.', '.KRRKKKKRRK.', '..KRRRRRRK..', '..KRYRRYRK..', '..KRRRRRRK..',
      'WWKKRRRRKKWW', 'WWWKRRRRKWWW', '.WWKRRRRKWW.', '...KRKKRK...', '...KK..KK...', '............'] },
    pet_angel: { pal: { K: '#6a7a9a', S: '#ffe0c8', B: '#3a6aff', W: '#ffffff', Y: '#ffe08a' }, glow: '200,230,255', rows: [
      '...YYYYYY...', '............', '....KSSK....', '...KSSSSK...', '...KSBSBK...', 'WW..KSSK..WW',
      'WWWKWWWWKWWW', '.WWKWWWWKWW.', '...KWWWWK...', '...KWWWWK...', '....KWWK....', '............'] },
  };
  const petCache = new Map();
  function petImg(kind, flap) {
    const k = kind + flap; if (petCache.has(k)) return petCache.get(k);
    const P = PETS[kind], c = document.createElement('canvas'); c.width = 12; c.height = 12; const g = c.getContext('2d');
    P.rows.forEach((row, y) => { for (let x = 0; x < 12; x++) { let ch = row[x]; if (ch === '.' ) continue; if (flap && ch === 'W' && (y === 5 || y === 6) && (x < 2 || x > 9)) continue; g.fillStyle = P.pal[ch]; g.fillRect(x, y, 1, 1); } });
    petCache.set(k, c); return c;
  }
  // (x, y) = chão ao lado do personagem; o pet flutua na altura do ombro
  function drawPet(ctx, kind, x, y, p, now, height) {
    const P = PETS[kind]; if (!P) return;
    const flap = Math.floor(now / 140) % 2, bob = Math.sin(now / 320) * 3 * p;
    const cy = y - height + bob, size = 12 * p;
    ctx.save(); ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = 0.25 + 0.15 * Math.sin(now / 200);
    const gr = ctx.createRadialGradient(x, cy, 1, x, cy, size);
    gr.addColorStop(0, `rgba(${P.glow},.9)`); gr.addColorStop(1, `rgba(${P.glow},0)`);
    ctx.fillStyle = gr; ctx.fillRect(x - size, cy - size, size * 2, size * 2);
    ctx.globalAlpha = 1;
    ctx.drawImage(petImg(kind, flap), Math.round(x - size / 2), Math.round(cy - size / 2), Math.round(size), Math.round(size));
    ctx.restore();
    // sombra pequena no chão
    ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.beginPath(); ctx.ellipse(x, y, 4 * p, 1.5 * p, 0, 0, Math.PI * 2); ctx.fill();
  }
  function petIcon(ctx, kind, x, y, size) {
    const P = PETS[kind]; if (!P) return false;
    ctx.save(); ctx.imageSmoothingEnabled = false;
    const g = ctx.createRadialGradient(x + size / 2, y + size / 2, 2, x + size / 2, y + size / 2, size / 2);
    g.addColorStop(0, `rgba(${P.glow},.4)`); g.addColorStop(1, `rgba(${P.glow},0)`);
    ctx.fillStyle = g; ctx.fillRect(x, y, size, size);
    ctx.drawImage(petImg(kind, 0), Math.round(x + size * 0.1), Math.round(y + size * 0.1), Math.round(size * 0.8), Math.round(size * 0.8));
    ctx.restore(); return true;
  }
  // variante pela base do item: fenrir_gold → dourado, fenrir_red → vermelho
  const variantOf = (base) => (base === 'fenrir_red' ? 'red' : base === 'fenrir_gold' ? 'gold' : null);
  window.Fenrir = { draw, icon, variantOf, drawPet, petIcon, isPet: (b) => !!PETS[b], SEAT: (p) => SEAT_ROWS * p, W, H };
}());
