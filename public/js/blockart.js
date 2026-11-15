// MuonlineClaude — personagens de BLOCOS desenhados em 2D (vista isométrica), para o site.
// Mesmas cores do modo blocos do jogo (classe, pele, cabelo, conjunto, arma, asas). Leve: sem 3D, só canvas.
// Troca Sprites.hero / Sprites.monster nas páginas do site (mesma assinatura), então tudo que desenhava
// heróis em pixel art passa a desenhar os bonecos de blocos.
(function () {
  'use strict';
  const C30 = Math.cos(Math.PI / 6), S30 = 0.5;
  const SPR = window.Sprites || {};
  const SKIN = SPR.SKIN || ['#f0c49a', '#d9a066', '#a8693f', '#6b4226'];
  const HAIR = SPR.HAIR || ['#5a3a1c', '#d8d8e8', '#f2d36b', '#c43a2a', '#1a1a1a', '#7a3fb8', '#ff6ab8'];
  const CLS = { dark_knight: ['#4a5468', '#2a2e3a'], dark_wizard: ['#3a48b0', '#26306a'], fairy_elf: ['#3fa04a', '#2a6a30'], magic_gladiator: ['#7a3ab0', '#3a2050'],
    dark_lord: ['#8a2a2a', '#3a1a1a'], summoner: ['#b04aa0', '#5a2a5a'] };
  const SET_COL = { leather: '#8a5a34', bronze: '#b5723a', scale: '#3c8a84', dragon: '#b0262c', storm: '#2f5fc8', phoenix: '#e8661a', abyss: '#5a2a90' };
  const WING_COL = { wings_satan: '#d0342a', wings_heaven: '#e8f4ff', wings_elf: '#8aff6a', wings_curse: '#b05aff', wings_dragon: '#ff5a2a', wings_soul: '#5ac8ff', wings_spirit: '#ffe08a', wings_darkness: '#8a4aff' };
  const setCol = (id) => (id && (SET_COL[id] || (window.MUI_SET_COLORS && window.MUI_SET_COLORS[id]))) || null;

  // ---------- cores ----------
  function shade(hex, k) {
    let r0, g0, b0;
    const m = /^rgb\((\d+),\s*(\d+),\s*(\d+)/.exec(String(hex));
    if (m) { r0 = +m[1]; g0 = +m[2]; b0 = +m[3]; }
    else { const n = parseInt(String(hex).replace('#', '').padEnd(6, '0').slice(0, 6), 16); r0 = (n >> 16) & 255; g0 = (n >> 8) & 255; b0 = n & 255; }
    const r = Math.min(255, Math.round(r0 * k)), g = Math.min(255, Math.round(g0 * k)), b = Math.min(255, Math.round(b0 * k));
    return `rgb(${r},${g},${b})`;
  }
  // textura pixelada (manchinhas) por cima das faces
  let PAT = null;
  function pattern(ctx) {
    if (PAT) return PAT;
    const c = document.createElement('canvas'); c.width = c.height = 8;
    const g = c.getContext('2d'); let s = 13;
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { s = (s * 16807) % 2147483647; const v = s / 2147483647; if (v < 0.22) { g.fillStyle = 'rgba(0,0,0,.14)'; g.fillRect(x, y, 1, 1); } else if (v > 0.9) { g.fillStyle = 'rgba(255,255,255,.10)'; g.fillRect(x, y, 1, 1); } }
    PAT = ctx.createPattern(c, 'repeat'); return PAT;
  }

  // ---------- caixas em vista isométrica ----------
  // mundo: x para a direita-baixo, z para a esquerda-baixo, y para cima. U = pixels por unidade.
  function proj(o, U, x, y, z) { return [o[0] + (x - z) * C30 * U, o[1] + (-y + (x + z) * S30) * U]; }
  function face(ctx, pts, color) {
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.closePath();
    ctx.fillStyle = color; ctx.fill();
    ctx.save(); ctx.clip(); ctx.fillStyle = pattern(ctx); ctx.fill(); ctx.restore();
    ctx.strokeStyle = 'rgba(10,8,16,.45)'; ctx.lineWidth = 1; ctx.stroke();
  }
  function box(ctx, o, U, b) {
    const [x0, y0, z0, x1, y1, z1] = [b.x - b.w / 2, b.y, b.z - b.d / 2, b.x + b.w / 2, b.y + b.h, b.z + b.d / 2];
    const P = (x, y, z) => proj(o, U, x, y, z);
    face(ctx, [P(x0, y1, z0), P(x1, y1, z0), P(x1, y1, z1), P(x0, y1, z1)], shade(b.c, b.glow ? 1.35 : 1.18));
    face(ctx, [P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1)], shade(b.c, b.glow ? 1.15 : 0.96));
    face(ctx, [P(x1, y0, z0), P(x1, y0, z1), P(x1, y1, z1), P(x1, y1, z0)], shade(b.c, b.glow ? 1.0 : 0.74));
  }
  function draw(ctx, boxes, x, y, U, flip, alpha) {
    // de trás para a frente (pintor): primeiro quem está mais longe (x+z menor), depois mais alto
    boxes.sort((a, b) => (a.x + a.z + (a.o || 0)) - (b.x + b.z + (b.o || 0)) || a.y - b.y);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    if (alpha !== undefined) ctx.globalAlpha = alpha;
    ctx.translate(Math.round(x), Math.round(y));
    if (flip) ctx.scale(-1, 1);
    // sombra no chão
    ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.beginPath(); ctx.ellipse(0, 0, 0.62 * U, 0.3 * U, 0, 0, Math.PI * 2); ctx.fill();
    for (const b of boxes) box(ctx, [0, 0], U, b);
    ctx.restore();
  }

  // ---------- humanoide de blocos (de frente: rosto no lado +z) ----------
  function humanoid(o, action, t) {
    const B = [];
    const walk = /^(walk|run)/.test(action) ? Math.sin(t / (/^run/.test(action) ? 80 : 120)) : 0;
    const atk = action === 'attack' ? Math.sin(Math.min(1, t / 380) * Math.PI) : 0;
    const bob = /^idle/.test(action) ? Math.sin(t / 420) * 0.02 : 0;
    const dz = walk * 0.12;
    // pernas
    B.push({ x: -0.13, y: 0, z: dz, w: 0.25, h: 0.2, d: 0.3, c: o.boots }, { x: -0.13, y: 0.2, z: dz, w: 0.25, h: 0.52, d: 0.3, c: o.pants });
    B.push({ x: 0.13, y: 0, z: -dz, w: 0.25, h: 0.2, d: 0.3, c: o.boots }, { x: 0.13, y: 0.2, z: -dz, w: 0.25, h: 0.52, d: 0.3, c: o.pants });
    // asas atrás
    if (o.wings) {
      const f = Math.sin(t / 260) * 0.08;
      B.push({ x: -0.62 - f, y: 0.9 + bob, z: -0.32, w: 0.75, h: 0.85, d: 0.06, c: o.wings, glow: o.wingGlow, o: -2 });
      B.push({ x: 0.62 + f, y: 0.9 + bob, z: -0.32, w: 0.75, h: 0.85, d: 0.06, c: o.wings, glow: o.wingGlow, o: -2 });
    }
    // tronco e cinto
    B.push({ x: 0, y: 0.72 + bob, z: 0, w: 0.52, h: 0.72, d: 0.36, c: o.shirt });
    if (o.belt) B.push({ x: 0, y: 0.72 + bob, z: 0.005, w: 0.54, h: 0.09, d: 0.38, c: o.belt, o: 0.01 });
    // braços (o direito sobe no ataque)
    B.push({ x: -0.38, y: 0.76 + bob, z: -dz * 0.8, w: 0.22, h: 0.68, d: 0.26, c: o.sleeve });
    B.push({ x: -0.38, y: 0.76 + bob, z: -dz * 0.8 + 0.001, w: 0.23, h: 0.17, d: 0.27, c: o.hand || o.skin, o: 0.01 });
    const ry = 0.76 + bob + atk * 0.35, rz = dz * 0.8 + atk * 0.3;
    B.push({ x: 0.38, y: ry, z: rz, w: 0.22, h: 0.68, d: 0.26, c: o.sleeve });
    B.push({ x: 0.38, y: ry, z: rz + 0.001, w: 0.23, h: 0.17, d: 0.27, c: o.hand || o.skin, o: 0.01 });
    // arma
    if (o.weapon === 'sword') { B.push({ x: 0.38, y: ry + 0.05, z: rz + 0.2, w: 0.08, h: 0.16, d: 0.08, c: '#5a3a20', o: 0.4 }, { x: 0.38, y: ry + 0.21, z: rz + 0.2, w: 0.26, h: 0.06, d: 0.1, c: '#8a7a5a', o: 0.4 }, { x: 0.38, y: ry + 0.27, z: rz + 0.2, w: 0.08, h: 0.78, d: 0.12, c: o.wcol, glow: !!o.wglow, o: 0.4 }); }
    else if (o.weapon === 'staff') { B.push({ x: 0.38, y: ry - 0.1, z: rz + 0.18, w: 0.07, h: 1.3, d: 0.07, c: '#6a4a2a', o: 0.4 }, { x: 0.38, y: ry + 1.18, z: rz + 0.18, w: 0.16, h: 0.16, d: 0.16, c: o.wglow || '#5ac8ff', glow: true, o: 0.4 }); }
    else if (o.weapon === 'bow') { B.push({ x: -0.38, y: 0.62 + bob, z: 0.22, w: 0.06, h: 1.0, d: 0.06, c: '#7a5230', o: 0.4 }, { x: -0.38, y: 1.5 + bob, z: 0.15, w: 0.06, h: 0.12, d: 0.12, c: '#7a5230', o: 0.4 }, { x: -0.38, y: 0.56 + bob, z: 0.15, w: 0.06, h: 0.12, d: 0.12, c: '#7a5230', o: 0.4 }); }
    // cabeça, rosto, cabelo/elmo, chifres, orelhas
    const hy = 1.44 + bob;
    B.push({ x: 0, y: hy, z: 0, w: 0.48, h: 0.48, d: 0.48, c: o.skin, o: 0.02 });
    B.push({ x: -0.11, y: hy + 0.2, z: 0.245, w: 0.09, h: 0.08, d: 0.02, c: o.eye || '#1a1a2a', o: 0.6 }, { x: 0.11, y: hy + 0.2, z: 0.245, w: 0.09, h: 0.08, d: 0.02, c: o.eye || '#1a1a2a', o: 0.6 });
    if (o.helm) { B.push({ x: 0, y: hy + 0.36, z: 0, w: 0.54, h: 0.2, d: 0.54, c: o.helm, o: 0.05 }, { x: 0, y: hy, z: -0.22, w: 0.54, h: 0.4, d: 0.12, c: o.helm, o: -0.1 }, { x: -0.25, y: hy + 0.05, z: 0, w: 0.06, h: 0.35, d: 0.5, c: o.helm, o: -0.05 }, { x: 0.25, y: hy + 0.05, z: 0, w: 0.06, h: 0.35, d: 0.5, c: o.helm, o: 0.08 }); }
    else if (o.hair) { B.push({ x: 0, y: hy + 0.38, z: 0, w: 0.52, h: 0.14, d: 0.52, c: o.hair, o: 0.05 }, { x: 0, y: hy + 0.08, z: -0.22, w: 0.52, h: 0.32, d: 0.1, c: o.hair, o: -0.1 }); if (o.longHair) B.push({ x: 0, y: hy - 0.3, z: -0.24, w: 0.5, h: 0.42, d: 0.08, c: o.hair, o: -0.12 }); }
    if (o.horns) B.push({ x: -0.26, y: hy + 0.45, z: 0, w: 0.08, h: 0.24, d: 0.08, c: o.horns, o: 0.1 }, { x: 0.26, y: hy + 0.45, z: 0, w: 0.08, h: 0.24, d: 0.08, c: o.horns, o: 0.1 });
    if (o.ears) B.push({ x: -0.32, y: hy + 0.24, z: 0, w: 0.16, h: 0.08, d: 0.06, c: o.skin, o: 0.1 }, { x: 0.32, y: hy + 0.24, z: 0, w: 0.16, h: 0.08, d: 0.06, c: o.skin, o: 0.1 });
    return B;
  }
  function heroLook(cls, ap, eq) {
    ap = ap || {}; eq = eq || {};
    const cc = CLS[cls] || CLS.dark_knight;
    const armor = setCol(eq.armor), helm = setCol(eq.helm), gloves = setCol(eq.gloves), boots = setCol(eq.boots);
    const w = String(eq.w || '');
    const weapon = /staff|cajado|stick|scepter|cetro|book/.test(w) || cls === 'dark_wizard' || cls === 'summoner' ? 'staff' : /bow|arco|crossbow/.test(w) || cls === 'fairy_elf' ? 'bow' : 'sword';
    const hairIdx = ap.hair == null ? (SPR.defaultHairIndex ? SPR.defaultHairIndex(cls) : 0) : ap.hair;
    return {
      skin: SKIN[ap.skin || 0] || SKIN[0], hair: HAIR[hairIdx] || HAIR[0], longHair: cls === 'fairy_elf' || cls === 'summoner',
      helm: helm || (cls === 'dark_knight' ? '#6a7080' : null),
      shirt: armor || cc[0], sleeve: armor || cc[0], pants: armor ? shade(armor, 0.75) : cc[1], boots: boots || '#3a2a1a', hand: gloves || null, belt: '#3a2a1a',
      weapon, wcol: eq.wg || '#d0d4e0', wglow: eq.wg || null,
      wings: eq.wings ? (WING_COL[eq.wings] || '#e8e0ff') : null, wingGlow: eq.wingPlus >= 9,
    };
  }

  // ---------- monstros de blocos ----------
  function quad(c, dark, action, t) {
    const walk = /^(walk|run)/.test(action) ? Math.sin(t / 110) * 0.1 : 0;
    const B = [{ x: 0, y: 0.55, z: 0, w: 0.6, h: 0.5, d: 1.1, c }];
    for (const [x, z, s] of [[-0.2, 0.38, 1], [0.2, 0.38, -1], [-0.2, -0.38, -1], [0.2, -0.38, 1]]) B.push({ x, y: 0, z: z + walk * s, w: 0.18, h: 0.55, d: 0.18, c: dark });
    B.push({ x: 0, y: 0.75, z: 0.7, w: 0.48, h: 0.44, d: 0.44, c, o: 0.2 }, { x: 0, y: 0.72, z: 0.95, w: 0.28, h: 0.2, d: 0.14, c: dark, o: 0.3 });
    B.push({ x: -0.13, y: 0.95, z: 0.925, w: 0.08, h: 0.08, d: 0.02, c: '#ffea6a', glow: true, o: 0.5 }, { x: 0.13, y: 0.95, z: 0.925, w: 0.08, h: 0.08, d: 0.02, c: '#ffea6a', glow: true, o: 0.5 });
    B.push({ x: -0.16, y: 1.18, z: 0.62, w: 0.1, h: 0.16, d: 0.08, c: dark, o: 0.2 }, { x: 0.16, y: 1.18, z: 0.62, w: 0.1, h: 0.16, d: 0.08, c: dark, o: 0.2 });
    B.push({ x: 0, y: 0.82, z: -0.72, w: 0.12, h: 0.12, d: 0.4, c: dark, o: -0.3 });
    return B;
  }
  function spiderB(c) {
    const B = [{ x: 0, y: 0.3, z: -0.15, w: 0.7, h: 0.4, d: 0.8, c }, { x: 0, y: 0.28, z: 0.45, w: 0.45, h: 0.32, d: 0.4, c, o: 0.1 },
      { x: -0.1, y: 0.42, z: 0.655, w: 0.07, h: 0.07, d: 0.02, c: '#ff3a3a', glow: true, o: 0.5 }, { x: 0.1, y: 0.42, z: 0.655, w: 0.07, h: 0.07, d: 0.02, c: '#ff3a3a', glow: true, o: 0.5 }];
    for (let i = 0; i < 4; i++) for (const s of [-1, 1]) B.push({ x: s * 0.62, y: 0, z: 0.3 - i * 0.24, w: 0.5, h: 0.08, d: 0.07, c: shade(c, 0.8), o: -0.05 }, { x: s * 0.86, y: 0, z: 0.3 - i * 0.24, w: 0.07, h: 0.36, d: 0.07, c: shade(c, 0.8) });
    return B;
  }
  function slimeB(c, t) { const k = 1 + Math.sin(t / 180) * 0.06; return [{ x: 0, y: 0, z: 0, w: 0.8 * k, h: 0.8 / k, d: 0.8 * k, c }, { x: -0.15, y: 0.42, z: 0.405, w: 0.1, h: 0.12, d: 0.02, c: '#1a1a2a', o: 0.5 }, { x: 0.15, y: 0.42, z: 0.405, w: 0.1, h: 0.12, d: 0.02, c: '#1a1a2a', o: 0.5 }]; }
  const MCOL = { fenrir_wolf: '#d8a840', slime: '#5ad85a', goblin: '#5aa84a', goblin_elite: '#d8b04a', spider: '#3a3048', skeleton: '#e8e4d8', skeleton_king: '#e8d8a8', ice_golem: '#9ac8e8', lava_hound: '#ff7a3a' };
  function monsterBoxes(kind, action, t) {
    const k = String(kind || '');
    const tint = MCOL[k] || (/ice|frost|glacier/.test(k) ? '#9ac8e8' : /lava|magma|fire|flame/.test(k) ? '#ff7a3a' : /void|abyss|shadow|dark/.test(k) ? '#6a4aa8' : null);
    if (/slime/.test(k)) return { B: slimeB(tint || '#5ad85a', t), h: 0.8 };
    if (/spider|scorpion/.test(k)) return { B: spiderB(tint || '#3a3048'), h: 0.5 };
    if (/hound|wolf|boar|dragon|bull_beast/.test(k)) return { B: quad(tint || '#8a6b58', shade(tint || '#8a6b58', 0.55), action, t), h: 1.2 };
    const o = { skin: '#8a7a5a', shirt: '#6a5a4a', sleeve: '#6a5a4a', pants: '#3a3028', boots: '#2a2018' };
    if (/goblin/.test(k)) Object.assign(o, { skin: tint || '#5aa84a', shirt: '#7a5a3a', sleeve: '#7a5a3a', pants: '#4a3a2a', ears: true, weapon: 'sword', wcol: '#a0a0a8' });
    else if (/skeleton|bone/.test(k)) Object.assign(o, { skin: '#e8e4d8', shirt: tint || '#d8d4c8', sleeve: '#e0dccf', pants: '#c8c4b8', boots: '#a8a498', eye: '#ff3a3a', weapon: 'sword', wcol: '#c8ccd8', horns: /king/.test(k) ? '#ffd36b' : null });
    else if (/golem|yeti/.test(k)) Object.assign(o, { skin: tint || '#9ab8d8', shirt: tint || '#8aa8c8', sleeve: tint || '#8aa8c8', pants: shade(tint || '#8aa8c8', 0.7), boots: '#5a6a7a' });
    else Object.assign(o, { skin: tint || '#8a7a5a', shirt: tint ? shade(tint, 0.8) : '#6a5a4a', sleeve: tint ? shade(tint, 0.8) : '#6a5a4a' });
    return { B: humanoid(o, action, t), h: 1.9 };
  }

  // ---------- API (mesma assinatura do Sprites) ----------
  const HERO_PX = 56;   // altura do herói em pixels na escala 1 (igual ao pixel art)
  function hero(ctx, cls, ap, action, t, x, y, scale, flip, opts = {}) {
    const B = humanoid(heroLook(cls, ap, opts.equip), String(action || 'idle'), t || 0);
    draw(ctx, B, x, y, HERO_PX / 2.05 * (scale || 1), !!flip, opts.alpha);
    if (opts.white) { ctx.save(); ctx.globalCompositeOperation = 'source-atop'; ctx.restore(); }
    return true;
  }
  function monster(ctx, kind, action, t, x, y, scale, flip, opts = {}) {
    const m = monsterBoxes(kind, String(action || 'idle'), t || 0);
    let alpha = opts.alpha;
    if (action === 'death') alpha = Math.max(0, 1 - (t || 0) / 700);
    draw(ctx, m.B, x, y, (m.h > 1.5 ? 44 : m.h > 1 ? 34 : 30) / Math.max(1, m.h) * (scale || 1) * (m.h > 1.5 ? 1 : 1.3), !flip, alpha);
    if (opts.white) { ctx.save(); ctx.globalAlpha = 0.5; ctx.globalCompositeOperation = 'lighter'; draw(ctx, m.B, x, y, (m.h > 1.5 ? 44 : 34) / Math.max(1, m.h) * (scale || 1), !flip, 0.35); ctx.restore(); }
    return true;
  }
  // paisagem de blocos (céu, nuvens, morros em degraus, árvores de blocos, grama e terra) para a cena do topo
  function landscape(g, W, H, t, horizon) {
    const gy = Math.floor(H * (horizon || 0.6)), B = 6;
    const sky = g.createLinearGradient(0, 0, 0, gy); sky.addColorStop(0, '#5aa8e8'); sky.addColorStop(1, '#bfe6ff');
    g.fillStyle = sky; g.fillRect(0, 0, W, gy);
    g.fillStyle = '#fff3a0'; g.fillRect(Math.round(W * 0.78), Math.round(gy * 0.18), B * 3, B * 3);
    // nuvens de blocos andando devagar
    g.fillStyle = 'rgba(255,255,255,.92)';
    for (let i = 0; i < 6; i++) {
      const cx = ((i * 97 + (t || 0) / 180) % (W + 80)) - 40, cy = Math.round(gy * (0.12 + (i % 3) * 0.12));
      g.fillRect(Math.round(cx), cy, B * 6, B * 2); g.fillRect(Math.round(cx + B), cy - B, B * 3, B);
    }
    // morros ao fundo, em degraus de blocos
    const hill = (shift, amp, base, col) => {
      g.fillStyle = col;
      for (let x = 0; x < W; x += B) { const h = Math.round((Math.sin((x + shift) / 37) + Math.sin((x + shift) / 13) * 0.4 + 1.4) * amp / B) * B; g.fillRect(x, gy - base - h, B, base + h); }
    };
    hill(0, gy * 0.12, gy * 0.05, '#4a8a5a'); hill(90, gy * 0.07, 0, '#3f7a3a');
    // árvores de blocos no horizonte
    for (let i = 0; i < 7; i++) {
      const x = Math.round((i * 0.15 + 0.03) * W / B) * B, h = B * (3 + (i % 2));
      g.fillStyle = '#6a4a2a'; g.fillRect(x + B, gy - h, B, h);
      g.fillStyle = i % 3 ? '#3f8a32' : '#4a9a3a'; g.fillRect(x - B, gy - h - B * 3, B * 5, B * 3); g.fillRect(x, gy - h - B * 4, B * 3, B);
    }
    // chão: grama em cima, terra embaixo, com o desenho dos blocos
    g.fillStyle = '#5aa83a'; g.fillRect(0, gy, W, B);
    g.fillStyle = '#4a9030'; for (let x = 0; x < W; x += B * 2) g.fillRect(x, gy + B, B, Math.round(B / 2));
    g.fillStyle = '#8a5a34'; g.fillRect(0, gy + B, W, H - gy - B);
    for (let y = gy + B; y < H; y += B) for (let x = (y / B) % 2 ? 0 : B / 2; x < W; x += B) {
      const v = Math.sin(x * 12.9 + y * 78.2) * 43758.5; const r = v - Math.floor(v);
      g.fillStyle = r < 0.3 ? '#7a4e2c' : r > 0.85 ? '#9a6a40' : '#8a5a34'; g.fillRect(x, y, B - 1, B - 1);
      if (y > gy + B * 4 && r > 0.97) { g.fillStyle = '#9a9aa4'; g.fillRect(x, y, B - 1, B - 1); }
    }
  }
  window.BlockArt = { hero, monster, humanoid, heroLook, landscape };
  // nas páginas do site, os desenhos de herói e monstro viram blocos
  if (window.Sprites && window.MUI_SITE_BLOCKS !== false) { window.Sprites.hero = hero; window.Sprites.monster = monster; }
})();
