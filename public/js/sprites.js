// MuonlineClaude — carregador de sprites em alta resolução (folhas PNG + manifest.json)
'use strict';
(function () {
  const BASE = '/assets/sprites/';
  const HAIR = ['#5a3a1c', '#d8d8e8', '#f2d36b', '#c43a2a', '#1a1a1a', '#7a3fb8', '#ff6ab8'];
  const SKIN = ['#f0c49a', '#d9a066', '#a8693f', '#6b4226'];
  const S = { manifest: null, imgs: {}, cache: new Map() };

  const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const mix = (c, t, f) => c.map((v, i) => Math.round(v + (t[i] - v) * f));
  // mesmas regras do gerador (tools/sprites/pixelkit.py)
  // mesmas 5 cores do gerador: realce, base, sombra, meio-escuro, meio-claro
  const ramp = (base) => {
    const b = hex(base), h = mix(b, [255, 250, 230], 0.38), sh = mix(b, [18, 10, 40], 0.45);
    const md = b.map((v, i) => Math.floor(v * 0.6 + sh[i] * 0.4)), ml = b.map((v, i) => Math.floor(v * 0.6 + h[i] * 0.4));
    return [h, b, sh, md, ml];
  };

  function loadImg(src) {
    return new Promise((ok, fail) => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => fail(new Error('sprite ' + src)); im.src = src; });
  }

  const ready = (async () => {
    const r = await fetch(BASE + 'manifest.json?v=' + Date.now().toString(36).slice(0, 5), { cache: 'no-cache' });
    S.manifest = await r.json();
    const all = [];
    for (const group of ['heroes', 'monsters', 'effects', 'mounts']) {
      for (const [name, m] of Object.entries(S.manifest[group] || {})) {
        all.push(loadImg(BASE + m.sheet + '?v=' + S.manifest.version).then((im) => { S.imgs[group + ':' + name] = im; }));
      }
    }
    await Promise.all(all);
    return S.manifest;
  })();

  // Folha com cabelo/pele trocados, e versão branca (piscada de dano)
  function sheet(group, name, ap, white) {
    return recolored(group + ':' + name, S.imgs[group + ':' + name], S.manifest[group][name], group === 'heroes', ap, white);
  }
  function recolored(imgKey, im, meta, isHero, ap, white) {
    const key = `${imgKey}:${ap ? ap.hair : '-'}:${ap ? ap.skin : '-'}:${white ? 1 : 0}`;
    let c = S.cache.get(key);
    if (c) return c;
    if (!im) return null;
    const recolor = isHero && ap && (ap.hair !== undefined || ap.skin !== undefined);
    if (!recolor && !white) { S.cache.set(key, im); return im; }
    c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
    const g = c.getContext('2d');
    g.drawImage(im, 0, 0);
    const data = g.getImageData(0, 0, c.width, c.height);
    const d = data.data;
    const map = new Map();
    if (recolor) {
      if (meta.hairKeys && ap.hair !== undefined && HAIR[ap.hair]) {
        const to = ramp(HAIR[ap.hair]);
        meta.hairKeys.forEach((k, i) => map.set(k.join(','), to[i]));
      }
      if (ap.skin !== undefined && SKIN[ap.skin]) {
        const to = ramp(SKIN[ap.skin]);
        S.manifest.skinKeys.forEach((k, i) => map.set(k.join(','), to[i]));
      }
    }
    for (let i = 0; i < d.length; i += 4) {
      if (!d[i + 3]) continue;
      if (white) { if (d[i + 3] > 200) { d[i] = 255; d[i + 1] = 255; d[i + 2] = 255; } continue; }
      const to = map.get(d[i] + ',' + d[i + 1] + ',' + d[i + 2]);
      if (to) { d[i] = to[0]; d[i + 1] = to[1]; d[i + 2] = to[2]; }
    }
    g.putImageData(data, 0, 0);
    S.cache.set(key, c);
    return c;
  }

  function frameOf(meta, action, t, once) {
    // A corrida reutiliza os frames desenhados de caminhada numa cadência maior,
    // evitando sprites repetidos e mantendo compatíveis os equipamentos em camadas.
    let a = meta.actions[action];
    if (!a && action === 'run' && meta.actions.walk) a = { ...meta.actions.walk, fps: Math.max(12, meta.actions.walk.fps || 0) };
    a = a || meta.actions.idle;
    const n = a.frames;
    let f = Math.floor((t / 1000) * a.fps);
    f = once ? Math.min(n - 1, f) : ((f % n) + n) % n;
    return [a.row, f];
  }

  // monstro com cor própria: mantém o sombreado (modo "color") e escurece cores escuras
  function tinted(group, name, color) {
    const key = `${group}:${name}:tint:${color}`;
    let c = S.cache.get(key);
    if (c) return c;
    const im = S.imgs[group + ':' + name];
    if (!im) return null;
    c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
    const g = c.getContext('2d');
    g.drawImage(im, 0, 0);
    g.globalCompositeOperation = 'color';
    g.fillStyle = color; g.fillRect(0, 0, c.width, c.height);
    const [r, gg, b] = hex(color);
    const lum = (0.299 * r + 0.587 * gg + 0.114 * b) / 255;
    if (lum < 0.35) { g.globalCompositeOperation = 'multiply'; g.globalAlpha = 0.55; g.fillRect(0, 0, c.width, c.height); g.globalAlpha = 1; }
    if (lum > 0.85) { g.globalCompositeOperation = 'screen'; g.globalAlpha = 0.35; g.fillRect(0, 0, c.width, c.height); g.globalAlpha = 1; }
    g.globalCompositeOperation = 'destination-in';
    g.drawImage(im, 0, 0);
    S.cache.set(key, c);
    return c;
  }

  function draw(ctx, group, name, ap, action, t, x, y, scale, flip, opts = {}) {
    if (!S.manifest) return false;
    const meta = S.manifest[group][name];
    if (!meta) return false;
    const img = opts.tint && !opts.white ? tinted(group, name, opts.tint) : sheet(group, name, ap, opts.white);
    if (!img) return false;
    const [row, f] = frameOf(meta, action, t, opts.once);
    const sc = scale * (opts.useScale && meta.scale ? meta.scale : 1);
    const px = meta.pivot[0] * sc, py = meta.pivot[1] * sc;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.translate(Math.round(x), Math.round(y));
    if (flip) ctx.scale(-1, 1);
    if (opts.alpha !== undefined) ctx.globalAlpha = opts.alpha;
    ctx.drawImage(img, f * meta.fw, row * meta.fh, meta.fw, meta.fh, -Math.round(px), -Math.round(py), Math.round(meta.fw * sc), Math.round(meta.fh * sc));
    ctx.restore();
    return true;
  }

  // ---------- equipamento visível (camadas carregadas sob demanda) ----------
  const lazy = new Map();
  function lazyEntry(path) {
    let e = lazy.get(path);
    if (!e) {
      e = { im: null };
      lazy.set(path, e);
      e.p = loadImg(BASE + path + '?v=' + S.manifest.version).then((im) => { e.im = im; return im; }).catch(() => null);
    }
    return e;
  }
  function img(path) { return lazyEntry(path).im; }
  // todas as folhas que um herói equipado precisa (corpo em camadas, conjuntos, arma e asa/capa)
  const WING_VARIANT = { wings_life: 'wings_elf', wings_dragon_l1: 'wings_satan', wings_spirit_l1: 'wings_heaven' };
  // conjuntos de Natal (loja premium): cada tom tem a sua camada no herói; asas e armas usam as mais parecidas
  const FEST_WINGS = ['wings_dragon', 'wings_despair', 'wings_curse', 'wings_heaven', 'wings_darkness'];
  // asas desenhadas à mão (uma imagem de frente, as duas asas): famílias com níveis 1 a 5
  const NEW_WINGS = { wings_satan: 'demoniaca_2', wings_dragon: 'draconica_4', wings_heaven: 'angelical_2', wings_soul: 'angelical_4',
    wings_elf: 'elemental_1', wings_spirit: 'dourada', wings_life: 'elemental_2', wings_curse: 'sombria_2', wings_despair: 'sombria_4',
    wings_darkness: 'draconica_5', wings_dragon_l1: 'draconica_1', wings_spirit_l1: 'angelical_1' };
  // loja de cash: família pela cor do pacote (vermelho, azul, verde, dourado, roxo) e nível pela série (I a V; VI usa o 5)
  const FEST_FAMILY = ['demoniaca', 'cristalina', 'elemental', 'angelical', 'sombria'];
  const newWingPath = (k) => {
    if (!k || /^cape_/.test(k)) return null;
    const fm = /^festive_(\d+)_wings$/.exec(k);
    const name = fm ? FEST_FAMILY[(Number(fm[1]) - 1) % 5] + '_' + Math.min(5, Math.floor((Number(fm[1]) - 1) / 5) + 1) : NEW_WINGS[k] || 'angelical_3';
    return 'wings_new/' + name + '.png';
  };
  const FEST_WEAPON = { sword: 'phoenix_sword', bow: 'phoenix_bow', shield: null };
  function normEq(eq) {
    if (!eq) return eq;
    let out = null;
    const set = (k, v) => { if (!out) out = { ...eq }; out[k] = v; };
    for (const k of ['helm', 'armor', 'gloves', 'boots']) { const m = /^festive_(\d+)$/.exec(eq[k] || ''); if (m) set(k, 'fest' + ((Number(m[1]) - 1) % 5)); }
    // asas dos pacotes premium mantêm o nome: newWingPath escolhe o desenho pelo número do pacote
    const am = /^festive_\d+_(sword|bow)$/.exec(eq.w || ''); if (am) set('w', FEST_WEAPON[am[1]]);
    return out || eq;
  }
  function equipPaths(cls, eq) {
    eq = normEq(eq);
    const out = [];
    const m = S.manifest; if (!m || !m.equip) return out;
    const meta = m.heroes[cls]; if (!meta || (!meta.layers && !meta.full)) return out;
    eq = eq || {};
    // herói com arte completa (meta.full): armadura e arma já fazem parte do desenho, só asas/capas por cima
    if (!meta.full) {
      out.push(meta.layers.back, meta.layers.front);
      for (const k of ARMOR) { const set = eq[k]; const path = set && m.equip.classes[cls] && m.equip.classes[cls][set]; if (path) out.push(path); }
      const W = m.weapons.classes[cls]; if (W && W.sheet) out.push(W.sheet);
    }
    const WG = m.wings;
    if (meta.full) { const lp = lookPath(meta, eq); if (lp) out.push(lp); }
    if (meta.full && eq.wings && newWingPath(eq.wings)) out.push(newWingPath(eq.wings));
    else if (WG && eq.wings) {
      const key = WG.sheets[eq.wings] ? eq.wings : WING_VARIANT[eq.wings] || 'wings_dragon';
      if (WG.sheets[key]) out.push(WG.sheets[key]);
      const over = WG.over && (WG.over[eq.wings] || WG.over[key]); if (over) out.push(over);
    }
    return [...new Set(out)];
  }
  // carrega antes de mostrar: resolve quando todas as folhas estiverem prontas (ou depois de ms, para nunca travar)
  async function preloadEquip(cls, eq, ms = 4000) {
    await ready;
    const ps = equipPaths(cls, eq).map((p) => lazyEntry(p).p);
    await Promise.race([Promise.all(ps), new Promise((r) => setTimeout(r, ms))]);
  }
  const equipReady = (cls, eq) => equipPaths(cls, eq).every((p) => !!img(p));
  // em segundo plano: todas as folhas de equipamento de uma classe (trocar de conjunto fica instantâneo)
  async function preloadClass(cls) {
    await ready;
    const m = S.manifest; if (!m || !m.equip || !m.equip.classes[cls]) return;
    for (const path of Object.values(m.equip.classes[cls])) { await lazyEntry(path).p; }
  }
  const ARMOR = ['helm', 'armor', 'gloves', 'boots'];
  // herói de arte completa: o conjunto equipado aparece como a versão tingida do herói (manifest heroes[cls].looks)
  // loja de cash: todos os pacotes são o conjunto Dragão de Gelo (herói azul-gelo)
  const SET_LOOK = { fest0: 'ice', fest1: 'ice', fest2: 'ice', fest3: 'ice', fest4: 'ice',
    leather: 'steel', bronze: 'steel', scale: 'emerald', dragon: 'emerald', storm: 'solar', phoenix: 'solar', abyss: 'astral' };
  const lookPath = (meta, eq) => {
    if (!meta || !meta.looks || !eq) return null;
    const set = eq.armor || eq.helm || eq.pants || eq.gloves || eq.boots;
    const look = set && SET_LOOK[set];
    return look ? meta.looks[look] || null : null;
  };
  // eq: { w: base da arma, wg: cor do brilho da arma, helm/armor/gloves/boots: conjunto }
  function heroEquip(ctx, cls, ap, action, t, x, y, scale, flip, opts = {}, eq = {}) {
    eq = normEq(eq) || {};
    if (!S.manifest || !S.manifest.equip) return draw(ctx, 'heroes', cls, ap, action, t, x, y, scale, flip, opts);
    const meta = S.manifest.heroes[cls];
    if (!meta || (!meta.layers && !meta.full)) return draw(ctx, 'heroes', cls, ap, action, t, x, y, scale, flip, opts);
    const full = !!meta.full;
    const lp = full && lookPath(meta, eq), lookIm = lp && img(lp);
    const back = full ? (lookIm ? recolored('L:' + lp, lookIm, meta, true, ap, opts.white) : sheet('heroes', cls, ap, opts.white)) : recolored('L:' + meta.layers.back, img(meta.layers.back), meta, true, ap, opts.white);
    const front = full ? back : recolored('L:' + meta.layers.front, img(meta.layers.front), meta, true, ap, opts.white);
    if (!back || !front) return draw(ctx, 'heroes', cls, ap, action, t, x, y, scale, flip, opts); // ainda carregando
    const E = S.manifest.equip, W = S.manifest.weapons.classes[cls];
    const [row, f] = frameOf(meta, action, t, opts.once);
    const fw = meta.fw, fh = meta.fh, rp = E.rowsPerPiece;
    const px = meta.pivot[0] * scale, py = meta.pivot[1] * scale, dw = Math.round(fw * scale), dh = Math.round(fh * scale);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.translate(Math.round(x), Math.round(y));
    if (flip) ctx.scale(-1, 1);
    if (opts.alpha !== undefined) ctx.globalAlpha = opts.alpha;
    const blit = (im, block) => { if (im) ctx.drawImage(im, f * fw, (block * rp + row) * fh, fw, fh, -Math.round(px), -Math.round(py), dw, dh); };
    const piece = (name) => {
      const set = eq[name.split('_')[0]];
      const path = set && E.classes[cls] && E.classes[cls][set];
      if (path) blit(opts.white ? recolored('L:' + path, img(path), meta, false, null, true) : img(path), E.pieces.indexOf(name));
    };
    // asas/capa: folha própria (quadro maior), um bloco por classe; nível 2 brilha
    const WG = S.manifest.wings, wk = eq.wings, wblk = WG && wk ? Math.max(0, WG.classes.indexOf(cls)) : -1;
    const wing = (path, glow) => {
      if (!path || wblk < 0) return;
      const im = opts.white ? recolored('L:' + path, img(path), meta, false, null, true) : img(path);
      if (!im) return;
      const sx = f * WG.fw, sy = (wblk * WG.rowsPerClass + row) * WG.fh;
      const w = Math.round(WG.fw * scale), h = Math.round(WG.fh * scale);
      const flap = Math.sin((Number(t) || 0) / 520);
      const spread = 0.97 + (flap + 1) * 0.015;
      const bob = Math.round(flap * 1.5 * scale);
      const cx = -Math.round(WG.pivot[0] * scale) + w / 2;
      const cy = -Math.round(WG.pivot[1] * scale) + h / 2 + bob;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(spread, 1);
      if (glow && !opts.white) { ctx.shadowColor = glow; ctx.shadowBlur = 7 * scale; }
      ctx.drawImage(im, sx, sy, WG.fw, WG.fh, -w / 2, -h / 2, w, h);
      ctx.restore();
    };
    // Itens sazonais e asas adicionadas sem spritesheet próprio usam uma asa 2D compatível.
    const variants = { wings_life: ['wings_elf', 72], wings_dragon_l1: ['wings_satan', -12], wings_spirit_l1: ['wings_heaven', 32] };
    const variant = variants[wk];
    const wingKey = WG && wk && WG.sheets[wk] ? wk : variant ? variant[0] : 'wings_dragon';
    const wingPath = WG && (WG.sheets[wingKey] || Object.values(WG.sheets)[0]);
    const rarityGlow = { uncommon: '#5fdc78', rare: '#5aaaff', epic: '#be64ff', legendary: '#ffd36b' };
    // de costas a asa/capa fica por cima do corpo; nas outras vistas, atrás
    const fromBack = /_back$/.test(action);
    // asa nova: atrás do corpo de frente/de lado (de lado fica estreita, em perspectiva), por cima de costas; bate devagar
    // asa nova presa nas costas: a raiz fica fixa no ombro e só a ponta abre e fecha devagar.
    // De frente/de costas: cada asa sai do meio das costas. De lado: a asa sai das costas (atrás do herói),
    // com a outra asa um pouco acima e mais apagada.
    const newWing = (path, glow) => {
      const im = opts.white ? recolored('L:' + path, img(path), meta, false, null, true) : img(path);
      if (!im) return false;
      const side = !/_(front|back)$/.test(action);
      const open = 0.84 + 0.16 * (Math.sin((Number(t) || 0) / 320) + 1) / 2;
      const base = 1.4 * scale, half = Math.floor(im.width / 2), ih = im.height;
      const top = (meta.top || 72) * scale, rootY = -top * 0.7;
      const h = Math.round(ih * base);
      ctx.save();
      if (glow && !opts.white) { ctx.shadowColor = glow; ctx.shadowBlur = 8 * scale; }
      if (side) {
        const back = -4 * scale;                  // costas (o desenho do herói olha para a direita)
        const w = Math.round(half * base * open);
        const ga = ctx.globalAlpha;
        ctx.globalAlpha = ga * 0.7;               // asa do outro lado, atrás
        const w2 = Math.round(w * 0.86), h2 = Math.round(h * 0.9);
        ctx.drawImage(im, 0, 0, half, ih, Math.round(back + 3 * scale - w2), Math.round(rootY - 2 * scale - h2 / 2), w2, h2);
        ctx.globalAlpha = ga;
        ctx.drawImage(im, 0, 0, half, ih, Math.round(back - w), Math.round(rootY - h / 2), w, h);
      } else {
        const w = Math.round(half * base * open), gap = Math.round(scale);
        ctx.drawImage(im, 0, 0, half, ih, -gap - w, Math.round(rootY - h / 2), w, h);
        ctx.drawImage(im, half, 0, im.width - half, ih, gap, Math.round(rootY - h / 2), Math.round((im.width - half) * base * open), h);
      }
      ctx.restore();
      return true;
    };
    const drawWing = () => {
      // herói de arte completa: o Lorde já vem com capa no desenho; a capa equipada não usa mais a folha antiga
      // (ficava torta no corpo novo). A capa Emperor ganha só um brilho atrás do herói.
      if (full && /^cape_/.test(wk)) {
        const glow = WG && WG.glow && WG.glow[wk];
        if (glow && !opts.white) {
          const top = (meta.top || 72) * scale, cy = -top * 0.55, r = top * 0.62;
          const pulse = 0.75 + 0.25 * Math.sin((Number(t) || 0) / 400);
          const g = ctx.createRadialGradient(0, cy, 0, 0, cy, r);
          g.addColorStop(0, glow + '66'); g.addColorStop(1, glow + '00');
          ctx.save(); ctx.globalAlpha *= pulse; ctx.fillStyle = g; ctx.fillRect(-r, cy - r, r * 2, r * 2); ctx.restore();
        }
        return;
      }
      const np = full && newWingPath(wk);
      if (np) { if (newWing(np, (WG && WG.glow && WG.glow[wk]) || rarityGlow[eq.wingRarity] || null)) return; }
      const filter = variant && variant[1] ? `hue-rotate(${variant[1]}deg) saturate(1.25)` : 'none';
      ctx.save(); ctx.filter = filter;
      wing(wingPath, (WG.glow && WG.glow[wingKey]) || rarityGlow[eq.wingRarity] || null);
      ctx.restore();
    };
    if (wk && WG && !fromBack) drawWing();
    blit(back, 0);
    if (full) {
      if (wk && WG && fromBack) drawWing();
      ctx.restore();
      return true;
    }
    piece('boots'); piece('armor_mid'); piece('gloves_mid');
    if (wk && WG && fromBack) drawWing();
    const wingOver = WG && wk && WG.over && (WG.over[wk] || WG.over[wingKey]);
    if (wk && wingOver && !fromBack) wing(wingOver, null);
    piece('helm');
    const wb = eq.w === undefined ? S.manifest.weapons.defaults[cls] : eq.w;
    const wi = W && wb ? W.list.indexOf(wb) : -1;
    if (wi >= 0) {
      const wim = opts.white ? recolored('L:' + W.sheet, img(W.sheet), meta, false, null, true) : img(W.sheet);
      if (eq.wg && !opts.white) { ctx.save(); ctx.shadowColor = eq.wg; ctx.shadowBlur = 10 * scale; blit(wim, wi); ctx.restore(); }
      else blit(wim, wi);
    }
    blit(front, 0);
    piece('armor_front'); piece('gloves_front');
    ctx.restore();
    return true;
  }

  function drawEffect(ctx, name, frame, x, y, scale, angle = 0, alpha = 1) {
    if (!S.manifest) return false;
    const meta = S.manifest.effects[name];
    const img = S.imgs['effects:' + name];
    if (!meta || !img) return false;
    const f = Math.max(0, Math.min(meta.frames - 1, frame | 0));
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.translate(Math.round(x), Math.round(y));
    if (angle) ctx.rotate(angle);
    ctx.globalAlpha = alpha;
    ctx.drawImage(img, f * meta.fw, 0, meta.fw, meta.fh, -Math.round(meta.pivot[0] * scale), -Math.round(meta.pivot[1] * scale), Math.round(meta.fw * scale), Math.round(meta.fh * scale));
    ctx.restore();
    return true;
  }

  function defaultHairIndex(cls) {
    const m = S.manifest && S.manifest.heroes[cls];
    const i = m && m.defaultHair ? HAIR.indexOf(m.defaultHair) : 0;
    return i < 0 ? 0 : i;
  }
  function hasHair(cls) { return !!(S.manifest && S.manifest.heroes[cls] && S.manifest.heroes[cls].hairKeys); }

  window.Sprites = {
    ready, HAIR, SKIN, defaultHairIndex, hasHair, drawEffect, preloadEquip, equipReady, preloadClass,
    hero: (ctx, cls, ap, action, t, x, y, scale, flip, opts) => (opts && opts.equip ? heroEquip(ctx, cls, ap, action, t, x, y, scale, flip, opts, opts.equip) : draw(ctx, 'heroes', cls, ap, action, t, x, y, scale, flip, opts)),
    ARMOR,
    monster: (ctx, name, action, t, x, y, scale, flip, opts) => draw(ctx, 'monsters', name, null, action, t, x, y, scale, flip, { ...opts, useScale: true }),
    meta: (group, name) => S.manifest && S.manifest[group] && S.manifest[group][name],
    // montaria desenhada à mão: desenha e devolve o quanto a sela subiu/desceu neste quadro (seatBob)
    mount: (ctx, name, action, t, x, y, scale, flip, opts = {}) => {
      const meta = S.manifest && S.manifest.mounts && S.manifest.mounts[name];
      if (!meta || !draw(ctx, 'mounts', name, null, action, t, x, y, scale, flip, opts)) return null;
      const a = meta.actions[action] ? action : 'idle', f = frameOf(meta, a, t, false)[1];
      return { bob: ((meta.seatBob || {})[a] || [])[f] || 0, seat: meta.seat };
    },
    // só o quanto a sela sobe/desce neste quadro (para desenhar o herói antes da montaria)
    mountBob: (name, action, t) => {
      const meta = S.manifest && S.manifest.mounts && S.manifest.mounts[name];
      if (!meta) return 0;
      const a = meta.actions[action] ? action : 'idle', f = frameOf(meta, a, t, false)[1];
      return ((meta.seatBob || {})[a] || [])[f] || 0;
    },
    // ícone da montaria (bolsa e loja): quadro parado de lado, centralizado no quadrado
    mountIcon: (ctx, name, x, y, size, tint) => {
      const meta = S.manifest && S.manifest.mounts && S.manifest.mounts[name];
      const im = meta && (tint ? tinted('mounts', name, tint) : S.imgs['mounts:' + name]);
      if (!im) return false;
      ctx.save(); ctx.imageSmoothingEnabled = false;
      ctx.drawImage(im, 0, 0, meta.fw, meta.fh, Math.round(x), Math.round(y), Math.round(size), Math.round(size));
      ctx.restore();
      return true;
    },
    frames: (group, name, action) => { const m = S.manifest && S.manifest[group][name]; return m ? (m.actions[action] || m.actions.idle) : null; },
  };
})();
