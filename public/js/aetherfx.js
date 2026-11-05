// Efeitos visuais dos 20 poderes do Aether Reborn (portados do Test1, Phaser → canvas 2D).
// Só desenho: dano, alcance e área continuam calculados pelo servidor.
(function () {
  'use strict';
  const K = 0.55; // 1 unidade do Test1 = 0,55 unidade do mapa
  const COLORS = {
    slash: 0xff4b54, whirl: 0xffb463, quake: 0xff793a, swords: 0xffd37a,
    orb: 0x64caff, frost: 0xa5f4ff, lightning: 0x9b99ff, meteors: 0xff8a45,
    arrow: 0x71ffad, fan: 0xc4ff73, roots: 0x55d16b, phoenix: 0xffde7c,
    blade: 0xcb86ff, cross: 0xf29aff, crystals: 0x9c7aff, vortex: 0xd2a4ff,
    claw: 0xb87aff, ravens: 0xc5a1e8, chains: 0xd1a754, eclipse: 0xeac765,
  };
  const rgba = (c, a) => `rgba(${c >> 16 & 255},${c >> 8 & 255},${c & 255},${Math.max(0, Math.min(1, a))})`;
  let effects = [];
  let queue = [];
  let clock = 0;

  // imita a API de Graphics do Phaser num canvas já transladado/escalado para a origem do efeito
  function gfx(ctx) {
    let stroke = 'rgba(0,0,0,0)', fill = 'rgba(0,0,0,0)', lw = 1;
    const g = {
      lineStyle(w, c, a = 1) { lw = w; stroke = rgba(c, a); return g; },
      fillStyle(c, a = 1) { fill = rgba(c, a); return g; },
      strokeCircle(x, y, r) { ctx.beginPath(); ctx.arc(x, y, Math.max(0, r), 0, Math.PI * 2); ctx.lineWidth = lw; ctx.strokeStyle = stroke; ctx.stroke(); return g; },
      fillCircle(x, y, r) { ctx.beginPath(); ctx.arc(x, y, Math.max(0, r), 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill(); return g; },
      fillRect(x, y, w, h) { ctx.fillStyle = fill; ctx.fillRect(x, y, w, h); return g; },
      fillTriangle(a, b, c, d, e, f) { ctx.beginPath(); ctx.moveTo(a, b); ctx.lineTo(c, d); ctx.lineTo(e, f); ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); return g; },
      lineBetween(a, b, c, d) { ctx.beginPath(); ctx.moveTo(a, b); ctx.lineTo(c, d); ctx.lineWidth = lw; ctx.strokeStyle = stroke; ctx.stroke(); return g; },
      strokeEllipse(x, y, w, h) { ctx.beginPath(); ctx.ellipse(x, y, Math.max(0, w / 2), Math.max(0, h / 2), 0, 0, Math.PI * 2); ctx.lineWidth = lw; ctx.strokeStyle = stroke; ctx.stroke(); return g; },
      beginPath() { ctx.beginPath(); return g; },
      arc(x, y, r, a0, a1) { ctx.arc(x, y, Math.max(0, r), a0, a1); return g; },
      moveTo(x, y) { ctx.moveTo(x, y); return g; },
      lineTo(x, y) { ctx.lineTo(x, y); return g; },
      strokePath() { ctx.lineWidth = lw; ctx.strokeStyle = stroke; ctx.stroke(); return g; },
    };
    return g;
  }

  // origem/alvo em coordenadas do mapa; tudo dentro do efeito em unidades do Test1 relativas à origem
  function cast(kind, origin, aim, ends, at) {
    const color = COLORS[kind];
    if (color == null || !origin) return;
    const now = at == null ? clock : at;
    const O = { x: origin.x, y: origin.y };
    const A = aim ? { x: (aim.x - O.x) / K, y: (aim.y - O.y) / K } : { x: 60, y: 0 };
    const len = Math.hypot(A.x, A.y) || 1;
    const dir = { x: A.x / len, y: A.y / len }, angle = Math.atan2(dir.y, dir.x);
    const E = (ends && ends.length ? ends : [aim || { x: O.x + dir.x * 60 * K, y: O.y + dir.y * 60 * K }]).slice(0, 5).map((p) => ({ x: (p.x - O.x) / K, y: (p.y - O.y) / K }));
    const later = (d, fn) => queue.push({ at: now + d, fn });
    const animate = (x, y, dur, draw, delay = 0) => effects.push({ ox: O.x, oy: O.y, x, y, t0: now + delay, dur, draw });
    const burst = (p, r) => animate(p.x, p.y, 500, (g, t) => { g.lineStyle(2, color, 1 - t); g.strokeCircle(0, 0, 8 + t * r); for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; g.fillStyle(i % 2 ? color : 0xffffff, 1 - t); g.fillRect(Math.cos(a) * t * r, Math.sin(a) * t * r, 3, 3); } });
    const impact = (p, r) => burst(p, Math.min(r, 45));
    // runa pulsante sob quem conjura
    animate(0, 0, 400, (g, t) => { g.lineStyle(1, color, 1 - t); g.strokeEllipse(0, 5, 26 + t * 24, 12 + t * 10); for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3 + t * 4; g.fillStyle(color, 1 - t); g.fillRect(Math.cos(a) * 18, Math.sin(a) * 9 - 22 * t, 2, 4); } });
    const missile = (offset, mk, delay = 0) => {
      const a = angle + offset, d = { x: Math.cos(a), y: Math.sin(a) }, travel = len;
      animate(0, 0, 450, (g, t) => {
        const x = d.x * travel * t, y = d.y * travel * t;
        g.lineStyle(mk === 'phoenix' ? 12 : 4, color, 0.45); g.lineBetween(x - d.x * 30, y - d.y * 30, x, y);
        g.lineStyle(1, 0xffffff, 0.9); g.lineBetween(x - d.x * 18, y - d.y * 18, x, y); g.fillStyle(color, 0.9);
        if (mk === 'orb') { g.fillCircle(x, y, 7 + Math.sin(t * 25) * 2); g.lineStyle(1, color, 0.5); g.strokeCircle(x, y, 12); }
        else if (mk === 'blade') { g.lineStyle(4, color, 1); g.lineBetween(x - Math.cos(t * 22) * 16, y - Math.sin(t * 22) * 16, x + Math.cos(t * 22) * 16, y + Math.sin(t * 22) * 16); }
        else if (mk === 'phoenix') { g.lineStyle(3, color, 1); for (const side of [-1, 1]) g.lineBetween(x, y, x - d.x * 18 - d.y * side * (12 + Math.sin(t * 32) * 10), y - d.y * 18 + d.x * side * (12 + Math.sin(t * 32) * 10)); }
        else g.fillTriangle(x + d.x * 7, y + d.y * 7, x - d.x * 6 - d.y * 4, y - d.y * 6 + d.x * 4, x - d.x * 6 + d.y * 4, y - d.y * 6 - d.x * 4);
      }, delay);
      later(delay + 450, () => burst({ x: d.x * travel, y: d.y * travel }, 20));
    };
    switch (kind) {
      case 'orb': case 'arrow': case 'blade': case 'phoenix': missile(0, kind); break;
      case 'fan': for (const off of [-0.38, -0.19, 0, 0.19, 0.38]) missile(off, 'arrow'); break;
      case 'slash': case 'claw': {
        const count = kind === 'claw' ? 3 : 1;
        for (let i = 0; i < count; i++) animate(0, 0, 350, (g, t) => { g.lineStyle(5 - i, color, 1 - t); g.beginPath(); g.arc(0, 0, 20 + t * 65, angle - 1.1 + i * 0.25, angle + 0.7 + i * 0.25); g.strokePath(); g.lineStyle(1, 0xffffff, 1 - t); g.beginPath(); g.arc(0, 0, 24 + t * 65, angle - 1.1, angle + 0.7); g.strokePath(); }, i * 80);
        later(160, () => impact({ x: dir.x * 45, y: dir.y * 45 }, 48)); break;
      }
      case 'whirl': animate(0, 0, 900, (g, t) => { for (let i = 0; i < 4; i++) { const a = t * 18 + i * Math.PI / 2; g.lineStyle(4, color, 1 - t * 0.8); g.beginPath(); g.arc(0, 0, 35 + t * 45, a, a + 1); g.strokePath(); } }); break;
      case 'quake': for (let i = 1; i <= 6; i++) { const p = { x: dir.x * i * len / 6, y: dir.y * i * len / 6 }; later(i * 90, () => { animate(p.x, p.y, 420, (g, t) => { g.fillStyle(color, 1 - t); g.fillTriangle(-12, 5, 0, -30 * (1 - t), 12, 5); g.lineStyle(2, 0xffdf9d, 1 - t); g.lineBetween(-15, 8, 15, -8); }); impact(p, 25); }); } break;
      case 'swords': for (let i = 0; i < 7; i++) { const a = i * Math.PI * 2 / 7; const p = { x: Math.cos(a) * 65, y: Math.sin(a) * 65 }; later(i * 85, () => { animate(p.x, p.y, 550, (g, t) => { const y = -75 * (1 - Math.min(t * 2, 1)); g.lineStyle(4, color, 1 - t * 0.8); g.lineBetween(0, y - 22, 0, y); g.lineBetween(-8, y - 15, 8, y - 15); }); later(260, () => impact(p, 40)); }); } break;
      case 'frost': animate(0, 0, 850, (g, t) => { g.lineStyle(3, color, 1 - t); g.strokeCircle(0, 0, t * 100); for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6, r = t * 95; g.lineBetween(Math.cos(a) * r * 0.7, Math.sin(a) * r * 0.7, Math.cos(a) * r, Math.sin(a) * r); g.fillStyle(0xeaffff, 1 - t); g.fillTriangle(Math.cos(a) * r - 4, Math.sin(a) * r, Math.cos(a) * r, Math.sin(a) * r - 14, Math.cos(a) * r + 4, Math.sin(a) * r); } }); later(350, () => impact({ x: 0, y: 0 }, 100)); break;
      case 'lightning': { let from = { x: 0, y: 0 }; E.forEach((end, i) => { const start = { ...from }; later(i * 110, () => { animate(start.x, start.y, 420, (g, t) => { g.lineStyle(4, color, 1 - t); g.beginPath(); g.moveTo(0, 0); for (let j = 1; j <= 10; j++) g.lineTo((end.x - start.x) * j / 10 + (j < 10 ? Math.sin(j * 9 + t * 45) * 7 : 0), (end.y - start.y) * j / 10); g.strokePath(); }); impact(end, 20); }); from = end; }); break; }
      case 'meteors': for (let i = 0; i < 6; i++) { const a = i * 2.4; const p = { x: A.x + Math.cos(a) * (i ? 48 : 0), y: A.y + Math.sin(a) * (i ? 40 : 0) }; later(i * 160, () => { animate(p.x, p.y, 450, (g, t) => { g.lineStyle(10, color, 0.65); g.lineBetween(-60 * (1 - t), -100 * (1 - t), -60 * (1 - t) - 18, -100 * (1 - t) - 30); g.fillStyle(0xfff3b3); g.fillCircle(-60 * (1 - t), -100 * (1 - t), 7); g.lineStyle(1, color, 0.5); g.strokeEllipse(0, 0, 35, 18); }); later(450, () => impact(p, 45)); }); } break;
      case 'roots': for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; animate(A.x, A.y, 1100, (g, t) => { const r = 65 * Math.min(1, t * 3); g.lineStyle(3, color, 1 - t * 0.7); g.beginPath(); g.moveTo(Math.cos(a) * r, Math.sin(a) * r); g.lineTo(Math.cos(a) * r * 0.6, Math.sin(a) * r * 0.6 - 25 * Math.sin(t * Math.PI)); g.lineTo(Math.cos(a) * r * 0.25, Math.sin(a) * r * 0.25); g.strokePath(); }); } later(350, () => impact(A, 95)); break;
      case 'cross': animate(0, 0, 650, (g, t) => { g.lineStyle(8, color, 1 - t); for (const a of [angle + Math.PI / 4, angle - Math.PI / 4]) g.lineBetween(-Math.cos(a) * 110 * t, -Math.sin(a) * 110 * t, Math.cos(a) * 110 * t, Math.sin(a) * 110 * t); g.lineStyle(2, 0xffffff, 1 - t); g.strokeCircle(0, 0, t * 60); }); later(220, () => impact({ x: 0, y: 0 }, 110)); break;
      case 'crystals': for (let i = 1; i <= 5; i++) later(i * 100, () => { const p = { x: dir.x * i * len / 5, y: dir.y * i * len / 5 }; animate(p.x, p.y, 700, (g, t) => { const h = Math.sin(t * Math.PI) * 45; g.fillStyle(color, 1 - t * 0.7); g.fillTriangle(-12, 2, 0, -h, 12, 2); g.lineStyle(1, 0xffffff, 1 - t); g.lineBetween(0, -h, 4, 0); }); impact(p, 30); }); break;
      case 'vortex': animate(A.x, A.y, 1600, (g, t) => { g.fillStyle(0x211333, (1 - t) * 0.7); g.fillCircle(0, 0, 65); for (let i = 0; i < 40; i++) { const a = i * 0.65 + t * 14, r = (i / 40) * 90 * (1 - t * 0.3); g.fillStyle(i % 3 ? color : 0xffffff, 1 - t * 0.8); g.fillRect(Math.cos(a) * r, Math.sin(a) * r * 0.6, 3, 3); } g.lineStyle(2, color, 1 - t); g.strokeEllipse(0, 0, 150, 85); }); break;
      case 'ravens': for (let i = 0; i < 5; i++) later(i * 130, () => { animate(0, 0, 600, (g, t) => { const x = A.x * t + Math.sin(t * Math.PI) * (i - 2) * 14, y = A.y * t - 15; g.lineStyle(3, color, 1 - t * 0.5); const flap = Math.sin(t * 36 + i) * 9; g.lineBetween(x - 10, y + flap, x, y); g.lineBetween(x, y, x + 10, y + flap); }); later(600, () => impact(A, 24)); }); break;
      case 'chains': E.forEach((end) => { animate(0, 0, 950, (g, t) => { const reach = Math.min(t * 4, 1); g.lineStyle(2, color, 1 - t * 0.6); for (let i = 0; i < 12 * reach; i++) g.strokeEllipse(end.x * i / 12, end.y * i / 12, 8, 4); g.strokeCircle(end.x * reach, end.y * reach, 12 + Math.sin(t * 15) * 4); }); later(300, () => impact(end, 22)); }); break;
      case 'eclipse': animate(A.x, A.y, 1500, (g, t) => { const r = Math.sin(t * Math.PI) * 65; g.fillStyle(0x110d22, 0.85 * (1 - t * 0.6)); g.fillCircle(0, -20, r); g.lineStyle(3, color, 1 - t * 0.6); g.strokeCircle(0, -20, r); for (let i = 0; i < 16; i++) { const a = i * Math.PI / 8 + t * 2; g.lineBetween(Math.cos(a) * r, Math.sin(a) * r - 20, Math.cos(a) * (r + 14), Math.sin(a) * (r + 14) - 20); } g.strokeEllipse(0, 0, 120 + t * 100, 65 + t * 40); }); later(1000, () => impact(A, 120)); break;
      default: break;
    }
  }

  // toScreen: mapa → tela; zoom: pixels de tela por unidade do mapa
  function draw(ctx, toScreen, zoom, now) {
    clock = now;
    if (queue.length) { const due = queue.filter((q) => q.at <= now); queue = queue.filter((q) => q.at > now); for (const q of due) q.fn(); }
    if (!effects.length) return;
    const s = K * zoom;
    ctx.save();
    effects = effects.filter((f) => {
      const p = (now - f.t0) / f.dur;
      if (p >= 1) return false;
      if (p < 0) return true;
      const [sx, sy] = toScreen(f.ox, f.oy);
      ctx.save(); ctx.translate(sx + f.x * s, sy + f.y * s); ctx.scale(s, s);
      try { f.draw(gfx(ctx), p); } catch (_) { /* efeito quebrado não derruba o jogo */ }
      ctx.restore();
      return true;
    });
    ctx.restore();
  }
  window.AFX = { cast, draw, kinds: Object.keys(COLORS), get count() { return effects.length + queue.length; } };
}());
