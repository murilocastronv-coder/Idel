// MU Idle Legends — carregador de sprites em alta resolução (folhas PNG + manifest.json)
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
    for (const group of ['heroes', 'monsters', 'effects']) {
      for (const [name, m] of Object.entries(S.manifest[group])) {
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
    const a = meta.actions[action] || meta.actions.idle;
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
  function img(path) {
    let e = lazy.get(path);
    if (!e) {
      e = { im: null };
      lazy.set(path, e);
      loadImg(BASE + path + '?v=' + S.manifest.version).then((im) => { e.im = im; }).catch(() => {});
    }
    return e.im;
  }
  const ARMOR = ['helm', 'armor', 'gloves', 'boots'];
  // eq: { w: base da arma, wg: cor do brilho da arma, helm/armor/gloves/boots: conjunto }
  function heroEquip(ctx, cls, ap, action, t, x, y, scale, flip, opts = {}, eq = {}) {
    if (!S.manifest || !S.manifest.equip) return draw(ctx, 'heroes', cls, ap, action, t, x, y, scale, flip, opts);
    const meta = S.manifest.heroes[cls];
    if (!meta || !meta.layers) return draw(ctx, 'heroes', cls, ap, action, t, x, y, scale, flip, opts);
    const back = recolored('L:' + meta.layers.back, img(meta.layers.back), meta, true, ap, opts.white);
    const front = recolored('L:' + meta.layers.front, img(meta.layers.front), meta, true, ap, opts.white);
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
    const WG = S.manifest.wings, wk = eq.wings, wblk = WG && wk ? WG.classes.indexOf(cls) : -1;
    const wing = (path, glow) => {
      if (!path || wblk < 0) return;
      const im = opts.white ? recolored('L:' + path, img(path), meta, false, null, true) : img(path);
      if (!im) return;
      const sx = f * WG.fw, sy = (wblk * WG.rowsPerClass + row) * WG.fh;
      const dx = -Math.round(WG.pivot[0] * scale), dy = -Math.round(WG.pivot[1] * scale), w = Math.round(WG.fw * scale), h = Math.round(WG.fh * scale);
      if (glow && !opts.white) { ctx.save(); ctx.shadowColor = glow; ctx.shadowBlur = 7 * scale; ctx.drawImage(im, sx, sy, WG.fw, WG.fh, dx, dy, w, h); ctx.restore(); }
      else ctx.drawImage(im, sx, sy, WG.fw, WG.fh, dx, dy, w, h);
    };
    if (wk && WG) wing(WG.sheets[wk], WG.glow && WG.glow[wk]);
    blit(back, 0);
    piece('boots'); piece('armor_mid'); piece('gloves_mid');
    if (wk && WG && WG.over) wing(WG.over[wk], null);
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
    ready, HAIR, SKIN, defaultHairIndex, hasHair, drawEffect,
    hero: (ctx, cls, ap, action, t, x, y, scale, flip, opts) => (opts && opts.equip ? heroEquip(ctx, cls, ap, action, t, x, y, scale, flip, opts, opts.equip) : draw(ctx, 'heroes', cls, ap, action, t, x, y, scale, flip, opts)),
    ARMOR,
    monster: (ctx, name, action, t, x, y, scale, flip, opts) => draw(ctx, 'monsters', name, null, action, t, x, y, scale, flip, { ...opts, useScale: true }),
    meta: (group, name) => S.manifest && S.manifest[group][name],
    frames: (group, name, action) => { const m = S.manifest && S.manifest[group][name]; return m ? (m.actions[action] || m.actions.idle) : null; },
  };
})();
