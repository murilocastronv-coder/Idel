// MuonlineClaude — brilho, auras e efeitos do equipamento (só no gráfico 3D).
// Lê o equipamento real do herói (nível médio do conjunto, Excellent, Ancient, arma e asas) e monta:
//  • armadura metálica PBR com reflexo do ambiente, borda brilhante (fresnel) e faixa de energia percorrendo o corpo
//  • aura animada (dourada, azul elétrica, vermelha de chamas ou roxa mística) com partículas em pool
//  • arma com fio luminoso, faísca na ponta e rastro de luz nos golpes
//  • asas com borda e energia correndo, e penas de luz caindo
// Não muda modelos, animações nem regras: é só material e partículas por cima do herói.
(function () {
  'use strict';
  const W3 = window.World3D;
  if (!W3 || !window.THREE) return;
  const QP = { baixa: 0, media: 0.5, alta: 1, ultra: 1.5 }; // quantidade de partículas por qualidade
  const qk = () => QP[W3.qname || 'media'] ?? 0.5;

  // ------------------------------------------------------------ texturas
  let SOFT = null, RUNE = null, RING = null;
  function soft() {
    if (SOFT) return SOFT;
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return (SOFT = new THREE.CanvasTexture(c));
  }
  function ringTex() {
    if (RING) return RING;
    const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
    const gr = g.createRadialGradient(128, 128, 40, 128, 128, 126);
    gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.62, 'rgba(255,255,255,.08)'); gr.addColorStop(0.82, 'rgba(255,255,255,.75)'); gr.addColorStop(0.9, 'rgba(255,255,255,.25)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
    g.strokeStyle = 'rgba(255,255,255,.5)'; g.lineWidth = 2;
    for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2; g.beginPath(); g.moveTo(128 + Math.cos(a) * 92, 128 + Math.sin(a) * 92); g.lineTo(128 + Math.cos(a) * 102, 128 + Math.sin(a) * 102); g.stroke(); }
    return (RING = new THREE.CanvasTexture(c));
  }
  // círculo de símbolos mágicos (conjunto Ancient)
  function runeTex() {
    if (RUNE) return RUNE;
    const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
    g.translate(128, 128); g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 3;
    for (const r of [118, 96]) { g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.stroke(); }
    g.lineWidth = 2;
    for (let k = 0; k < 2; k++) { g.beginPath(); for (let i = 0; i <= 3; i++) { const a = -Math.PI / 2 + k * Math.PI / 3 + i * Math.PI * 2 / 3; const x = Math.cos(a) * 96, y = Math.sin(a) * 96; if (i) g.lineTo(x, y); else g.moveTo(x, y); } g.stroke(); }
    g.font = 'bold 15px serif'; g.fillStyle = 'rgba(255,255,255,.95)'; g.textAlign = 'center'; g.textBaseline = 'middle';
    const glyphs = 'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗ';
    for (let i = 0; i < 20; i++) { const a = i / 20 * Math.PI * 2; g.save(); g.rotate(a); g.fillText(glyphs[i], 0, -107); g.restore(); }
    return (RUNE = new THREE.CanvasTexture(c));
  }

  // ------------------------------------------------------------ material: fresnel + faixa de energia
  function glowify(mat, U) {
    if (!mat || mat.userData.fxGlow) return;
    mat.userData.fxGlow = true;
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uFxT = U.t; sh.uniforms.uFxCol = U.col; sh.uniforms.uFxRim = U.rim; sh.uniforms.uFxSweep = U.sweep; sh.uniforms.uFxPulse = U.pulse;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vFxY;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvFxY = (modelMatrix * vec4(transformed, 1.0)).y;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uFxT; uniform vec3 uFxCol; uniform float uFxRim; uniform float uFxSweep; uniform float uFxPulse; varying float vFxY;')
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          float fxF = pow(1.0 - clamp(abs(dot(normalize(normal), normalize(vViewPosition))), 0.0, 1.0), 2.6);
          float fxB = 1.0 - smoothstep(0.0, 0.09, abs(fract(vFxY * 0.5 - uFxT * 0.4) - 0.5));
          float fxP = 1.0 + uFxPulse * 0.4 * sin(uFxT * 4.2);
          totalEmissiveRadiance += uFxCol * (fxF * uFxRim * fxP + fxB * uFxSweep * (0.5 + 0.5 * fxF));`);
    };
    mat.customProgramCacheKey = () => 'mu-fx-glow';
    mat.needsUpdate = true;
  }

  // ------------------------------------------------------------ partículas em pool (um Points por efeito)
  function makePoints(n, color, size, additive = true) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    const mat = new THREE.PointsMaterial({ map: soft(), color: new THREE.Color(color), size, sizeAttenuation: true, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, opacity: 0.9 });
    const pts = new THREE.Points(geo, mat); pts.frustumCulled = false;
    const st = []; for (let i = 0; i < n; i++) st.push({ a: Math.random() * 6.28, r: 0, y: Math.random() * 2, v: 0, life: Math.random() });
    return { pts, st, n };
  }

  // tipo de aura a partir da cor do conjunto vestido
  function auraKind(hex, anc) {
    const c = new THREE.Color(hex || '#ffd36b'); const hsl = {}; c.getHSL(hsl);
    if (anc) return 'ancient';
    if (hsl.s < 0.2) return 'gold';
    const h = hsl.h * 360;
    if (h < 25 || h >= 330) return 'red';
    if (h < 70) return 'gold';
    if (h < 170) return 'gold';
    if (h < 250) return 'blue';
    return 'purple';
  }
  const AURA = {
    gold: { col: '#ffcf5a', p2: '#fff3b0', rise: 0.45 },
    blue: { col: '#5ac8ff', p2: '#e0f6ff', rise: 0.6 },
    red: { col: '#ff5a1a', p2: '#ffb04a', rise: 0.9 },
    purple: { col: '#b060ff', p2: '#ff8ae8', rise: 0.3 },
    ancient: { col: '#4affc8', p2: '#ffd36b', rise: 0.5 },
  };
  // efeito por nível médio do conjunto (+0 a +15)
  function tier(lv) {
    return {
      metal: lv <= 3 ? 0.15 : 0.3,
      rim: [0, 0, 0, 0.12, 0.25, 0.3, 0.35, 0.5, 0.55, 0.7, 0.8, 0.85, 1, 1.05, 1.2, 1.5][lv] || 0,
      sweep: lv >= 15 ? 1.4 : lv >= 12 ? 0.9 : lv >= 10 ? 0.6 : 0,
      pulse: lv >= 12 ? 1 : 0,
      aura: lv >= 7 ? Math.min(1, 0.35 + (lv - 7) * 0.09) : 0,
      parts: lv >= 15 ? 46 : lv >= 14 ? 36 : lv >= 12 ? 26 : lv >= 9 ? 16 : lv >= 7 ? 8 : 0,
    };
  }

  // ------------------------------------------------------------ efeitos de um herói
  W3.heroFx = function (actor, eq, setColor) {
    eq = eq || {};
    const lv = Math.max(0, Math.min(15, eq.ap || 0)), wl = Math.max(0, Math.min(15, eq.wp || 0));
    const T = tier(lv);
    const kind = auraKind(setColor, eq.anc);
    const A = AURA[kind];
    const qm = qk();
    const env = W3.env && W3.env();
    const U = { t: { value: 0 }, col: { value: new THREE.Color(eq.anc ? A.col : setColor || A.col) }, rim: { value: T.rim }, sweep: { value: qm ? T.sweep : 0 }, pulse: { value: T.pulse } };
    const fx = { U, parts: [], extra: [], t0: 0 };
    // armadura: metal com reflexo + brilho nas bordas
    actor.model.traverse((o) => {
      if (!o.isMesh || (actor.weapon && isChild(o, actor.weapon)) || (actor.wings && isChild(o, actor.wings))) return;
      for (const m of [].concat(o.material)) {
        if (!m.isMeshStandardMaterial || /Pele|Olho|Labio|Cabelo/.test(m.name)) continue;
        if (env) { m.envMap = env; m.envMapIntensity = 0.55 + T.metal + lv * 0.03; }
        m.metalness = Math.min(0.95, Math.max(m.metalness, 0.35 + T.metal + (/Ouro|Gold|Brilho|Prata/.test(m.name) ? 0.35 : 0)));
        m.roughness = Math.max(0.18, Math.min(m.roughness, 0.55 - lv * 0.02));
        if (T.rim > 0 || T.sweep > 0) glowify(m, U);
      }
    });
    const root = actor.root;
    // aura no chão (anel girando; símbolos mágicos no Ancient)
    if (T.aura > 0 || eq.anc) {
      const ring = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.9).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: eq.anc ? runeTex() : ringTex(), color: new THREE.Color(A.col), transparent: true, opacity: 0.55 * Math.max(T.aura, eq.anc ? 0.8 : 0), blending: THREE.AdditiveBlending, depthWrite: false }));
      ring.position.y = 0.03; ring.renderOrder = 2; root.add(ring); fx.ring = ring;
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: soft(), color: new THREE.Color(A.col), transparent: true, opacity: 0.32 * Math.max(T.aura, 0.5), blending: THREE.AdditiveBlending, depthWrite: false }));
      glow.scale.set(1.6, 2.4, 1); glow.position.y = 1.0; root.add(glow); fx.glow = glow;
    }
    // partículas subindo pelo corpo
    const n = Math.round((T.parts + (eq.anc ? 18 : 0)) * qm);
    if (n > 0) { const p = makePoints(n, A.col, kind === 'red' ? 0.11 : 0.08); root.add(p.pts); fx.parts.push({ ...p, kind, rise: A.rise }); }
    // Excellent: brilhinhos verdes/dourados piscando nos detalhes
    const nx = Math.round((eq.ax || 0) * 4 * qm);
    if (nx > 0) { const p = makePoints(nx, '#9affb0', 0.06); root.add(p.pts); fx.parts.push({ ...p, kind: 'twinkle', rise: 0 }); }
    // raios azuis (aura elétrica)
    if (kind === 'blue' && lv >= 9 && qm) {
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(10 * 2 * 3), 3));
      const lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xbfeaff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
      lines.frustumCulled = false; root.add(lines); fx.bolts = lines; fx.boltT = 0;
    }
    // arma: fio luminoso por nível, faísca na ponta e rastro nos golpes
    if (actor.weapon) {
      const wcol = new THREE.Color(eq.wg || (eq.we ? '#7aff9a' : wl >= 7 ? '#7ad0ff' : A.col));
      const wk = wl >= 15 ? 3.2 : wl >= 13 ? 2.4 : wl >= 10 ? 1.8 : wl >= 9 ? 1.4 : wl >= 7 ? 1.0 : wl >= 4 ? 0.6 : 0.25;
      actor.weapon.traverse((o) => { if (!o.isMesh) return; for (const m of [].concat(o.material)) {
        if (env) { m.envMap = env; m.envMapIntensity = 0.9; }
        if (/Fio|Brilho|Orbe|Gema|Rubi|Safira|Esmeralda|Ametista|Lamina/.test(m.name)) { m.emissive = wcol.clone(); m.emissiveIntensity = Math.max(m.emissiveIntensity || 0, wk * (/Lamina_(Negra|Velha)/.test(m.name) ? 0.25 : 1)); }
      } });
      fx.tipBase = actor.weapon.getObjectByName('rastroBase'); fx.tip = actor.weapon.getObjectByName('rastroPonta') || actor.weapon.getObjectByName('orbe');
      if (fx.tip && (wl >= 9 || eq.we)) {
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: soft(), color: wcol, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
        sp.scale.setScalar(wl >= 15 ? 0.55 : 0.35); W3.scene() && actor.root.parent && actor.root.parent.add(sp); fx.tipSprite = sp;
      }
      if (fx.tipBase && fx.tip) {
        const N = 14, geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 2 * 3), 3));
        const al = new Float32Array(N * 2); for (let i = 0; i < N; i++) { al[i * 2] = al[i * 2 + 1] = 1 - i / (N - 1); }
        geo.setAttribute('alpha', new THREE.BufferAttribute(al, 1));
        const idx = []; for (let i = 0; i < N - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } geo.setIndex(idx);
        const mat = new THREE.ShaderMaterial({ uniforms: { uCol: { value: wcol }, uOp: { value: 0 } }, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
          vertexShader: 'attribute float alpha; varying float vA; void main(){ vA = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
          fragmentShader: 'uniform vec3 uCol; uniform float uOp; varying float vA; void main(){ gl_FragColor = vec4(uCol * 1.6, vA * vA * uOp); }' });
        const trail = new THREE.Mesh(geo, mat); trail.frustumCulled = false; trail.visible = false;
        fx.trail = trail; fx.trailN = N; fx.trailPts = []; fx.trailK = Math.min(1, 0.45 + wl * 0.04 + (eq.we ? 0.15 : 0));
        fx.trailParent = () => actor.root.parent;
      }
    }
    // asas: borda e energia correndo + penas de luz caindo
    if (actor.wings) {
      const wp = eq.wingPlus || 0, rare = ['epic', 'legendary', 'ancestral'].includes(eq.wingRarity);
      const UW = { t: U.t, col: { value: new THREE.Color(actor.wingColor || A.col) }, rim: { value: 0.6 + wp * 0.05 }, sweep: { value: qm ? (wp >= 9 || rare ? 0.9 : 0.4) : 0 }, pulse: { value: rare ? 1 : 0 } };
      actor.wings.traverse((o) => { if (o.isMesh) for (const m of [].concat(o.material)) if (m.isMeshStandardMaterial) glowify(m, UW); });
      const nw = Math.round((rare ? 14 : 6) * qm);
      if (nw > 0) { const p = makePoints(nw, UW.col.value.getStyle(), 0.07); root.add(p.pts); fx.parts.push({ ...p, kind: 'wing', rise: -0.35 }); }
    }
    fx.update = (dt, t, d) => updateFx(fx, actor, dt, t, d);
    fx.dispose = () => {
      for (const o of [fx.tipSprite, fx.trail]) if (o && o.parent) { o.parent.remove(o); o.material.dispose(); o.geometry && o.geometry.dispose(); }
    };
    return fx;
  };
  function isChild(o, root) { for (let x = o; x; x = x.parent) if (x === root) return true; return false; }

  const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3();
  function updateFx(fx, actor, dt, t, d) {
    fx.U.t.value = t;
    if (fx.ring) { fx.ring.rotation.y += dt * (fx.ring.material.map === RUNE ? 0.6 : 0.9); const k = 0.85 + 0.15 * Math.sin(t * 3); fx.ring.scale.setScalar(k); }
    if (fx.glow) fx.glow.material.opacity = (fx.glow.userData.o || (fx.glow.userData.o = fx.glow.material.opacity)) * (0.75 + 0.25 * Math.sin(t * 2.6));
    for (const P of fx.parts) {
      const pos = P.pts.geometry.attributes.position;
      for (let i = 0; i < P.n; i++) {
        const s = P.st[i];
        s.life += dt * (P.kind === 'twinkle' ? 1.3 : 0.45);
        if (s.life >= 1 || !s.r) {
          s.life = s.life >= 1 ? 0 : s.life; s.a = Math.random() * 6.28;
          s.r = P.kind === 'wing' ? 0.3 + Math.random() * 0.9 : P.kind === 'twinkle' ? 0.15 + Math.random() * 0.3 : 0.3 + Math.random() * 0.25;
          s.y0 = P.kind === 'wing' ? 1.4 + Math.random() * 0.6 : P.kind === 'twinkle' ? 0.3 + Math.random() * 1.4 : Math.random() * 0.4;
        }
        let x, y, z;
        if (P.kind === 'twinkle') { x = Math.cos(s.a) * s.r; z = Math.sin(s.a) * s.r; y = s.y0; }
        else if (P.kind === 'wing') { x = Math.cos(s.a) * s.r; z = -0.3 + Math.sin(s.a) * 0.2; y = s.y0 + P.rise * s.life * 2; }
        else {
          const sw = P.kind === 'purple' ? Math.sin(t * 1.5 + i) * 0.12 : P.kind === 'red' ? Math.sin(t * 6 + i) * 0.04 : 0;
          const ang = s.a + (P.kind === 'gold' ? s.life * 2.2 : P.kind === 'ancient' ? s.life * 3 : 0);
          x = Math.cos(ang) * (s.r + sw); z = Math.sin(ang) * (s.r + sw); y = s.y0 + s.life * (1.4 + P.rise);
        }
        pos.setXYZ(i, x, y, z);
      }
      pos.needsUpdate = true;
      P.pts.material.opacity = P.kind === 'twinkle' ? 0.6 + 0.4 * Math.sin(t * 9) : 0.85;
    }
    // raios elétricos (refaz a cada ~90 ms)
    if (fx.bolts) {
      fx.boltT -= dt;
      if (fx.boltT <= 0) {
        fx.boltT = 0.09;
        const p = fx.bolts.geometry.attributes.position;
        for (let i = 0; i < 10; i++) {
          const a = Math.random() * 6.28, r = 0.35 + Math.random() * 0.2, y = 0.2 + Math.random() * 1.6;
          p.setXYZ(i * 2, Math.cos(a) * r, y, Math.sin(a) * r);
          p.setXYZ(i * 2 + 1, Math.cos(a + 0.4) * (r + 0.1), y + (Math.random() - 0.5) * 0.35, Math.sin(a + 0.4) * (r + 0.1));
        }
        p.needsUpdate = true;
        fx.bolts.material.opacity = Math.random() < 0.35 ? 0 : 0.85;
      }
    }
    // faísca na ponta da arma
    if (fx.tipSprite && fx.tip) { fx.tip.getWorldPosition(tmpA); fx.tipSprite.position.copy(tmpA); fx.tipSprite.material.opacity = 0.6 + 0.3 * Math.sin(t * 10); }
    // rastro de luz durante o golpe
    if (fx.trail) {
      const par = fx.trailParent();
      if (par && fx.trail.parent !== par) par.add(fx.trail);
      const attacking = d && d.act === 'attack';
      fx.tipBase.getWorldPosition(tmpA); fx.tip.getWorldPosition(tmpB);
      fx.trailPts.unshift([tmpA.clone(), tmpB.clone()]); if (fx.trailPts.length > fx.trailN) fx.trailPts.pop();
      const op = fx.trail.material.uniforms.uOp;
      op.value = attacking ? Math.min(fx.trailK, op.value + dt * 8) : Math.max(0, op.value - dt * 4);
      fx.trail.visible = op.value > 0.01 && fx.trailPts.length > 2;
      if (fx.trail.visible) {
        const p = fx.trail.geometry.attributes.position;
        for (let i = 0; i < fx.trailN; i++) { const q = fx.trailPts[Math.min(i, fx.trailPts.length - 1)]; p.setXYZ(i * 2, q[0].x, q[0].y, q[0].z); p.setXYZ(i * 2 + 1, q[1].x, q[1].y, q[1].z); }
        p.needsUpdate = true;
      }
    }
  }
})();
