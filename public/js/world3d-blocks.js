// MuonlineClaude — modo BLOCOS: o mesmo mundo 3D feito de cubos (arte própria, estilo voxel).
// Terreno, árvores, pedras, água, heróis, monstros e NPCs viram blocos. Posições, combate e regras continuam
// vindo do servidor e do game.js: este arquivo só troca o desenho. Ligado quando window.MUI_BLOCKS = true.
(function () {
  'use strict';
  const W3 = window.World3D;
  if (!W3 || !window.THREE || !window.MUI_BLOCKS) return;
  W3.blocks = true;
  const K = W3.K;
  const C = (c) => new THREE.Color(c);

  // ------------------------------------------------------------------ textura pixelada dos blocos (16×16, própria)
  function pixTex(kind) {
    const c = document.createElement('canvas'); c.width = c.height = 16;
    const g = c.getContext('2d');
    let s = kind === 'leaf' ? 91 : kind === 'stone' ? 37 : kind === 'wood' ? 53 : 17;
    const rnd = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      let v = 0.82 + rnd() * 0.18;
      if (kind === 'wood') v = (x % 4 === 0 ? 0.7 : 0.88) + rnd() * 0.1;
      if (kind === 'leaf' && rnd() < 0.18) v = 0.55;
      if (kind === 'stone' && rnd() < 0.12) v = 0.62;
      const b = Math.round(255 * v); g.fillStyle = `rgb(${b},${b},${b})`; g.fillRect(x, y, 1, 1);
    }
    // borda levemente escura: cada bloco aparece separado (visual de blocos)
    g.fillStyle = 'rgba(0,0,0,.16)'; g.fillRect(0, 0, 16, 1); g.fillRect(0, 0, 1, 16);
    const t = new THREE.CanvasTexture(c);
    t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestMipmapNearestFilter; t.encoding = THREE.sRGBEncoding;
    return t;
  }
  const TEX = {};
  const tex = (k) => TEX[k] || (TEX[k] = pixTex(k));
  const BOX = new THREE.BoxGeometry(1, 1, 1);

  // lista de blocos → InstancedMesh (um por material)
  function makeBatch() {
    const L = [];
    return {
      add(x, y, z, color, sx = 1, sy = 1, sz = 1, jitter = 0.06) {
        const c = C(color); if (jitter) c.multiplyScalar(1 - jitter + Math.random() * jitter * 2);
        L.push([x, y, z, sx, sy, sz, c]);
        return L.length - 1;
      },
      build(group, mat, shadows) {
        if (!L.length) return null;
        const im = new THREE.InstancedMesh(BOX, mat, L.length);
        const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3();
        L.forEach((b, i) => { m4.compose(v.set(b[0], b[1], b[2]), q, sc.set(b[3], b[4], b[5])); im.setMatrixAt(i, m4); im.setColorAt(i, b[6]); });
        im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
        im.castShadow = !!shadows; im.receiveShadow = true;
        group.add(im); this.im = im; this.L = L; return im;
      },
      get size() { return L.length; },
    };
  }
  const MSM = THREE.MeshStandardMaterial;

  // ------------------------------------------------------------------ terreno
  // chão: 1 bloco por metro com a cor do chão do mapa 2D (deixada em degraus); morros de blocos em volta do mapa
  W3.buildBlocks = function (group, m, built, theme, th, out) {
    const Wm = Math.ceil(m.w / K), Hm = Math.ceil(m.h / K);
    const sm = document.createElement('canvas'); sm.width = Wm; sm.height = Hm;
    const sg = sm.getContext('2d'); sg.imageSmoothingEnabled = true; sg.drawImage(built.canvas, 0, 0, Wm, Hm);
    const px = sg.getImageData(0, 0, Wm, Hm).data;
    const step = (v) => Math.round(v / 16) * 16;
    const cell = (x, z) => { const i = (Math.max(0, Math.min(Hm - 1, z)) * Wm + Math.max(0, Math.min(Wm - 1, x))) * 4; return `rgb(${step(px[i])},${step(px[i + 1])},${step(px[i + 2])})`; };
    // água e lava (círculos do mapa) viram blocos líquidos
    const pools = (built.waters || []).filter((w) => w.r).map((w) => ({ x: w.x / K, z: w.y / K, r: w.r / K, lava: w.kind === 'lava', ice: w.kind === 'ice' }));
    const poolAt = (x, z) => pools.find((p) => (x - p.x) ** 2 + (z - p.z) ** 2 < p.r * p.r);
    const ground = makeBatch(), water = makeBatch(), lava = makeBatch(), hills = makeBatch(), stone = makeBatch(), wood = makeBatch(), leaf = makeBatch(), glow = makeBatch();
    for (let z = 0; z < Hm; z++) for (let x = 0; x < Wm; x++) {
      const p = poolAt(x + 0.5, z + 0.5);
      if (p && p.lava) { lava.add(x + 0.5, -0.62, z + 0.5, '#ff6a1a', 1, 1, 1, 0.1); continue; }
      if (p) { water.add(x + 0.5, -0.6, z + 0.5, p.ice ? '#bfe4ff' : '#2a6ac8', 1, 1, 1, 0.03); continue; }
      ground.add(x + 0.5, -0.5, z + 0.5, cell(x, z));
    }
    // borda: morros de blocos (de 1 a 6 de altura) com a cor da beira do mapa, mais escura
    const noise = (x, z) => (Math.sin(x * 0.37) + Math.sin(z * 0.29 + 1.7) + Math.sin((x + z) * 0.17)) / 3;
    const B = 7;
    for (let z = -B; z < Hm + B; z++) for (let x = -B; x < Wm + B; x++) {
      if (x >= 0 && z >= 0 && x < Wm && z < Hm) continue;
      const d = Math.max(-x, -z, x - Wm + 1, z - Hm + 1);
      const h = Math.max(1, Math.round(1 + d * 0.55 + noise(x, z) * 2.5));
      const base = C(cell(x, z)).multiplyScalar(0.8);
      for (let y = 0; y < h; y++) hills.add(x + 0.5, y + 0.5 - 1, z + 0.5, y === h - 1 ? base : base.clone().multiplyScalar(0.7), 1, 1, 1, 0.08);
    }
    // objetos do mapa no mesmo lugar do 2D
    const snap = (v) => Math.floor(v) + 0.5;
    let sd = 7; const rnd = () => { sd = (sd * 16807) % 2147483647; return (sd - 1) / 2147483646; };
    const leafCol = theme === 'darkforest' ? '#2a4a2a' : theme === 'snow' || theme === 'glacier' ? '#3a6a4a' : '#3f8a32';
    const props = [];
    const mark = () => [stone, wood, leaf, glow].map((b) => b.size);
    for (const p of built.props || []) {
      const k = p.kind || {}, x = snap(p.x / K), z = snap(p.y / K), r = rnd();
      const before = mark();
      switch (k.k) {
        case 'tree': {
          const h = 3 + Math.round(r * 2), col = k.pink ? '#f0a0c0' : leafCol;
          for (let y = 0; y < h; y++) wood.add(x, y + 0.5, z, '#7a5230');
          for (let y = h - 2; y <= h; y++) {
            const rad = y === h ? 1 : 2;
            for (let dx = -rad; dx <= rad; dx++) for (let dz = -rad; dz <= rad; dz++) {
              if (Math.abs(dx) === rad && Math.abs(dz) === rad && rnd() < 0.7) continue;
              if (dx === 0 && dz === 0 && y < h) continue;
              leaf.add(x + dx, y + 0.5, z + dz, col, 1, 1, 1, 0.12);
            }
          }
          leaf.add(x, h + 1.5, z, col);
          break;
        }
        case 'pine': {
          const h = 5 + Math.round(r * 2);
          for (let y = 0; y < h; y++) wood.add(x, y + 0.5, z, '#5a3a20');
          for (let y = 2; y <= h; y++) {
            const rad = Math.max(0, Math.round((h - y) / 2));
            for (let dx = -rad; dx <= rad; dx++) for (let dz = -rad; dz <= rad; dz++) if (dx || dz || y === h) leaf.add(x + dx, y + 0.5, z + dz, theme === 'snow' && (h - y) % 2 === 0 ? '#e8f4ff' : '#2a5a3a', 1, 1, 1, 0.1);
          }
          break;
        }
        case 'crystal': { const col = (k.col && k.col[0]) || '#3a8ad8'; for (let y = 0; y < 3; y++) glow.add(x, y * 0.8 + 0.4, z, col, 0.6, 0.8, 0.6, 0.05); out.glows.push({ x, z, h: 1.2, color: C(col), size: 2.2 }); break; }
        case 'pillar': case 'column': case 'marble': case 'obelisk': case 'spike': {
          const h = Math.max(2, Math.round((k.h || 40) / K * 1.5)), col = k.k === 'marble' ? '#ece6dc' : k.tone === 'tower' ? '#8a7ab8' : k.k === 'obelisk' ? '#3a3448' : '#9a96a0';
          for (let y = 0; y < h; y++) stone.add(x, y + 0.5, z, col, k.k === 'spike' ? 0.7 : 1, 1, k.k === 'spike' ? 0.7 : 1);
          if (k.k === 'obelisk') out.glows.push({ x, z, h: h * 0.7, color: C('#b05aff'), size: 1.6 });
          break;
        }
        case 'cactus': { for (let y = 0; y < 3; y++) leaf.add(x, y + 0.5, z, '#3a8a3a', 0.8, 1, 0.8); leaf.add(x - 0.8, 1.5, z, '#3a8a3a', 0.6, 0.6, 0.6); leaf.add(x - 0.8, 2.1, z, '#3a8a3a', 0.6, 0.6, 0.6); break; }
        case 'coral': { const col = k.col || '#ff7aa0'; for (let i = 0; i < 3; i++) glow.add(x + (rnd() - 0.5), 0.3 + i * 0.35, z + (rnd() - 0.5), col, 0.3, 0.6, 0.3); break; }
        case 'torch': stone.add(x, 0.6, z, '#5a4a3a', 0.25, 1.2, 0.25); out.torches.push({ x, z, h: 1.4 }); break;
        case 'brazier': stone.add(x, 0.4, z, '#3a3030', 0.8, 0.8, 0.8); out.braziers.push({ x, z, dev: k.dev }); break;
        case 'rock': case 'boulder': case 'stone': default: {
          if (!k.k || /rock|boulder|stone|ruin|bone|skull|grave|log|stump|bush/.test(k.k)) { /* pedras e arbustos */
            const n = 1 + Math.round(r * 2), col = /bush/.test(k.k || '') ? leafCol : /log|stump/.test(k.k || '') ? '#7a5230' : '#7a7680';
            for (let i = 0; i < n; i++) ((/bush/.test(k.k || '')) ? leaf : stone).add(x + (i ? Math.round(rnd() * 2 - 1) : 0), 0.4, z + (i ? Math.round(rnd() * 2 - 1) : 0), col, 0.8, 0.8, 0.8, 0.1);
          }
        }
      }
      const after = mark();
      const parts = [stone, wood, leaf, glow].map((b, i) => [b, before[i], after[i] - before[i]]).filter((q) => q[2] > 0);
      if (parts.length) props.push({ x, z, parts, hidden: false });
    }
    // NPCs ganham uma barraquinha de blocos atrás (as cidades não ficam vazias)
    void 0;
    for (const n of (m.npcs || [])) {
      const x = snap(n.x / K), z = snap(n.y / K) - 2;
      for (let dx = -2; dx <= 2; dx++) { wood.add(x + dx, 0.5, z, '#8a6a42'); stone.add(x + dx, 2.6, z + 0.4, dx % 2 ? '#c83a3a' : '#f0e6d0', 1, 0.2, 1.6); }
      wood.add(x - 2, 1.5, z + 1, '#6a4a2a', 0.3, 2, 0.3); wood.add(x + 2, 1.5, z + 1, '#6a4a2a', 0.3, 2, 0.3);
    }
    const sh = W3.qname === 'alta' || W3.qname === 'ultra';
    ground.build(group, new MSM({ map: tex('ground'), roughness: 1 }), false);
    hills.build(group, new MSM({ map: tex('ground'), roughness: 1 }), false);
    stone.build(group, new MSM({ map: tex('stone'), roughness: 0.9 }), sh);
    wood.build(group, new MSM({ map: tex('wood'), roughness: 1 }), sh);
    leaf.build(group, new MSM({ map: tex('leaf'), roughness: 1 }), sh);
    glow.build(group, new MSM({ map: tex('stone'), roughness: 0.4, emissive: 0xffffff, emissiveIntensity: 0.35 }), false);
    water.build(group, new MSM({ map: tex('ground'), roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.78 }), false);
    lava.build(group, new MSM({ map: tex('ground'), emissive: 0xff5a10, emissiveIntensity: 1.1, roughness: 0.7 }), false);
    OCC.props = props;
    return { macro: null };
  };
  // objetos entre a câmera e o foco somem (a câmera fica do lado +z, olhando para o foco)
  const OCC = { props: [] };
  const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
  function occlude() {
    if (!OCC.props.length || W3.fx == null) return;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3();
    const dirty = new Set();
    for (const p of OCC.props) {
      const hide = Math.abs(p.x - W3.fx) < 13 && p.z > W3.fz - 1.5 && p.z < W3.fz + 16;
      if (hide === p.hidden) continue;
      p.hidden = hide;
      for (const [b, start, n] of p.parts) {
        if (!b.im) continue;
        for (let i = start; i < start + n; i++) {
          const d = b.L[i];
          b.im.setMatrixAt(i, hide ? ZERO : m4.compose(v.set(d[0], d[1], d[2]), q, sc.set(d[3], d[4], d[5])));
        }
        dirty.add(b.im);
      }
    }
    for (const im of dirty) im.instanceMatrix.needsUpdate = true;
  }

  // ------------------------------------------------------------------ personagens de blocos
  const MAT = new Map();
  const mat = (color, emissive) => {
    const key = color + '|' + (emissive || '');
    if (!MAT.has(key)) MAT.set(key, new MSM({ color: C(color), map: tex('ground'), roughness: 0.85, emissive: emissive ? C(emissive) : 0x000000, emissiveIntensity: emissive ? 0.6 : 0 }));
    return MAT.get(key);
  };
  function cube(w, h, d, color, x = 0, y = 0, z = 0, emissive) {
    const ms = new THREE.Mesh(BOX, mat(color, emissive));
    ms.scale.set(w, h, d); ms.position.set(x, y, z); ms.castShadow = true;
    return ms;
  }
  // pivô: grupo na articulação, a peça pendurada para baixo
  function limb(w, h, d, color, x, y, z, low) {
    const g = new THREE.Group(); g.position.set(x, y, z);
    g.add(cube(w, h, d, color, 0, -h / 2, 0));
    if (low) g.add(cube(w * 1.04, h * 0.26, d * 1.04, low, 0, -h * 0.87, 0));
    return g;
  }
  const SKIN = ['#f1c9a5', '#d9a77e', '#a8774f', '#6e4a32'];
  const HAIR = ['#2a1a10', '#8a5a2a', '#e0c070', '#c03a2a', '#3a3a3a', '#e8e8f0', '#4a2a6a', '#2a6aa8'];
  const CLS = { dark_knight: ['#4a5468', '#2a2e3a'], dark_wizard: ['#3a48b0', '#26306a'], fairy_elf: ['#3fa04a', '#2a6a30'], magic_gladiator: ['#7a3ab0', '#3a2050'],
    dark_lord: ['#8a2a2a', '#3a1a1a'], summoner: ['#b04aa0', '#5a2a5a'] };
  const SET_COL = { leather: '#8a5a34', bronze: '#b5723a', scale: '#3c8a84', dragon: '#b0262c', storm: '#2f5fc8', phoenix: '#e8661a', abyss: '#5a2a90' };
  const setCol = (id) => (id && (SET_COL[id] || (W3.setColors && W3.setColors[id]) || (W3.setColors && W3.setColors[String(id).replace(/_(helm|armor|gloves|boots)$/, '')]))) || null;
  const WING_COL = { wings_satan: '#d0342a', wings_heaven: '#e8f4ff', wings_elf: '#8aff6a', wings_curse: '#b05aff', wings_dragon: '#ff5a2a', wings_soul: '#5ac8ff', wings_spirit: '#ffe08a', wings_darkness: '#8a4aff' };

  // humanoide de blocos (altura ~1,85 m antes da escala)
  function humanoid(o) {
    const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
    const P = {};
    P.legL = limb(0.25, 0.72, 0.3, o.pants, -0.13, 0.72, 0, o.boots); P.legR = limb(0.25, 0.72, 0.3, o.pants, 0.13, 0.72, 0, o.boots);
    body.add(P.legL, P.legR);
    const torso = cube(0.52, 0.72, 0.36, o.shirt, 0, 1.08, 0); body.add(torso);
    if (o.belt) body.add(cube(0.54, 0.08, 0.38, o.belt, 0, 0.76, 0));
    P.armL = limb(0.22, 0.68, 0.26, o.sleeve || o.shirt, -0.38, 1.42, 0, o.hand); P.armR = limb(0.22, 0.68, 0.26, o.sleeve || o.shirt, 0.38, 1.42, 0, o.hand);
    body.add(P.armL, P.armR);
    const head = new THREE.Group(); head.position.set(0, 1.44, 0); body.add(head); P.head = head;
    head.add(cube(0.48, 0.48, 0.48, o.skin, 0, 0.24, 0));
    head.add(cube(0.09, 0.07, 0.02, o.eye || '#1a1a2a', -0.11, 0.26, 0.245), cube(0.09, 0.07, 0.02, o.eye || '#1a1a2a', 0.11, 0.26, 0.245));
    if (o.helm) { head.add(cube(0.5, 0.2, 0.5, o.helm, 0, 0.4, 0)); head.add(cube(0.5, 0.3, 0.1, o.helm, 0, 0.27, -0.2)); }
    else if (o.hair) { head.add(cube(0.47, 0.13, 0.47, o.hair, 0, 0.45, 0)); head.add(cube(0.47, 0.3, 0.1, o.hair, 0, 0.3, -0.19)); }
    if (o.horns) { head.add(cube(0.08, 0.22, 0.08, o.horns, -0.24, 0.5, 0)); head.add(cube(0.08, 0.22, 0.08, o.horns, 0.24, 0.5, 0)); }
    if (o.ears) { head.add(cube(0.16, 0.08, 0.06, o.skin, -0.3, 0.3, 0)); head.add(cube(0.16, 0.08, 0.06, o.skin, 0.3, 0.3, 0)); }
    // arma na mão direita
    if (o.weapon) {
      const wg = new THREE.Group(); wg.position.set(0, -0.62, 0.06); P.armR.add(wg);
      const wc = o.wcol || '#c8ccd8', em = o.wglow || null;
      if (o.weapon === 'staff') { wg.add(cube(0.06, 1.25, 0.06, '#6a4a2a', 0, 0.2, 0.08)); wg.add(cube(0.14, 0.14, 0.14, o.wglow || '#5ac8ff', 0, 0.85, 0.08, o.wglow || '#5ac8ff')); }
      else if (o.weapon === 'bow') { wg.add(cube(0.05, 0.9, 0.06, '#7a5230', 0, 0.05, 0.12)); wg.add(cube(0.05, 0.12, 0.06, '#7a5230', 0, 0.52, 0.06)); wg.add(cube(0.05, 0.12, 0.06, '#7a5230', 0, -0.42, 0.06)); wg.add(cube(0.01, 0.9, 0.01, '#e8e0c8', 0, 0.05, 0.02)); }
      else { wg.add(cube(0.06, 0.16, 0.06, '#5a3a20', 0, 0, 0)); wg.add(cube(0.24, 0.05, 0.08, '#8a7a5a', 0, 0.09, 0)); wg.add(cube(0.07, 0.75, 0.12, wc, 0, 0.5, 0, em)); }
      wg.rotation.x = Math.PI / 2 * 0.9;
    }
    // asas (duas placas atrás que batem)
    if (o.wings) {
      const wings = [];
      for (const s of [-1, 1]) {
        const pv = new THREE.Group(); pv.position.set(s * 0.08, 1.35, -0.16);
        pv.add(cube(0.7, 0.8, 0.05, o.wings, s * 0.38, 0.05, 0, o.wingGlow ? o.wings : null));
        pv.add(cube(0.4, 0.4, 0.05, o.wings, s * 0.7, -0.35, 0, o.wingGlow ? o.wings : null));
        body.add(pv); wings.push({ pv, s });
      }
      P.wings = wings;
    }
    root.userData.P = P; root.userData.body = body;
    return root;
  }
  function quadruped(color, dark) {
    const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
    const P = { legs: [] };
    body.add(cube(0.6, 0.55, 1.1, color, 0, 0.8, 0));
    const head = new THREE.Group(); head.position.set(0, 1.0, 0.6); body.add(head); P.head = head;
    head.add(cube(0.5, 0.46, 0.5, color, 0, 0, 0.15)); head.add(cube(0.3, 0.22, 0.25, dark, 0, -0.08, 0.48));
    head.add(cube(0.08, 0.08, 0.02, '#ffea6a', -0.14, 0.08, 0.41, '#ffea6a'), cube(0.08, 0.08, 0.02, '#ffea6a', 0.14, 0.08, 0.41, '#ffea6a'));
    head.add(cube(0.1, 0.16, 0.08, dark, -0.17, 0.3, 0.05), cube(0.1, 0.16, 0.08, dark, 0.17, 0.3, 0.05));
    for (const [x, z] of [[-0.2, 0.38], [0.2, 0.38], [-0.2, -0.38], [0.2, -0.38]]) { const L = limb(0.18, 0.55, 0.18, color, x, 0.55, z, dark); body.add(L); P.legs.push(L); }
    const tail = cube(0.12, 0.12, 0.45, dark, 0, 0.95, -0.7); body.add(tail); P.tail = tail;
    root.userData.P = P; root.userData.body = body; root.userData.quad = true;
    return root;
  }
  function spider(color) {
    const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
    const P = { legs: [] };
    body.add(cube(0.7, 0.4, 0.8, color, 0, 0.5, -0.2)); body.add(cube(0.45, 0.32, 0.4, color, 0, 0.45, 0.38));
    body.add(cube(0.07, 0.07, 0.02, '#ff3a3a', -0.1, 0.52, 0.59, '#ff3a3a'), cube(0.07, 0.07, 0.02, '#ff3a3a', 0.1, 0.52, 0.59, '#ff3a3a'));
    for (let i = 0; i < 8; i++) {
      const s = i < 4 ? -1 : 1, k = i % 4, L = new THREE.Group(); L.position.set(s * 0.3, 0.5, 0.25 - k * 0.22);
      L.add(cube(0.6, 0.07, 0.07, color, s * 0.3, 0.05, 0)); L.add(cube(0.07, 0.45, 0.07, color, s * 0.6, -0.2, 0));
      body.add(L); P.legs.push({ L, s, k });
    }
    root.userData.P = P; root.userData.body = body; root.userData.spider = true;
    return root;
  }
  function slime(color) {
    const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
    const m1 = new MSM({ color: C(color), roughness: 0.2, transparent: true, opacity: 0.8, map: tex('ground') });
    const outer = new THREE.Mesh(BOX, m1); outer.scale.set(0.8, 0.8, 0.8); outer.position.y = 0.4; body.add(outer);
    body.add(cube(0.4, 0.4, 0.4, C(color).multiplyScalar(0.6).getStyle(), 0, 0.4, 0));
    body.add(cube(0.1, 0.12, 0.02, '#1a1a2a', -0.15, 0.48, 0.41), cube(0.1, 0.12, 0.02, '#1a1a2a', 0.15, 0.48, 0.41));
    root.userData.P = {}; root.userData.body = body; root.userData.slime = true;
    return root;
  }

  // como cada monstro vira blocos (pelo modelo do 3D antigo, sem baixar arquivo nenhum)
  function monsterModel(d) {
    const def = (W3.MON && W3.MON[d.mtype]) || {};
    const key = def.proc || def.nova || def.lenda || d.mtype || '';
    let tint = def.tint || null;
    if (d.golden) tint = '#ffd36b';
    else if (d.tint === 'elite') tint = '#ffcf7a';
    else if (d.tint && d.tint[0] === '#') tint = d.tint;
    let model, h = def.h || 1.6;
    if (/slime/.test(key)) model = slime(tint || '#5ad85a');
    else if (/spider|scorpion/.test(key)) model = spider(tint || '#3a3048');
    else if (/wolf|boar|hound|bear|bull_beast/.test(key) || def.len) model = quadruped(tint || '#8a6b58', C(tint || '#8a6b58').multiplyScalar(0.55).getStyle());
    else {
      const o = { skin: '#7a8a5a', shirt: '#5a4a3a', pants: '#3a3028', boots: '#2a2018', hand: null };
      if (/goblin/.test(key)) Object.assign(o, { skin: tint || '#5aa84a', shirt: '#7a5a3a', pants: '#4a3a2a', ears: true, weapon: 'sword', wcol: '#a0a0a8' });
      else if (/esqueleto|skeleton/.test(key)) Object.assign(o, { skin: '#e8e4d8', shirt: tint || '#d8d4c8', pants: '#c8c4b8', boots: '#a8a498', sleeve: '#e0dccf', eye: '#ff3a3a', weapon: 'sword' });
      else if (/touro/.test(key)) Object.assign(o, { skin: '#6a4a3a', shirt: tint || '#8a3a2a', pants: '#4a2a1a', horns: '#e8e0c8', weapon: 'sword', wcol: '#8a8a8a' });
      else if (/yeti|golem/.test(key)) Object.assign(o, { skin: tint || '#9ab8d8', shirt: tint || '#8aa8c8', pants: C(tint || '#8aa8c8').multiplyScalar(0.7).getStyle(), boots: '#5a6a7a' });
      else if (/necro|mage/.test(key)) Object.assign(o, { skin: '#c8d8c8', shirt: tint || '#3a6a5a', pants: '#2a3a3a', weapon: 'staff', wglow: tint || '#7affe0' });
      else if (/boss|morvak|cguard|hag/.test(key)) Object.assign(o, { skin: '#5a3a5a', shirt: tint || '#6a2a8a', pants: '#2a1a2a', horns: '#e8d8a8', eye: '#ff3a3a', weapon: 'sword', wcol: '#b0b0c0', wglow: def.glow || null });
      else Object.assign(o, { skin: tint || '#8a7a5a', shirt: tint ? C(tint).multiplyScalar(0.8).getStyle() : '#6a5a4a' });
      model = humanoid(o);
      if (/yeti|golem/.test(key)) model.scale.set(1.25, 1, 1.15);
    }
    const base = model.userData.slime ? 0.8 : model.userData.spider ? 0.75 : model.userData.quad ? 1.3 : 1.88;
    const sc = (h / base) * (d.scale || 1);
    model.scale.multiplyScalar(sc);
    return model;
  }
  const NPC_LOOK = { shop: ['#c8a04a', '#6a4a2a'], smith: ['#8a5a3a', '#3a2a1a'], guild: ['#3a6ac8', '#2a3a6a'], marlon: ['#2f5fc8', '#1a2a5a'], sevina: ['#e8661a', '#7a3a10'],
    castle_guard: ['#5a2a90', '#2a1a4a'], charon: ['#3a3a4a', '#1a1a2a'], archangel: ['#f0e6c0', '#c8a04a'], teleport: ['#7a3ab0', '#3a1a5a'], chaos: ['#a070ff', '#5a3aa0'] };
  function heroModel(d) {
    const eq = d.eq || {}, ap = d.ap || {}, cc = CLS[d.cls] || CLS.dark_knight;
    const armor = setCol(eq.armor), helm = setCol(eq.helm), gloves = setCol(eq.gloves), boots = setCol(eq.boots);
    const w = String(eq.w || '');
    const weapon = /staff|cajado|stick|scepter|cetro|book/.test(w) || d.cls === 'dark_wizard' || d.cls === 'summoner' ? 'staff' : /bow|arco|crossbow/.test(w) || d.cls === 'fairy_elf' ? 'bow' : 'sword';
    const wingBase = eq.wings || null;
    return humanoid({
      skin: ((window.Sprites && Sprites.SKIN) || SKIN)[ap.skin || 0] || SKIN[0], hair: d.cls === 'dark_knight' && !helm ? null : ((window.Sprites && Sprites.HAIR) || HAIR)[ap.hair || 0] || HAIR[0],
      shirt: armor || cc[0], sleeve: armor || cc[0], pants: armor ? C(armor).multiplyScalar(0.75).getStyle() : cc[1], boots: boots || '#3a2a1a',
      hand: gloves || null, helm: helm || (d.cls === 'dark_knight' ? '#6a7080' : null), belt: '#3a2a1a',
      weapon, wcol: eq.wg || '#d0d4e0', wglow: eq.wg || null,
      wings: wingBase ? ((W3.wingColor && W3.wingColor(wingBase)) || WING_COL[wingBase] || '#e8e0ff') : null, wingGlow: eq.wingPlus >= 9,
    });
  }
  function npcModel(d) {
    const L = NPC_LOOK[d.npc] || ['#7a6a5a', '#3a2a2a'];
    return humanoid({ skin: SKIN[1], hair: HAIR[(d.npc || '').length % HAIR.length], shirt: L[0], pants: L[1], boots: '#2a1a10', belt: '#c8a04a', weapon: d.npc === 'smith' ? 'sword' : d.npc === 'teleport' || d.npc === 'charon' ? 'staff' : null, wglow: '#c88aff' });
  }
  function mountModel(red) { const m = quadruped(red ? '#a02a20' : '#d8a840', red ? '#4a1010' : '#7a5a20'); m.scale.multiplyScalar(1.25); return m; }

  class BlockActor {
    constructor(d) {
      this.kind = d.kind; this.root = new THREE.Group();
      const isMount = d.kind === 'hero' && d.eq && /fenrir/.test(String(d.eq.pet || ''));
      this.model = d.kind === 'hero' ? heroModel(d) : d.kind === 'mon' ? monsterModel(d) : npcModel(d);
      this.root.add(this.model);
      if (isMount) {
        this.mount = mountModel(/red/.test(String(d.eq.pet))); this.root.add(this.mount);
        this.model.position.y = 1.05; const P = this.model.userData.P; if (P.legL) { P.legL.rotation.x = -1.2; P.legR.rotation.x = -1.2; }
      }
      this.x = d.x / K; this.z = d.y / K; this.face = 0; this.phase = Math.random() * 6;
      this.root.position.set(this.x, 0, this.z);
      const sc = W3.scene(); if (sc) sc.add(this.root);
    }
    update(d, dt, t) {
      const tx = d.x / K, tz = d.y / K, k = 1 - Math.exp(-dt * 14);
      this.x += (tx - this.x) * k; this.z += (tz - this.z) * k;
      this.root.position.set(this.x, 0, this.z);
      // para onde olhar: alvo, senão a direção em que anda, senão o último lado
      let fx = null, fz = null;
      if (d.faceX != null) { fx = d.faceX / K - this.x; fz = d.faceY / K - this.z; }
      else if ((d.speed || 0) > 5 && (d.vx || d.vy)) { fx = d.vx; fz = d.vy; }
      else if (d.flip != null && this.kind !== 'hero') { fx = d.flip ? -1 : 1; fz = 0; }
      if (fx != null && (fx || fz)) {
        const want = Math.atan2(fx, fz); let diff = want - this.face;
        while (diff > Math.PI) diff -= Math.PI * 2; while (diff < -Math.PI) diff += Math.PI * 2;
        this.face += diff * Math.min(1, dt * 12);
      }
      this.root.rotation.y = this.face;
      const P = this.model.userData.P || {}, body = this.model.userData.body;
      const moving = d.act === 'walk' || d.act === 'run' || (d.speed || 0) > 10, run = d.act === 'run' || (d.speed || 0) > 65;
      this.phase += dt * (moving ? (run ? 14 : 9) : 0);
      const sw = moving ? Math.sin(this.phase) * (run ? 0.85 : 0.6) : 0;
      const nowS = t * 1000;
      const atk = d.act === 'attack' && d.atkDur > 0 ? Math.max(0, Math.min(1, (performance.now() - d.atkAt) / d.atkDur)) : -1;
      if (P.legL && !this.mount) { P.legL.rotation.x = sw; P.legR.rotation.x = -sw; }
      if (P.armL) {
        P.armL.rotation.x = -sw * 0.8 + (moving ? 0 : Math.sin(t * 2 + this.phase) * 0.04);
        P.armR.rotation.x = atk >= 0 ? -0.4 - Math.sin(atk * Math.PI) * 1.9 : sw * 0.8;
      }
      if (P.legs) {
        if (this.model.userData.spider) P.legs.forEach(({ L, s, k: i }) => { L.rotation.z = moving ? Math.sin(this.phase * 1.6 + i + (s > 0 ? 1.5 : 0)) * 0.25 * s : 0; });
        else P.legs.forEach((L, i) => { L.rotation.x = moving ? Math.sin(this.phase + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI : 0)) * 0.6 : 0; });
      }
      if (P.tail) P.tail.rotation.y = Math.sin(t * (moving ? 10 : 3)) * 0.35;
      if (P.head && this.model.userData.quad && atk >= 0) P.head.position.z = 0.6 + Math.sin(atk * Math.PI) * 0.25;
      if (this.model.userData.slime) body.scale.set(1 + Math.sin(t * 6 + this.phase) * 0.06, 1 - Math.sin(t * 6 + this.phase) * 0.08, 1 + Math.sin(t * 6 + this.phase) * 0.06);
      if (P.wings) { const f = Math.sin(t * (moving ? 7 : 2.4)); for (const { pv, s } of P.wings) pv.rotation.y = s * (0.35 + f * (moving ? 0.35 : 0.15)); }
      if (this.mount) {
        const MP = this.mount.userData.P;
        MP.legs.forEach((L, i) => { L.rotation.x = moving ? Math.sin(this.phase * 1.2 + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI : 0)) * 0.7 : 0; });
        this.model.position.y = 1.05 + (moving ? Math.abs(Math.sin(this.phase * 1.2)) * 0.06 : 0);
      }
      // levou golpe: tranco para trás; morreu: tomba e afunda
      const hurt = d.flash ? 1 : 0;
      if (body) body.rotation.x = -hurt * 0.18;
      if (d.act === 'death') { this.dead = Math.min(1, (this.dead || 0) + dt * 2.5); this.model.rotation.x = -this.dead * Math.PI / 2; this.model.position.y = (this.mount ? 1.05 : 0) - Math.max(0, this.dead - 0.8) * 0.5; }
      else if (this.dead) { this.dead = 0; this.model.rotation.x = 0; }
      if (d.act === 'hit' && body) body.position.z = -0.08; else if (body) body.position.z = 0;
      this.root.visible = d.visible !== false;
      void nowS;
    }
    dispose() { if (this.root.parent) this.root.parent.remove(this.root); }
  }

  // troca a lista de personagens do motor 3D pela versão de blocos
  const actors = new Map();
  let frameList = [];
  W3.setActors = function (list) { frameList = list; };
  W3.clearActors = function () { for (const a of actors.values()) a.dispose(); actors.clear(); };
  W3.updateActors = function (dt, t) {
    occlude();
    const seen = new Set();
    for (const d of frameList) {
      seen.add(d.key);
      let a = actors.get(d.key);
      const sig = d.kind === 'hero' ? [d.cls, JSON.stringify(d.eq || {})].join('|') : d.kind === 'mon' ? [d.mtype, d.golden || '', d.tint || ''].join('|') : d.npc;
      if (a && a.sig !== sig) { a.dispose(); actors.delete(d.key); a = null; }
      if (!a) { a = new BlockActor(d); a.sig = sig; actors.set(d.key, a); }
      a.update(d, dt, t);
    }
    for (const [k, a] of actors) if (!seen.has(k)) { a.dispose(); actors.delete(k); }
  };
  W3.preload = function () { return Promise.resolve(); };
  W3.heroHeight = 1.88;
})();
