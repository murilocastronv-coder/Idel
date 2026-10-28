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
      if (p.dead && !dead) p.dyingAt = 0;
      Object.assign(p, { x, y, hp, maxHp, dead: !!dead, flip: !!flip });
      if (p.rx === null) { p.rx = x; p.ry = y; }
    }
    for (const [id, x, y, hp, dead, flip] of m.M) {
      const mo = S.monsters.get(id);
      if (!mo) continue;
      if (mo.dead && !dead) { mo.rx = x; mo.ry = y; mo.dyingAt = 0; }
      Object.assign(mo, { x, y, hp, dead: !!dead, flip: !!flip });
      if (mo.rx === null) { mo.rx = x; mo.ry = y; }
    }
    for (const ev of m.ev) handleEvent(ev, now);
    S.boss = m.boss;
    S.me = m.me;
    renderHud();
  }

  function ent(id) { return id[0] === 'p' ? S.players.get(id) : S.monsters.get(id); }

  const PROJ = { fire: 'proj_fire', energy: 'proj_energy', ice: 'proj_ice', arrow: 'proj_arrow', arrow3: 'proj_arrow', dark: 'proj_dark', spirit: 'proj_spirit' };
  const IMPACT = { fire: 'impact_fire', energy: 'impact_energy', ice: 'impact_ice', arrow: 'impact_arrow', arrow3: 'impact_arrow', dark: 'impact_dark',
    spirit: 'impact_spirit', lightning: 'impact_lightning', meteor: 'impact_fire', claw: 'impact_blood', boss: 'impact_dark', slash: 'impact_energy', whirl: 'impact_energy' };
  const BURST = { meteor: 'burst_fire', fire: 'burst_fire', whirl: 'burst_energy', lightning: 'burst_lightning', spirit: 'burst_spirit', arrow3: 'burst_arrow', dark: 'burst_dark' };
  const MON_H = { slime: 26, goblin: 46, goblin_elite: 46, spider: 30, skeleton: 52, skeleton_king: 62 };
  const HERO_H = 56;
  const monSprite = (m) => m.sprite + (m.tint === 'elite' ? '_elite' : '');

  function handleEvent(ev, now) {
    if (ev.k === 'h') {
      const a = ent(ev.a), t = ent(ev.t);
      if (!t) return;
      if (a) { a.attackStart = now; a.attackUntil = now + 340; }
      t.hurtUntil = now + 160;
      const color = ev.t === S.youId ? '#ff6b5b' : ev.c ? '#ffb02e' : '#ffffff';
      const ranged = RANGED.has(ev.fx) && a && !ev.aoe;
      const delay = ranged ? 220 : 0;
      if (ranged) S.fx.push({ kind: 'proj', from: a, to: t, sprite: PROJ[ev.fx] || 'proj_energy', t0: now, dur: delay });
      else if (!ev.aoe && a && ev.a[0] === 'p' && a.info) {
        S.fx.push({ kind: 'crescent', at: t, from: a, sprite: a.info.cls === 'dark_lord' ? 'crescent_fire' : a.info.cls === 'magic_gladiator' ? 'crescent_dark' : 'crescent_energy', t0: now, dur: 240 });
      }
      S.fx.push({ kind: 'impact', at: t, sprite: IMPACT[ev.fx] || 'impact_energy', t0: now + delay, dur: 260 });
      S.floats.push({ at: t, text: String(ev.d), color, big: !!ev.c, t0: now + delay });
    } else if (ev.k === 'aoe') {
      S.fx.push({ kind: 'burst', x: ev.x, y: ev.y, r: ev.r, sprite: BURST[ev.fx] || 'burst_energy', t0: now, dur: 460 });
      const a = ent(ev.a); if (a) { a.attackStart = now; a.attackUntil = now + 340; }
    } else if (ev.k === 'heal') {
      const t = ent(ev.t);
      if (t) { S.floats.push({ at: t, text: '+' + ev.d, color: '#9affd0', t0: now }); S.fx.push({ kind: 'heal', at: t, t0: now, dur: 600 }); }
    } else if (ev.k === 'lv') {
      const t = ent(ev.t);
      if (t) { S.fx.push({ kind: 'lvl', at: t, t0: now, dur: 1200 }); S.floats.push({ at: t, text: 'LEVEL UP!', color: '#ffd36b', big: true, t0: now }); }
      if (ev.t === S.youId) feed('Subiu de nível!', 'lvl');
    } else if (ev.k === 'die') {
      const t = ent(ev.t); if (t) t.dyingAt = now;
    } else if (ev.k === 'pdie') {
      const t = ent(ev.t); if (t) t.dyingAt = now;
      if (ev.t === S.youId) feed('Você caiu em combate.', 'warn');
    }
  }

  // ================= chão do mapa (gerado igual para todos, no dobro da resolução) =================
  function rng(seed) { let s = 0; for (const ch of seed) s = (s * 31 + ch.charCodeAt(0)) >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
  const GS = 2;
  const GROUND = {
    town: { base: '#4f7a3a', a: '#5b8a44', b: '#43692f', blade: '#6aa04e' },
    grass: { base: '#5b8a3c', a: '#6a9a48', b: '#4a7530', blade: '#7ab456' },
    forest: { base: '#2f5a26', a: '#3b6b2a', b: '#244a1e', blade: '#4a8a36' },
    cave: { base: '#3a3240', a: '#463c4c', b: '#2c2632', blade: '#524658' },
    noria: { base: '#3f7a32', a: '#4a8a3a', b: '#336a2a', blade: '#6ab84e' },
    snow: { base: '#e8eef6', a: '#f4f8fc', b: '#d4dee8', blade: '#c8d4e2' },
    dungeon: { base: '#2e2830', a: '#36303a', b: '#262028', blade: '#3e3644' },
  };
  function buildGround(m) {
    const W = m.w * GS, H = m.h * GS;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    const T = GROUND[m.theme] || GROUND.grass;
    const r = rng(m.map);
    const px = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h))); };
    const disc = (cx, cy, rad, col, flat = 1) => { for (let dy = -rad; dy <= rad; dy++) { const w = Math.floor(Math.sqrt(rad * rad - dy * dy)); px(cx - w, cy + dy * flat, w * 2 + 1, Math.max(1, flat), col); } };
    const shadow = (cx, cy, rad) => { g.fillStyle = 'rgba(0,0,0,.22)'; for (let dy = -rad / 3; dy <= rad / 3; dy++) { const w = Math.floor(rad * Math.sqrt(1 - (dy * 3 / rad) ** 2)); g.fillRect(Math.round(cx - w), Math.round(cy + dy), w * 2, 1); } };
    px(0, 0, W, H, T.base);
    for (let i = 0; i < W * H / 2200; i++) px(r() * W, r() * H, 10 + r() * 26, 4 + r() * 10, r() < 0.5 ? T.a : T.b);
    for (let i = 0; i < W * H / 140; i++) { const x = r() * W, y = r() * H; px(x, y, 1, 2, T.blade); if (r() < 0.4) px(x + 1, y + 1, 1, 1, T.b); }
    const tree = (x, y, s = 1, dark = false) => {
      shadow(x + 4 * s, y + 2, 16 * s);
      px(x - 4 * s, y - 18 * s, 8 * s, 20 * s, '#3a2410'); px(x - 3 * s, y - 18 * s, 6 * s, 20 * s, '#5a3a1c'); px(x - 3 * s, y - 18 * s, 2 * s, 20 * s, '#7a5230');
      px(x - 7 * s, y, 4 * s, 2 * s, '#5a3a1c'); px(x + 3 * s, y, 4 * s, 2 * s, '#5a3a1c');
      const c0 = dark ? '#10260e' : '#163a14', c1 = dark ? '#1f4a1c' : '#2d6a2a', c2 = dark ? '#2d5a24' : '#3f8a36', c3 = dark ? '#3f7a32' : '#6ab84e';
      disc(x, y - 30 * s, 17 * s, c0); disc(x - 9 * s, y - 24 * s, 9 * s, c0); disc(x + 10 * s, y - 25 * s, 9 * s, c0);
      disc(x, y - 30 * s, 15 * s, c1); disc(x - 9 * s, y - 24 * s, 7 * s, c1); disc(x + 10 * s, y - 25 * s, 7 * s, c1);
      disc(x - 3 * s, y - 34 * s, 10 * s, c2); disc(x - 6 * s, y - 37 * s, 5 * s, c3);
      for (let k = 0; k < 14 * s; k++) px(x + (r() - 0.5) * 26 * s, y - 30 * s + (r() - 0.5) * 24 * s, 2, 2, r() < 0.5 ? c3 : c0);
    };
    const rock = (x, y, s = 1) => { shadow(x + 2, y + 3, 11 * s); disc(x, y, 9 * s, '#4a4a54', 1); disc(x, y - 1, 8 * s, '#7a7a86'); disc(x - 3 * s, y - 3 * s, 4 * s, '#a8a8b4'); px(x + 2 * s, y + 2 * s, 4 * s, 1, '#4a4a54'); };
    const flower = (x, y, col) => { px(x, y + 2, 1, 3, '#2d6a2a'); px(x - 1, y, 3, 2, col); px(x, y - 1, 1, 4, col); px(x, y, 1, 1, '#fff6c8'); };
    const torch = (x, y) => {
      const grd = g.createRadialGradient(x, y - 22, 2, x, y - 22, 40); grd.addColorStop(0, 'rgba(255,170,60,.35)'); grd.addColorStop(1, 'rgba(255,170,60,0)');
      g.fillStyle = grd; g.fillRect(x - 40, y - 62, 80, 80);
      px(x - 2, y - 20, 4, 22, '#3a2410'); px(x - 1, y - 20, 2, 22, '#7a5230'); px(x - 4, y - 22, 8, 3, '#5a5a66');
      disc(x, y - 27, 4, '#ff6a1a'); disc(x, y - 28, 3, '#ffb02e'); px(x - 1, y - 31, 2, 3, '#fff2a8');
    };
    if (m.theme === 'town') {
      const cx = m.w, cy = m.h; // centro em px de alta resolução
      px(cx - 360, cy - 240, 720, 480, '#6e685c');
      for (let y = cy - 240, row = 0; y < cy + 240; y += 16, row++) {
        for (let x = cx - 360 + (row % 2) * 12; x < cx + 360; x += 24) {
          const tone = ['#9a9488', '#8a8478', '#a8a296', '#7e786c'][(r() * 4) | 0];
          px(x + 1, y + 1, 22, 14, tone); px(x + 1, y + 1, 22, 2, '#b8b2a6'); px(x + 1, y + 13, 22, 2, '#6a645a');
          if (r() < 0.08) px(x + 6 + r() * 10, y + 5, 5, 1, '#5a544a');
        }
      }
      // fonte
      shadow(cx + 4, cy + 46, 60); disc(cx, cy, 52, '#3a3a46'); disc(cx, cy, 48, '#7a7a88'); disc(cx, cy, 42, '#5a5a66'); disc(cx, cy, 38, '#2a5aa8'); disc(cx - 8, cy - 8, 22, '#3a7ad8');
      for (let k = 0; k < 30; k++) px(cx - 30 + r() * 60, cy - 30 + r() * 60, 3, 1, '#bff0ff');
      px(cx - 8, cy - 64, 16, 40, '#9a9aa8'); px(cx - 8, cy - 64, 5, 40, '#c8c8d8'); disc(cx, cy - 70, 10, '#c8c8d8'); disc(cx - 3, cy - 73, 4, '#ffffff');
      // casas
      for (let i = 0; i < 6; i++) {
        const hx = (60 + i * 120) * GS, hy = 70 * GS;
        shadow(hx + 80, hy + 104, 90);
        px(hx, hy, 140, 100, '#7a5a3a');
        for (let k = 0; k < 100; k += 10) { px(hx, hy + k, 140, 9, k % 20 ? '#a07a52' : '#94704a'); px(hx, hy + k + 9, 140, 1, '#5a3a22'); }
        px(hx - 12, hy - 40, 164, 44, '#5a1414');
        for (let k = 0; k < 40; k += 8) for (let j = 0; j < 164; j += 14) px(hx - 12 + j + (k / 8 % 2) * 7, hy - 40 + k, 13, 7, k < 8 ? '#b83a2a' : '#8a2a2a');
        px(hx - 12, hy + 2, 164, 4, '#3a0a0a');
        px(hx + 56, hy + 50, 28, 50, '#3a2418'); px(hx + 58, hy + 52, 24, 48, '#5a3a22'); px(hx + 76, hy + 76, 3, 3, '#e8b84a');
        for (const wx of [hx + 16, hx + 100]) { px(wx, hy + 26, 24, 22, '#3a2418'); px(wx + 2, hy + 28, 20, 18, '#ffd36b'); px(wx + 11, hy + 28, 2, 18, '#3a2418'); px(wx + 2, hy + 36, 20, 2, '#3a2418'); px(wx + 2, hy + 28, 8, 6, '#fff2a8'); }
      }
      // muralha
      px(0, H - 80, W, 80, '#4a4a56');
      for (let x = 0; x < W; x += 20) for (let y = H - 80; y < H; y += 12) px(x + ((y / 12) % 2) * 10, y, 19, 11, r() < 0.5 ? '#6a6a78' : '#5a5a66');
      for (let x = 0; x < W; x += 32) { px(x, H - 96, 20, 16, '#6a6a78'); px(x, H - 96, 20, 3, '#8a8a98'); }
      for (let i = 0; i < 12; i++) tree(r() * W, 400 + r() * (H - 560), 1);
      // rio a leste
      for (let y = 0; y < H - 80; y += 2) {
        const xc = W - 70 + Math.sin(y / 70) * 20;
        px(xc - 52, y, 104, 2, '#4a7a3a'); px(xc - 46, y, 92, 2, '#8a7a5a'); px(xc - 40, y, 80, 2, '#1a4a8a'); px(xc - 30, y, 54, 2, '#2a6ab8');
        if (r() < 0.12) px(xc - 20 + r() * 30, y, 8, 1, '#9ad8ff');
      }
      // barraca da loja
      const sx = 470 * GS, sy = 250 * GS;
      shadow(sx, sy, 70);
      px(sx - 56, sy - 72, 6, 64, '#5a3a1c'); px(sx + 50, sy - 72, 6, 64, '#5a3a1c');
      for (let i = 0; i < 120; i += 20) { px(sx - 62 + i, sy - 94, 10, 22, '#c8452c'); px(sx - 52 + i, sy - 94, 10, 22, '#f0e6cc'); }
      for (let i = 0; i < 120; i += 10) disc(sx - 57 + i, sy - 72, 5, i % 20 ? '#f0e6cc' : '#c8452c');
      px(sx - 62, sy - 24, 124, 16, '#6a4a2a'); px(sx - 62, sy - 24, 124, 4, '#9a7a52');
      for (let k = 0; k < 5; k++) { disc(sx - 40 + k * 20, sy - 30, 5, ['#d0302a', '#3a7aff', '#d0302a', '#3a7aff', '#e8b84a'][k]); px(sx - 41 + k * 20, sy - 33, 2, 2, '#ffffff'); }
    } else if (m.theme === 'noria') {
      // floresta élfica: lagos azuis, árvores coloridas, cogumelos e cristais
      for (let i = 0; i < 9; i++) {
        const x = r() * W, y = r() * H, rad = 40 + r() * 60;
        disc(x, y, rad + 6, '#2a5a2a'); disc(x, y, rad, '#1a5a8a'); disc(x - rad * 0.2, y - rad * 0.2, rad * 0.7, '#2a7ab8');
        for (let k = 0; k < 12; k++) px(x - rad * 0.6 + r() * rad * 1.2, y - rad * 0.5 + r() * rad, 6, 1, '#9ad8ff');
      }
      for (let x = 0; x < W; x += 2) {
        const yc = H * 0.55 + Math.sin(x / 210) * 140;
        px(x, yc - 16, 2, 32, '#8a6a3a'); px(x, yc - 16, 2, 2, '#6a4a24'); if (r() < 0.1) px(x, yc - 8 + r() * 16, 2, 2, '#c8a86a');
      }
      for (let i = 0; i < 260; i++) flower(r() * W, r() * H, ['#ff7ad9', '#c06bff', '#ffd36b', '#9ac8ff'][i % 4]);
      const items = [];
      for (let i = 0; i < 70; i++) items.push(['t', r() * W, r() * H, r() < 0.25]);
      for (let i = 0; i < 18; i++) items.push(['c', r() * W, r() * H]);
      items.sort((a, b) => a[2] - b[2]).forEach(([k, x, y, pink]) => {
        if (k === 'c') {
          shadow(x + 2, y + 2, 10);
          g.fillStyle = '#5a2a9a'; g.beginPath(); g.moveTo(x, y - 30); g.lineTo(x + 7, y); g.lineTo(x - 7, y); g.fill();
          px(x - 2, y - 26, 3, 20, '#c06bff'); px(x - 1, y - 24, 1, 12, '#f0d8ff');
          const grd = g.createRadialGradient(x, y - 14, 1, x, y - 14, 26); grd.addColorStop(0, 'rgba(192,107,255,.35)'); grd.addColorStop(1, 'rgba(192,107,255,0)');
          g.fillStyle = grd; g.fillRect(x - 26, y - 40, 52, 52);
        } else if (pink) {
          shadow(x + 4, y + 2, 16);
          px(x - 4, y - 18, 8, 20, '#5a3a1c'); px(x - 3, y - 18, 2, 20, '#7a5230');
          disc(x, y - 30, 17, '#6a1a5a'); disc(x, y - 30, 15, '#c8458a'); disc(x - 4, y - 34, 9, '#ff7ad9'); disc(x - 6, y - 37, 4, '#ffd0ec');
        } else tree(x, y, 1);
      });
      for (let i = 0; i < 50; i++) { const x = r() * W, y = r() * H; px(x - 1, y - 4, 3, 6, '#e8e0d0'); disc(x, y - 6, 5, '#3a7ad8'); disc(x - 1, y - 7, 3, '#7ab8ff'); px(x - 2, y - 8, 2, 2, '#ffffff'); }
    } else if (m.theme === 'snow') {
      // Devias: neve, gelo, pinheiros nevados e cristais de gelo
      for (let i = 0; i < W * H / 900; i++) px(r() * W, r() * H, 2 + r() * 6, 1, r() < 0.5 ? '#dfe8f4' : '#ffffff');
      for (let i = 0; i < 8; i++) {
        const x = r() * W, y = r() * H, rad = 40 + r() * 50;
        disc(x, y, rad + 4, '#9ab8d8'); disc(x, y, rad, '#b8d8f0'); disc(x - rad * 0.25, y - rad * 0.25, rad * 0.5, '#e0f2ff');
        for (let k = 0; k < 6; k++) px(x - rad * 0.6 + r() * rad, y - rad * 0.4 + r() * rad * 0.8, 10, 1, '#ffffff');
      }
      for (let x = 0; x < W; x += 2) { const yc = H * 0.5 + Math.sin(x / 160) * 120; px(x, yc - 14, 2, 28, '#c8d4e4'); if (r() < 0.2) px(x, yc - 6 + r() * 12, 2, 2, '#a8b8cc'); }
      const pine = (x, y, s) => {
        shadow(x + 3, y + 2, 14 * s);
        px(x - 2 * s, y - 8 * s, 4 * s, 10 * s, '#4a2e18');
        for (let k = 0; k < 4; k++) {
          const ww = (16 - k * 3) * s, yy = y - 8 * s - k * 9 * s;
          for (let j = 0; j < 10 * s; j++) { const w2 = ww * (j / (10 * s)); px(x - w2, yy - 10 * s + j, w2 * 2, 1, j < 3 * s ? '#ffffff' : (j % 3 ? '#1e4a3a' : '#2a5a48')); }
        }
        px(x - 1, y - 48 * s, 2, 4, '#ffffff');
      };
      const crystal = (x, y) => {
        shadow(x + 2, y + 2, 12);
        for (const [dx, h, wd] of [[-6, 22, 5], [0, 34, 7], [7, 18, 5]]) {
          g.fillStyle = '#3a8ad8'; g.beginPath(); g.moveTo(x + dx, y - h); g.lineTo(x + dx + wd, y); g.lineTo(x + dx - wd, y); g.fill();
          px(x + dx - 1, y - h + 6, 2, h - 8, '#bff0ff');
        }
        const grd = g.createRadialGradient(x, y - 16, 1, x, y - 16, 30); grd.addColorStop(0, 'rgba(160,220,255,.35)'); grd.addColorStop(1, 'rgba(160,220,255,0)');
        g.fillStyle = grd; g.fillRect(x - 30, y - 46, 60, 60);
      };
      const items = [];
      for (let i = 0; i < 60; i++) items.push(['p', r() * W, r() * H, r() < 0.3 ? 1.3 : 1]);
      for (let i = 0; i < 22; i++) items.push(['c', r() * W, r() * H]);
      for (let i = 0; i < 18; i++) items.push(['r', r() * W, r() * H]);
      items.sort((a, b) => a[2] - b[2]).forEach(([k, x, y, s]) => (k === 'p' ? pine(x, y, s) : k === 'c' ? crystal(x, y) : rock(x, y, 1)));
      for (let i = 0; i < 400; i++) px(r() * W, r() * H, 1, 1, '#ffffff');
    } else if (m.theme === 'dungeon') {
      // pedra escura com fendas de lava, pilares, ossos e tochas
      for (let y = 0; y < H; y += 32) for (let x = (y / 32 % 2) * 16; x < W; x += 32) {
        px(x, y, 31, 31, ['#2e2830', '#342c36', '#28222a'][(r() * 3) | 0]); px(x, y, 31, 2, '#40363e'); px(x, y + 29, 31, 2, '#1c181e');
        if (r() < 0.15) px(x + 6 + r() * 16, y + 8 + r() * 16, 8, 1, '#1c181e');
      }
      const lava = (x0, y0, len) => {
        let x = x0, y = y0;
        for (let k = 0; k < len; k++) {
          px(x - 3, y - 3, 7, 7, '#5a1408'); px(x - 2, y - 2, 5, 5, '#d8401a'); px(x - 1, y - 1, 3, 3, '#ffb02e');
          x += 3 + r() * 3; y += (r() - 0.5) * 8;
        }
      };
      for (let i = 0; i < 26; i++) lava(r() * W, r() * H, 20 + r() * 40);
      for (let i = 0; i < 6; i++) {
        const x = r() * W, y = r() * H, rad = 26 + r() * 30;
        disc(x, y, rad + 4, '#3a0a04'); disc(x, y, rad, '#c8301a'); disc(x - rad * 0.2, y - rad * 0.2, rad * 0.65, '#ff7a2a'); disc(x - rad * 0.35, y - rad * 0.35, rad * 0.3, '#ffd36b');
        const grd = g.createRadialGradient(x, y, 2, x, y, rad * 2.2); grd.addColorStop(0, 'rgba(255,120,40,.3)'); grd.addColorStop(1, 'rgba(255,120,40,0)');
        g.fillStyle = grd; g.fillRect(x - rad * 2.2, y - rad * 2.2, rad * 4.4, rad * 4.4);
      }
      for (let i = 0; i < 50; i++) {
        const x = r() * W, y = r() * H, hgt = 28 + r() * 22;
        shadow(x + 4, y + 2, 16);
        px(x - 12, y - hgt, 24, hgt, '#1c181e'); px(x - 10, y - hgt, 20, hgt, '#3a3240'); px(x - 10, y - hgt, 5, hgt, '#4e4454');
        px(x - 13, y - hgt - 6, 26, 6, '#4e4454'); px(x - 13, y - hgt - 6, 26, 2, '#6a5e70');
      }
      for (let i = 0; i < 60; i++) { const x = r() * W, y = r() * H; px(x, y, 12, 3, '#d8cfb4'); px(x, y, 12, 1, '#fffbe8'); disc(x - 1, y + 1, 2, '#d8cfb4'); disc(x + 12, y + 1, 2, '#d8cfb4'); }
      for (let i = 0; i < 8; i++) { const x = r() * W, y = r() * H; disc(x, y, 7, '#d8cfb4'); px(x - 3, y - 2, 2, 3, '#1b1b2a'); px(x + 1, y - 2, 2, 3, '#1b1b2a'); px(x - 2, y + 4, 5, 3, '#d8cfb4'); }
      for (let x = 0; x < W; x += 8) { const h = 20 + (r() * 28 | 0); px(x, 0, 8, h, '#140e14'); px(x + 2, h, 4, 4, '#140e14'); }
      // sala do boss
      px(1720, 640, 360, 320, '#1a1218');
      for (let x = 1720; x < 2080; x += 20) for (let y = 640; y < 960; y += 20) { px(x + 1, y + 1, 18, 18, r() < 0.3 ? '#3a1a22' : '#2a161c'); px(x + 1, y + 1, 18, 1, '#4a2a32'); }
      px(1740, 760, 320, 80, '#5a0a1a'); px(1740, 760, 320, 4, '#e8b84a'); px(1740, 836, 320, 4, '#e8b84a');
      for (let i = 0; i < 24; i++) torch(r() * W, r() * H);
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
    const ox = e.rx, oy = e.ry;
    e.rx += (e.x - e.rx) * k; e.ry += (e.y - e.ry) * k;
    const v = dt > 0 ? Math.hypot(e.rx - ox, e.ry - oy) / dt : 0;
    e.speed = (e.speed || 0) * 0.8 + v * 0.2;
    if (e.phase === undefined) e.phase = Math.random() * 1000;
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
      // chão: recorta a parte visível (o chão tem o dobro da resolução do mundo)
      const sx = Math.max(0, camX), sy = Math.max(0, camY);
      const sw = Math.min(S.map.w - sx, vw), sh = Math.min(S.map.h - sy, vh);
      ctx.drawImage(S.ground, sx * GS, sy * GS, sw * GS, sh * GS, (sx - camX) * zoom, (sy - camY) * zoom, sw * zoom, sh * zoom);
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
  const spr = () => zoom / 2; // pixels de tela por pixel de sprite (sprites têm o dobro da resolução do mundo)

  function animOf(e, now) {
    if (e.dyingAt) return ['death', now - e.dyingAt, true];
    if (now < (e.attackUntil || 0)) return ['attack', now - (e.attackStart || now), true];
    if (now < (e.hurtUntil || 0) && e.info) return ['hit', 0, true];
    if ((e.speed || 0) > 10) return ['walk', now + e.phase, false];
    return ['idle', now + e.phase, false];
  }
  function shadowAt(x, y, w) {
    ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(x, y, w, w * 0.32, 0, 0, Math.PI * 2); ctx.fill();
  }

  function drawEntities(now) {
    const list = [];
    S.monsters.forEach((m) => {
      if (m.dead && !(m.dyingAt && now - m.dyingAt < 900)) return;
      list.push(['m', m]);
    });
    S.players.forEach((p) => {
      if (!p.info) return;
      if (p.dead && !(p.dyingAt && now - p.dyingAt < 1400)) return;
      list.push(['p', p]);
    });
    if (S.map.npcs) S.map.npcs.forEach((n) => list.push(['n', n]));
    list.sort((a, b) => (a[1].ry ?? a[1].y) - (b[1].ry ?? b[1].y));
    const myTarget = S.me && S.me.target;
    const sc = spr();
    for (const [kind, e] of list) {
      if (kind === 'n') {
        const [x, y] = toScreen(e.x, e.y);
        shadowAt(x, y, 9 * zoom);
        Sprites.hero(ctx, 'dark_wizard', { hair: 1, skin: 1 }, 'idle', now, x, y, sc, true);
        label(e.name, x, y - HERO_H * sc - 4 * dpr, '#ffd36b');
        label('Loja', x, y - HERO_H * sc - 17 * dpr, '#9affd0', 10);
        continue;
      }
      const [x, y] = toScreen(e.rx, e.ry);
      const [act, t, once] = animOf(e, now);
      if (kind === 'm') {
        const name = monSprite(e);
        const meta = Sprites.meta('monsters', name);
        const ms = meta ? meta.scale : 1;
        const h = (MON_H[name] || 40) * ms * sc;
        const w = Math.max(10 * zoom, h * 0.45);
        if (e.id === myTarget && !e.dead) { ctx.strokeStyle = '#ffd36b'; ctx.lineWidth = dpr * 2; ctx.beginPath(); ctx.ellipse(x, y, w, w * 0.34, 0, 0, Math.PI * 2); ctx.stroke(); }
        shadowAt(x, y, w * 0.8);
        const hurt = now < (e.hurtUntil || 0) && !e.dyingAt;
        Sprites.monster(ctx, name, act, t, x, y, sc, !e.flip, { once, white: hurt && (now - e.hurtUntil) > -90 });
        if (e.dead) continue;
        const top = y - h - 6 * dpr;
        hpBar(x, top, Math.max(28 * dpr, w * 1.6), e.hp / e.maxHp, e.boss ? '#c06bff' : e.elite ? '#ffb02e' : '#e0473a');
        if (e.boss || e.elite || e.id === myTarget) label(`${e.name} Nv.${e.level}`, x, top - 4 * dpr, e.boss ? '#e0b0ff' : e.elite ? '#ffd36b' : '#f0e6cc', 10);
      } else {
        const info = e.info;
        const isMe = e === S.players.get(S.youId);
        shadowAt(x, y, 9 * zoom);
        const rar = info.weaponRarity;
        if (rar && ['epic', 'legendary', 'ancestral'].includes(rar)) {
          ctx.globalAlpha = 0.35 + 0.15 * Math.sin(now / 200); ctx.fillStyle = RAR[rar];
          ctx.beginPath(); ctx.ellipse(x, y, 13 * zoom, 4 * zoom, 0, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
        }
        Sprites.hero(ctx, info.cls, info.ap, act, t, x, y, sc, e.flip, { once });
        if (e.dead) continue;
        const top = y - HERO_H * sc - 4 * dpr;
        hpBar(x, top, 16 * zoom, e.hp / e.maxHp, isMe ? '#6aa84f' : '#4aa3ff');
        label(`${info.name} ${info.level}`, x, top - 4 * dpr, isMe ? '#ffd36b' : '#bfe0ff', 11);
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
  // centro do corpo, em coordenadas do mundo
  function center(e) {
    if (e.sprite) { const n = monSprite(e); const meta = Sprites.meta('monsters', n); return [e.rx, e.ry - (MON_H[n] || 40) * (meta ? meta.scale : 1) / 4]; }
    return [e.rx, e.ry - HERO_H / 4];
  }
  function drawFx(now) {
    const sc = spr();
    S.fx = S.fx.filter((f) => {
      const p = (now - f.t0) / f.dur;
      if (p >= 1) return false;
      if (p < 0) return true;
      if (f.kind === 'proj') {
        const [ax, ay] = center(f.from), [bx, by] = center(f.to);
        const [x, y] = toScreen(ax + (bx - ax) * p, ay + (by - ay) * p);
        Sprites.drawEffect(ctx, f.sprite, Math.floor((now - f.t0) / 60) % 4, x, y, sc * 1.2, Math.atan2(by - ay, bx - ax));
      } else if (f.kind === 'impact') {
        const [cx, cy] = center(f.at); const [x, y] = toScreen(cx, cy);
        Sprites.drawEffect(ctx, f.sprite, p * 4, x, y, sc * 1.3);
      } else if (f.kind === 'crescent') {
        const [cx, cy] = center(f.at); const [x, y] = toScreen(cx, cy);
        const left = f.from && f.from.rx > f.at.rx;
        Sprites.drawEffect(ctx, f.sprite, p * 4, x, y, sc * 1.4, left ? Math.PI : 0, 1 - p * 0.3);
      } else if (f.kind === 'burst') {
        const [x, y] = toScreen(f.x, f.y);
        Sprites.drawEffect(ctx, f.sprite, p * 6, x, y, zoom * f.r / 44, 0, 0.85);
      } else if (f.kind === 'heal') {
        const [x, y] = toScreen(f.at.rx, f.at.ry);
        Sprites.drawEffect(ctx, 'heal', p * 4, x, y, sc * 1.4);
      } else if (f.kind === 'lvl') {
        const [x, y] = toScreen(f.at.rx, f.at.ry);
        ctx.globalAlpha = 1 - p; ctx.fillStyle = '#ffd36b';
        for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2 + p * 3; ctx.fillRect(x + Math.cos(a) * 14 * zoom, y - 14 * zoom + Math.sin(a) * 5 * zoom - p * 16 * zoom, 2 * dpr * 2, 2 * dpr * 2); }
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
      const img = document.createElement('img');
      img.src = `/assets/maps/${w.id}.jpg`; img.alt = '';
      li.appendChild(img);
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
      await Sprites.ready;
    } catch (_) { centerMsg('Não foi possível carregar o jogo. Verifique a internet.', true); return; }
    connect();
  })();
})();
