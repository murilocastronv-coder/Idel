// MU Idle Legends — cliente do mundo. Desenha o que o servidor manda e envia só intenções.
'use strict';
(function () {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const PA = window.PixelArt;
  const fmt = new Intl.NumberFormat('pt-BR');
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const charId = new URLSearchParams(location.search).get('c');

  const S = {
    data: null, char: null, me: null, map: null, ground: null,
    players: new Map(), monsters: new Map(), fx: [], floats: [], clickMark: null,
    boss: null, chatUnread: 0, panel: null, selItem: null, rarFilter: 'all', youId: null,
  };
  const RAR = { common: '#c8c8c8', uncommon: '#5fd35f', rare: '#4aa3ff', epic: '#b45cff', legendary: '#ffb02e', ancestral: '#ff4d4d' };
  const RAR_NAME = { common: 'Comum', uncommon: 'Incomum', rare: 'Raro', epic: 'Épico', legendary: 'Lendário', ancestral: 'Ancestral' };
  const RAR_ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'ancestral'];
  const SLOT_NAME = { weapon: 'Arma', helm: 'Elmo', armor: 'Armadura', gloves: 'Luvas', boots: 'Botas', ring: 'Anel' };
  const FX_COLOR = { fire: '#ff7a3d', energy: '#59c7ff', ice: '#bff0ff', arrow: '#efe4c8', arrow3: '#efe4c8', dark: '#c06bff',
    spirit: '#ff7ad9', lightning: '#ffffaa', meteor: '#ff4d1f', slash: '#ffffff', whirl: '#ffffff', heal: '#9affd0', claw: '#ff6060', boss: '#c06bff' };
  const RANGED = new Set(['fire', 'energy', 'ice', 'arrow', 'arrow3', 'dark', 'spirit']);
  const MERCHANT = { hair: '#8a5a2b', armor: '#a8742a', armorDark: '#6a4818', cape: '#3a5a2a', pants: '#4a3a2a', boots: '#2a1d14', belt: '#e8b84a', accent: '#ffd36b' };

  if (!charId) { location.href = '/'; return; }

  // ================= conexão =================
  let ws = null, retry = 0, joined = false, leaving = false;
  function send(obj) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj)); }
  function connect() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${proto}://${location.host}/ws`);
    const sock = ws;
    sock.onopen = () => { retry = 0; setConn(true); send({ type: 'join', charId }); };
    sock.onmessage = (ev) => { let m; try { m = JSON.parse(ev.data); } catch (_) { return; } onMsg(m); };
    sock.onclose = () => {
      if (sock !== ws || leaving) return;
      setConn(false);
      if (S.kicked) return;
      centerMsg('Conexão perdida. Reconectando…');
      setTimeout(connect, Math.min(10000, 800 * 2 ** retry++));
    };
  }
  function setConn(on) { $('#g-conn').className = 'dot ' + (on ? 'on' : 'off'); }
  window.addEventListener('online', () => { if (!ws || ws.readyState > 1) connect(); });

  function centerMsg(html, withHome) {
    const el = $('#center-msg');
    if (!html) { el.hidden = true; return; }
    el.innerHTML = html + (withHome ? '<br><a class="btn btn-gold" href="/">Voltar ao início</a>' : '');
    el.hidden = false;
  }

  // ================= mensagens =================
  function onMsg(m) {
    switch (m.type) {
      case 'hello': case 'pong': case 'stats': return;
      case 'enter': return onEnter(m);
      case 's': return onSnap(m);
      case 'char': S.char = m; renderChar(); return;
      case 'pj': S.players.set(m.id, { ...(S.players.get(m.id) || { x: 0, y: 0, rx: null }), info: m }); return;
      case 'pl': S.players.delete(m.id); return;
      case 'reward': return feed(`+${fmt.format(m.exp)} EXP  +${fmt.format(m.zen)} Zen${m.share ? ` (${m.share}% do dano)` : ''}`, '');
      case 'drop': {
        const it = m.item;
        feed(`Item: ${it.name}${it.plus ? ' +' + it.plus : ''} (${RAR_NAME[it.rarity]})`, 'drop', RAR[it.rarity]);
        return;
      }
      case 'log': return feed(m.text, m.kind === 'warn' ? 'warn' : '');
      case 'offline': return showOffline(m);
      case 'chat': return addChat(m, true);
      case 'chatlog': $('#chat-lines').innerHTML = ''; m.lines.forEach((l) => addChat(l, false)); return;
      case 'kicked': S.kicked = true; centerMsg(esc(m.reason), true); return;
      case 'left': location.href = '/'; return;
      case 'error':
        if (!joined) { S.kicked = true; centerMsg(esc(m.error), true); } else feed(m.error, 'warn');
        return;
      default:
    }
  }

  function onEnter(m) {
    joined = true;
    centerMsg(null);
    S.map = m; S.youId = m.you;
    S.monsters = new Map(m.monsters.map((mo) => [mo.id, { ...mo, x: 0, y: 0, rx: null, ry: null, hp: mo.maxHp, dead: false }]));
    const keep = S.players.get(m.you);
    S.players = new Map(m.players.map((p) => [p.id, { info: p, x: 0, y: 0, rx: null }]));
    S.players.set(m.you, keep && keep.info ? { ...keep, rx: null } : { info: null, x: 0, y: 0, rx: null });
    S.fx = []; S.floats = [];
    S.ground = buildGround(m);
    $('#map-name').textContent = m.name + (m.safe ? ' · zona segura' : '');
    $('#btn-shop').hidden = false;
    if (S.panel === 'maps') renderMaps();
    if (S.panel === 'shop') renderShop();
  }

  function onSnap(m) {
    const now = performance.now();
    for (const [id, x, y, hp, maxHp, dead, flip] of m.P) {
      let p = S.players.get(id);
      if (!p) { p = { info: null, rx: null }; S.players.set(id, p); }
      Object.assign(p, { x, y, hp, maxHp, dead: !!dead, flip: !!flip });
      if (p.rx === null) { p.rx = x; p.ry = y; }
    }
    for (const [id, x, y, hp, dead, flip] of m.M) {
      const mo = S.monsters.get(id);
      if (!mo) continue;
      if (mo.dead && !dead) { mo.rx = x; mo.ry = y; }
      Object.assign(mo, { x, y, hp, dead: !!dead, flip: !!flip });
      if (mo.rx === null) { mo.rx = x; mo.ry = y; }
    }
    for (const ev of m.ev) handleEvent(ev, now);
    S.boss = m.boss;
    S.me = m.me;
    renderHud();
  }

  function ent(id) { return id[0] === 'p' ? S.players.get(id) : S.monsters.get(id); }

  function handleEvent(ev, now) {
    if (ev.k === 'h') {
      const a = ent(ev.a), t = ent(ev.t);
      if (!t) return;
      if (a) a.attackUntil = now + 230;
      if (ev.t[0] === 'm') t.hurtUntil = now + 140;
      const color = ev.t === S.youId ? '#ff6b5b' : ev.c ? '#ffb02e' : '#ffffff';
      const ranged = RANGED.has(ev.fx) && a && !ev.aoe;
      const delay = ranged ? 200 : 0;
      if (ranged) S.fx.push({ kind: 'proj', from: a, to: t, color: FX_COLOR[ev.fx], fx: ev.fx, t0: now, dur: delay });
      else if (!ev.aoe) S.fx.push({ kind: 'slash', at: t, color: FX_COLOR[ev.fx] || '#fff', t0: now, dur: 180 });
      S.floats.push({ at: t, text: String(ev.d), color, big: !!ev.c, t0: now + delay });
    } else if (ev.k === 'aoe') {
      S.fx.push({ kind: 'aoe', x: ev.x, y: ev.y, r: ev.r, color: FX_COLOR[ev.fx] || '#fff', t0: now, dur: 380 });
      const a = ent(ev.a); if (a) a.attackUntil = now + 260;
    } else if (ev.k === 'heal') {
      const t = ent(ev.t); if (t) S.floats.push({ at: t, text: '+' + ev.d, color: '#9affd0', t0: now });
    } else if (ev.k === 'lv') {
      const t = ent(ev.t);
      if (t) { S.fx.push({ kind: 'lvl', at: t, t0: now, dur: 1200 }); S.floats.push({ at: t, text: 'LEVEL UP!', color: '#ffd36b', big: true, t0: now }); }
      if (ev.t === S.youId) feed('Subiu de nível!', 'lvl');
    } else if (ev.k === 'die') {
      const t = ent(ev.t); if (t) S.fx.push({ kind: 'poof', x: t.rx, y: t.ry, t0: now, dur: 500 });
    } else if (ev.k === 'pdie' && ev.t === S.youId) {
      feed('Você caiu em combate.', 'warn');
    }
  }

  // ================= chão do mapa (gerado igual para todos) =================
  function rng(seed) { let s = 0; for (const ch of seed) s = (s * 31 + ch.charCodeAt(0)) >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
  const GROUND = {
    town: { base: '#4f7a3a', a: '#5b8a44', b: '#43692f' },
    grass: { base: '#5b8a3c', a: '#6a9a48', b: '#4a7530' },
    forest: { base: '#2f5a26', a: '#3b6b2a', b: '#244a1e' },
    cave: { base: '#3a3240', a: '#463c4c', b: '#2c2632' },
  };
  function buildGround(m) {
    const c = document.createElement('canvas'); c.width = m.w; c.height = m.h;
    const g = c.getContext('2d');
    const T = GROUND[m.theme] || GROUND.grass;
    const r = rng(m.map);
    const px = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(Math.round(x), Math.round(y), w, h); };
    px(0, 0, m.w, m.h, T.base);
    for (let i = 0; i < m.w * m.h / 90; i++) px(r() * m.w, r() * m.h, 2 + (r() * 3 | 0), 1 + (r() * 2 | 0), r() < 0.5 ? T.a : T.b);
    const tree = (x, y, s = 1, dark = false) => {
      px(x - 2 * s, y - 6 * s, 4 * s, 8 * s, '#5a3a1c');
      const c1 = dark ? '#1f4a1c' : '#2d6a2a', c2 = dark ? '#2d5a24' : '#4a9a3a';
      px(x - 8 * s, y - 18 * s, 16 * s, 12 * s, c1); px(x - 6 * s, y - 22 * s, 12 * s, 4 * s, c1);
      px(x - 5 * s, y - 20 * s, 7 * s, 4 * s, c2); px(x - 9 * s, y - 13 * s, 2 * s, 5 * s, c1); px(x + 7 * s, y - 13 * s, 2 * s, 5 * s, c1);
    };
    const rock = (x, y, col = '#7a7a80') => { px(x - 5, y - 4, 10, 5, col); px(x - 3, y - 6, 6, 2, col); px(x - 3, y - 5, 3, 1, '#a8a8b0'); };
    if (m.theme === 'town') {
      const cx = m.w / 2, cy = m.h / 2;
      px(cx - 180, cy - 120, 360, 240, '#8a8478');
      for (let x = cx - 180; x < cx + 180; x += 12) for (let y = cy - 120; y < cy + 120; y += 8) px(x + ((y / 8) % 2) * 6, y, 11, 7, r() < 0.5 ? '#9a9488' : '#7e786c');
      px(cx - 24, cy - 24, 48, 48, '#5a5a66'); px(cx - 20, cy - 20, 40, 40, '#3a7ad8'); px(cx - 4, cy - 30, 8, 14, '#c8c8d8'); px(cx - 2, cy - 34, 4, 4, '#bff0ff');
      for (let i = 0; i < 6; i++) {
        const hx = 60 + i * 120, hy = 70;
        px(hx, hy, 70, 50, '#a07a52'); px(hx - 6, hy - 18, 82, 20, '#8a2a2a'); px(hx + 28, hy + 26, 14, 24, '#3a2418'); px(hx + 8, hy + 14, 12, 10, '#ffd36b'); px(hx + 50, hy + 14, 12, 10, '#ffd36b');
      }
      px(0, m.h - 40, m.w, 40, '#5a5a66'); for (let x = 0; x < m.w; x += 16) px(x, m.h - 48, 10, 8, '#5a5a66');
      for (let i = 0; i < 14; i++) tree(r() * m.w, 200 + r() * (m.h - 260), 1);
      // barraca da loja
      const sx = 470, sy = 250;
      px(sx - 30, sy - 46, 60, 10, '#c8452c'); for (let i = 0; i < 60; i += 10) px(sx - 30 + i, sy - 46, 5, 10, '#f0e6cc');
      px(sx - 28, sy - 36, 4, 30, '#5a3a1c'); px(sx + 24, sy - 36, 4, 30, '#5a3a1c'); px(sx - 30, sy - 12, 60, 8, '#8a6a4a');
    } else if (m.theme === 'grass') {
      for (let x = 0; x < m.w; x += 4) px(x, m.h / 2 + Math.sin(x / 90) * 60, 4, 18, '#9a7a4a');
      for (let i = 0; i < 160; i++) px(r() * m.w, r() * m.h, 1, 1, ['#ffd36b', '#ff7ad9', '#ffffff'][i % 3]);
      for (let i = 0; i < 40; i++) tree(r() * m.w, r() * m.h, 1);
      for (let i = 0; i < 25; i++) rock(r() * m.w, r() * m.h);
    } else if (m.theme === 'forest') {
      for (let i = 0; i < 90; i++) tree(r() * m.w, r() * m.h, r() < 0.3 ? 1.5 : 1, true);
      for (let i = 0; i < 40; i++) { const x = r() * m.w, y = r() * m.h; px(x, y, 2, 3, '#e8e0d0'); px(x - 2, y - 3, 6, 3, '#c8452c'); px(x - 1, y - 3, 1, 1, '#ffffff'); }
      for (let i = 0; i < 30; i++) px(r() * m.w, r() * m.h, 1, 1, '#9affd0');
    } else if (m.theme === 'cave') {
      for (let i = 0; i < 70; i++) { const x = r() * m.w, y = r() * m.h; px(x - 6, y - 16, 12, 18, '#2a2230'); px(x - 4, y - 18, 8, 3, '#4a3e52'); }
      for (let i = 0; i < 60; i++) { const x = r() * m.w, y = r() * m.h; px(x, y, 6, 2, '#d8cfb4'); px(x + 2, y - 2, 2, 6, '#d8cfb4'); }
      for (let i = 0; i < 20; i++) { const x = r() * m.w, y = r() * m.h; px(x, y - 10, 2, 10, '#5a3a1c'); px(x - 2, y - 14, 6, 5, '#ff8a2a'); px(x - 1, y - 15, 4, 2, '#ffd36b'); }
      for (let x = 0; x < m.w; x += 6) px(x, 0, 6, 10 + (r() * 14 | 0), '#1c1626');
      if (m.map === 'dungeon') { px(860, 320, 180, 160, '#2a2236'); for (let x = 860; x < 1040; x += 10) for (let y = 320; y < 480; y += 10) if (r() < 0.3) px(x, y, 9, 9, '#3a2e48'); }
    }
    return c;
  }

  // ================= desenho =================
  const cv = $('#world');
  const ctx = cv.getContext('2d');
  let zoom = 2, dpr = 1, camX = 0, camY = 0;
  function resize() {
    dpr = Math.min(3, window.devicePixelRatio || 1);
    cv.width = Math.round(window.innerWidth * dpr);
    cv.height = Math.round(window.innerHeight * dpr);
    zoom = Math.max(2, Math.floor(Math.min(window.innerWidth, window.innerHeight) / 200)) * dpr;
  }
  window.addEventListener('resize', resize); resize();

  function lerp(e, dt) {
    const k = 1 - Math.exp(-dt * 12);
    if (e.rx === null || e.rx === undefined) { e.rx = e.x; e.ry = e.y; }
    if (Math.hypot(e.x - e.rx, e.y - e.ry) > 120) { e.rx = e.x; e.ry = e.y; }
    e.rx += (e.x - e.rx) * k; e.ry += (e.y - e.ry) * k;
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#0b1020'; ctx.fillRect(0, 0, cv.width, cv.height);
    if (S.map && S.ground) {
      S.players.forEach((p) => lerp(p, dt));
      S.monsters.forEach((m) => lerp(m, dt));
      const me = S.players.get(S.youId);
      const vw = cv.width / zoom, vh = cv.height / zoom;
      if (me && me.rx !== null) {
        camX = Math.max(0, Math.min(S.map.w - vw, me.rx - vw / 2));
        camY = Math.max(0, Math.min(S.map.h - vh, me.ry - vh / 2 + 20));
        if (S.map.w < vw) camX = (S.map.w - vw) / 2;
        if (S.map.h < vh) camY = (S.map.h - vh) / 2;
      }
      // chão: recorta a parte visível
      const sx = Math.max(0, camX), sy = Math.max(0, camY);
      const sw = Math.min(S.map.w - sx, vw), sh = Math.min(S.map.h - sy, vh);
      ctx.drawImage(S.ground, sx, sy, sw, sh, (sx - camX) * zoom, (sy - camY) * zoom, sw * zoom, sh * zoom);
      drawClickMark(now);
      drawEntities(now);
      drawFx(now);
      drawFloats(now);
      drawMinimap();
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  const toScreen = (x, y) => [Math.round((x - camX) * zoom), Math.round((y - camY) * zoom)];

  function drawEntities(now) {
    const list = [];
    S.monsters.forEach((m) => { if (!m.dead) list.push(['m', m]); });
    S.players.forEach((p) => { if (p.info && !p.dead) list.push(['p', p]); });
    if (S.map.npcs) S.map.npcs.forEach((n) => list.push(['n', n]));
    list.sort((a, b) => (a[1].ry ?? a[1].y) - (b[1].ry ?? b[1].y));
    const bob = Math.floor(now / 450) % 2 === 1;
    const myTarget = S.me && S.me.target;
    for (const [kind, e] of list) {
      if (kind === 'n') {
        const [x, y] = toScreen(e.x, e.y);
        PA.drawCharacter(ctx, 'dark_wizard', MERCHANT, { hair: 0, skin: 1 }, x - 11 * zoom, y - 20 * zoom, zoom, { bob });
        label(e.name, x, y - 22 * zoom, '#ffd36b');
        label('Loja', x, y - 22 * zoom - 13 * dpr, '#9affd0', 10);
        continue;
      }
      const [x, y] = toScreen(e.rx, e.ry);
      if (kind === 'm') {
        const size = PA.monsterSize(e.sprite);
        const s = Math.max(1, Math.round(zoom * e.size));
        if (e.id === myTarget) { ctx.strokeStyle = '#ffd36b'; ctx.lineWidth = dpr * 2; ctx.beginPath(); ctx.ellipse(x, y, size[0] * s / 2, 3 * s, 0, 0, Math.PI * 2); ctx.stroke(); }
        ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.beginPath(); ctx.ellipse(x, y, size[0] * s / 2.4, 2.2 * s, 0, 0, Math.PI * 2); ctx.fill();
        PA.drawMonster(ctx, e.sprite, x - size[0] * s / 2, y - size[1] * s, s, { bob, hurt: now < (e.hurtUntil || 0), flip: e.flip, tint: e.tint });
        const top = y - size[1] * s - 6 * dpr;
        hpBar(x, top, Math.max(28, size[0] * s * 0.8), e.hp / e.maxHp, e.boss ? '#c06bff' : e.elite ? '#ffb02e' : '#e0473a');
        if (e.boss || e.elite || e.id === myTarget) label(`${e.name} Nv.${e.level}`, x, top - 4 * dpr, e.boss ? '#e0b0ff' : e.elite ? '#ffd36b' : '#f0e6cc', 10);
      } else {
        const info = e.info;
        const cls = S.data && S.data.classes[info.cls];
        if (!cls) continue;
        const isMe = e === S.players.get(S.youId);
        ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.beginPath(); ctx.ellipse(x, y, 7 * zoom, 2.2 * zoom, 0, 0, Math.PI * 2); ctx.fill();
        const pal = { ...cls.palette };
        if (info.weaponRarity && info.weaponRarity !== 'common') pal.accent = RAR[info.weaponRarity];
        PA.drawCharacter(ctx, info.cls, pal, info.ap, x - 11 * zoom, y - 20 * zoom, zoom, { bob, attack: now < (e.attackUntil || 0), flip: e.flip });
        hpBar(x, y - 22 * zoom, 16 * zoom, e.hp / e.maxHp, isMe ? '#6aa84f' : '#4aa3ff');
        label(`${info.name} ${info.level}`, x, y - 22 * zoom - 5 * dpr, isMe ? '#ffd36b' : '#bfe0ff', 11);
      }
    }
  }
  function hpBar(cx, y, w, frac, color) {
    const h = 3 * dpr;
    ctx.fillStyle = '#0b1020'; ctx.fillRect(Math.round(cx - w / 2) - dpr, y - dpr, w + 2 * dpr, h + 2 * dpr);
    ctx.fillStyle = color; ctx.fillRect(Math.round(cx - w / 2), y, Math.max(0, w * Math.min(1, frac)), h);
  }
  function label(text, x, y, color, size = 11) {
    ctx.font = `600 ${size * dpr}px "Pixelify Sans", monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillStyle = '#0b1020'; ctx.fillText(text, x + dpr, y + dpr);
    ctx.fillStyle = color; ctx.fillText(text, x, y);
  }
  function center(e) {
    if (e.sprite) { const sz = PA.monsterSize(e.sprite); return [e.rx, e.ry - sz[1] * e.size / 2]; }
    return [e.rx, e.ry - 10];
  }
  function drawFx(now) {
    S.fx = S.fx.filter((f) => {
      const p = (now - f.t0) / f.dur;
      if (p >= 1) return false;
      if (p < 0) return true;
      if (f.kind === 'proj') {
        const [ax, ay] = center(f.from), [bx, by] = center(f.to);
        const [x, y] = toScreen(ax + (bx - ax) * p, ay + (by - ay) * p);
        const s = 3 * zoom / 2;
        ctx.fillStyle = f.color; ctx.fillRect(x - s, y - s, s * 2, s * 2);
        ctx.fillStyle = '#ffffff'; ctx.fillRect(x - s / 2, y - s / 2, s, s);
        ctx.globalAlpha = 0.5; ctx.fillStyle = f.color;
        const [tx, ty] = toScreen(ax + (bx - ax) * Math.max(0, p - 0.15), ay + (by - ay) * Math.max(0, p - 0.15));
        ctx.fillRect(tx - s / 2, ty - s / 2, s, s); ctx.globalAlpha = 1;
      } else if (f.kind === 'slash') {
        const [cx, cy] = center(f.at); const [x, y] = toScreen(cx, cy);
        ctx.strokeStyle = f.color; ctx.lineWidth = 2 * dpr; ctx.globalAlpha = 1 - p;
        ctx.beginPath(); ctx.arc(x, y, (6 + p * 6) * zoom, -2.4 + p * 2, -0.6 + p * 2); ctx.stroke(); ctx.globalAlpha = 1;
      } else if (f.kind === 'aoe') {
        const [x, y] = toScreen(f.x, f.y);
        ctx.globalAlpha = 0.55 * (1 - p); ctx.fillStyle = f.color;
        ctx.beginPath(); ctx.ellipse(x, y, f.r * zoom * (0.4 + p * 0.6), f.r * zoom * 0.45 * (0.4 + p * 0.6), 0, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1 - p; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = dpr * 2; ctx.stroke(); ctx.globalAlpha = 1;
      } else if (f.kind === 'lvl') {
        const [x, y] = toScreen(f.at.rx, f.at.ry);
        ctx.globalAlpha = 1 - p; ctx.fillStyle = '#ffd36b';
        for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2 + p * 3; ctx.fillRect(x + Math.cos(a) * 12 * zoom, y - 10 * zoom + Math.sin(a) * 6 * zoom - p * 14 * zoom, 2 * zoom, 2 * zoom); }
        ctx.globalAlpha = 1;
      } else if (f.kind === 'poof') {
        const [x, y] = toScreen(f.x, f.y);
        ctx.globalAlpha = 1 - p; ctx.fillStyle = '#c8c8c8';
        for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; ctx.fillRect(x + Math.cos(a) * p * 10 * zoom, y - 6 * zoom + Math.sin(a) * p * 6 * zoom, 2 * zoom, 2 * zoom); }
        ctx.globalAlpha = 1;
      }
      return true;
    });
  }
  function drawFloats(now) {
    S.floats = S.floats.filter((f) => {
      const age = now - f.t0;
      if (age < 0) return true;
      if (age > 900) return false;
      const [cx, cy] = center(f.at);
      const [x, y] = toScreen(cx, cy - 12 - age / 45);
      ctx.globalAlpha = age > 600 ? 1 - (age - 600) / 300 : 1;
      label(f.text, x, y, f.color, f.big ? 15 : 12);
      ctx.globalAlpha = 1;
      return true;
    });
  }
  function drawClickMark(now) {
    const c = S.clickMark; if (!c) return;
    const p = (now - c.t0) / 500; if (p >= 1) { S.clickMark = null; return; }
    const [x, y] = toScreen(c.x, c.y);
    ctx.strokeStyle = '#ffd36b'; ctx.globalAlpha = 1 - p; ctx.lineWidth = dpr * 2;
    ctx.beginPath(); ctx.ellipse(x, y, (4 + p * 6) * zoom, (2 + p * 3) * zoom, 0, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
  }
  const mm = $('#minimap'), mmx = mm.getContext('2d');
  function drawMinimap() {
    const W = mm.width, H = mm.height, sx = W / S.map.w, sy = H / S.map.h;
    mmx.drawImage(S.ground, 0, 0, W, H);
    mmx.fillStyle = 'rgba(11,16,32,.35)'; mmx.fillRect(0, 0, W, H);
    S.monsters.forEach((m) => { if (m.dead) return; mmx.fillStyle = m.boss ? '#c06bff' : m.elite ? '#ffb02e' : '#ff5a4a'; const s = m.boss ? 4 : 2; mmx.fillRect(m.rx * sx - s / 2, m.ry * sy - s / 2, s, s); });
    S.players.forEach((p, id) => { if (!p.info || p.dead) return; mmx.fillStyle = id === S.youId ? '#ffd36b' : '#59c7ff'; mmx.fillRect(p.rx * sx - 2, p.ry * sy - 2, id === S.youId ? 4 : 3, id === S.youId ? 4 : 3); });
    mmx.strokeStyle = 'rgba(255,255,255,.6)'; mmx.lineWidth = 1;
    mmx.strokeRect(camX * sx, camY * sy, cv.width / zoom * sx, cv.height / zoom * sy);
  }

  // ================= toque / clique no mapa =================
  cv.addEventListener('pointerdown', (ev) => {
    if (!S.map || !S.me || S.me.dead) return;
    if (S.panel && window.innerWidth < 700) closePanel();
    const wx = camX + ev.clientX * dpr / zoom, wy = camY + ev.clientY * dpr / zoom;
    // NPC da loja
    for (const n of S.map.npcs || []) {
      if (Math.hypot(n.x - wx, n.y - 10 - wy) < 16) { openPanel('shop'); return; }
    }
    let best = null, bd = 18;
    S.monsters.forEach((m) => {
      if (m.dead) return;
      const [cx, cy] = center(m);
      const d = Math.hypot(cx - wx, cy - wy) - (m.size - 1) * 8;
      if (d < bd) { bd = d; best = m; }
    });
    if (best) { send({ type: 'target', id: best.id }); S.clickMark = { x: best.rx, y: best.ry, t0: performance.now() }; return; }
    send({ type: 'move', x: Math.round(wx), y: Math.round(wy) });
    S.clickMark = { x: wx, y: wy, t0: performance.now() };
  });

  // ================= HUD =================
  function setBar(fill, text, v, max, label) {
    $(fill).style.width = `${max ? Math.max(0, Math.min(100, v / max * 100)) : 0}%`;
    $(text).textContent = label || `${fmt.format(Math.max(0, Math.round(v)))}/${fmt.format(max)}`;
  }
  function renderHud() {
    const me = S.me; if (!me) return;
    setBar('#hp-fill', '#hp-text', me.hp, me.maxHp);
    setBar('#mp-fill', '#mp-text', me.mp, me.maxMp);
    const pct = me.next ? me.exp / me.next * 100 : 0;
    setBar('#xp-fill', '#xp-text', me.exp, me.next, `EXP ${pct.toFixed(1)}% · ${fmt.format(me.exp)}/${fmt.format(me.next)}`);
    $('#me-level').textContent = me.level;
    $('#zen').textContent = fmt.format(me.zen);
    $('#pot-hp').textContent = fmt.format(me.pots.hp);
    $('#pot-mp').textContent = fmt.format(me.pots.mp);
    const ab = $('#btn-auto');
    ab.setAttribute('aria-pressed', me.auto);
    $('#auto-state').textContent = me.auto ? (S.map && S.map.safe ? 'na cidade' : 'lutando') : 'desligado';
    $('#pts-badge').hidden = !(me.free > 0);
    // recargas
    $$('#skills .act.skill').forEach((b) => {
      const cd = me.cds[b.dataset.id] || 0, total = Number(b.dataset.cd) || 1;
      b.querySelector('.cd').style.height = `${Math.min(100, cd / total * 100)}%`;
    });
    if (me.dead) centerMsg(`Você caiu em combate.<br><small>Renascendo em Lorencia em ${Math.ceil(me.respawnIn / 1000)}s…</small>`);
    else if (me.returnIn > 0) centerMsg(`Voltando ao farm em ${Math.ceil(me.returnIn / 1000)}s…`);
    else if (!S.kicked && joined && !$('#center-msg').hidden && !$('#center-msg').querySelector('a')) centerMsg(null);
    // boss
    const bb = $('#boss-bar');
    if (S.boss) {
      bb.hidden = false;
      $('#boss-title').textContent = S.boss.dead ? `${S.boss.name} volta em ${Math.ceil(S.boss.respawnIn / 60000)} min` : S.boss.name;
      setBar('#boss-fill', '#boss-text', S.boss.dead ? 0 : S.boss.hp, S.boss.max);
      $('#boss-top').innerHTML = S.boss.top.map((t) => `<li>${esc(t.name)} ${t.pct}%</li>`).join('');
    } else bb.hidden = true;
  }

  function feed(text, cls, color) {
    const el = document.createElement('div');
    el.textContent = text;
    if (cls) el.className = cls;
    if (color) el.style.setProperty('--r', color);
    const f = $('#feed');
    f.appendChild(el);
    while (f.children.length > 6) f.firstChild.remove();
    setTimeout(() => el.remove(), 6200);
  }

  // ================= ficha do personagem =================
  function renderChar() {
    const c = S.char;
    $('#me-name').textContent = c.name;
    const meP = S.players.get(S.youId) || { rx: null };
    meP.info = { id: c.id, name: c.name, cls: c.cls, ap: c.ap, level: c.level, weaponRarity: (c.items.find((i) => i.equipped && i.slot === 'weapon') || {}).rarity };
    S.players.set(S.youId || c.id, meP);
    renderSkills();
    if (S.panel) renderPanel(S.panel);
  }

  function renderSkills() {
    const box = $('#skills');
    box.innerHTML = '';
    for (const sk of S.char.skills) {
      if (sk.id === 'basic') continue;
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'act skill' + (sk.on ? '' : ' off');
      b.dataset.id = sk.id; b.dataset.cd = sk.cd;
      b.setAttribute('aria-pressed', sk.on);
      b.title = sk.on ? 'O modo automático usa esta habilidade. Toque para desligar.' : 'Desligada. Toque para o modo automático usar.';
      b.innerHTML = `${esc(sk.name)}<span class="mana">${sk.mana} MP</span><span class="cd"></span>`;
      b.onclick = () => send({ type: 'settings', settings: { skills: { [sk.id]: !sk.on } } });
      box.appendChild(b);
    }
  }

  // ================= painéis =================
  function openPanel(name) {
    if (S.panel === name) return closePanel();
    closePanel();
    S.panel = name;
    $(`#panel-${name}`).hidden = false;
    $$('.menu [data-panel]').forEach((b) => b.setAttribute('aria-expanded', b.dataset.panel === name));
    if (name === 'chat') { S.chatUnread = 0; $('#chat-badge').hidden = true; setTimeout(() => { const l = $('#chat-lines'); l.scrollTop = l.scrollHeight; }, 0); }
    renderPanel(name);
  }
  function closePanel() {
    if (!S.panel) return;
    $(`#panel-${S.panel}`).hidden = true;
    S.panel = null;
    $$('.menu [data-panel]').forEach((b) => b.setAttribute('aria-expanded', 'false'));
  }
  function renderPanel(name) {
    if (!S.char) return;
    if (name === 'bag') renderBag();
    else if (name === 'hero') renderHero();
    else if (name === 'maps') renderMaps();
    else if (name === 'shop') renderShop();
    else if (name === 'config') renderConfig();
  }
  $$('.menu [data-panel]').forEach((b) => { b.onclick = () => openPanel(b.dataset.panel); });
  $$('.panel [data-close]').forEach((b) => { b.onclick = closePanel; });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePanel(); });

  function iconCanvas(it) {
    const c = document.createElement('canvas'); c.width = 48; c.height = 48;
    PA.drawIcon(c.getContext('2d'), it.icon, 3, 3, 3, RAR[it.rarity]);
    return c;
  }
  function slotButton(it, onClick) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'islot' + (S.selItem === it.id ? ' sel' : '');
    b.style.setProperty('--r', RAR[it.rarity]);
    b.setAttribute('aria-label', `${it.name}${it.plus ? ' +' + it.plus : ''}, ${RAR_NAME[it.rarity]}`);
    b.appendChild(iconCanvas(it));
    if (it.plus) b.insertAdjacentHTML('beforeend', `<span class="plus">+${it.plus}</span>`);
    b.onclick = onClick;
    return b;
  }
  function renderBag() {
    const c = S.char;
    const bag = c.items.filter((i) => !i.equipped);
    $('#bag-count').textContent = `${bag.length}/${c.invMax}`;
    const slots = $('#equip-slots'); slots.innerHTML = '';
    for (const slot of Object.keys(SLOT_NAME)) {
      const it = c.items.find((i) => i.equipped && i.slot === slot);
      if (it) slots.appendChild(slotButton(it, () => { S.selItem = it.id; renderBag(); }));
      else { const e = document.createElement('div'); e.className = 'islot empty'; e.innerHTML = `<span class="slotname">${SLOT_NAME[slot]}</span>`; slots.appendChild(e); }
    }
    const rf = $('#rar-filter');
    rf.innerHTML = ['all', ...RAR_ORDER].map((r) => `<button type="button" data-r="${r}" class="${S.rarFilter === r ? 'on' : ''}" ${r !== 'all' ? `style="color:${RAR[r]}"` : ''}>${r === 'all' ? 'Todas' : RAR_NAME[r]}</button>`).join('');
    $$('button', rf).forEach((b) => { b.onclick = () => { S.rarFilter = b.dataset.r; renderBag(); }; });
    const grid = $('#bag-grid'); grid.innerHTML = '';
    bag.filter((i) => S.rarFilter === 'all' || i.rarity === S.rarFilter)
      .sort((a, b) => RAR_ORDER.indexOf(b.rarity) - RAR_ORDER.indexOf(a.rarity) || b.req - a.req)
      .forEach((it) => grid.appendChild(slotButton(it, () => { S.selItem = it.id; renderBag(); })));
    if (!bag.length) grid.innerHTML = '<p class="muted" style="grid-column:1/-1;margin:4px 0">Bolsa vazia. Monstros deixam itens ao morrer.</p>';
    renderItemDetail();
  }
  function statLine(st) {
    const parts = [];
    if (st.dmg) parts.push(`Dano ${st.dmg[0]}–${st.dmg[1]}`);
    if (st.def) parts.push(`Defesa +${st.def}`);
    if (st.hp) parts.push(`Vida +${st.hp}`);
    return parts.join(' · ');
  }
  function renderItemDetail() {
    const box = $('#item-detail');
    const it = S.char.items.find((i) => i.id === S.selItem);
    if (!it) { box.innerHTML = '<p class="muted">Toque em um item para ver detalhes.</p>'; return; }
    const cls = S.data.classes[S.char.cls];
    const lvlOk = S.char.level >= it.req;
    const usable = it.slot !== 'weapon' || (WEAPONS[S.char.cls] || []).includes(it.kind);
    const cur = S.char.items.find((i) => i.equipped && i.slot === it.slot && i.id !== it.id);
    let cmp = '';
    if (cur && !it.equipped) {
      const a = (it.stats.dmg ? it.stats.dmg[0] + it.stats.dmg[1] : 0) + (it.stats.def || 0) * 2 + (it.stats.hp || 0) / 4;
      const b = (cur.stats.dmg ? cur.stats.dmg[0] + cur.stats.dmg[1] : 0) + (cur.stats.def || 0) * 2 + (cur.stats.hp || 0) / 4;
      cmp = `<p>${a > b ? '<span style="color:#a8e08a">Melhor</span>' : a < b ? '<span class="bad">Pior</span>' : 'Igual'} que o equipado (${esc(statLine(cur.stats))})</p>`;
    }
    const set = it.set && S.data.sets[it.set] ? `<p class="muted">Conjunto ${esc(S.data.sets[it.set].name)} — ${esc(S.data.sets[it.set].bonus)}</p>` : '';
    box.innerHTML = `<h3 style="color:${RAR[it.rarity]}">${esc(it.name)}${it.plus ? ' +' + it.plus : ''}</h3>
      <p style="color:${RAR[it.rarity]}">${RAR_NAME[it.rarity]} · ${SLOT_NAME[it.slot]}</p>
      <p>${esc(statLine(it.stats))}</p>
      <p class="${lvlOk ? '' : 'bad'}">Requer nível ${it.req}</p>
      ${usable ? '' : `<p class="bad">${esc(cls.name)} não usa esta arma.</p>`}
      ${cmp}${set}
      <div class="row">${it.equipped
        ? '<button class="btn small" type="button" data-act="unequip">Desequipar</button>'
        : `<button class="btn small btn-gold" type="button" data-act="equip" ${lvlOk && usable ? '' : 'disabled'}>Equipar</button>
           <button class="btn small btn-ghost" type="button" data-act="sell">Vender por ${fmt.format(it.value)} Zen</button>`}</div>`;
    $$('[data-act]', box).forEach((b) => {
      b.onclick = () => {
        if (b.dataset.act === 'sell') S.selItem = null;
        send({ type: b.dataset.act, id: it.id });
      };
    });
  }
  const WEAPONS = { dark_knight: ['sword'], magic_gladiator: ['sword', 'staff'], dark_wizard: ['staff'], fairy_elf: ['bow'], dark_lord: ['scepter'], summoner: ['book'] };
  $('#btn-autoequip').onclick = () => send({ type: 'autoequip' });

  function renderHero() {
    const c = S.char, me = S.me || {};
    const names = { str: 'Força', agi: 'Agilidade', vit: 'Vitalidade', ene: 'Energia', cmd: 'Comando' };
    const keys = ['str', 'agi', 'vit', 'ene'].concat(c.cls === 'dark_lord' ? ['cmd'] : []);
    $('#hero-body').innerHTML = `
      <p>${esc(c.name)} · ${esc(S.data.classes[c.cls].name)} · Nível ${c.level}${c.resets ? ` · ${c.resets} resets` : ''}</p>
      <p class="free-pts">${c.free > 0 ? `${c.free} pontos para distribuir` : 'Nenhum ponto livre'}</p>
      <div class="stat-rows">${keys.map((k) => `<div class="stat-row"><span>${names[k]}</span><b>${c.stats[k]}</b>
        <button class="btn small" type="button" data-stat="${k}" data-n="1" ${c.free < 1 ? 'disabled' : ''} aria-label="Adicionar 1 ponto em ${names[k]}">+1</button>
        <button class="btn small" type="button" data-stat="${k}" data-n="${Math.min(10, c.free) || 10}" ${c.free < 1 ? 'disabled' : ''} aria-label="Adicionar até 10 pontos em ${names[k]}">+${Math.min(10, c.free) || 10}</button></div>`).join('')}</div>
      <label class="cfg-check"><input type="checkbox" id="auto-stats" ${c.settings.autoStats ? 'checked' : ''}> Distribuir pontos automaticamente ao subir de nível</label>
      <div class="derived">
        <div><span>Dano</span><br>${c.dmg[0]}–${c.dmg[1]}</div><div><span>Defesa</span><br>${c.def}</div>
        <div><span>Vida</span><br>${fmt.format(c.maxHp)}</div><div><span>Mana</span><br>${fmt.format(c.maxMp)}</div>
        <div><span>Ataque a cada</span><br>${(c.atkMs / 1000).toFixed(2)}s</div><div><span>Crítico</span><br>${Math.round(c.crit * 100)}%</div>
        <div><span>Poder de combate</span><br>${fmt.format(c.power)}</div><div><span>Monstros derrotados</span><br>${fmt.format(c.kills)}</div>
      </div>
      ${c.fullSet ? '<p style="color:#a8e08a">Bônus de conjunto completo ativo: +10% defesa, +5% dano.</p>' : ''}
      <h3>Habilidades</h3>
      <ul class="skills-list">${c.allSkills.map((s) => `<li>${esc(s.name)} <small class="muted">${c.level >= s.lvl ? 'liberada' : `nível ${s.lvl}`}</small></li>`).join('')}</ul>`;
    $$('#hero-body [data-stat]').forEach((b) => { b.onclick = () => send({ type: 'stat', stat: b.dataset.stat, n: Number(b.dataset.n) }); });
    $('#auto-stats').onchange = (e) => send({ type: 'settings', settings: { autoStats: e.target.checked } });
    void me;
  }

  function renderMaps() {
    const ul = $('#tp-list'); ul.innerHTML = '';
    for (const w of S.data.world) {
      const li = document.createElement('li');
      const here = S.map && S.map.map === w.id;
      if (here) li.className = 'here';
      const c = document.createElement('canvas'); c.width = 96; c.height = 54;
      PA.drawLandscape(c.getContext('2d'), w.theme, w.id, 96, 54, 0);
      li.appendChild(c);
      const info = document.createElement('div');
      info.innerHTML = `<b>${esc(w.name)}</b><small>${w.safe ? 'Cidade · zona segura · loja' : `Nível ${w.minLevel}+ · ${esc(w.monsters.join(', '))}`}</small>`;
      li.appendChild(info);
      const ok = S.char.level >= w.minLevel;
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'btn small' + (ok && !here ? ' btn-gold' : '');
      b.textContent = here ? 'Aqui' : ok ? 'Ir' : `Nv. ${w.minLevel}`;
      b.disabled = here || !ok;
      b.onclick = () => { send({ type: 'teleport', map: w.id }); closePanel(); };
      li.appendChild(b);
      ul.appendChild(li);
    }
  }

  function renderShop() {
    const body = $('#shop-body');
    if (!S.map || !S.map.safe) {
      body.innerHTML = '<p>A Mercadora Pasi fica na praça de Lorencia.</p><button class="btn btn-gold" type="button" id="go-town">Teleportar para Lorencia</button>';
      $('#go-town').onclick = () => { send({ type: 'teleport', map: 'lorencia' }); };
      return;
    }
    body.innerHTML = `<p>Seu Zen: <b>${fmt.format(S.char.zen)}</b></p>` + Object.entries(S.data.shop).map(([id, s]) => `
      <div class="shop-item"><canvas width="36" height="36" data-icon="${id === 'pot_hp' ? 'potion_hp' : 'potion_mp'}"></canvas>
        <div><b>${esc(s.name)}</b> — ${s.price} Zen<br><small class="muted">${esc(s.desc)} · você tem ${fmt.format(id === 'pot_hp' ? S.char.pots.hp : S.char.pots.mp)}</small></div>
        <div class="row">${[10, 50, 100].map((q) => `<button class="btn small" type="button" data-buy="${id}" data-q="${q}" ${S.char.zen < q * s.price ? 'disabled' : ''}>${q}× · ${fmt.format(q * s.price)}</button>`).join('')}</div>
      </div>`).join('') + '<p class="muted">Para vender itens, abra a Bolsa e toque no item.</p>';
    $$('#shop-body canvas[data-icon]').forEach((c) => PA.drawIcon(c.getContext('2d'), c.dataset.icon, 0, 0, 3, '#3a7aff'));
    $$('#shop-body [data-buy]').forEach((b) => { b.onclick = () => send({ type: 'buy', item: b.dataset.buy, qty: Number(b.dataset.q) }); });
  }

  function renderConfig() {
    const st = S.char.settings;
    $('#config-body').innerHTML = `
      <div class="cfg-row"><label for="cfg-hp">Usar poção de vida abaixo de <b id="cfg-hp-v">${Math.round(st.potHp * 100)}%</b></label>
        <input type="range" id="cfg-hp" min="0" max="90" step="5" value="${Math.round(st.potHp * 100)}"></div>
      <div class="cfg-row"><label for="cfg-mp">Usar poção de mana abaixo de <b id="cfg-mp-v">${Math.round(st.potMp * 100)}%</b></label>
        <input type="range" id="cfg-mp" min="0" max="90" step="5" value="${Math.round(st.potMp * 100)}"></div>
      <label class="cfg-check"><input type="checkbox" id="cfg-return" ${st.returnToFarm ? 'checked' : ''}> Voltar sozinho ao farm depois de morrer</label>
      <label class="cfg-check"><input type="checkbox" id="cfg-stats" ${st.autoStats ? 'checked' : ''}> Distribuir pontos automaticamente</label>
      <div class="cfg-row"><label for="cfg-loot">Guardar itens a partir de</label>
        <select id="cfg-loot">${RAR_ORDER.map((r) => `<option value="${r}" ${st.lootMin === r ? 'selected' : ''}>${RAR_NAME[r]}</option>`).join('')}</select>
        <small class="muted">Itens abaixo disso viram Zen na hora.</small></div>
      <h3>Habilidades no automático</h3>
      ${S.char.skills.filter((s) => s.id !== 'basic').map((s) => `<label class="cfg-check"><input type="checkbox" data-skill="${s.id}" ${s.on ? 'checked' : ''}> ${esc(s.name)} <small class="muted">${s.mana} MP · ${(s.cd / 1000).toFixed(1)}s</small></label>`).join('')}
      <p class="muted">Com o AUTO ligado, seu herói procura monstros, ataca, usa poções e continua evoluindo por até 8 horas enquanto você está fora.</p>`;
    const sendS = (s) => send({ type: 'settings', settings: s });
    $('#cfg-hp').oninput = (e) => { $('#cfg-hp-v').textContent = e.target.value + '%'; };
    $('#cfg-hp').onchange = (e) => sendS({ potHp: Number(e.target.value) / 100 });
    $('#cfg-mp').oninput = (e) => { $('#cfg-mp-v').textContent = e.target.value + '%'; };
    $('#cfg-mp').onchange = (e) => sendS({ potMp: Number(e.target.value) / 100 });
    $('#cfg-return').onchange = (e) => sendS({ returnToFarm: e.target.checked });
    $('#cfg-stats').onchange = (e) => sendS({ autoStats: e.target.checked });
    $('#cfg-loot').onchange = (e) => sendS({ lootMin: e.target.value });
    $$('#config-body [data-skill]').forEach((c) => { c.onchange = () => sendS({ skills: { [c.dataset.skill]: c.checked } }); });
  }

  // ================= chat =================
  function addChat(l, notify) {
    const li = document.createElement('li');
    if (!l.from) { li.className = 'sys'; li.textContent = l.text; }
    else { const b = document.createElement('b'); b.textContent = l.from + ': '; li.appendChild(b); li.append(l.text); }
    const ul = $('#chat-lines'); ul.appendChild(li);
    while (ul.children.length > 80) ul.firstChild.remove();
    ul.scrollTop = ul.scrollHeight;
    if (notify && S.panel !== 'chat') {
      if (!l.from) feed(l.text, 'lvl');
      else { S.chatUnread++; $('#chat-badge').hidden = false; }
    }
  }
  $('#chat-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const inp = e.target.text;
    if (inp.value.trim()) send({ type: 'chat', text: inp.value });
    inp.value = '';
  });

  // ================= relatório offline =================
  function showOffline(r) {
    const h = Math.floor(r.secs / 3600), m = Math.floor((r.secs % 3600) / 60);
    $('#offline-body').innerHTML = `
      <p>Seu herói continuou lutando em <b>${esc(r.map)}</b> por ${h ? h + 'h ' : ''}${m}min${r.capped ? ' (limite de 8 horas)' : ''}.</p>
      <dl><dt>Monstros</dt><dd>${fmt.format(r.kills)}</dd><dt>EXP</dt><dd>+${fmt.format(r.exp)}</dd>
        <dt>Níveis</dt><dd>${r.levels ? '+' + r.levels : '—'}</dd><dt>Zen</dt><dd>+${fmt.format(r.zen)}</dd>
        <dt>Poções usadas</dt><dd>${fmt.format(r.potsUsed)}</dd></dl>
      ${r.died ? '<p class="bad" style="color:#ff9a7a">As poções de vida acabaram e o herói caiu. Compre mais na loja de Lorencia.</p>' : ''}
      ${r.items.length ? `<p>Itens encontrados:</p><ul>${r.items.map((i) => `<li style="color:${RAR[i.rarity]}">${esc(i.name)}${i.plus ? ' +' + i.plus : ''}</li>`).join('')}</ul>` : ''}`;
    const d = $('#offline-dialog');
    d.showModal();
  }
  $('#offline-dialog').addEventListener('click', (e) => { if (e.target.closest('[data-close]')) e.currentTarget.close(); });

  // ================= botões =================
  $('#btn-auto').onclick = () => send({ type: 'auto', on: !(S.me && S.me.auto) });
  $('#btn-pot-hp').onclick = () => send({ type: 'potion', kind: 'hp' });
  $('#btn-pot-mp').onclick = () => send({ type: 'potion', kind: 'mp' });
  $('#btn-exit').onclick = () => { leaving = true; send({ type: 'leave' }); setTimeout(() => { location.href = '/'; }, 800); };
  PA.drawIcon($('#btn-pot-hp canvas').getContext('2d'), 'potion_hp', 0, 0, 3, '#fff');
  PA.drawIcon($('#btn-pot-mp canvas').getContext('2d'), 'potion_mp', 0, 0, 3, '#3a7aff');

  // ================= início =================
  (async function init() {
    centerMsg('Entrando no mundo…');
    try {
      const r = await fetch('/api/gamedata', { credentials: 'same-origin' });
      S.data = await r.json();
    } catch (_) { centerMsg('Não foi possível carregar o jogo. Verifique a internet.', true); return; }
    connect();
  })();
})();
