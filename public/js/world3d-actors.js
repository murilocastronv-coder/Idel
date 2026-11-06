// MU Idle Legends — personagens 3D: heróis (modelos do Lenda 97), monstros e NPCs (Nova-versao-mu + modelos feitos aqui).
// Recebe a lista de entidades do game.js a cada quadro e só anima/desenha.
(function () {
  'use strict';
  const W3 = window.World3D;
  if (!W3 || !window.THREE || !THREE.GLTFLoader) return;
  const K = W3.K;
  const MSM = THREE.MeshStandardMaterial;
  const LENDA = '/assets/3d/lenda/', NOVA = '/assets/3d/nova/';
  const loader = new THREE.GLTFLoader();
  const cache = new Map();
  let MAN = null, CLIPS = {}, META = {}, PREFIX = 'mixamorig';
  const manP = fetch(LENDA + 'manifest.json').then((r) => r.json()).then((m) => { MAN = m; PREFIX = m.esqueleto.prefixo; return m; });
  function loadGLB(url) {
    if (cache.has(url)) return cache.get(url);
    const p = fetch(url).then((r) => { if (!r.ok) throw new Error(url + ' ' + r.status); return r.arrayBuffer(); })
      .then((buf) => new Promise((res, rej) => loader.parse(buf, '', res, rej)));
    cache.set(url, p);
    p.catch(() => cache.delete(url));
    return p;
  }
  const animP = manP.then((m) => loadGLB(LENDA + m.animacoes.arquivo)).then((g) => { for (const c of g.animations) { CLIPS[c.name] = c; META[c.name] = MAN.animacoes.clipes[c.name] || {}; } });
  function prep(root, man) {
    root.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false;
      for (const m of [].concat(o.material)) {
        const k = man && man.brilho && man.brilho[m.name];
        if (k) m.emissiveIntensity = k;
        m.envMapIntensity = m.metalness > 0.5 ? 0.75 : 0.35;
        if (/Capa|Cabelo|Tecido/.test(m.name)) m.side = THREE.DoubleSide;
      }
    });
    return root;
  }
  const lendaModel = (key) => manP.then((m) => loadGLB(LENDA + m.modelos[key]).then((g) => prep(g.scene, m)));
  const lendaWeapon = (key) => manP.then((m) => loadGLB(LENDA + m.armas[key]).then((g) => prep(g.scene, m)));
  const novaModel = (key) => loadGLB(NOVA + key + '.glb').then((g) => { prep(g.scene); g.scene.userData.clips = g.animations; return g.scene; });
  function cloneModel(src) {
    const o = THREE.SkeletonUtils.clone(src);
    o.traverse((m) => { if (m.isMesh) m.material = Array.isArray(m.material) ? m.material.map((x) => x.clone()) : m.material.clone(); });
    o.userData.clips = src.userData.clips;
    return o;
  }

  // ------------------------------------------------------------------ dados
  const HERO = {
    dark_knight: { model: 'dark_knight', weapon: 'espada_dk', hand: 'direita', style: 'espada', atk: ['espada_atk1', 'espada_atk2'], accents: { DK_Vermelho: 0.85, DK_Brilho: 0.9, DK_Capa: 0.45, DK_Gema: 0.4 } },
    dark_lord: { model: 'dark_lord', weapon: 'cetro_dl', hand: 'direita', style: 'espada', atk: ['espada_atk1', 'espada_cast'], accents: { DL_Capa: 0.6, DL_Rubi: 0.4 } },
    dark_wizard: { model: 'dark_wizard', weapon: 'cajado_dw', hand: 'direita', style: 'cajado', atk: ['cajado_cast'], accents: { DW_Manto: 0.55, DW_Azul: 0.8, DW_Roupa: 0.35, DW_Luva: 0.35 } },
    fairy_elf: { model: 'fairy_elf', weapon: 'arco_elfa', hand: 'esquerda', style: 'arco', atk: ['arco_shoot'], accents: { Elfa_Verde: 0.8, Elfa_Esmeralda: 0.5 } },
    magic_gladiator: { model: 'magic_gladiator', weapon: 'espada_mg', hand: 'direita', style: 'espada', atk: ['espada_atk1', 'espada_atk2'], accents: { MG_Roxo: 0.9, MG_Brilho: 1.3, MG_Ametista: 0.4 } },
    summoner: { model: 'fairy_elf', weapon: 'cajado_dw', hand: 'direita', style: 'cajado', atk: ['cajado_cast'], accents: { Elfa_Verde: 0.8, Elfa_Esmeralda: 0.5 }, base: '#7a3ac0' },
  };
  const SET_COL = { leather: '#8a5a34', bronze: '#b5723a', scale: '#3c8a84', dragon: '#b0262c', storm: '#2f5fc8', phoenix: '#e8661a', abyss: '#5a2a90' };
  const WING_COL = { wings_satan: '#d0342a', wings_heaven: '#e8f4ff', wings_elf: '#8aff6a', wings_curse: '#b05aff', wings_life: '#54ed9b', wings_dragon_l1: '#ff7840', wings_spirit_l1: '#86eaff',
    wings_dragon: '#ff5a2a', wings_soul: '#5ac8ff', wings_spirit: '#ffe08a', wings_darkness: '#8a4aff', wings_despair: '#ff6ab8', cape_lord: '#9a4aff', cape_emperor: '#ff3a3a' };
  const BAT = /satan|curse|darkness|despair|dragon/;
  // monstros: modelo, altura em metros, cor (multiplica as texturas), arma
  const MON = {
    slime: { proc: 'slime', h: 0.9, tint: '#5ad85a' }, sea_slime: { proc: 'slime', h: 0.9, tint: '#2a6aff' }, sky_slime: { proc: 'slime', h: 0.9, tint: '#e0f0ff' },
    noria_bull_fighter: { lenda: 'touro', weapon: 'machado_touro', h: 2.3 }, noria_elite_bull_fighter: { lenda: 'touro', weapon: 'machado_touro', h: 2.6, tint: '#ffcf7a' },
    noria_hound: { nova: 'mob_wolf', h: 1.7, len: true, tint: '#8a6b58' }, lava_hound: { nova: 'mob_wolf', h: 1.7, len: true, tint: '#ff7a3a' }, hell_hound: { nova: 'mob_wolf', h: 1.8, len: true, tint: '#a02a4a' },
    magma_hound: { nova: 'mob_wolf', h: 1.8, len: true, tint: '#ffb84a' }, demon_hound: { nova: 'mob_wolf', h: 1.9, len: true, tint: '#a02aff' }, frost_wolf: { nova: 'mob_frostwolf', h: 1.8, len: true },
    noria_budge_dragon: { nova: 'mob_boar', h: 1.5, len: true, tint: '#d8903a' },
    noria_spider: { proc: 'spider', h: 1.0, tint: '#7a5b3e' }, spider: { proc: 'spider', h: 1.0, tint: '#3a3048' }, abyss_spider: { proc: 'spider', h: 1.0, tint: '#2ad8ff' },
    storm_spider: { proc: 'spider', h: 1.0, tint: '#9ad8ff' }, venom_spider: { proc: 'spider', h: 1.0, tint: '#5aff3a' }, sand_scorpion: { proc: 'scorpion', h: 1.0, tint: '#d8a84a' },
    goblin: { nova: 'mob_goblin', h: 1.3 }, goblin_elite: { nova: 'mob_goblin', h: 1.45, tint: '#ffcf7a' }, shadow_goblin: { nova: 'mob_goblin', h: 1.35, tint: '#6a4aa8' },
    nomad_goblin: { nova: 'mob_goblin', h: 1.35, tint: '#d8a870' }, mist_goblin: { nova: 'mob_goblin', h: 1.35, tint: '#5ab88a' },
    skeleton: { lenda: 'esqueleto', weapon: 'espada_esqueleto', shield: 'escudo_esqueleto', h: 1.85 }, flame_skeleton: { lenda: 'esqueleto', weapon: 'espada_esqueleto', shield: 'escudo_esqueleto', h: 1.85, tint: '#ff8a4a', glow: '#ff6a2a' },
    cursed_skeleton: { lenda: 'esqueleto', weapon: 'espada_esqueleto', shield: 'escudo_esqueleto', h: 1.9, tint: '#c08aff', glow: '#b05aff' }, obsidian_skeleton: { lenda: 'esqueleto', weapon: 'espada_esqueleto', shield: 'escudo_esqueleto', h: 1.95, tint: '#5a4a6a' },
    void_skeleton: { lenda: 'esqueleto', weapon: 'espada_esqueleto', shield: 'escudo_esqueleto', h: 1.95, tint: '#8a6aff', glow: '#5a3aff' },
    death_knight: { nova: 'mob_cguard', h: 2.3, tint: '#8a5aff' }, bone_mage: { nova: 'mob_necro', h: 2.0, tint: '#7affe0' },
    ice_golem: { nova: 'mob_yeti', h: 2.5, tint: '#bfe8ff' }, coral_golem: { nova: 'mob_yeti', h: 2.6, tint: '#ff9ab0' }, magma_golem: { nova: 'mob_yeti', h: 2.7, tint: '#ff7a3a', glow: '#ff4a1a' },
    sand_golem: { nova: 'mob_yeti', h: 2.7, tint: '#e8c070' }, cloud_golem: { nova: 'mob_yeti', h: 2.7, tint: '#ffffff' }, glacier_golem: { nova: 'mob_yeti', h: 2.8, tint: '#7ac8ff' },
    dark_treant: { nova: 'mob_hag', h: 2.6, tint: '#6a8a4a' },
    kundun: { nova: 'mob_morvak', h: 3.6, tint: '#b06aff', glow: '#9a2aff' }, balgass: { nova: 'mob_boss', h: 3.6, tint: '#ff7a6a', glow: '#ff3a3a' }, skeleton_king: { nova: 'mob_skeleton', h: 3.2, tint: '#ffe0a0', glow: '#ffcf5a' },
  };
  const NPC = {
    shop: { nova: 'npc_mira' }, smith: { nova: 'npc_brant' }, guild: { nova: 'npc_selene' }, marlon: { hero: 'dark_knight', set: 'storm' }, sevina: { hero: 'fairy_elf', set: 'phoenix' },
    castle_guard: { nova: 'npc_guardiao' }, charon: { nova: 'npc_torvin' }, archangel: { nova: 'npc_selene' }, teleport: { nova: 'npc_elric' }, chaos: { nova: 'mob_goblin', tint: '#a070ff', h: 1.3 }, vault: { proc: 'chest' },
  };
  W3.MON = MON;

  // ------------------------------------------------------------------ peças feitas aqui
  const sharedGeo = {};
  function slimeModel(tint) {
    const g = new THREE.Group();
    const c = new THREE.Color(tint);
    const body = new THREE.Mesh(sharedGeo.slime || (sharedGeo.slime = W3.lumpy(new THREE.SphereGeometry(0.5, 24, 16), 0.04, 2)), new MSM({ color: c, roughness: 0.2, metalness: 0, transparent: true, opacity: 0.85, envMap: W3.env(), envMapIntensity: 0.5, emissive: c, emissiveIntensity: 0.12 }));
    body.scale.set(1, 0.8, 1); body.position.y = 0.4; body.castShadow = true; g.add(body);
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), new MSM({ color: c.clone().multiplyScalar(0.5), roughness: 0.4 })); core.position.set(0.05, 0.35, -0.05); g.add(core);
    for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), new MSM({ color: 0x050505, roughness: 0.2 })); e.position.set(0.15 * s, 0.55, 0.38); g.add(e); const h = new THREE.Mesh(new THREE.SphereGeometry(0.02, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffffff })); h.position.set(0.15 * s - 0.02, 0.57, 0.43); g.add(h); }
    g.userData.proc = 'slime'; g.userData.body = body;
    return g;
  }
  function spiderModel(tint, scorpion) {
    const g = new THREE.Group();
    const c = new THREE.Color(tint);
    const mat = new MSM({ color: c, roughness: 0.55, metalness: 0.05, envMap: W3.env(), envMapIntensity: 0.25 });
    const dark = new MSM({ color: c.clone().multiplyScalar(0.45), roughness: 0.6 });
    const abd = new THREE.Mesh(new THREE.SphereGeometry(0.3, 18, 12), mat); abd.scale.set(1, 0.75, scorpion ? 0.9 : 1.3); abd.position.set(0, 0.48, scorpion ? -0.1 : -0.42); abd.castShadow = true; g.add(abd);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 14, 10), dark); head.position.set(0, 0.45, 0.25); head.castShadow = true; g.add(head);
    const eye = new MSM({ color: 0x200000, emissive: 0xff2010, emissiveIntensity: 2.5 });
    for (const [x, y] of [[-0.09, 0.55], [0.09, 0.55], [-0.15, 0.5], [0.15, 0.5]]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 4), eye); e.position.set(x, y, 0.47); g.add(e); }
    const legs = [];
    const legGeo = new THREE.CylinderGeometry(0.04, 0.06, 0.6, 6); legGeo.translate(0, -0.3, 0);
    for (let i = 0; i < 8; i++) {
      const side = i < 4 ? -1 : 1, k = i % 4;
      const hip = new THREE.Group(); hip.position.set(0.18 * side, 0.5, 0.25 - k * 0.17); g.add(hip);
      const up = new THREE.Mesh(legGeo, dark); up.rotation.z = side * 2.0; up.castShadow = true; hip.add(up);
      const knee = new THREE.Group(); knee.position.set(0.6 * side * Math.sin(2.0), -0.6 * Math.cos(2.0), 0); hip.add(knee);
      const lo = new THREE.Mesh(legGeo, dark); lo.scale.y = 1.25; lo.rotation.z = side * 0.35; knee.add(lo);
      hip.rotation.y = side * (k - 1.5) * -0.35;
      legs.push({ hip, side, k });
    }
    if (scorpion) {
      let prev = g, z = -0.5, y = 0.5;
      const segs = [];
      for (let i = 0; i < 5; i++) { const s = new THREE.Mesh(new THREE.SphereGeometry(0.14 - i * 0.012, 10, 8), mat); const piv = new THREE.Group(); piv.position.set(0, i ? 0.18 : y, i ? -0.04 : z); piv.add(s); prev.add(piv); prev = piv; segs.push(piv); }
      const sting = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.25, 8), new MSM({ color: 0x1a1008, roughness: 0.3 })); sting.position.set(0, 0.12, 0.08); sting.rotation.x = 1.2; prev.add(sting);
      g.userData.tail = segs;
      for (const sd of [-1, 1]) { const cl = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), mat); cl.scale.set(0.8, 0.6, 1.4); cl.position.set(0.3 * sd, 0.4, 0.6); g.add(cl); }
    }
    g.userData.proc = scorpion ? 'scorpion' : 'spider'; g.userData.legs = legs;
    return g;
  }
  function chestModel() {
    const g = new THREE.Group();
    const wood = new MSM({ map: W3.canvasTex('wood', 128, () => {}), color: 0x8a5a30, roughness: 0.8 });
    const gold = new MSM({ color: 0xd8a83a, metalness: 0.9, roughness: 0.3, envMap: W3.env(), envMapIntensity: 1 });
    const b = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.7, 0.8), wood); b.position.y = 0.35; b.castShadow = true; g.add(b);
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 1.2, 16, 1, false, 0, Math.PI), wood); lid.rotation.z = Math.PI / 2; lid.position.y = 0.7; lid.castShadow = true; g.add(lid);
    for (const x of [-0.45, 0.45]) { const band = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.72, 0.84), gold); band.position.set(x, 0.36, 0); g.add(band); }
    const lock = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.22, 0.06), gold); lock.position.set(0, 0.6, 0.42); g.add(lock);
    const glow = W3.glowSprite(new THREE.Color('#ffd36b'), 1.6, 0.5); glow.position.y = 0.9; g.add(glow);
    g.userData.proc = 'chest';
    return g;
  }
  // asas: penas (ou membrana de morcego) presas nas costas, batendo devagar
  function wingTex(color, bat) {
    const key = 'wing_' + color + (bat ? 'b' : 'f');
    return W3.canvasTex(key, 256, (g, s) => {
      const c = new THREE.Color(color);
      const hex = (k) => '#' + c.clone().multiplyScalar(k).getHexString();
      if (bat) {
        const gr = g.createLinearGradient(0, 0, s, s); gr.addColorStop(0, hex(1)); gr.addColorStop(1, hex(0.35)); g.fillStyle = gr; g.fillRect(0, 0, s, s);
        g.strokeStyle = 'rgba(0,0,0,.35)'; for (let i = 0; i < 40; i++) { g.lineWidth = 1 + Math.random() * 2; g.beginPath(); g.moveTo(Math.random() * s, 0); g.lineTo(Math.random() * s, s); g.stroke(); }
      } else {
        const gr = g.createLinearGradient(0, 0, 0, s); gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.25, hex(1.1)); gr.addColorStop(1, hex(0.55)); g.fillStyle = gr; g.fillRect(0, 0, s, s);
        g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 2; g.beginPath(); g.moveTo(s / 2, 0); g.lineTo(s / 2, s); g.stroke();
        g.strokeStyle = 'rgba(0,0,0,.18)'; g.lineWidth = 1; for (let y = 6; y < s; y += 7) { g.beginPath(); g.moveTo(s / 2, y); g.lineTo(0, y + 18); g.moveTo(s / 2, y); g.lineTo(s, y + 18); g.stroke(); }
      }
    });
  }
  // Fenrir Dourado (montaria): lobo dourado feito de formas simples, cabeça para +z
  function fenrirModel(red) {
    const g = new THREE.Group();
    const gold = red ? new MSM({ color: 0xc82a20, metalness: 0.35, roughness: 0.45, emissive: 0x4a0604, emissiveIntensity: 0.4 }) : new MSM({ color: 0xe8b84a, metalness: 0.75, roughness: 0.32, emissive: 0x5a3a08, emissiveIntensity: 0.35 });
    const dark = new MSM({ color: red ? 0x7a1410 : 0xa8761a, metalness: red ? 0.3 : 0.6, roughness: 0.45 });
    const light = red ? new MSM({ color: 0xff6a4a, metalness: 0.3, roughness: 0.4, emissive: 0x8a1a10, emissiveIntensity: 0.45 }) : new MSM({ color: 0xffe08a, metalness: 0.5, roughness: 0.35, emissive: 0x8a6a1a, emissiveIntensity: 0.4 });
    const eye = red ? new MSM({ color: 0xffd36b, emissive: 0xffd36b, emissiveIntensity: 2 }) : new MSM({ color: 0xff3a1a, emissive: 0xff3a1a, emissiveIntensity: 2 });
    const box = (w, h, d, m, x, y, z, rx = 0) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.rotation.x = rx; o.castShadow = true; g.add(o); return o; };
    box(0.5, 0.42, 1.05, gold, 0, 0.62, 0);                  // corpo
    box(0.56, 0.5, 0.42, light, 0, 0.7, 0.36);               // peito e juba
    const head = new THREE.Group(); head.position.set(0, 0.92, 0.62); g.add(head);
    const hb = (w, h, d, m, x, y, z) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = true; head.add(o); return o; };
    hb(0.36, 0.32, 0.36, gold, 0, 0, 0); hb(0.22, 0.18, 0.3, light, 0, -0.06, 0.26);
    hb(0.08, 0.16, 0.06, gold, -0.12, 0.22, -0.04); hb(0.08, 0.16, 0.06, gold, 0.12, 0.22, -0.04);
    hb(0.05, 0.05, 0.02, eye, -0.09, 0.05, 0.18); hb(0.05, 0.05, 0.02, eye, 0.09, 0.05, 0.18);
    const tail = new THREE.Group(); tail.position.set(0, 0.74, -0.52); g.add(tail);
    const tm = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.5), light); tm.position.set(0, 0.08, -0.22); tm.rotation.x = -0.5; tail.add(tm);
    const legs = [];
    for (const [x, z] of [[-0.17, 0.36], [0.17, 0.36], [-0.17, -0.36], [0.17, -0.36]]) {
      const hip = new THREE.Group(); hip.position.set(x, 0.5, z); g.add(hip);
      const l = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.5, 0.14), dark); l.position.y = -0.25; l.castShadow = true; hip.add(l);
      const paw = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.06, 0.2), light); paw.position.set(0, -0.48, 0.03); hip.add(paw);
      legs.push(hip);
    }
    g.userData = { legs, head, tail };
    return g;
  }
  function wingModel(base, color) {
    const bat = BAT.test(base || '');
    const g = new THREE.Group();
    const mat = new MSM({ map: wingTex(color, bat), side: THREE.DoubleSide, transparent: true, alphaTest: 0.3, roughness: bat ? 0.6 : 0.5, metalness: 0.1, emissive: new THREE.Color(color), emissiveIntensity: bat ? 0.15 : 0.35, envMap: W3.env(), envMapIntensity: 0.6 });
    const halves = [];
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group(); pivot.position.set(0.08 * side, 0, -0.12); g.add(pivot);
      if (bat) {
        const sh = new THREE.Shape();
        sh.moveTo(0, 0); sh.lineTo(0.35, 0.45); sh.lineTo(1.0, 0.75); sh.lineTo(1.45, 0.5); sh.quadraticCurveTo(1.2, 0.2, 1.3, -0.15); sh.quadraticCurveTo(1.0, -0.05, 0.95, -0.45); sh.quadraticCurveTo(0.7, -0.25, 0.55, -0.6); sh.quadraticCurveTo(0.35, -0.3, 0.12, -0.35); sh.lineTo(0, 0);
        const geo = new THREE.ShapeGeometry(sh, 8); const uv = geo.attributes.uv; const p = geo.attributes.position; for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / 1.45, (p.getY(i) + 0.6) / 1.35);
        const m = new THREE.Mesh(geo, mat); m.scale.x = side; m.castShadow = true; pivot.add(m);
        const bone = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 1.5, 5), new MSM({ color: 0x1a1210, roughness: 0.6 })); bone.rotation.z = -side * 1.15; bone.position.set(0.7 * side, 0.45, 0.01); pivot.add(bone);
      } else {
        const feather = new THREE.Shape(); feather.moveTo(-0.07, 0); feather.quadraticCurveTo(-0.09, 0.5, 0, 0.75); feather.quadraticCurveTo(0.09, 0.5, 0.07, 0); feather.lineTo(-0.07, 0);
        const fgeo = new THREE.ShapeGeometry(feather, 6); const uv = fgeo.attributes.uv; const p = fgeo.attributes.position; for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) + 0.09) / 0.18, p.getY(i) / 0.75);
        for (let row = 0; row < 3; row++) for (let i = 0; i < 8 - row * 2; i++) {
          const f = new THREE.Mesh(fgeo, mat); const q = i / (7 - row * 2 || 1);
          f.position.set(side * (0.15 + q * (1.0 - row * 0.25)), 0.45 + q * 0.35 - row * 0.12, 0.01 * row);
          f.rotation.z = -side * (2.6 - q * 1.8); f.scale.setScalar(1.2 - row * 0.28 + q * 0.4); f.castShadow = row === 0; pivot.add(f);
        }
      }
      halves.push({ pivot, side });
    }
    const glow = W3.glowSprite(new THREE.Color(color), 1.4, 0.35); glow.position.set(0, 0.4, -0.25); g.add(glow);
    g.userData.halves = halves;
    return g;
  }

  // ------------------------------------------------------------------ atores
  const actors = new Map();
  W3._actors = actors;
  const SHADOW_TEX = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(0,0,0,.6)'); gr.addColorStop(0.6, 'rgba(0,0,0,.28)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
  const SHADOW_GEO = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  function tintModel(root, tint, k = 0.55, only) {
    if (!tint) return;
    const c = new THREE.Color(tint);
    root.traverse((o) => { if (!o.isMesh) return; for (const m of [].concat(o.material)) { if (only && !only(m)) continue; if (/Olho|Eye/.test(m.name)) continue; m.color.lerp(c.clone().multiply(m.color.clone().addScalar(0.35)), k); } });
  }
  function setGlow(root, color, k) {
    const c = new THREE.Color(color);
    root.traverse((o) => { if (!o.isMesh) return; for (const m of [].concat(o.material)) { if (/Olho|Eye|Gema|Orbe|Brilho|Fio/.test(m.name)) { m.emissive = c.clone(); m.emissiveIntensity = Math.max(m.emissiveIntensity || 0, k * 2.5); } } });
  }
  function heightOf(o) { const b = new THREE.Box3().setFromObject(o); return Math.max(0.1, b.max.y - b.min.y); }
  function lenOf(o) { const b = new THREE.Box3().setFromObject(o); return Math.max(0.1, b.max.z - b.min.z, b.max.x - b.min.x); }

  class Actor {
    constructor(desc, parent) {
      this.key = desc.key; this.kind = desc.kind;
      this.root = new THREE.Group();
      this.yaw = desc.kind === 'npc' ? 0 : Math.PI * 0; this.tyaw = this.yaw;
      this.shadow = new THREE.Mesh(SHADOW_GEO, new THREE.MeshBasicMaterial({ map: SHADOW_TEX, transparent: true, depthWrite: false }));
      this.shadow.position.y = 0.02; this.shadow.renderOrder = 1; this.root.add(this.shadow);
      this.model = null; this.mixer = null; this.actions = {}; this.cur = null; this.sig = '';
      this.lastAtk = 0; this.lastHit = 0; this.dying = false; this.flash = 0;
      (parent || W3.scene()).add(this.root);
      this.build(desc);
    }
    async build(desc) {
      const sig = this.sigOf(desc); this.sig = sig;
      try {
        if (desc.kind === 'hero') await this.buildHero(desc.cls, desc.eq, desc.set);
        else if (desc.kind === 'mon') await this.buildMon(desc.mtype, desc.tint, desc.golden);
        else await this.buildNpc(desc.npc);
      } catch (e) { if (window.console) console.warn('[3d]', e && e.message); }
    }
    sigOf(d) { return d.kind === 'hero' ? [d.cls, JSON.stringify(d.eq || {})].join('|') : d.kind === 'mon' ? [d.mtype, d.golden || ''].join('|') : d.npc; }
    attach(model, targetH, useLen) {
      if (this.model) this.root.remove(this.model);
      this.model = model;
      const base = useLen ? lenOf(model) : heightOf(model);
      const s = targetH / base;
      model.scale.multiplyScalar(s);
      this.root.add(model);
      this.height = targetH;
      this.shadow.scale.setScalar(Math.max(0.9, targetH * (useLen ? 1.1 : 0.55)));
      this.bones = {};
      model.traverse((o) => { if (o.isBone) this.bones[o.name.replace(PREFIX, '')] = o; });
    }
    async buildHero(cls, eq, setOverride) {
      const def = HERO[cls] || HERO.dark_knight;
      await animP;
      const [src, wsrc] = await Promise.all([lendaModel(def.model), lendaWeapon(def.weapon)]);
      const model = cloneModel(src);
      this.attach(model, 1.85);
      // cor do conjunto vestido (ou a cor da classe)
      const set = setOverride || (eq && (eq.armor || eq.helm || eq.gloves || eq.boots));
      const setCol = set && (SET_COL[set] || (W3.setColors && W3.setColors[set])) || def.base;
      if (setCol) {
        const c = new THREE.Color(setCol);
        model.traverse((o) => { if (!o.isMesh) return; for (const m of [].concat(o.material)) { const k = def.accents[m.name]; if (k) { m.color.copy(c).multiplyScalar(k); if (m.emissive && m.emissiveIntensity > 0.3) m.emissive.copy(c); } } });
      }
      const w = cloneModel(wsrc);
      const hand = this.bones[def.hand === 'esquerda' ? 'LeftHand' : 'RightHand'];
      if (hand) { w.position.fromArray(MAN.encaixe[def.hand]); hand.add(w); }
      this.weapon = w;
      if (eq && eq.wg) setGlow(w, eq.wg, 1);
      // asas / capa
      if (eq && eq.wings && (WING_COL[eq.wings] || /^festive|^wings/.test(eq.wings))) {
        if (/^cape/.test(eq.wings)) {
          tintModel(model, WING_COL[eq.wings], 0.9, (m) => /Capa/.test(m.name));
        } else {
          const color = WING_COL[eq.wings] || (W3.wingColor && W3.wingColor(eq.wings)) || '#ffffff';
          const wings = wingModel(eq.wings, color);
          this.wingColor = color;
          // presas nas costas (no corpo todo, sem herdar o giro dos ossos)
          wings.position.set(0, 1.12, -0.22); wings.scale.setScalar(BAT.test(eq.wings) ? 0.75 : 0.62); this.root.add(wings);
          this.wings = wings;
        }
      }
      // montaria: o Fenrir anda ao lado do herói (sem ficar em cima de nada)
      if (eq && (eq.pet === 'fenrir_gold' || eq.pet === 'fenrir_red')) {
        const wolf = fenrirModel(eq.pet === 'fenrir_red'); wolf.position.set(0.85, 0, -0.35); wolf.scale.setScalar(0.85); this.root.add(wolf); this.fenrir = wolf;
      }
      this.style = def.style; this.atkClips = def.atk; this.lenda = true;
      this.mixer = new THREE.AnimationMixer(model);
      this.play(def.style + '_idle', 0);
      this.mixer.update(Math.random() * 3);
      // brilho, aura e rastro conforme o equipamento real (+nível, Excellent, Ancient, arma e asas)
      if (eq && W3.heroFx) { try { this.fx = W3.heroFx(this, eq, setCol || null); } catch (e) { console.warn('[3d fx]', e && e.message); } }
    }
    async buildMon(type, tintOverride, golden) {
      const d = MON[type] || MON.goblin;
      const tint = golden ? '#ffd84a' : tintOverride && tintOverride[0] === '#' ? tintOverride : d.tint;
      let model;
      if (d.proc === 'slime') { model = slimeModel(tint || '#5ad85a'); this.attach(model, d.h); this.proc = 'slime'; }
      else if (d.proc === 'spider' || d.proc === 'scorpion') { model = spiderModel(tint || '#3a3048', d.proc === 'scorpion'); this.attach(model, d.h); this.proc = d.proc; }
      else if (d.lenda) {
        await animP;
        const [src, wsrc, ssrc] = await Promise.all([lendaModel(d.lenda), lendaWeapon(d.weapon), d.shield ? lendaWeapon(d.shield) : null]);
        model = cloneModel(src); this.attach(model, d.h);
        const w = cloneModel(wsrc); if (this.bones.RightHand) { w.position.fromArray(MAN.encaixe.direita); this.bones.RightHand.add(w); }
        if (ssrc) { const s = cloneModel(ssrc); if (this.bones.LeftHand) { s.position.fromArray(MAN.encaixe.esquerda); this.bones.LeftHand.add(s); } }
        if (tint) tintModel(model, tint, 0.5);
        this.lenda = true; this.style = 'espada'; this.atkClips = ['espada_atk1', 'espada_atk2'];
        this.mixer = new THREE.AnimationMixer(model);
        this.play('espada_idle', 0); this.mixer.update(Math.random() * 3);
      } else {
        const src = await novaModel(d.nova);
        model = cloneModel(src); this.attach(model, d.h, d.len);
        if (tint) tintModel(model, tint, 0.55);
        this.nova = true;
        this.mixer = new THREE.AnimationMixer(model);
        this.clips = {}; for (const c of model.userData.clips || []) this.clips[c.name.toLowerCase()] = c;
        this.play('idle', 0); this.mixer.update(Math.random() * 3);
      }
      if (d.glow || golden) setGlow(model, golden ? '#ffcf3a' : d.glow, 1);
      if (golden) model.traverse((o) => { if (o.isMesh) for (const m of [].concat(o.material)) { m.emissive = new THREE.Color('#5a3a00'); m.emissiveIntensity = 0.6; m.metalness = Math.max(m.metalness, 0.6); m.roughness = Math.min(m.roughness, 0.35); m.envMap = W3.env(); m.envMapIntensity = 1; } });
    }
    async buildNpc(kind) {
      const d = NPC[kind] || NPC.shop;
      if (d.hero) { await this.buildHero(d.hero, null, d.set); return; }
      if (d.proc === 'chest') { this.attach(chestModel(), 1.0); this.proc = 'chest'; return; }
      const src = await novaModel(d.nova);
      const model = cloneModel(src); this.attach(model, d.h || 1.85);
      if (d.tint) tintModel(model, d.tint, 0.6);
      this.nova = true;
      this.mixer = new THREE.AnimationMixer(model);
      this.clips = {}; for (const c of model.userData.clips || []) this.clips[c.name.toLowerCase()] = c;
      this.play('idle', 0); this.mixer.update(Math.random() * 3);
    }
    clip(name) {
      if (this.lenda) return CLIPS[name] || null;
      if (this.nova) {
        const map = { idle: 'idle', walk: 'walk', run: 'run', attack: 'attack', hit: 'hit', death: 'death' };
        return this.clips[map[name] || name] || this.clips.idle || null;
      }
      return null;
    }
    play(name, fade = 0.2, once = false, ts = 1) {
      if (!this.mixer) return;
      const c = this.clip(name);
      if (!c) return;
      let a = this.actions[name];
      if (!a) { a = this.actions[name] = this.mixer.clipAction(c); }
      a.setEffectiveTimeScale(ts);
      if (this.cur === a && !once) return;
      a.reset(); a.enabled = true; a.setEffectiveWeight(1);
      if (once) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; } else a.setLoop(THREE.LoopRepeat, Infinity);
      a.play();
      if (this.cur && this.cur !== a && fade > 0) a.crossFadeFrom(this.cur, fade, false);
      else if (this.cur && this.cur !== a) this.cur.stop();
      this.cur = a; this.curName = name;
    }
    update(d, dt, t) {
      // posição e direção (o servidor manda; aqui só suaviza o giro)
      this.root.position.set(d.x / K, 0, d.y / K);
      const sp = d.speed || 0;
      if (d.kind !== 'npc') {
        if (d.faceX !== undefined && d.faceY !== undefined && (d.act === 'attack')) this.tyaw = Math.atan2(d.faceX - d.x, d.faceY - d.y);
        else if (sp > 10 && (Math.abs(d.vx || 0) + Math.abs(d.vy || 0)) > 4) this.tyaw = Math.atan2(d.vx || 0, d.vy || 0);
        else if (d.act === 'attack' && d.flip !== undefined) this.tyaw = d.flip ? -Math.PI / 2 : Math.PI / 2;
        let dy = this.tyaw - this.yaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
        this.yaw += dy * Math.min(1, dt * 12);
        this.root.rotation.y = this.yaw;
      }
      if (!this.model) return;
      const sc = d.scale || 1;
      this.root.scale.setScalar(sc);
      // animação
      if (this.mixer) {
        if (d.act === 'death') { if (!this.dying) { this.dying = true; this.play(this.lenda ? this.style + '_death' : 'death', 0.15, true); } }
        else {
          this.dying = false;
          if (d.act === 'attack' && d.atkAt && d.atkAt !== this.lastAtk) {
            this.lastAtk = d.atkAt;
            const name = this.lenda ? this.atkClips[(this.atkN = (this.atkN || 0) + 1) % this.atkClips.length] : 'attack';
            const c = this.clip(name); const dur = c ? c.duration : 1;
            const want = Math.max(0.28, (d.atkDur || 600) / 1000 * 1.25);
            this.play(name, 0.08, true, Math.min(3, Math.max(1, dur / want)));
            this.oneUntil = t + Math.min(dur, want);
          } else if (d.act === 'hit' && d.hitAt && d.hitAt !== this.lastHit && !(this.oneUntil > t)) {
            this.lastHit = d.hitAt;
            this.play(this.lenda ? this.style + '_hit' : 'hit', 0.06, true, 1.4);
            this.oneUntil = t + 0.32;
          } else if (!(this.oneUntil > t)) {
            const m = sp / K;
            if (sp > 65) this.play(this.lenda ? this.style + '_run' : 'run', 0.22, false, this.lenda ? Math.max(0.6, Math.min(1.8, m / 3.6)) : Math.max(0.6, Math.min(1.8, m / 3.2)));
            else if (sp > 10) this.play(this.lenda ? this.style + '_walk' : 'walk', 0.22, false, this.lenda ? Math.max(0.6, Math.min(2, m / 1.2)) : Math.max(0.6, Math.min(2, m / 1.3)));
            else this.play(this.lenda ? this.style + '_idle' : 'idle', 0.28);
          }
        }
        this.mixer.update(dt);
      }
      // modelos feitos aqui
      if (this.proc === 'slime') {
        const b = this.model.userData.body, moving = sp > 10;
        const k = moving ? Math.sin(t * 12) : Math.sin(t * 3);
        b.scale.set(1 + k * 0.08, 0.8 - k * (moving ? 0.12 : 0.04), 1 + k * 0.08);
        b.position.y = 0.4 + (moving ? Math.max(0, k) * 0.12 : 0);
        if (d.act === 'death') this.model.scale.multiplyScalar(0.95);
      } else if (this.proc === 'spider' || this.proc === 'scorpion') {
        const moving = sp > 10, ph = t * (sp > 65 ? 22 : 14);
        for (const L of this.model.userData.legs) { const o = (L.k % 2 ? 1 : -1) * (L.side); L.hip.rotation.x = moving ? Math.sin(ph + o) * 0.35 : Math.sin(t * 2 + L.k) * 0.04; }
        if (this.model.userData.tail) this.model.userData.tail.forEach((s, i) => { s.rotation.x = -0.55 - (d.act === 'attack' ? 0.35 * Math.sin(t * 18) : 0.05 * Math.sin(t * 2 + i)); });
        if (d.act === 'attack') this.model.position.z = Math.max(0, Math.sin(t * 14)) * 0.15;
        if (d.act === 'death') { this.model.rotation.z = Math.min(Math.PI, this.model.rotation.z + dt * 6); }
      } else if (this.proc === 'chest') { /* parado */ }
      if (this.fx) this.fx.update(dt, t, d);
      // patas e cauda do Fenrir
      if (this.fenrir) {
        const moving = sp > 10, ph = t * (sp > 65 ? 16 : 11), u = this.fenrir.userData;
        u.legs.forEach((L, i) => { L.rotation.x = moving ? Math.sin(ph + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI / 2 : 0)) * 0.6 : 0; });
        u.tail.rotation.y = Math.sin(t * (moving ? 10 : 3)) * 0.35;
        u.head.position.y = 0.92 + (moving ? Math.abs(Math.sin(ph)) * 0.04 : Math.sin(t * 2) * 0.015);
      }
      // asas abrindo e fechando
      if (this.wings) {
        const moving = sp > 10, f = Math.sin(t * (moving ? 6 : 2.2));
        for (const h of this.wings.userData.halves) { h.pivot.rotation.y = h.side * (0.35 + f * (moving ? 0.35 : 0.18)); h.pivot.rotation.z = h.side * f * 0.06; }
      }
      // clarão branco ao levar golpe
      const fl = d.flash ? 1 : 0;
      if (fl !== this.flash) {
        this.flash = fl;
        this.model.traverse((o) => { if (!o.isMesh) return; for (const m of [].concat(o.material)) { if (fl) { m.userData.e0 = m.userData.e0 || { c: m.emissive ? m.emissive.clone() : null, i: m.emissiveIntensity }; if (m.emissive) { m.emissive.setRGB(1, 1, 1); m.emissiveIntensity = 0.9; } } else if (m.userData.e0) { if (m.emissive && m.userData.e0.c) m.emissive.copy(m.userData.e0.c); m.emissiveIntensity = m.userData.e0.i; m.userData.e0 = null; } } });
      }
      this.root.visible = d.visible !== false;
    }
    dispose() {
      if (this.fx) this.fx.dispose();
      W3.scene() && this.root.parent && this.root.parent.remove(this.root);
      if (this.mixer) this.mixer.stopAllAction();
      this.root.traverse((o) => { if (o.isMesh && o.material) [].concat(o.material).forEach((m) => m.dispose()); });
    }
  }

  // ------------------------------------------------------------------ API para o game.js
  let frameList = [];
  W3.setActors = function (list) { frameList = list; };
  W3.clearActors = function () { for (const a of actors.values()) a.dispose(); actors.clear(); };
  W3.updateActors = function (dt, t) {
    const seen = new Set();
    for (const d of frameList) {
      seen.add(d.key);
      let a = actors.get(d.key);
      const sig = d.kind === 'hero' ? [d.cls, JSON.stringify(d.eq || {})].join('|') : d.kind === 'mon' ? [d.mtype, d.golden || ''].join('|') : d.npc;
      if (a && a.sig !== sig) { a.dispose(); actors.delete(d.key); a = null; }
      if (!a) { a = new Actor(d); actors.set(d.key, a); }
      a.update(d, dt, t);
    }
    for (const [k, a] of actors) if (!seen.has(k)) { a.dispose(); actors.delete(k); }
  };
  // carrega antes os modelos do mapa (para não aparecer vazio ao entrar)
  W3.preload = function (types, heroes) {
    const jobs = [animP];
    for (const t of types || []) { const d = MON[t]; if (!d) continue; if (d.nova) jobs.push(novaModel(d.nova)); if (d.lenda) jobs.push(lendaModel(d.lenda)); }
    for (const c of heroes || []) { const d = HERO[c]; if (d) jobs.push(lendaModel(d.model), lendaWeapon(d.weapon)); }
    return Promise.all(jobs.map((p) => p.catch(() => null)));
  };
  W3.heroHeight = 1.85;

  // ------------------------------------------------------------------ prévia do herói (loja e inspeção de item)
  // Desenha num canto do canvas 3D antes do quadro do mapa e copia para o canvas da janela.
  let pv = null;
  W3.preview = function (canvas2d, desc) {
    if (pv) pv.stop();
    const sc = new THREE.Scene();
    sc.add(new THREE.HemisphereLight(0xbfd0ff, 0x2a2018, 0.9));
    const key = new THREE.DirectionalLight(0xfff0dc, 2.2); key.position.set(2.5, 4, 3.5); sc.add(key);
    const rim = new THREE.DirectionalLight(0x8aa8ff, 1.2); rim.position.set(-3, 2.5, -3); sc.add(rim);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(1.15, 48).rotateX(-Math.PI / 2), new MSM({ color: 0x1a1622, roughness: 0.6, metalness: 0.3 }));
    sc.add(floor);
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.18, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffd36b, transparent: true, opacity: 0.6 })); ring.position.y = 0.01; sc.add(ring);
    const holder = new THREE.Group(); sc.add(holder);
    const cam = new THREE.PerspectiveCamera(30, canvas2d.width / canvas2d.height, 0.1, 40);
    cam.position.set(0, 1.35, 5.2); cam.lookAt(0, 1.05, 0);
    const actor = new Actor({ ...desc, key: 'preview' }, holder);
    const ctx = canvas2d.getContext('2d');
    pv = { sc, cam, holder, actor, canvas2d, ctx, desc, t0: performance.now(), stop() { if (pv === this) pv = null; actor.dispose(); } };
    return () => pv && pv.actor === actor && pv.stop();
  };
  W3.renderPreview = function (renderer, dt, t) {
    if (!pv) return;
    if (!pv.canvas2d.isConnected) { pv.stop(); return; }
    const w = pv.canvas2d.width, h = pv.canvas2d.height;
    pv.holder.rotation.y += dt * 0.7;
    pv.actor.update({ ...pv.desc, x: 0, y: 0, speed: 0, act: 'idle' }, dt, t);
    const pr = renderer.getPixelRatio();
    const vw = w / pr, vh = h / pr;
    pv.cam.aspect = w / h; pv.cam.updateProjectionMatrix();
    renderer.setScissorTest(true); renderer.setScissor(0, 0, vw, vh); renderer.setViewport(0, 0, vw, vh);
    renderer.setClearColor(0x0a0c18, 1); renderer.clear();
    renderer.render(pv.sc, pv.cam);
    const gl = renderer.domElement;
    pv.ctx.clearRect(0, 0, w, h);
    pv.ctx.drawImage(gl, 0, gl.height - h, w, h, 0, 0, w, h);
    renderer.setScissorTest(false);
    const size = renderer.getSize(new THREE.Vector2()); renderer.setViewport(0, 0, size.x, size.y);
    renderer.setClearColor(0x000000, 1);
  };
})();
