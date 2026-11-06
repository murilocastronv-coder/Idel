// Fenrir Dourado (montaria): pixel art desenhado em código, de perfil e olhando para a direita.
// Fenrir.draw(ctx, x, y, p, flip, moving, now): (x, y) = chão no meio da montaria; p = tamanho de cada pixel.
// Fenrir.SEAT(p): quanto o herói sobe para ficar sentado nas costas. Fenrir.icon(ctx, x, y, size): ícone do item.
(function () {
  'use strict';
  const PAL = { K: '#4a2e06', D: '#b8861c', G: '#e8b84a', L: '#ffe08a', M: '#ffd36b', W: '#fff6c8', E: '#ff3a1a', R: '#ff9a3a' };
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
  function frame(i) {
    if (cache.has(i)) return cache.get(i);
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    BODY.concat(LEGS[i]).forEach((row, y) => { for (let x = 0; x < W; x++) { const k = row[x]; if (k && k !== '.') { g.fillStyle = PAL[k]; g.fillRect(x, y, 1, 1); } } });
    cache.set(i, c);
    return c;
  }
  // altura do assento (topo das costas) em pixels do desenho, a partir do chão
  const SEAT_ROWS = H - 8;
  function draw(ctx, x, y, p, flip, moving, now) {
    const f = moving ? Math.floor(now / 110) % 2 : 1;
    const img = frame(f);
    const bob = moving ? (f ? -1 : 0) * p : 0;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.translate(Math.round(x), Math.round(y + bob));
    if (flip) ctx.scale(-1, 1);
    // brilho dourado suave em volta
    ctx.globalAlpha = 0.28 + 0.12 * Math.sin(now / 260);
    const gr = ctx.createRadialGradient(0, -H * p * 0.5, 2, 0, -H * p * 0.5, W * p * 0.6);
    gr.addColorStop(0, 'rgba(255,214,90,.9)'); gr.addColorStop(1, 'rgba(255,214,90,0)');
    ctx.fillStyle = gr; ctx.fillRect(-W * p * 0.6, -H * p * 1.1, W * p * 1.2, H * p * 1.2);
    ctx.globalAlpha = 1;
    ctx.drawImage(img, Math.round(-W * p / 2), Math.round(-H * p), Math.round(W * p), Math.round(H * p));
    ctx.restore();
  }
  function icon(ctx, x, y, size) {
    const img = frame(1), p = size / (W + 2);
    ctx.save(); ctx.imageSmoothingEnabled = false;
    const g = ctx.createRadialGradient(x + size / 2, y + size / 2, 2, x + size / 2, y + size / 2, size / 2);
    g.addColorStop(0, 'rgba(255,214,90,.35)'); g.addColorStop(1, 'rgba(255,214,90,0)');
    ctx.fillStyle = g; ctx.fillRect(x, y, size, size);
    ctx.drawImage(img, Math.round(x + p), Math.round(y + (size - H * p) / 2), Math.round(W * p), Math.round(H * p));
    ctx.restore();
  }
  window.Fenrir = { draw, icon, SEAT: (p) => SEAT_ROWS * p, W, H };
}());
