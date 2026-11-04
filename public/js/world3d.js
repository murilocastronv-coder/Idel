// MU Idle Legends — gráfico 3D (three.js r147). Só desenha: posições, combate e regras continuam no servidor e no game.js.
// Mundo: x do mapa = X (metros), y do mapa = Z. 1 metro = K unidades do mapa.
(function () {
  'use strict';
  const K = 15.5;
  const W3 = (window.World3D = { on: false, ok: false, K });
  if (!window.THREE || !THREE.GLTFLoader || !THREE.SkeletonUtils) return;
  // cores em hexadecimal são sRGB (como no CSS): converte para linear antes de iluminar
  if (THREE.ColorManagement) THREE.ColorManagement.legacyMode = false;
  const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
  const MSM = THREE.MeshStandardMaterial;
  let renderer, scene, camera, composer, bloom, glc, env, maxAniso = 4;
  let world = null; // { group, dispose[], lights[], waters[], flames[], theme }
  let QL = { pr: 1, shadows: false, bloom: false, pool: 4, shadowSize: 1024 };
  const QUALITY3D = {
    baixa: { pr: 0.7, shadows: false, bloom: false, pool: 2, shadowSize: 512 },
    media: { pr: 1, shadows: false, bloom: false, pool: 4, shadowSize: 1024 },
    alta: { pr: 1.25, shadows: true, bloom: true, pool: 6, shadowSize: 1024 },
    ultra: { pr: 2, shadows: true, bloom: true, pool: 8, shadowSize: 2048 },
  };

  // ------------------------------------------------------------------ início
  W3.init = function (canvas2d, quality) {
    try {
      glc = document.createElement('canvas');
      glc.id = 'world3d';
      glc.setAttribute('aria-hidden', 'true');
      canvas2d.parentNode.insertBefore(glc, canvas2d);
      renderer = new THREE.WebGLRenderer({ canvas: glc, antialias: true, powerPreference: 'high-performance' });
    } catch (e) {
      if (glc && glc.parentNode) glc.parentNode.removeChild(glc);
      W3.failed = true; return false;
    }
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    camera = new THREE.PerspectiveCamera(34, 1, 0.5, 260);
    if (THREE.RoomEnvironment) {
      const pm = new THREE.PMREMGenerator(renderer);
      env = pm.fromScene(new THREE.RoomEnvironment(), 0.04).texture;
      pm.dispose();
    }
    W3.setQuality(quality);
    W3.ok = true;
    glc.addEventListener('webglcontextlost', (ev) => { ev.preventDefault(); W3.lost = true; });
    glc.addEventListener('webglcontextrestored', () => { W3.lost = false; });
    return true;
  };
  W3.setQuality = function (q) {
    QL = QUALITY3D[q] || QUALITY3D.media;
    W3.qname = QUALITY3D[q] ? q : 'media';
    if (!renderer) return;
    renderer.shadowMap.enabled = QL.shadows;
    if (world && world.sun) {
      world.sun.castShadow = QL.shadows;
      world.sun.shadow.mapSize.set(QL.shadowSize, QL.shadowSize);
      if (world.sun.shadow.map) { world.sun.shadow.map.dispose(); world.sun.shadow.map = null; }
    }
    if (world) world.group.traverse((o) => { if (o.material) [].concat(o.material).forEach((m) => { m.needsUpdate = true; }); });
    W3.resize(W3.w || 1, W3.h || 1);
  };
  W3.resize = function (cssW, cssH) {
    if (!renderer) return;
    W3.w = cssW; W3.h = cssH;
    const pr = Math.min(window.devicePixelRatio || 1, QL.pr);
    renderer.setPixelRatio(pr);
    renderer.setSize(cssW, cssH, false);
    glc.style.width = cssW + 'px'; glc.style.height = cssH + 'px';
    camera.aspect = cssW / cssH; camera.updateProjectionMatrix();
    if (QL.bloom && THREE.EffectComposer && THREE.UnrealBloomPass) {
      if (!composer) {
        composer = new THREE.EffectComposer(renderer);
        composer.addPass(new THREE.RenderPass(new THREE.Scene(), camera));
        bloom = new THREE.UnrealBloomPass(new THREE.Vector2(256, 256), 0.55, 0.45, 0.88);
        composer.addPass(bloom);
      }
      composer.setPixelRatio(pr);
      composer.setSize(cssW, cssH);
    }
  };

  // ------------------------------------------------------------------ texturas procedurais
  let seed = 1;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const TEX = {};
  function canvasTex(key, size, draw, srgb = true) {
    if (TEX[key]) return TEX[key];
    seed = 1000 + key.length * 97 + key.charCodeAt(0);
    const c = document.createElement('canvas'); c.width = c.height = size; draw(c.getContext('2d'), size);
    const t = new THREE.CanvasTexture(c); if (srgb) t.encoding = THREE.sRGBEncoding;
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = maxAniso;
    return (TEX[key] = t);
  }
  function wrapDraw(s, x, y, r, fn) { fn(x, y); if (x < r) fn(x + s, y); if (x > s - r) fn(x - s, y); if (y < r) fn(x, y + s); if (y > s - r) fn(x, y - s); }
  function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r); c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h); c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r); c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y); c.closePath(); }
  // chão natural: manchas, folhas de grama ou grãos (cores do tema)
  function groundTex(key, base, hue, sat, light, blades) {
    return canvasTex(key, 512, (g, s) => {
      g.fillStyle = base; g.fillRect(0, 0, s, s);
      for (let i = 0; i < 240; i++) { const x = rnd() * s, y = rnd() * s, r = 20 + rnd() * 60; wrapDraw(s, x, y, r, (a, b) => { g.fillStyle = rnd() < 0.5 ? 'rgba(0,0,0,.05)' : 'rgba(255,250,220,.03)'; g.beginPath(); g.arc(a, b, r, 0, 7); g.fill(); }); }
      if (blades) {
        for (let i = 0; i < 9000; i++) {
          const x = rnd() * s, y = rnd() * s, h = hue + rnd() * 30, l = rnd() < 0.5 ? light * 0.45 + rnd() * 8 : light + rnd() * 16, dx = (rnd() - 0.5) * 4, dy = -3 - rnd() * 6;
          wrapDraw(s, x, y, 10, (a, b) => { g.strokeStyle = `hsla(${h},${sat + rnd() * 20}%,${l}%,.8)`; g.lineWidth = 1.2; g.beginPath(); g.moveTo(a, b); g.lineTo(a + dx, b + dy); g.stroke(); });
        }
      } else {
        for (let i = 0; i < 7000; i++) { const v = rnd(); g.fillStyle = v < 0.4 ? 'rgba(0,0,0,.22)' : v < 0.85 ? `hsla(${hue + rnd() * 16},${sat}%,${light + rnd() * 18}%,.5)` : 'rgba(255,255,255,.22)'; g.beginPath(); g.arc(rnd() * s, rnd() * s, 0.6 + rnd() * 2.2, 0, 7); g.fill(); }
      }
    });
  }
  // lajotas de pedra (praças, masmorras, torres, castelos)
  function flagTex(key, hue, sat, light, moss) {
    return canvasTex(key, 1024, (g) => {
      const cell = 256;
      g.fillStyle = `hsl(${hue},${sat}%,${light * 0.35}%)`; g.fillRect(0, 0, 1024, 1024);
      for (let cy = 0; cy < 4; cy++) for (let cx = 0; cx < 4; cx++) {
        const cuts = rnd() < 0.5 ? [[0, 0, 0.55, 1], [0.55, 0, 1, 0.45], [0.55, 0.45, 1, 1]] : rnd() < 0.5 ? [[0, 0, 1, 0.5], [0, 0.5, 0.4, 1], [0.4, 0.5, 1, 1]] : [[0, 0, 0.5, 0.5], [0.5, 0, 1, 0.5], [0, 0.5, 1, 1]];
        for (const q of cuts) {
          const x0 = cx * cell + q[0] * cell + 5, y0 = cy * cell + q[1] * cell + 5, w = (q[2] - q[0]) * cell - 10, hh = (q[3] - q[1]) * cell - 10;
          g.fillStyle = `hsl(${hue + rnd() * 12},${sat + rnd() * 5}%,${light + rnd() * 12}%)`; rr(g, x0, y0, w, hh, 10); g.fill();
          for (let k = 0; k < (w * hh) / 90; k++) { g.fillStyle = rnd() < 0.5 ? `rgba(0,0,0,${rnd() * 0.08})` : `rgba(255,240,215,${rnd() * 0.06})`; g.fillRect(x0 + rnd() * w, y0 + rnd() * hh, 2 + rnd() * 4, 2 + rnd() * 4); }
          const gr = g.createLinearGradient(x0, y0, x0 + w, y0 + hh); gr.addColorStop(0, 'rgba(255,235,200,.08)'); gr.addColorStop(1, 'rgba(0,0,0,.22)'); g.fillStyle = gr; rr(g, x0, y0, w, hh, 10); g.fill();
          if (rnd() < 0.35) { g.strokeStyle = 'rgba(0,0,0,.45)'; g.lineWidth = 1.3; g.beginPath(); let px = x0 + rnd() * w, py = y0 + rnd() * hh; g.moveTo(px, py); for (let k = 0; k < 5; k++) { px += (rnd() - 0.5) * 40; py += (rnd() - 0.5) * 40; g.lineTo(px, py); } g.stroke(); }
          if (moss && rnd() < 0.3) { g.fillStyle = `rgba(60,80,25,${0.25 + rnd() * 0.25})`; g.beginPath(); g.arc(x0 + (rnd() < 0.5 ? 0 : w), y0 + rnd() * hh, 6 + rnd() * 14, 0, 7); g.fill(); }
        }
      }
    });
  }
  const bumpTex = () => canvasTex('bump', 256, (g, s) => { g.fillStyle = '#808080'; g.fillRect(0, 0, s, s); for (let i = 0; i < 5000; i++) { const v = (rnd() * 255) | 0; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(rnd() * s, rnd() * s, 1.5, 2.5); } }, false);
  const waterBump = () => canvasTex('waterBump', 256, (g, s) => { g.fillStyle = '#808080'; g.fillRect(0, 0, s, s); for (let i = 0; i < 400; i++) { const x = rnd() * s, y = rnd() * s, r = 4 + rnd() * 18, v = (rnd() * 255) | 0; wrapDraw(s, x, y, r, (a, b) => { const gr = g.createRadialGradient(a, b, 0, a, b, r); gr.addColorStop(0, `rgba(${v},${v},${v},.5)`); gr.addColorStop(1, `rgba(${v},${v},${v},0)`); g.fillStyle = gr; g.fillRect(a - r, b - r, r * 2, r * 2); }); } }, false);
  const softTex = () => canvasTex('soft', 128, (g, s) => { const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, s, s); }, false);
  const barkTex = () => canvasTex('bark', 128, (g, s) => { g.fillStyle = '#3a2818'; g.fillRect(0, 0, s, s); for (let i = 0; i < 60; i++) { g.strokeStyle = `rgba(${rnd() < 0.5 ? 10 : 90},${rnd() < 0.5 ? 6 : 60},${rnd() < 0.5 ? 2 : 40},.6)`; g.lineWidth = 1 + rnd() * 2; const x = rnd() * s; g.beginPath(); g.moveTo(x, 0); g.bezierCurveTo(x + (rnd() - 0.5) * 10, s * 0.3, x + (rnd() - 0.5) * 10, s * 0.6, x, s); g.stroke(); } });
  const leafTex = () => canvasTex('leaf', 256, (g, s) => { g.fillStyle = '#5a5a5a'; g.fillRect(0, 0, s, s); for (let i = 0; i < 2600; i++) { const x = rnd() * s, y = rnd() * s, l = rnd(); g.fillStyle = l < 0.4 ? 'rgba(20,20,20,.6)' : l < 0.85 ? `hsla(0,0%,${40 + rnd() * 30}%,.85)` : 'rgba(255,255,255,.5)'; g.save(); g.translate(x, y); g.rotate(rnd() * 6.3); g.beginPath(); g.ellipse(0, 0, 4 + rnd() * 3, 2, 0, 0, 7); g.fill(); g.restore(); } });
  const stoneTex = () => canvasTex('stone', 256, (g, s) => { g.fillStyle = '#5a5246'; g.fillRect(0, 0, s, s); for (let r = 0; r < 8; r++) { const off = r % 2 ? s / 8 : 0; for (let c = -1; c < 4; c++) { g.fillStyle = `hsl(32,${8 + rnd() * 6}%,${28 + rnd() * 12}%)`; g.fillRect(c * s / 4 + off + 2, r * s / 8 + 2, s / 4 - 4, s / 8 - 4); } } for (let i = 0; i < 3000; i++) { g.fillStyle = `rgba(${rnd() < 0.5 ? 0 : 255},${rnd() < 0.5 ? 0 : 240},${rnd() < 0.5 ? 0 : 220},${rnd() * 0.08})`; g.fillRect(rnd() * s, rnd() * s, 2, 2); } });
  const plasterTex = () => canvasTex('plaster', 512, (g, s) => {
    g.fillStyle = '#b8a888'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 4000; i++) { g.fillStyle = `rgba(${rnd() < 0.5 ? 60 : 255},${rnd() < 0.5 ? 50 : 245},${rnd() < 0.5 ? 30 : 220},${rnd() * 0.08})`; g.fillRect(rnd() * s, rnd() * s, 2 + rnd() * 4, 2 + rnd() * 4); }
    const gr = g.createLinearGradient(0, s, 0, s * 0.6); gr.addColorStop(0, 'rgba(40,30,15,.45)'); gr.addColorStop(1, 'rgba(40,30,15,0)'); g.fillStyle = gr; g.fillRect(0, 0, s, s);
    g.fillStyle = '#2a1a0e';
    const beam = (x, y, w, h) => { g.fillRect(x, y, w, h); g.fillStyle = 'rgba(255,220,170,.08)'; g.fillRect(x, y, w, 2); g.fillStyle = '#2a1a0e'; };
    beam(0, 0, s, 22); beam(0, s - 26, s, 26); beam(0, s * 0.48, s, 18);
    for (const x of [0, s * 0.33, s * 0.66, s - 22]) beam(x, 0, 22, s);
    g.lineWidth = 16; g.strokeStyle = '#2a1a0e';
    g.beginPath(); g.moveTo(22, s * 0.48); g.lineTo(s * 0.33, 22); g.moveTo(s * 0.66 + 22, 22); g.lineTo(s - 22, s * 0.48); g.stroke();
  });
  const roofTex = () => canvasTex('roof', 256, (g, s) => {
    g.fillStyle = '#3a1a14'; g.fillRect(0, 0, s, s);
    for (let r = 0; r < 12; r++) for (let c = 0; c < 9; c++) {
      const x = c * 32 + (r % 2 ? 16 : 0) - 16, y = r * 22;
      g.fillStyle = `hsl(${8 + rnd() * 10},${35 + rnd() * 15}%,${18 + rnd() * 10}%)`;
      g.beginPath(); g.moveTo(x + 1, y); g.lineTo(x + 31, y); g.lineTo(x + 31, y + 18); g.quadraticCurveTo(x + 16, y + 26, x + 1, y + 18); g.closePath(); g.fill();
      g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(x + 1, y + 18, 30, 3);
    }
  });
  const woodTex = () => canvasTex('wood', 128, (g, s) => { g.fillStyle = '#3a2412'; g.fillRect(0, 0, s, s); for (let i = 0; i < 40; i++) { g.strokeStyle = `rgba(${rnd() < 0.5 ? 20 : 90},${rnd() < 0.5 ? 10 : 55},5,.5)`; g.lineWidth = 1 + rnd() * 2; const y = rnd() * s; g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(s * 0.3, y + (rnd() - 0.5) * 8, s * 0.6, y + (rnd() - 0.5) * 8, s, y); g.stroke(); } });
  const lavaTex = () => canvasTex('lava', 256, (g, s) => {
    g.fillStyle = '#ff5a10'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 160; i++) { const x = rnd() * s, y = rnd() * s, r = 6 + rnd() * 26; wrapDraw(s, x, y, r, (a, b) => { const gr = g.createRadialGradient(a, b, 0, a, b, r); gr.addColorStop(0, rnd() < 0.5 ? 'rgba(255,230,120,.9)' : 'rgba(60,8,0,.85)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(a - r, b - r, r * 2, r * 2); }); }
  });

  // ------------------------------------------------------------------ temas
  const THEMES = {
    town: { sky: 0x1a2236, fog: [0x1a2030, 0.010], hemi: [0x8a9ac8, 0x2a1e10, 0.55], sun: [0xffd6a0, 1.9], ground: () => groundTex('g_grass', '#2c3f1c', 78, 38, 26, true), tint: 0.3 },
    grass: { sky: 0x3a6fb0, fog: [0x8ab0d0, 0.008], hemi: [0xaaccee, 0x2a3018, 0.7], sun: [0xfff0d0, 2.1], ground: () => groundTex('g_grass', '#2c3f1c', 78, 38, 26, true), tint: 0.55 },
    noria: { sky: 0x2a4a5a, fog: [0x2a4048, 0.010], hemi: [0xa8d8ff, 0x24301a, 0.65], sun: [0xffe8c8, 1.9], ground: () => groundTex('g_grass2', '#2e4a1e', 82, 46, 30, true), tint: 0.5 },
    forest: { sky: 0x1f4a3a, fog: [0x1a3024, 0.012], hemi: [0x9ac8a0, 0x1a2010, 0.6], sun: [0xfff0c8, 1.7], ground: () => groundTex('g_grass', '#2c3f1c', 78, 38, 26, true), tint: 0.55 },
    snow: { sky: 0x8aa8d0, fog: [0xb8c8e0, 0.013], hemi: [0xdaeaff, 0x6a7a90, 0.8], sun: [0xf0f6ff, 1.9], ground: () => groundTex('g_snow', '#d8e2ee', 210, 30, 82, false), tint: 0.4 },
    dungeon: { sky: 0x08060c, fog: [0x0a080e, 0.016], hemi: [0x7a7090, 0x1a120c, 0.6], sun: [0xb0a0c8, 0.9], ground: () => flagTex('f_dungeon', 280, 6, 20, true), tint: 0.6, night: true },
    lava: { sky: 0x1a0604, fog: [0x2a0c06, 0.014], hemi: [0xa86050, 0x200804, 0.6], sun: [0xffa070, 1.3], ground: () => groundTex('g_ash', '#2a201c', 18, 12, 14, false), tint: 0.75, night: true },
    water: { sky: 0x06283a, fog: [0x0a3a50, 0.018], hemi: [0x7ad8f0, 0x0a2028, 0.8], sun: [0xaaf0ff, 1.4], ground: () => groundTex('g_seabed', '#2c5a5a', 180, 25, 30, false), tint: 0.6, night: true },
    tower: { sky: 0x120a20, fog: [0x140c22, 0.015], hemi: [0x9a80d8, 0x140a1a, 0.6], sun: [0xc8a8ff, 1.0], ground: () => flagTex('f_tower', 262, 18, 22, false), tint: 0.6, night: true },
    desert: { sky: 0xe0a860, fog: [0xd8b080, 0.010], hemi: [0xffe0b0, 0x6a4a28, 0.7], sun: [0xffe0b0, 2.3], ground: () => groundTex('g_sand', '#c89a5a', 32, 40, 55, false), tint: 0.45 },
    sky: { sky: 0x8ac0f0, fog: [0xd8ecff, 0.012], hemi: [0xffffff, 0x9ab0d0, 0.85], sun: [0xfff8e8, 2.0], ground: () => flagTex('f_marble', 40, 12, 70, false), tint: 0.4 },
    darkforest: { sky: 0x0a0812, fog: [0x10141a, 0.017], hemi: [0x6a8a9a, 0x0a0a08, 0.6], sun: [0x9ab0d0, 1.0], ground: () => groundTex('g_moss', '#1a2416', 100, 25, 14, true), tint: 0.6, night: true },
    void: { sky: 0x0a0414, fog: [0x140820, 0.015], hemi: [0x9a6ad8, 0x0a0410, 0.6], sun: [0xd09aff, 1.0], ground: () => groundTex('g_void', '#1e1428', 275, 25, 16, false), tint: 0.7, night: true },
    castle: { sky: 0x1a1414, fog: [0x1a1210, 0.02], hemi: [0x8a7a70, 0x1a100a, 0.4], sun: [0xffb070, 1.0], ground: () => flagTex('f_castle', 25, 8, 32, false), tint: 0.5, night: true },
    devilsq: { sky: 0x140816, fog: [0x1a0a1a, 0.022], hemi: [0x9a6ab0, 0x140a14, 0.4], sun: [0xd08aff, 0.8], ground: () => flagTex('f_devil', 300, 14, 22, false), tint: 0.5, night: true },
    arena: { sky: 0x3a5a8a, fog: [0x7aa0c8, 0.01], hemi: [0xddeeff, 0x4a3a28, 0.7], sun: [0xfff0d8, 2.0], ground: () => groundTex('g_sand', '#c89a5a', 32, 40, 55, false), tint: 0.5 },
  };
  W3.THEMES = THEMES;

  // ------------------------------------------------------------------ montagem do mapa
  const DUMMY = new THREE.Object3D();
  function inst(group, geo, mat, list, cast = true) {
    if (!list.length) return null;
    const m = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((o, i) => {
      DUMMY.position.set(o.x, o.h || 0, o.z); DUMMY.rotation.set(o.rx || 0, o.ry || 0, o.rz || 0);
      DUMMY.scale.set(o.sx || 1, o.sy || o.sx || 1, o.sz || o.sx || 1); DUMMY.updateMatrix(); m.setMatrixAt(i, DUMMY.matrix);
      if (o.c) m.setColorAt(i, o.c);
    });
    m.castShadow = cast; m.receiveShadow = true; group.add(m); return m;
  }
  function lumpy(geo, amt, sd) { const p = geo.attributes.position, v = new THREE.Vector3(); for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const n = Math.sin(v.x * 7.1 + sd) * Math.sin(v.y * 6.3 + sd * 2) * Math.sin(v.z * 5.7 + sd * 3); v.multiplyScalar(1 + n * amt); p.setXYZ(i, v.x, v.y, v.z); } geo.computeVertexNormals(); return geo; }
  function glowSprite(color, size, op = 1) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTex(), color, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false })); s.scale.setScalar(size); return s; }
  const col = (h) => new THREE.Color(h);

  // chão: textura repetida do tema × as cores do mapa 2D (caminhos, água, lava, praças) bem suavizadas
  function buildGround(group, m, built, th) {
    const Wm = m.w / K, Hm = m.h / K;
    const mc = document.createElement('canvas');
    const mw = Math.min(1024, Math.round(m.w / 2)), mh = Math.round(mw * m.h / m.w);
    mc.width = mw; mc.height = mh;
    const g = mc.getContext('2d');
    g.filter = 'blur(2px)';
    g.drawImage(built.canvas, 0, 0, mw, mh);
    g.filter = 'none';
    // cor média do mapa: o tom vira "multiplicador" em volta de 1
    const sm = document.createElement('canvas'); sm.width = sm.height = 1;
    const sg = sm.getContext('2d'); sg.drawImage(mc, 0, 0, 1, 1);
    const avg = sg.getImageData(0, 0, 1, 1).data;
    const macro = new THREE.CanvasTexture(mc); macro.encoding = THREE.sRGBEncoding;
    const tex = th.ground();
    const rep = 5;
    tex.repeat.set(Wm / rep, Hm / rep);
    const bump = bumpTex(); bump.repeat.set(Wm / 2, Hm / 2);
    const mat = new MSM({ map: tex, bumpMap: bump, bumpScale: 0.12, roughness: 0.95, envMapIntensity: 0.1 });
    const lin = (c) => Math.pow(c / 255, 2.2);
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.macroMap = { value: macro };
      sh.uniforms.macroAvg = { value: new THREE.Vector3(Math.max(0.02, lin(avg[0])), Math.max(0.02, lin(avg[1])), Math.max(0.02, lin(avg[2]))) };
      sh.uniforms.macroK = { value: th.tint };
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vMacroUv;').replace('#include <uv_vertex>', '#include <uv_vertex>\nvMacroUv = uv;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D macroMap; uniform vec3 macroAvg; uniform float macroK; varying vec2 vMacroUv;')
        .replace('#include <map_fragment>', '#include <map_fragment>\n vec3 mcol = texture2D(macroMap, vMacroUv).rgb; vec3 rel = clamp(mcol / macroAvg, 0.25, 3.0); diffuseColor.rgb *= mix(vec3(1.0), rel, macroK);');
    };
    // a textura repetida usa uvTransform; a do mapa usa a uv crua (0..1 no mapa inteiro)
    const geo = new THREE.PlaneGeometry(Wm, Hm, 1, 1); geo.rotateX(-Math.PI / 2); geo.translate(Wm / 2, 0, Hm / 2);
    const mesh = new THREE.Mesh(geo, mat); mesh.receiveShadow = true; group.add(mesh);
    // borda escura fora do mapa
    const outer = new THREE.Mesh(new THREE.PlaneGeometry(Wm + 160, Hm + 160).rotateX(-Math.PI / 2), new MSM({ color: new THREE.Color(th.fog[0]).multiplyScalar(0.6), roughness: 1 }));
    outer.position.set(Wm / 2, -0.03, Hm / 2); group.add(outer);
    return { macro, mat };
  }

  function buildWaters(group, built, theme, waters) {
    for (const w of built.waters || []) {
      const x = w.x / K, z = w.y / K, r = w.r / K;
      if (w.kind === 'river' || w.kind === 'fountain') continue; // rio e fonte têm modelo próprio
      if (w.kind === 'lava') {
        const lm = new MSM({ color: 0x220400, emissive: 0xff5a10, emissiveMap: lavaTex(), emissiveIntensity: 1.6, roughness: 0.6 });
        const mesh = new THREE.Mesh(new THREE.CircleGeometry(r, 36).rotateX(-Math.PI / 2), lm); mesh.position.set(x, 0.03, z); group.add(mesh);
        const rim = new THREE.Mesh(lumpy(new THREE.TorusGeometry(r, 0.18, 6, 36), 0.2, x).rotateX(-Math.PI / 2), new MSM({ color: 0x1a1210, roughness: 0.9 })); rim.position.set(x, 0.05, z); group.add(rim);
        waters.push({ mat: lm, lava: true });
        continue;
      }
      const ice = w.kind === 'ice';
      const wm = new MSM({ color: ice ? 0xa8d0f0 : 0x0b2a3a, roughness: ice ? 0.15 : 0.06, metalness: ice ? 0.1 : 0.4, bumpMap: waterBump(), bumpScale: ice ? 0.01 : 0.05, envMap: env, envMapIntensity: ice ? 0.6 : 0.9, transparent: true, opacity: ice ? 0.92 : 0.9 });
      const shore = new THREE.Mesh(new THREE.CircleGeometry(r + 0.35, 40).rotateX(-Math.PI / 2), new MSM({ color: ice ? 0xc8d8e8 : 0x2a2216, roughness: 1, transparent: true, opacity: 0.85 }));
      shore.position.set(x, 0.01, z); group.add(shore);
      const mesh = new THREE.Mesh(new THREE.CircleGeometry(r, 40).rotateX(-Math.PI / 2), wm); mesh.position.set(x, 0.04, z); mesh.receiveShadow = true; group.add(mesh);
      waters.push({ mat: wm, ice });
    }
  }

  // objetos do mapa (árvores, tochas, cristais, colunas...) no mesmo lugar do 2D
  function buildProps(group, built, theme, out) {
    const trunks = [], blobs = [], cones = [], snowCaps = [], rocks = [], crystals = [], pillars = [], caps = [], spikes = [], corals = [], cacti = [], obelisks = [], marble = [], columns = [];
    const leafCol = (t) => theme === 'darkforest' ? new THREE.Color().setHSL(0.36 + t * 0.05, 0.35, 0.16 + rnd() * 0.06) : t > 0.98 ? null : new THREE.Color().setHSL(0.24 + t * 0.08, 0.42, 0.28 + rnd() * 0.12);
    seed = 77;
    for (const p of built.props || []) {
      const k = p.kind || {}, x = p.x / K, z = p.y / K, s0 = rnd();
      switch (k.k) {
        case 'tree': {
          const sc = (k.s || 1) * (0.9 + s0 * 0.3) * 0.8;
          trunks.push({ x, z, h: 0.8 * sc, sx: 0.17 * sc, sy: 1.6 * sc, sz: 0.17 * sc, ry: s0 * 9 });
          for (const b of [[-0.35, 1.9, 0.1, 0.75], [0.4, 2.0, -0.15, 0.7], [0, 2.6, 0, 0.85], [-0.1, 2.15, 0.45, 0.65], [0.2, 2.5, 0.35, 0.55]]) {
            const c = k.pink ? new THREE.Color().setHSL(0.93 + rnd() * 0.04, 0.55, 0.62 + rnd() * 0.1) : leafCol(s0);
            blobs.push({ x: x + b[0] * sc, z: z + b[2] * sc, h: b[1] * sc, sx: b[3] * sc * 1.1, sy: b[3] * sc * 0.9, sz: b[3] * sc, ry: s0 * 20 + b[0], c: c || new THREE.Color().setHSL(0.27, 0.42, 0.3) });
          }
          break;
        }
        case 'pine': {
          const sc = (k.s || 1) * (0.9 + s0 * 0.3) * 0.95;
          trunks.push({ x, z, h: 0.5 * sc, sx: 0.14 * sc, sy: 1.0 * sc, sz: 0.14 * sc, ry: s0 * 9 });
          for (let i = 0; i < 4; i++) {
            cones.push({ x, z, h: (1.1 + i * 0.55) * sc, sx: (1.05 - i * 0.2) * sc, sy: 1.05 * sc, sz: (1.05 - i * 0.2) * sc, ry: s0 * 7 + i, c: new THREE.Color().setHSL(0.4, 0.35, 0.1 + i * 0.025) });
            if (theme === 'snow') snowCaps.push({ x, z, h: (1.32 + i * 0.55) * sc, sx: (0.75 - i * 0.15) * sc, sy: 0.5 * sc, sz: (0.75 - i * 0.15) * sc, ry: s0 * 7 + i });
          }
          break;
        }
        case 'torch': out.torches.push({ x, z, h: 1.9 }); break;
        case 'brazier': out.braziers.push({ x, z, dev: k.dev }); break;
        case 'crystal': {
          const c = col((k.col && k.col[0]) || '#3a8ad8');
          for (const [dx, dz, h, w] of [[-0.25, 0.05, 1.0, 0.22], [0, 0, 1.6, 0.3], [0.3, -0.05, 0.8, 0.2], [0.1, 0.25, 0.6, 0.16]]) crystals.push({ x: x + dx, z: z + dz, h: h / 2, sx: w, sy: h, sz: w, ry: s0 * 6 + dx * 9, rz: dx * 0.5, c });
          out.glows.push({ x, z, h: 0.8, color: c, size: 2.2 });
          break;
        }
        case 'pillar': { const h = (k.h || 40) / K * 1.6; pillars.push({ x, z, h: h / 2, sx: 0.75, sy: h, sz: 0.75, ry: s0, c: k.tone === 'tower' ? col('#9a88c8') : col('#a8a0b0') }); caps.push({ x, z, h: h + 0.1, sx: 0.95, sy: 0.22, sz: 0.95 }); if (k.tone === 'tower') out.glows.push({ x, z: z + 0.4, h: h * 0.7, color: col('#d08aff'), size: 0.6 }); break; }
        case 'spike': { const h = (k.h || 40) / K * 1.7; spikes.push({ x, z, h: h / 2, sx: 0.5, sy: h, sz: 0.5, ry: s0 * 3, rz: (s0 - 0.5) * 0.25 }); break; }
        case 'coral': { const c = col(k.col || '#ff7aa0'); for (let i = 0; i < 5; i++) corals.push({ x: x + (rnd() - 0.5) * 0.5, z: z + (rnd() - 0.5) * 0.5, h: 0.35, sx: 0.07, sy: 0.6 + rnd() * 0.7, sz: 0.07, rx: (rnd() - 0.5) * 0.7, rz: (rnd() - 0.5) * 0.7, c }); break; }
        case 'column': { const h = (k.h || 50) / K * (k.broken ? 0.9 : 1.6); columns.push({ x, z, h: h / 2, sx: 0.32, sy: h, sz: 0.32, rz: k.broken ? (s0 - 0.5) * 0.2 : 0, c: col('#7a9a9a') }); caps.push({ x, z, h: h + 0.08, sx: 0.85, sy: 0.18, sz: 0.85 }); break; }
        case 'marble': { const h = (k.h || 50) / K * 1.6; marble.push({ x, z, h: h / 2, sx: 0.32, sy: h, sz: 0.32 }); caps.push({ x, z, h: h + 0.08, sx: 0.85, sy: 0.18, sz: 0.85, c: col('#f0ece4') }); caps.push({ x, z, h: 0.08, sx: 0.85, sy: 0.18, sz: 0.85, c: col('#c8c4bc') }); break; }
        case 'cactus': { const sc = (k.s || 1) * 1.15; cacti.push({ x, z, h: 1.2 * sc, sx: 0.22 * sc, sy: 2.4 * sc, sz: 0.22 * sc }); cacti.push({ x: x - 0.32 * sc, z, h: 1.35 * sc, sx: 0.14 * sc, sy: 0.8 * sc, sz: 0.14 * sc }); cacti.push({ x: x + 0.3 * sc, z, h: 1.0 * sc, sx: 0.14 * sc, sy: 0.7 * sc, sz: 0.14 * sc }); break; }
        case 'obelisk': { const h = (k.h || 50) / K * 1.7; obelisks.push({ x, z, h: h / 2, sx: 0.55, sy: h, sz: 0.55, ry: s0 }); out.glows.push({ x, z, h: h * 0.6, color: col('#c060ff'), size: 1.4 }); break; }
        default: break;
      }
    }
    for (const r of built.rocks || []) rocks.push({ x: r.x / K, z: r.y / K, h: 0.15, sx: (0.8 + rnd() * 0.6) * (r.s || 1), sy: (0.55 + rnd() * 0.4) * (r.s || 1), sz: 0.9 * (r.s || 1), ry: rnd() * 9 });
    const bark = new MSM({ map: barkTex(), roughness: 0.95, envMapIntensity: 0.15 });
    const leaf = new MSM({ map: leafTex(), roughness: 0.9, envMapIntensity: 0.1 });
    const stone = new MSM({ map: stoneTex(), color: 0x9a9488, roughness: 0.88, envMapIntensity: 0.15 });
    inst(group, new THREE.CylinderGeometry(0.6, 1, 1, 8), bark, trunks);
    inst(group, lumpy(new THREE.IcosahedronGeometry(1, 2), 0.16, 1.3), leaf, blobs);
    inst(group, lumpy(new THREE.ConeGeometry(1, 1, 10, 3), 0.08, 2.1), leaf, cones);
    inst(group, lumpy(new THREE.ConeGeometry(1, 1, 10, 2), 0.1, 3.1), new MSM({ color: 0xf4f8ff, roughness: 0.8 }), snowCaps, false);
    inst(group, lumpy(new THREE.DodecahedronGeometry(0.4, 1), 0.2, 4), stone, rocks);
    inst(group, new THREE.OctahedronGeometry(0.5, 0).scale(1, 1, 1), new MSM({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.35, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.88, envMap: env, envMapIntensity: 1 }), crystals.map((o) => ({ ...o, sy: o.sy })), false);
    const pillarMat = new MSM({ map: stoneTex(), roughness: 0.85, envMapIntensity: 0.15 });
    inst(group, new THREE.BoxGeometry(1, 1, 1), pillarMat, pillars);
    inst(group, new THREE.BoxGeometry(1, 1, 1), new MSM({ map: stoneTex(), color: 0xb8b0a8, roughness: 0.85 }), caps);
    inst(group, new THREE.ConeGeometry(1, 1, 5), new MSM({ color: 0x120a10, roughness: 0.3, metalness: 0.4, emissive: 0x3a0a04, emissiveIntensity: 0.6, envMap: env, envMapIntensity: 0.6 }), spikes);
    inst(group, new THREE.CylinderGeometry(0.6, 1, 1, 6), new MSM({ roughness: 0.6, emissive: 0x111111 }), corals);
    inst(group, new THREE.CylinderGeometry(1, 1, 1, 12), new MSM({ map: stoneTex(), roughness: 0.8 }), columns);
    inst(group, new THREE.CylinderGeometry(1, 1, 1, 14), new MSM({ color: 0xe8e4dc, roughness: 0.35, envMap: env, envMapIntensity: 0.5 }), marble);
    inst(group, new THREE.CylinderGeometry(0.85, 1, 1, 8), new MSM({ color: 0x3a7a3a, roughness: 0.7 }), cacti);
    inst(group, new THREE.CylinderGeometry(0.35, 1, 1, 4), new MSM({ color: 0x0e0818, roughness: 0.25, metalness: 0.5, emissive: 0x3a0a5a, emissiveIntensity: 0.5, envMap: env, envMapIntensity: 0.7 }), obelisks);
  }

  // tochas, braseiros, brilhos e o "pool" de luzes reais (só as mais próximas da câmera acendem)
  function buildFires(group, out, lightsList) {
    const iron = new MSM({ color: 0x16140f, metalness: 0.8, roughness: 0.42, envMap: env, envMapIntensity: 0.6 });
    const flameMat = new MSM({ color: 0x220800, emissive: 0xff8a2a, emissiveIntensity: 4, transparent: true, opacity: 0.95 });
    const flameP = new MSM({ color: 0x100420, emissive: 0xb060ff, emissiveIntensity: 4, transparent: true, opacity: 0.95 });
    const posts = [], bowls = [], flames = [], flamesP = [];
    for (const t of out.torches) { posts.push({ x: t.x, z: t.z, h: 0.95, sx: 0.06, sy: 1.9, sz: 0.06 }); bowls.push({ x: t.x, z: t.z, h: 1.95, sx: 0.18, sy: 0.14, sz: 0.18 }); flames.push({ x: t.x, z: t.z, h: 2.15, sx: 0.12, sy: 0.32, sz: 0.12 }); lightsList.push({ x: t.x, z: t.z, h: 2.2, color: 0xff9a40, r: 7, k: 1.6 }); out.glows.push({ x: t.x, z: t.z, h: 2.15, color: col('#ff9a40'), size: 1.1, flick: true }); }
    for (const b of out.braziers) { posts.push({ x: b.x, z: b.z, h: 0.45, sx: 0.35, sy: 0.9, sz: 0.35 }); bowls.push({ x: b.x, z: b.z, h: 0.95, sx: 0.5, sy: 0.2, sz: 0.5 }); (b.dev ? flamesP : flames).push({ x: b.x, z: b.z, h: 1.25, sx: 0.28, sy: 0.6, sz: 0.28 }); lightsList.push({ x: b.x, z: b.z, h: 1.6, color: b.dev ? 0xb060ff : 0xff8a3a, r: 10, k: 2.4 }); out.glows.push({ x: b.x, z: b.z, h: 1.2, color: col(b.dev ? '#b060ff' : '#ff8a3a'), size: 2.2, flick: true }); }
    inst(group, new THREE.CylinderGeometry(0.7, 1, 1, 8), iron, posts);
    inst(group, new THREE.CylinderGeometry(1, 0.6, 1, 10), iron, bowls);
    const fl = inst(group, new THREE.ConeGeometry(1, 1, 8), flameMat, flames, false);
    const fp = inst(group, new THREE.ConeGeometry(1, 1, 8), flameP, flamesP, false);
    return [fl, fp].filter(Boolean);
  }

  // estruturas: casas, fonte, muralhas, rio, barraca, arena, cerca, altar
  function buildStructs(group, m, built, theme, out, lightsList) {
    const stone = new MSM({ map: stoneTex(), color: 0xa49c90, roughness: 0.85, envMapIntensity: 0.15 });
    const wood = new MSM({ map: woodTex(), roughness: 0.85, envMapIntensity: 0.1 });
    for (const s of built.structs || []) {
      if (s.k === 'plaza') {
        const ft = flagTex('f_plaza', 30, 8, 40, true).clone(); ft.needsUpdate = true;
        const w = (s.x1 - s.x0) / K, d = (s.y1 - s.y0) / K;
        ft.repeat.set(w / 7, d / 7);
        const pl = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), new MSM({ map: ft, roughness: 0.85, color: 0xb0aaa0, envMapIntensity: 0.12 }));
        pl.position.set((s.x0 + s.x1) / 2 / K, 0.012, (s.y0 + s.y1) / 2 / K); pl.receiveShadow = true; group.add(pl);
      } else if (s.k === 'fountain') {
        const f = new THREE.Group(); f.position.set(s.x / K, 0, s.y / K); group.add(f);
        const v = (a) => a.map((p) => new THREE.Vector2(p[0], p[1]));
        const R = Math.max(1.6, s.r / K);
        const fm = new MSM({ map: stoneTex(), color: 0x9a9488, roughness: 0.8, envMapIntensity: 0.2 });
        const a = new THREE.Mesh(new THREE.LatheGeometry(v([[R - 0.3, 0], [R, 0], [R + 0.05, 0.12], [R, 0.5], [R + 0.05, 0.56], [R - 0.15, 0.6], [R - 0.3, 0.55], [R - 0.3, 0]]), 48), fm);
        const b = new THREE.Mesh(new THREE.LatheGeometry(v([[0, 0], [0.42, 0], [0.36, 0.18], [0.22, 0.3], [0.18, 1.15], [0.28, 1.25], [0.78, 1.32], [0.82, 1.42], [0.7, 1.48], [0.16, 1.5], [0.12, 2.0], [0.22, 2.06], [0.18, 2.14], [0, 2.2]]), 32), fm);
        a.castShadow = b.castShadow = a.receiveShadow = b.receiveShadow = true; f.add(a, b);
        const wm = new MSM({ color: 0x0b2a3a, roughness: 0.08, metalness: 0.4, bumpMap: waterBump(), bumpScale: 0.05, envMap: env, envMapIntensity: 0.8, transparent: true, opacity: 0.9 });
        const w1 = new THREE.Mesh(new THREE.CircleGeometry(R - 0.3, 40).rotateX(-Math.PI / 2), wm); w1.position.y = 0.42; f.add(w1);
        const w2 = new THREE.Mesh(new THREE.CircleGeometry(0.72, 24).rotateX(-Math.PI / 2), wm); w2.position.y = 1.45; f.add(w2);
        out.waterMats.push(wm);
        out.spray = { x: s.x / K, z: s.y / K };
      } else if (s.k === 'house') {
        const w = s.w / K, d = 3.2, x = (s.x + s.w / 2) / K, z = (s.y + s.h * 0.55) / K;
        const hg = new THREE.Group(); hg.position.set(x, 0, z); group.add(hg);
        const pt = plasterTex().clone(); pt.needsUpdate = true; pt.repeat.set(Math.max(1, w / 3.2), 1);
        const walls = new THREE.Mesh(new THREE.BoxGeometry(w, 3, d), new MSM({ map: pt, roughness: 0.92, envMapIntensity: 0.1 }));
        walls.position.y = 1.5; walls.castShadow = walls.receiveShadow = true; hg.add(walls);
        const roofShape = new THREE.Shape(); roofShape.moveTo(-d / 2 - 0.35, 0); roofShape.lineTo(0, 1.9); roofShape.lineTo(d / 2 + 0.35, 0); roofShape.lineTo(-d / 2 - 0.35, 0);
        const rgeo = new THREE.ExtrudeGeometry(roofShape, { depth: w + 0.5, bevelEnabled: false }); rgeo.translate(0, 0, -(w + 0.5) / 2); rgeo.rotateY(Math.PI / 2);
        const rt = roofTex().clone(); rt.needsUpdate = true; rt.repeat.set(0.25, 0.25);
        const roof = new THREE.Mesh(rgeo, new MSM({ map: rt, roughness: 0.8, envMapIntensity: 0.1 })); roof.position.y = 3; roof.castShadow = true; hg.add(roof);
        const door = new THREE.Mesh(new THREE.BoxGeometry(0.95, 1.8, 0.1), wood); door.position.set(0, 0.9, d / 2 + 0.03); hg.add(door);
        const winMat = new MSM({ color: 0x2a1a08, emissive: 0xffb050, emissiveIntensity: 1.6 });
        for (const wx of [-w * 0.3, w * 0.3]) { const wi = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.7, 0.06), winMat); wi.position.set(wx, 1.8, d / 2 + 0.02); hg.add(wi); out.glows.push({ x: x + wx, z: z + d / 2 + 0.3, h: 1.8, color: col('#ffb050'), size: 1.2 }); }
        const ch = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.4, 0.5), stone); ch.position.set(w * 0.32, 4.1, -0.3); ch.castShadow = true; hg.add(ch);
        lightsList.push({ x, z: z + d / 2 + 0.8, h: 2.2, color: 0xffb060, r: 6, k: 1.2 });
      } else if (s.k === 'townwall') {
        const Wm = m.w / K, z0 = s.y / K;
        const wall = new THREE.Mesh(new THREE.BoxGeometry(Wm, 2.6, 2), stone); wall.position.set(Wm / 2, 1.3, z0 + 1.6); wall.castShadow = wall.receiveShadow = true; group.add(wall);
        const merl = [];
        for (let x = 0.5; x < Wm; x += 1.4) merl.push({ x, z: z0 + 0.8, h: 2.9, sx: 0.7, sy: 0.6, sz: 0.5 });
        inst(group, new THREE.BoxGeometry(1, 1, 1), stone, merl);
      } else if (s.k === 'river') {
        const pts = [];
        for (let y = -20; y <= s.H + 40; y += 10) pts.push(new THREE.Vector3((s.W - 35 + Math.sin(y / 35) * 10) / K, 0.035, y / K));
        const curve = new THREE.CatmullRomCurve3(pts);
        const shape = (wdt, yy, mat) => {
          const N = 120, pos = [], idx = [], uv = [];
          for (let i = 0; i <= N; i++) { const p = curve.getPoint(i / N); pos.push(p.x - wdt / 2, yy, p.z, p.x + wdt / 2, yy, p.z); uv.push(0, i / 10, 1, i / 10); if (i < N) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); } }
          const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); gg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); gg.setIndex(idx); gg.computeVertexNormals();
          const mesh = new THREE.Mesh(gg, mat); mesh.receiveShadow = true; group.add(mesh); return mesh;
        };
        shape(6.6, 0.015, new MSM({ color: 0x3a3020, roughness: 1 }));
        const wm = new MSM({ color: 0x0b2a3a, roughness: 0.06, metalness: 0.4, bumpMap: waterBump(), bumpScale: 0.05, envMap: env, envMapIntensity: 0.9, transparent: true, opacity: 0.92 });
        shape(5, 0.04, wm); out.waterMats.push(wm);
      } else if (s.k === 'stall') {
        const g2 = new THREE.Group(); g2.position.set(s.x / K, 0, (s.y - 30) / K); group.add(g2);
        const table = new THREE.Mesh(new THREE.BoxGeometry(4, 0.9, 1.2), wood); table.position.y = 0.45; table.castShadow = true; g2.add(table);
        for (const px of [-1.9, 1.9]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.6, 6), wood); p.position.set(px, 1.3, -0.5); g2.add(p); }
        const at = canvasTex('awning', 128, (g, sz) => { for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#f0e6cc' : '#c8452c'; g.fillRect(i * sz / 8, 0, sz / 8, sz); } });
        const aw = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 1.6), new MSM({ map: at, side: THREE.DoubleSide, roughness: 0.8 })); aw.rotation.x = -Math.PI / 3; aw.position.set(0, 2.5, 0); aw.castShadow = true; g2.add(aw);
        const fr = []; for (let k = 0; k < 5; k++) fr.push({ x: s.x / K - 1.4 + k * 0.7, z: (s.y - 30) / K, h: 1.02, sx: 0.18, c: col(['#d0302a', '#3a7aff', '#d0302a', '#3a7aff', '#e8b84a'][k]) });
        inst(group, new THREE.SphereGeometry(1, 12, 8), new MSM({ roughness: 0.5 }), fr);
      } else if (s.k === 'arena') {
        const Wm = m.w / K, Hm = m.h / K, M = s.m / K, wh = 3.4;
        const wmat = new MSM({ map: stoneTex(), color: s.dev ? 0x6a4a6a : 0x8a7a70, roughness: 0.85 });
        const walls = [[Wm / 2, M / 2, Wm, M], [Wm / 2, Hm - M / 2, Wm, M], [M / 2, Hm / 2, M, Hm], [Wm - M / 2, Hm / 2, M, Hm]];
        for (const [x, z, w, d] of walls) { const b = new THREE.Mesh(new THREE.BoxGeometry(w, wh, d), wmat); b.position.set(x, wh / 2, z); b.castShadow = b.receiveShadow = true; group.add(b); }
        const merl = [];
        for (let x = M; x < Wm - M; x += 1.6) { merl.push({ x, z: M - 0.3, h: wh + 0.35, sx: 0.8, sy: 0.7, sz: 0.6 }); merl.push({ x, z: Hm - M + 0.3, h: wh + 0.35, sx: 0.8, sy: 0.7, sz: 0.6 }); }
        for (let z = M; z < Hm - M; z += 1.6) { merl.push({ x: M - 0.3, z, h: wh + 0.35, sx: 0.6, sy: 0.7, sz: 0.8 }); merl.push({ x: Wm - M + 0.3, z, h: wh + 0.35, sx: 0.6, sy: 0.7, sz: 0.8 }); }
        inst(group, new THREE.BoxGeometry(1, 1, 1), wmat, merl);
        for (const [x, z] of [[M / 2, M / 2], [Wm - M / 2, M / 2], [M / 2, Hm - M / 2], [Wm - M / 2, Hm - M / 2]]) { const t = new THREE.Mesh(new THREE.CylinderGeometry(M * 0.6, M * 0.66, wh * 1.6, 12), wmat); t.position.set(x, wh * 0.8, z); t.castShadow = true; group.add(t); }
        const em = new THREE.Mesh(new THREE.RingGeometry(4.2, 5.2, 5, 1).rotateX(-Math.PI / 2), new MSM({ color: 0x100004, emissive: s.dev ? 0xa84aff : 0xd8402a, emissiveIntensity: 1.2 })); em.position.set(Wm / 2, 0.03, Hm / 2); group.add(em);
      } else if (s.k === 'fence') {
        const x0 = s.x / K, z0 = s.y / K, w = s.w / K, d = s.h / K, posts = [], rails = [];
        for (let i = 0; i <= 12; i++) { const x = x0 + i * w / 12; posts.push({ x, z: z0, h: 0.6, sx: 0.12, sy: 1.2, sz: 0.12 }); posts.push({ x, z: z0 + d, h: 0.6, sx: 0.12, sy: 1.2, sz: 0.12 }); }
        for (let i = 0; i <= 8; i++) { const z = z0 + i * d / 8; posts.push({ x: x0, z, h: 0.6, sx: 0.12, sy: 1.2, sz: 0.12 }); if (i < 3 || i > 5) posts.push({ x: x0 + w, z, h: 0.6, sx: 0.12, sy: 1.2, sz: 0.12 }); }
        for (const hh of [0.45, 0.95]) { rails.push({ x: x0 + w / 2, z: z0, h: hh, sx: w, sy: 0.08, sz: 0.06 }, { x: x0 + w / 2, z: z0 + d, h: hh, sx: w, sy: 0.08, sz: 0.06 }, { x: x0, z: z0 + d / 2, h: hh, sx: 0.06, sy: 0.08, sz: d }); }
        inst(group, new THREE.BoxGeometry(1, 1, 1), wood, posts); inst(group, new THREE.BoxGeometry(1, 1, 1), wood, rails);
      } else if (s.k === 'altar') {
        const pl = new THREE.Mesh(new THREE.BoxGeometry(s.w / K, 0.25, s.h / K), new MSM({ map: stoneTex(), color: 0x4a2a32, roughness: 0.8 })); pl.position.set((s.x + s.w / 2) / K, 0.12, (s.y + s.h / 2) / K); pl.receiveShadow = true; group.add(pl);
        const cp = new THREE.Mesh(new THREE.PlaneGeometry(s.w / K * 0.9, 2.5).rotateX(-Math.PI / 2), new MSM({ color: 0x5a0a1a, roughness: 0.9 })); cp.position.set((s.x + s.w / 2) / K, 0.26, (s.y + s.h / 2) / K); group.add(cp);
        lightsList.push({ x: (s.x + s.w / 2) / K, z: (s.y + s.h / 2) / K, h: 3, color: 0xc83cdc, r: 14, k: 2 });
      }
    }
  }

  // ------------------------------------------------------------------ troca de mapa
  function disposeWorld() {
    if (!world) return;
    scene.remove(world.group);
    world.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) [].concat(o.material).forEach((m) => { for (const k of ['map', 'bumpMap', 'emissiveMap']) if (m[k] && !Object.values(TEX).includes(m[k]) && m[k].image && m[k].image.tagName === 'CANVAS' && m[k] !== TEX[k]) { /* texturas clonadas são leves */ } m.dispose(); });
    });
    if (world.macro) world.macro.dispose();
    world = null;
  }
  W3.enterMap = function (m, built) {
    if (!W3.ok) return;
    disposeWorld();
    W3.clearActors();
    scene = new THREE.Scene();
    const theme = THEMES[m.theme] ? m.theme : 'grass';
    const th = THEMES[theme];
    scene.background = new THREE.Color(th.sky);
    scene.fog = new THREE.FogExp2(th.fog[0], th.fog[1]);
    scene.environment = null;
    const group = new THREE.Group(); scene.add(group);
    const hemi = new THREE.HemisphereLight(th.hemi[0], th.hemi[1], th.hemi[2]); group.add(hemi);
    const sun = new THREE.DirectionalLight(th.sun[0], th.sun[1]);
    sun.castShadow = QL.shadows; sun.shadow.mapSize.set(QL.shadowSize, QL.shadowSize);
    const sc = sun.shadow.camera; sc.left = -22; sc.right = 22; sc.top = 22; sc.bottom = -22; sc.near = 1; sc.far = 90;
    sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03;
    group.add(sun, sun.target);
    const rim = new THREE.DirectionalLight(0x6a8cff, th.night ? 0.35 : 0.25); rim.position.set(-20, 18, -30); group.add(rim);
    const out = { torches: [], braziers: [], glows: [], waterMats: [], spray: null };
    const lightsList = [];
    const g = buildGround(group, m, built, th);
    const waters = [];
    buildWaters(group, built, theme, waters);
    buildProps(group, built, theme, out);
    buildStructs(group, m, built, theme, out, lightsList);
    const flames = buildFires(group, out, lightsList);
    // luzes do mapa 2D (cristais, lava, janelas...) também entram no pool, com menos força
    for (const l of built.lights || []) {
      const [r0, g0, b0] = String(l.color).split(',').map(Number);
      lightsList.push({ x: l.x / K, z: l.y / K, h: 1.4, color: new THREE.Color(r0 / 255, g0 / 255, b0 / 255).getHex(), r: Math.min(12, Math.max(3, l.r / K * 1.6)), k: 0.8, weak: true });
    }
    const glows = [];
    for (const o of out.glows) { const s = glowSprite(o.color, o.size, 0.85); s.position.set(o.x, o.h, o.z); group.add(s); glows.push({ s, base: o.size, flick: o.flick, ph: Math.random() * 6 }); }
    const pool = [];
    for (let i = 0; i < QL.pool; i++) { const pl = new THREE.PointLight(0xffffff, 0, 8, 2); pl.position.set(0, -50, 0); group.add(pl); pool.push(pl); }
    world = { group, theme, sun, hemi, macro: g.macro, waters: waters.map((w) => w.mat).concat(out.waterMats), lavas: waters.filter((w) => w.lava).map((w) => w.mat), lightsList, pool, glows, flames, w: m.w / K, h: m.h / K };
    W3.theme = theme;
    W3.lastStats = { props: (built.props || []).length, kinds: (built.props || []).reduce((a, p) => { const k = (p.kind && p.kind.k) || '?'; a[k] = (a[k] || 0) + 1; return a; }, {}), lights: lightsList.length };
    // compila os shaders já (evita travada no primeiro quadro)
    try { renderer.compile(scene, camera); } catch (_) { /* ok */ }
  };

  // ------------------------------------------------------------------ câmera e projeção
  const PITCH = 0.8; // ~46° olhando para baixo (estilo MU)
  const focus = V3();
  W3.setView = function (fx, fy, zoomPx, cvW, cvH) {
    // distância tal que, no ponto focado, 1 unidade do mapa = zoomPx pixels (as sobreposições 2D batem com o 3D)
    const pxPerM = zoomPx * K;
    const dist = cvH / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * pxPerM);
    focus.set(fx / K, 0, fy / K);
    camera.position.set(focus.x, Math.sin(PITCH) * dist, focus.z + Math.cos(PITCH) * dist);
    camera.lookAt(focus);
    camera.updateMatrixWorld();
    W3.cvW = cvW; W3.cvH = cvH;
  };
  const tmp = V3();
  W3.project = function (x, y, h = 0) {
    tmp.set(x / K, h / K, y / K).project(camera);
    return [(tmp.x + 1) / 2 * W3.cvW, (1 - tmp.y) / 2 * W3.cvH, tmp.z];
  };
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane(V3(0, 1, 0), 0);
  W3.pick = function (cssX, cssY) {
    ndc.set(cssX / W3.w * 2 - 1, -(cssY / W3.h) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = V3();
    if (!ray.ray.intersectPlane(plane, hit)) return null;
    return [hit.x * K, hit.z * K];
  };

  // ------------------------------------------------------------------ quadro
  let lastT = 0;
  W3.render = function (now) {
    if (!W3.ok || !world || W3.lost) return;
    const t = now / 1000, dt = Math.min(0.1, lastT ? t - lastT : 0.016); lastT = t;
    // sol acompanha o foco (sombra nítida perto do herói)
    world.sun.position.set(focus.x + 14, 26, focus.z + 10); world.sun.target.position.copy(focus); world.sun.target.updateMatrixWorld();
    for (const m of world.waters) if (m.bumpMap) { m.bumpMap.offset.x = t * 0.02; m.bumpMap.offset.y = t * 0.013; }
    for (const m of world.lavas) { m.emissiveIntensity = 1.4 + 0.3 * Math.sin(t * 2.1); if (m.emissiveMap) m.emissiveMap.offset.set(t * 0.01, t * 0.007); }
    for (const gl of world.glows) if (gl.flick) gl.s.scale.setScalar(gl.base * (0.9 + 0.12 * Math.sin(t * 9 + gl.ph) + 0.06 * Math.sin(t * 23 + gl.ph)));
    // acende as luzes mais próximas do foco
    const L = world.lightsList;
    if (L.length) {
      const near = L.map((l) => [l, (l.x - focus.x) ** 2 + (l.z - focus.z) ** 2]).sort((a, b) => a[1] - b[1]);
      world.pool.forEach((pl, i) => {
        const e = near[i];
        if (!e || e[1] > 40 * 40) { pl.intensity = 0; return; }
        const l = e[0];
        pl.position.set(l.x, l.h, l.z); pl.color.setHex(l.color); pl.distance = l.r;
        pl.intensity = l.k * (l.weak ? 1 : (0.9 + 0.1 * Math.sin(t * 11 + i) + 0.05 * Math.sin(t * 27 + i * 3)));
      });
    }
    W3.updateActors(dt, t);
    if (W3.renderPreview) W3.renderPreview(renderer, dt, t);
    if (QL.bloom && composer) { composer.passes[0].scene = scene; composer.passes[0].camera = camera; composer.render(dt); }
    else renderer.render(scene, camera);
  };
  W3.scene = () => scene;
  W3.world = () => world;
  W3.env = () => env;
  W3.glowSprite = glowSprite;
  W3.lumpy = lumpy;
  W3.canvasTex = canvasTex;
  W3.clearActors = () => {};
  W3.updateActors = () => {};
})();
