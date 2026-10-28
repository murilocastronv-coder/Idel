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
      case 'reward': if (window.Sfx) Sfx.coin(); return feed(`+${fmt.format(m.exp)} EXP  +${fmt.format(m.zen)} Zen${m.share ? ` (${m.share}% do dano)` : ''}`, '');
      case 'duelInvite': return showDuelInvite(m);
      case 'duel': S.duel = { with: m.with, name: m.name, until: performance.now() + m.until }; renderDuelBar(); if (window.Sfx) Sfx.duel(); feed(`Duelo contra ${m.name} começou! Vence quem derrubar o outro.`, 'pvp'); return;
      case 'duelEnd': S.duel = null; renderDuelBar(); feed(m.result === 'win' ? 'Você venceu o duelo!' : m.result === 'loss' ? 'Você perdeu o duelo.' : 'Duelo encerrado sem vencedor.', m.result === 'win' ? 'lvl' : 'warn'); return;
      case 'drop': {
        const it = m.item;
        if (m.x !== null && m.x !== undefined) S.drops.push({ x: m.x, y: m.y, dx: (Math.random() - 0.5) * 24, item: it, t0: performance.now() });
        feed(`Item: ${it.name}${it.plus ? ' +' + it.plus : ''} (${RAR_NAME[it.rarity]})`, 'drop', RAR[it.rarity]);
        return;
      }
      case 'log': return feed(m.text, m.kind === 'warn' ? 'warn' : m.kind === 'quest' ? 'quest' : m.kind === 'pvp' ? 'pvp' : '');
      case 'quests': S.quests = m; $('#quest-badge').hidden = !m.claimable; if (S.panel === 'quests') renderQuests(); return;
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
    S.fx = []; S.floats = []; S.drops = []; S.dangers = []; S.parts = [];
    S.enterAt = performance.now(); S.camInit = false;
    const wInfo = S.data && S.data.world.find((w) => w.id === m.map);
    const ban = $('#map-banner');
    ban.innerHTML = `<b>${esc(m.name)}</b><small>${m.safe ? 'Zona segura' : wInfo && wInfo.pvp ? 'Zona PvP · jogadores podem se atacar' : wInfo ? `Nível ${wInfo.minLevel}+` : ''}</small>`;
    ban.classList.remove('show'); void ban.offsetWidth; ban.classList.add('show');
    if (window.Sfx) Sfx.ambient(m.theme);
    const built = buildGround(m);
    S.ground = built.canvas; S.props = built.props; S.lights = built.lights;
    $('#map-name').textContent = m.name + (m.safe ? ' · zona segura' : (wInfo && wInfo.pvp ? ' · PvP' : ''));
    $('#map-name').classList.toggle('pvp', !!(wInfo && wInfo.pvp));
    $('#btn-shop').hidden = false;
    if (S.panel === 'maps') renderMaps();
    if (S.panel === 'shop') renderShop();
  }

  function onSnap(m) {
    const now = performance.now();
    for (const [id, x, y, hp, maxHp, dead, flip, buff, flags] of m.P) {
      let p = S.players.get(id);
      if (!p) { p = { info: null, rx: null }; S.players.set(id, p); }
      if (p.dead && !dead) p.dyingAt = 0;
      Object.assign(p, { x, y, hp, maxHp, dead: !!dead, flip: !!flip, buff: buff || 0, flags: flags || 0 });
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
      S.floats.push({ at: t, text: ev.c ? `${ev.d}!` : String(ev.d), color, big: !!ev.c, t0: now + delay });
      if (window.Sfx) {
        if (ev.a === S.youId) { if (ranged || ev.fx !== 'slash') Sfx.cast(ev.fx); if (ev.c) Sfx.crit(); else Sfx.hit(false); }
        else if (ev.t === S.youId) Sfx.hurt();
      }
      if (ev.a === S.youId && ev.c) shake(3, 160);
      if (ev.t === S.youId && S.me && ev.d > S.me.maxHp * 0.08) { S.hurtFlash = now; shake(4, 200); }
    } else if (ev.k === 'warn') {
      S.dangers.push({ x: ev.x, y: ev.y, r: ev.r, ms: ev.ms, t0: now });
      if (window.Sfx) Sfx.warn();
    } else if (ev.k === 'slam') {
      S.fx.push({ kind: 'burst', x: ev.x, y: ev.y, r: ev.r, sprite: 'burst_dark', t0: now, dur: 520 });
      S.fx.push({ kind: 'burst', x: ev.x, y: ev.y, r: ev.r * 0.7, sprite: 'burst_fire', t0: now + 80, dur: 460 });
      shake(10, 500); if (window.Sfx) Sfx.slam();
      const a = ent(ev.a); if (a) { a.attackStart = now; a.attackUntil = now + 340; }
    } else if (ev.k === 'enrage') {
      const t = ent(ev.t); if (t) S.floats.push({ at: t, text: 'FÚRIA!', color: '#ff4030', big: true, t0: now });
      shake(8, 600); if (window.Sfx) Sfx.boss();
      alertBanner('O Rei Esqueleto está enfurecido!');
    } else if (ev.k === 'spawn' && ev.boss) {
      alertBanner('O Rei Esqueleto despertou!'); shake(8, 700); if (window.Sfx) Sfx.boss();
    } else if (ev.k === 'aoe') {
      S.fx.push({ kind: 'burst', x: ev.x, y: ev.y, r: ev.r, sprite: BURST[ev.fx] || 'burst_energy', t0: now, dur: 460 });
      const a = ent(ev.a); if (a) { a.attackStart = now; a.attackUntil = now + 340; }
    } else if (ev.k === 'buff') {
      const t = ent(ev.t);
      if (t) {
        S.fx.push({ kind: 'burst', x: t.rx, y: t.ry, r: 40, sprite: ev.b === 'dmg' ? 'burst_fire' : 'burst_energy', t0: now, dur: 460 });
        S.floats.push({ at: t, text: ev.b === 'dmg' ? 'DANO +' : 'DEFESA +', color: ev.b === 'dmg' ? '#ffb02e' : '#7ad0ff', big: true, t0: now });
        if (ev.t === S.youId && window.Sfx) Sfx.buff();
      }
    } else if (ev.k === 'heal') {
      const t = ent(ev.t);
      if (t) { S.floats.push({ at: t, text: '+' + ev.d, color: '#9affd0', t0: now }); S.fx.push({ kind: 'heal', at: t, t0: now, dur: 600 }); if (ev.fx === 'heal' && ev.t === S.youId && window.Sfx) Sfx.heal(); }
    } else if (ev.k === 'lv') {
      const t = ent(ev.t);
      if (t) { S.fx.push({ kind: 'lvl', at: t, t0: now, dur: 1200 }); S.floats.push({ at: t, text: 'LEVEL UP!', color: '#ffd36b', big: true, t0: now }); }
      if (ev.t === S.youId) { feed('Subiu de nível!', 'lvl'); if (window.Sfx) Sfx.levelUp(); shake(4, 300); }
    } else if (ev.k === 'die') {
      const t = ent(ev.t); if (t) t.dyingAt = now;
    } else if (ev.k === 'pdie') {
      const t = ent(ev.t); if (t) t.dyingAt = now;
      if (ev.t === S.youId) { feed('Você caiu em combate.', 'warn'); if (window.Sfx) Sfx.death(); }
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
    lava: { base: '#2a1e1c', a: '#322420', b: '#221816', blade: '#3e2c26' },
  };
  // Monta o chão (pintado uma vez) + objetos altos separados (balançam e entram na ordem de profundidade) + luzes
  function buildGround(m) {
    const W = m.w * GS, H = m.h * GS;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const base = c.getContext('2d');
    let g = base;
    const props = [], lights = [];
    const T = GROUND[m.theme] || GROUND.town;
    const r = rng(m.map);
    const px = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h))); };
    const disc = (cx, cy, rad, col, flat = 1) => { for (let dy = -rad; dy <= rad; dy++) { const w = Math.floor(Math.sqrt(Math.max(0, rad * rad - dy * dy))); px(cx - w, cy + dy * flat, w * 2 + 1, Math.max(1, flat), col); } };
    const shadow = (cx, cy, rad) => { g.fillStyle = 'rgba(0,0,0,.22)'; for (let dy = -rad / 3; dy <= rad / 3; dy++) { const w = Math.floor(rad * Math.sqrt(Math.max(0, 1 - (dy * 3 / rad) ** 2))); g.fillRect(Math.round(cx - w), Math.round(cy + dy), w * 2, 1); } };
    const light = (x, y, rad, color, flicker = 0.15) => lights.push({ x: x / GS, y: y / GS, r: rad / GS, color, flicker, ph: r() * 6 });
    // desenha um objeto num canvas próprio; (x,y) = base no mundo em px de alta resolução
    const prop = (x, y, w, h, ax, ay, fn, sway = 0) => {
      shadow(x + 3, y + 2, Math.min(w * 0.3, 18));
      const pc = document.createElement('canvas'); pc.width = w; pc.height = h;
      const prev = g; g = pc.getContext('2d'); fn(ax, ay); g = prev;
      props.push({ img: pc, x: x / GS, y: y / GS, ax, ay, w, h, sway, ph: r() * 6.28 });
    };
    px(0, 0, W, H, T.base);
    for (let i = 0; i < W * H / 2200; i++) px(r() * W, r() * H, 10 + r() * 26, 4 + r() * 10, r() < 0.5 ? T.a : T.b);
    for (let i = 0; i < W * H / 140; i++) { const x = r() * W, y = r() * H; px(x, y, 1, 2, T.blade); if (r() < 0.4) px(x + 1, y + 1, 1, 1, T.b); }

    const treeArt = (x, y, s = 1, dark = false, pink = false) => {
      px(x - 4 * s, y - 18 * s, 8 * s, 20 * s, '#3a2410'); px(x - 3 * s, y - 18 * s, 6 * s, 20 * s, '#5a3a1c'); px(x - 3 * s, y - 18 * s, 2 * s, 20 * s, '#7a5230');
      px(x - 7 * s, y, 4 * s, 2 * s, '#5a3a1c'); px(x + 3 * s, y, 4 * s, 2 * s, '#5a3a1c');
      const pal = pink ? ['#4a0e3a', '#a8306a', '#e05a9a', '#ffb0dc'] : dark ? ['#10260e', '#1f4a1c', '#2d5a24', '#3f7a32'] : ['#163a14', '#2d6a2a', '#3f8a36', '#6ab84e'];
      disc(x, y - 30 * s, 17 * s, pal[0]); disc(x - 9 * s, y - 24 * s, 9 * s, pal[0]); disc(x + 10 * s, y - 25 * s, 9 * s, pal[0]);
      disc(x, y - 30 * s, 15 * s, pal[1]); disc(x - 9 * s, y - 24 * s, 7 * s, pal[1]); disc(x + 10 * s, y - 25 * s, 7 * s, pal[1]);
      disc(x - 3 * s, y - 34 * s, 10 * s, pal[2]); disc(x - 6 * s, y - 37 * s, 5 * s, pal[3]);
      for (let k = 0; k < 18 * s; k++) px(x + (r() - 0.5) * 28 * s, y - 30 * s + (r() - 0.5) * 26 * s, 2, 2, r() < 0.5 ? pal[3] : pal[0]);
    };
    const tree = (x, y, s = 1, dark = false, pink = false) => prop(x, y, Math.ceil(60 * s), Math.ceil(64 * s), Math.ceil(30 * s), Math.ceil(58 * s), (ax, ay) => treeArt(ax, ay, s, dark, pink), 1);
    const rock = (x, y, s = 1) => { shadow(x + 2, y + 3, 11 * s); disc(x, y, 9 * s, '#4a4a54', 1); disc(x, y - 1, 8 * s, '#7a7a86'); disc(x - 3 * s, y - 3 * s, 4 * s, '#a8a8b4'); px(x + 2 * s, y + 2 * s, 4 * s, 1, '#4a4a54'); };
    const flower = (x, y, col) => { px(x, y + 2, 1, 3, '#2d6a2a'); px(x - 1, y, 3, 2, col); px(x, y - 1, 1, 4, col); px(x, y, 1, 1, '#fff6c8'); };
    const torch = (x, y) => {
      prop(x, y, 12, 40, 6, 36, (ax, ay) => {
        px(ax - 2, ay - 20, 4, 22, '#3a2410'); px(ax - 1, ay - 20, 2, 22, '#7a5230'); px(ax - 4, ay - 22, 8, 3, '#5a5a66');
        disc(ax, ay - 27, 4, '#ff6a1a'); disc(ax, ay - 28, 3, '#ffb02e'); px(ax - 1, ay - 31, 2, 3, '#fff2a8');
      });
      light(x, y - 28, 110, '255,150,50', 0.25);
    };
    const crystal = (x, y, col = ['#3a8ad8', '#bff0ff'], lightCol = '150,215,255') => {
      prop(x, y, 30, 40, 15, 36, (ax, ay) => {
        for (const [dx, h, wd] of [[-6, 22, 5], [0, 34, 7], [7, 18, 5]]) {
          g.fillStyle = col[0]; g.beginPath(); g.moveTo(ax + dx, ay - h); g.lineTo(ax + dx + wd, ay); g.lineTo(ax + dx - wd, ay); g.fill();
          px(ax + dx - 1, ay - h + 6, 2, h - 8, col[1]);
        }
      });
      light(x, y - 16, 70, lightCol, 0.1);
    };

    if (m.theme === 'town') {
      const cx = m.w, cy = m.h;
      px(cx - 360, cy - 240, 720, 480, '#6e685c');
      for (let y = cy - 240, row = 0; y < cy + 240; y += 16, row++) {
        for (let x = cx - 360 + (row % 2) * 12; x < cx + 360; x += 24) {
          const tone = ['#9a9488', '#8a8478', '#a8a296', '#7e786c'][(r() * 4) | 0];
          px(x + 1, y + 1, 22, 14, tone); px(x + 1, y + 1, 22, 2, '#b8b2a6'); px(x + 1, y + 13, 22, 2, '#6a645a');
          if (r() < 0.08) px(x + 6 + r() * 10, y + 5, 5, 1, '#5a544a');
        }
      }
      shadow(cx + 4, cy + 46, 60); disc(cx, cy, 52, '#3a3a46'); disc(cx, cy, 48, '#7a7a88'); disc(cx, cy, 42, '#5a5a66'); disc(cx, cy, 38, '#2a5aa8'); disc(cx - 8, cy - 8, 22, '#3a7ad8');
      for (let k = 0; k < 30; k++) px(cx - 30 + r() * 60, cy - 30 + r() * 60, 3, 1, '#bff0ff');
      px(cx - 8, cy - 64, 16, 40, '#9a9aa8'); px(cx - 8, cy - 64, 5, 40, '#c8c8d8'); disc(cx, cy - 70, 10, '#c8c8d8'); disc(cx - 3, cy - 73, 4, '#ffffff');
      for (let i = 0; i < 6; i++) {
        const hx = (60 + i * 120) * GS, hy = 70 * GS;
        shadow(hx + 80, hy + 104, 90);
        px(hx, hy, 140, 100, '#7a5a3a');
        for (let k = 0; k < 100; k += 10) { px(hx, hy + k, 140, 9, k % 20 ? '#a07a52' : '#94704a'); px(hx, hy + k + 9, 140, 1, '#5a3a22'); }
        px(hx - 12, hy - 40, 164, 44, '#5a1414');
        for (let k = 0; k < 40; k += 8) for (let j = 0; j < 164; j += 14) px(hx - 12 + j + (k / 8 % 2) * 7, hy - 40 + k, 13, 7, k < 8 ? '#b83a2a' : '#8a2a2a');
        px(hx - 12, hy + 2, 164, 4, '#3a0a0a');
        px(hx + 56, hy + 50, 28, 50, '#3a2418'); px(hx + 58, hy + 52, 24, 48, '#5a3a22'); px(hx + 76, hy + 76, 3, 3, '#e8b84a');
        for (const wx of [hx + 16, hx + 100]) { px(wx, hy + 26, 24, 22, '#3a2418'); px(wx + 2, hy + 28, 20, 18, '#ffd36b'); px(wx + 11, hy + 28, 2, 18, '#3a2418'); px(wx + 2, hy + 36, 20, 2, '#3a2418'); px(wx + 2, hy + 28, 8, 6, '#fff2a8'); light(wx + 12, hy + 38, 70, '255,210,120', 0.08); }
        torch(hx + 48, hy + 108); torch(hx + 92, hy + 108);
      }
      px(0, H - 80, W, 80, '#4a4a56');
      for (let x = 0; x < W; x += 20) for (let y = H - 80; y < H; y += 12) px(x + ((y / 12) % 2) * 10, y, 19, 11, r() < 0.5 ? '#6a6a78' : '#5a5a66');
      for (let x = 0; x < W; x += 32) { px(x, H - 96, 20, 16, '#6a6a78'); px(x, H - 96, 20, 3, '#8a8a98'); }
      for (let y = 0; y < H - 80; y += 2) {
        const xc = W - 70 + Math.sin(y / 70) * 20;
        px(xc - 52, y, 104, 2, '#4a7a3a'); px(xc - 46, y, 92, 2, '#8a7a5a'); px(xc - 40, y, 80, 2, '#1a4a8a'); px(xc - 30, y, 54, 2, '#2a6ab8');
        if (r() < 0.12) px(xc - 20 + r() * 30, y, 8, 1, '#9ad8ff');
      }
      const sx = 470 * GS, sy = 250 * GS;
      shadow(sx, sy, 70);
      px(sx - 56, sy - 72, 6, 64, '#5a3a1c'); px(sx + 50, sy - 72, 6, 64, '#5a3a1c');
      for (let i = 0; i < 120; i += 20) { px(sx - 62 + i, sy - 94, 10, 22, '#c8452c'); px(sx - 52 + i, sy - 94, 10, 22, '#f0e6cc'); }
      for (let i = 0; i < 120; i += 10) disc(sx - 57 + i, sy - 72, 5, i % 20 ? '#f0e6cc' : '#c8452c');
      px(sx - 62, sy - 24, 124, 16, '#6a4a2a'); px(sx - 62, sy - 24, 124, 4, '#9a7a52');
      for (let k = 0; k < 5; k++) { disc(sx - 40 + k * 20, sy - 30, 5, ['#d0302a', '#3a7aff', '#d0302a', '#3a7aff', '#e8b84a'][k]); px(sx - 41 + k * 20, sy - 33, 2, 2, '#ffffff'); }
      for (let i = 0; i < 12; i++) tree(r() * W * 0.9, 400 + r() * (H - 560), 1);
    } else if (m.theme === 'noria') {
      for (let i = 0; i < 9; i++) {
        const x = r() * W, y = r() * H, rad = 40 + r() * 60;
        disc(x, y, rad + 6, '#2a5a2a'); disc(x, y, rad, '#1a5a8a'); disc(x - rad * 0.2, y - rad * 0.2, rad * 0.7, '#2a7ab8');
        for (let k = 0; k < 12; k++) px(x - rad * 0.6 + r() * rad * 1.2, y - rad * 0.5 + r() * rad, 6, 1, '#9ad8ff');
        light(x, y, rad * 2, '90,170,255', 0.05);
      }
      for (let x = 0; x < W; x += 2) {
        const yc = H * 0.55 + Math.sin(x / 210) * 140;
        px(x, yc - 16, 2, 32, '#8a6a3a'); px(x, yc - 16, 2, 2, '#6a4a24'); if (r() < 0.1) px(x, yc - 8 + r() * 16, 2, 2, '#c8a86a');
      }
      for (let i = 0; i < 260; i++) flower(r() * W, r() * H, ['#ff7ad9', '#c06bff', '#ffd36b', '#9ac8ff'][i % 4]);
      for (let i = 0; i < 50; i++) { const x = r() * W, y = r() * H; px(x - 1, y - 4, 3, 6, '#e8e0d0'); disc(x, y - 6, 5, '#3a7ad8'); disc(x - 1, y - 7, 3, '#7ab8ff'); px(x - 2, y - 8, 2, 2, '#ffffff'); }
      for (let i = 0; i < 70; i++) tree(r() * W, r() * H, 1, false, r() < 0.25);
      for (let i = 0; i < 18; i++) crystal(r() * W, r() * H, ['#7a3ac0', '#f0d8ff'], '192,107,255');
    } else if (m.theme === 'snow') {
      for (let i = 0; i < W * H / 900; i++) px(r() * W, r() * H, 2 + r() * 6, 1, r() < 0.5 ? '#dfe8f4' : '#ffffff');
      for (let i = 0; i < 8; i++) {
        const x = r() * W, y = r() * H, rad = 40 + r() * 50;
        disc(x, y, rad + 4, '#9ab8d8'); disc(x, y, rad, '#b8d8f0'); disc(x - rad * 0.25, y - rad * 0.25, rad * 0.5, '#e0f2ff');
        for (let k = 0; k < 6; k++) px(x - rad * 0.6 + r() * rad, y - rad * 0.4 + r() * rad * 0.8, 10, 1, '#ffffff');
      }
      for (let x = 0; x < W; x += 2) { const yc = H * 0.5 + Math.sin(x / 160) * 120; px(x, yc - 14, 2, 28, '#c8d4e4'); if (r() < 0.2) px(x, yc - 6 + r() * 12, 2, 2, '#a8b8cc'); }
      const pine = (x, y, s) => prop(x, y, Math.ceil(36 * s), Math.ceil(58 * s), Math.ceil(18 * s), Math.ceil(54 * s), (ax, ay) => {
        px(ax - 2 * s, ay - 8 * s, 4 * s, 10 * s, '#4a2e18');
        for (let k = 0; k < 4; k++) {
          const ww = (16 - k * 3) * s, yy = ay - 8 * s - k * 9 * s;
          for (let j = 0; j < 10 * s; j++) { const w2 = ww * (j / (10 * s)); px(ax - w2, yy - 10 * s + j, w2 * 2, 1, j < 3 * s ? '#ffffff' : (j % 3 ? '#1e4a3a' : '#2a5a48')); }
        }
        px(ax - 1, ay - 48 * s, 2, 4, '#ffffff');
      }, 0.6);
      for (let i = 0; i < 18; i++) rock(r() * W, r() * H, 1);
      for (let i = 0; i < 60; i++) pine(r() * W, r() * H, r() < 0.3 ? 1.3 : 1);
      for (let i = 0; i < 22; i++) crystal(r() * W, r() * H);
      for (let i = 0; i < 400; i++) px(r() * W, r() * H, 1, 1, '#ffffff');
    } else if (m.theme === 'dungeon' || m.theme === 'lava') {
      const lavaMap = m.theme === 'lava';
      for (let y = 0; y < H; y += 32) for (let x = (y / 32 % 2) * 16; x < W; x += 32) {
        const tones = lavaMap ? ['#2a1e1c', '#322420', '#241a18'] : ['#2e2830', '#342c36', '#28222a'];
        px(x, y, 31, 31, tones[(r() * 3) | 0]); px(x, y, 31, 2, lavaMap ? '#3e2c26' : '#40363e'); px(x, y + 29, 31, 2, '#1c1416');
        if (r() < 0.15) px(x + 6 + r() * 16, y + 8 + r() * 16, 8, 1, '#1c1416');
      }
      const crack = (x0, y0, len) => {
        let x = x0, y = y0;
        for (let k = 0; k < len; k++) {
          px(x - 3, y - 3, 7, 7, '#5a1408'); px(x - 2, y - 2, 5, 5, '#d8401a'); px(x - 1, y - 1, 3, 3, '#ffb02e');
          if (k % 8 === 0) light(x, y, 50, '255,110,30', 0.2);
          x += 3 + r() * 3; y += (r() - 0.5) * 8;
        }
      };
      for (let i = 0; i < (lavaMap ? 40 : 26); i++) crack(r() * W, r() * H, 20 + r() * 40);
      for (let i = 0; i < (lavaMap ? 12 : 6); i++) {
        const x = r() * W, y = r() * H, rad = 26 + r() * (lavaMap ? 50 : 30);
        disc(x, y, rad + 4, '#3a0a04'); disc(x, y, rad, '#c8301a'); disc(x - rad * 0.2, y - rad * 0.2, rad * 0.65, '#ff7a2a'); disc(x - rad * 0.35, y - rad * 0.35, rad * 0.3, '#ffd36b');
        light(x, y, rad * 3.2, '255,120,40', 0.12);
      }
      for (let i = 0; i < 60; i++) { const x = r() * W, y = r() * H; px(x, y, 12, 3, '#d8cfb4'); px(x, y, 12, 1, '#fffbe8'); disc(x - 1, y + 1, 2, '#d8cfb4'); disc(x + 12, y + 1, 2, '#d8cfb4'); }
      if (!lavaMap) {
        for (let i = 0; i < 8; i++) { const x = r() * W, y = r() * H; disc(x, y, 7, '#d8cfb4'); px(x - 3, y - 2, 2, 3, '#1b1b2a'); px(x + 1, y - 2, 2, 3, '#1b1b2a'); px(x - 2, y + 4, 5, 3, '#d8cfb4'); }
        px(1720, 640, 360, 320, '#1a1218');
        for (let x = 1720; x < 2080; x += 20) for (let y = 640; y < 960; y += 20) { px(x + 1, y + 1, 18, 18, r() < 0.3 ? '#3a1a22' : '#2a161c'); px(x + 1, y + 1, 18, 1, '#4a2a32'); }
        px(1740, 760, 320, 80, '#5a0a1a'); px(1740, 760, 320, 4, '#e8b84a'); px(1740, 836, 320, 4, '#e8b84a');
        light(1900, 800, 260, '200,60,220', 0.08);
      }
      for (let x = 0; x < W; x += 8) { const h = 20 + (r() * 28 | 0); px(x, 0, 8, h, '#140e14'); px(x + 2, h, 4, 4, '#140e14'); }
      // pilares de pedra (ou espinhos de obsidiana em Vulcanus)
      for (let i = 0; i < (lavaMap ? 40 : 50); i++) {
        const x = r() * W, y = r() * H, hgt = Math.round(28 + r() * 22);
        if (lavaMap) {
          prop(x, y, 28, hgt + 8, 14, hgt + 4, (ax, ay) => {
            g.fillStyle = '#120a10'; g.beginPath(); g.moveTo(ax - 10, ay); g.lineTo(ax - 2, ay - hgt); g.lineTo(ax + 10, ay); g.fill();
            g.fillStyle = '#2a1a2a'; g.beginPath(); g.moveTo(ax - 6, ay); g.lineTo(ax - 2, ay - hgt + 6); g.lineTo(ax + 2, ay); g.fill();
            px(ax - 3, ay - hgt + 10, 2, hgt - 14, '#5a3a5a');
          });
        } else {
          prop(x, y, 30, hgt + 12, 15, hgt + 8, (ax, ay) => {
            px(ax - 12, ay - hgt, 24, hgt, '#1c181e'); px(ax - 10, ay - hgt, 20, hgt, '#3a3240'); px(ax - 10, ay - hgt, 5, hgt, '#4e4454');
            px(ax - 13, ay - hgt - 6, 26, 6, '#4e4454'); px(ax - 13, ay - hgt - 6, 26, 2, '#6a5e70');
          });
        }
      }
      for (let i = 0; i < (lavaMap ? 10 : 24); i++) torch(r() * W, r() * H);
    }
    props.sort((a, b) => a.y - b.y);
    return { canvas: c, props, lights };
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

  // ---------- qualidade gráfica ----------
  const QUALITY = {
    baixa: { parts: 20, lights: false, sway: false },
    media: { parts: 60, lights: true, sway: true },
    alta: { parts: 140, lights: true, sway: true },
  };
  const qStore = (() => { try { return window.localStorage; } catch (_) { return null; } })();
  let quality = (() => { try { return qStore && qStore.getItem('mui_quality'); } catch (_) { return null; } })() || (window.innerWidth < 700 ? 'media' : 'alta');
  if (!QUALITY[quality]) quality = 'media';
  function setQuality(q) { if (!QUALITY[q]) return; quality = q; try { if (qStore) qStore.setItem('mui_quality', q); } catch (_) { /* sem armazenamento */ } S.parts = []; }
  const DARKNESS = { dungeon: 0.62, lava: 0.4 };

  // ---------- partículas do ambiente (com limite fixo, reaproveitadas) ----------
  S.parts = [];
  function spawnParticle(theme, vw, vh) {
    const x = camX + Math.random() * vw, y = camY + Math.random() * vh;
    const p = { x, y, t: 0 };
    switch (theme) {
      case 'town': Object.assign(p, { kind: 'leaf', vx: 6 + Math.random() * 8, vy: 4 + Math.random() * 6, life: 6 + Math.random() * 4, col: ['#6ab84e', '#c8a83a', '#9ac85a'][(Math.random() * 3) | 0], s: 2 }); break;
      case 'noria': Object.assign(p, Math.random() < 0.5
        ? { kind: 'leaf', vx: 4 + Math.random() * 6, vy: 5 + Math.random() * 5, life: 7, col: ['#ff9ad0', '#ffc0e4'][(Math.random() * 2) | 0], s: 2 }
        : { kind: 'spark', vx: (Math.random() - 0.5) * 4, vy: -2 - Math.random() * 4, life: 3 + Math.random() * 3, col: ['#9ad8ff', '#d8a0ff', '#fff2a8'][(Math.random() * 3) | 0], s: 2 }); break;
      case 'snow': Object.assign(p, { kind: 'snow', y: camY - 4, vx: 10 + Math.random() * 10, vy: 22 + Math.random() * 22, life: 12, col: '#ffffff', s: Math.random() < 0.3 ? 3 : 2 }); break;
      case 'lava': Object.assign(p, Math.random() < 0.7
        ? { kind: 'ember', y: camY + vh + 4, vx: (Math.random() - 0.5) * 8, vy: -20 - Math.random() * 25, life: 4 + Math.random() * 3, col: ['#ff8a2a', '#ffd36b', '#ff4d1f'][(Math.random() * 3) | 0], s: 2 }
        : { kind: 'ash', y: camY - 4, vx: 3, vy: 8 + Math.random() * 8, life: 10, col: '#6a6060', s: 2 }); break;
      case 'dungeon': Object.assign(p, Math.random() < 0.5
        ? { kind: 'ember', vx: (Math.random() - 0.5) * 4, vy: -6 - Math.random() * 8, life: 4, col: '#ff9a3a', s: 2 }
        : { kind: 'dust', vx: (Math.random() - 0.5) * 3, vy: (Math.random() - 0.5) * 3, life: 6, col: '#8a7a8a', s: 1 }); break;
      default: return null;
    }
    return p;
  }
  function updateParticles(dt, now, vw, vh) {
    const Q = QUALITY[quality];
    const theme = S.map.theme;
    const want = Q.parts;
    while (S.parts.length < want) { const p = spawnParticle(theme, vw, vh); if (!p) break; p.t = Math.random() * p.life * 0.5; S.parts.push(p); }
    ctx.save();
    for (let i = S.parts.length - 1; i >= 0; i--) {
      const p = S.parts[i];
      p.t += dt;
      const sway = p.kind === 'leaf' || p.kind === 'snow' ? Math.sin(now / 600 + i) * 8 : 0;
      p.x += (p.vx + sway) * dt; p.y += p.vy * dt;
      const out = p.x < camX - 20 || p.x > camX + vw + 20 || p.y < camY - 30 || p.y > camY + vh + 30;
      if (p.t > p.life || out) { const np = spawnParticle(theme, vw, vh); if (np) S.parts[i] = np; else S.parts.splice(i, 1); continue; }
      const fade = Math.min(1, p.t / 0.6, (p.life - p.t) / 0.8);
      const tw = p.kind === 'spark' ? 0.5 + 0.5 * Math.sin(now / 120 + i * 3) : 1;
      ctx.globalAlpha = Math.max(0, fade * tw * (p.kind === 'dust' ? 0.5 : 0.9));
      ctx.fillStyle = p.col;
      const [sx, sy] = toScreen(p.x, p.y);
      const sz = p.s * dpr * (zoom >= 4 * dpr ? 1.5 : 1);
      ctx.fillRect(sx, sy, sz, sz);
    }
    ctx.restore();
    // névoa fria em Devias
    if (theme === 'snow' && Q.lights) {
      ctx.save();
      for (let k = 0; k < 3; k++) {
        const fx = ((now / 60 + k * 400) % (vw + 300)) - 150, fy = vh * (0.25 + k * 0.28);
        const [sx, sy] = [fx * zoom, fy * zoom];
        const grd = ctx.createRadialGradient(sx, sy, 10, sx, sy, 160 * zoom);
        grd.addColorStop(0, 'rgba(230,240,255,.18)'); grd.addColorStop(1, 'rgba(230,240,255,0)');
        ctx.fillStyle = grd; ctx.fillRect(sx - 160 * zoom, sy - 160 * zoom, 320 * zoom, 320 * zoom);
      }
      ctx.restore();
    }
  }

  // ---------- luz e escuridão ----------
  const lightCv = document.createElement('canvas');
  function drawLighting(now, me) {
    const Q = QUALITY[quality];
    const dark = DARKNESS[S.map.theme] || 0;
    const vis = (S.lights || []).filter((l) => l.x + l.r > camX && l.x - l.r < camX + cv.width / zoom && l.y + l.r > camY && l.y - l.r < camY + cv.height / zoom);
    if (dark > 0) {
      const k = 0.5;
      if (lightCv.width !== Math.ceil(cv.width * k)) { lightCv.width = Math.ceil(cv.width * k); lightCv.height = Math.ceil(cv.height * k); }
      const lc = lightCv.getContext('2d');
      lc.globalCompositeOperation = 'source-over';
      lc.clearRect(0, 0, lightCv.width, lightCv.height);
      lc.fillStyle = `rgba(6,4,14,${dark})`; lc.fillRect(0, 0, lightCv.width, lightCv.height);
      lc.globalCompositeOperation = 'destination-out';
      const hole = (x, y, rad, a) => {
        const [sx, sy] = toScreen(x, y);
        const g2 = lc.createRadialGradient(sx * k, sy * k, 0, sx * k, sy * k, rad * zoom * k);
        g2.addColorStop(0, `rgba(0,0,0,${a})`); g2.addColorStop(1, 'rgba(0,0,0,0)');
        lc.fillStyle = g2; lc.beginPath(); lc.arc(sx * k, sy * k, rad * zoom * k, 0, Math.PI * 2); lc.fill();
      };
      if (me && me.rx !== null) hole(me.rx, me.ry - 12, 120, 1);
      for (const l of vis) hole(l.x, l.y, l.r * (1 + Math.sin(now / 90 + l.ph) * l.flicker * 0.3), 0.95);
      S.fx.forEach((f) => { if (f.kind === 'burst') hole(f.x, f.y, f.r * 2, 0.8); });
      ctx.drawImage(lightCv, 0, 0, cv.width, cv.height);
    }
    if (!Q.lights) return;
    // brilho colorido das fontes de luz
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const l of vis) {
      const [sx, sy] = toScreen(l.x, l.y);
      const rad = l.r * zoom * 0.7 * (1 + Math.sin(now / 80 + l.ph) * l.flicker * 0.4);
      const g2 = ctx.createRadialGradient(sx, sy, 0, sx, sy, rad);
      g2.addColorStop(0, `rgba(${l.color},.22)`); g2.addColorStop(1, `rgba(${l.color},0)`);
      ctx.fillStyle = g2; ctx.fillRect(sx - rad, sy - rad, rad * 2, rad * 2);
    }
    ctx.restore();
  }

  // ---------- objetos do cenário com vento ----------
  function drawProp(pr, now, me) {
    const sc = zoom / GS;
    const [x, y] = toScreen(pr.x, pr.y);
    const dx = x - pr.ax * sc, dy = y - pr.ay * sc, w = pr.w * sc, h = pr.h * sc;
    if (dx > cv.width || dy > cv.height || dx + w < 0 || dy + h < 0) return;
    // fica translúcido quando o herói está atrás
    let alpha = 1;
    if (me && me.rx !== null && me.ry < pr.y && me.ry > pr.y - pr.h / GS && Math.abs(me.rx - pr.x) < pr.w / GS / 2.2) alpha = 0.5;
    ctx.globalAlpha = alpha;
    if (!pr.sway || !QUALITY[quality].sway) { ctx.drawImage(pr.img, Math.round(dx), Math.round(dy), Math.round(w), Math.round(h)); ctx.globalAlpha = 1; return; }
    const n = 4, sh = pr.h / n;
    const amp = Math.sin(now / 900 + pr.ph) * 1.6 * pr.sway + Math.sin(now / 370 + pr.ph * 2) * 0.5 * pr.sway;
    for (let i = 0; i < n; i++) {
      const off = Math.round(amp * (1 - i / n) * sc);
      ctx.drawImage(pr.img, 0, i * sh, pr.w, sh + 0.5, Math.round(dx + off), Math.round(dy + i * sh * sc), Math.round(w), Math.ceil(sh * sc) + 1);
    }
    ctx.globalAlpha = 1;
  }

  // ---------- itens caindo no chão ----------
  const iconCache = new Map();
  function itemIcon(item) {
    const k = item.icon + item.rarity;
    let c = iconCache.get(k);
    if (!c) { c = document.createElement('canvas'); c.width = 48; c.height = 48; PA.drawIcon(c.getContext('2d'), item.icon, 6, 6, 3, RAR[item.rarity]); iconCache.set(k, c); }
    return c;
  }
  function drawDrops(now, me) {
    S.drops = (S.drops || []).filter((d) => {
      const age = now - d.t0;
      if (age > 1600) return false;
      let wx = d.x, wy = d.y, lift = 0;
      if (age < 450) { const p = age / 450; lift = Math.sin(p * Math.PI) * 26 * (1 - p * 0.4); wx = d.x + d.dx * p; }
      else { wx = d.x + d.dx; }
      if (age > 1150 && me) { const p = Math.min(1, (age - 1150) / 400); wx += (me.rx - wx) * p; wy += (me.ry - 14 - wy) * p; if (p >= 1 && !d.got) { d.got = true; if (window.Sfx) Sfx.drop(d.item.rarity); S.fx.push({ kind: 'impact', at: me, sprite: 'impact_energy', t0: now, dur: 240 }); } }
      const [sx, sy] = toScreen(wx, wy - lift);
      const rich = ['rare', 'epic', 'legendary', 'ancestral'].includes(d.item.rarity);
      if (rich && age < 1150) {
        const gr = ctx.createLinearGradient(sx, sy - 70 * dpr, sx, sy);
        gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(1, RAR[d.item.rarity]);
        ctx.globalAlpha = 0.45 + 0.2 * Math.sin(now / 100); ctx.fillStyle = gr; ctx.fillRect(sx - 4 * dpr, sy - 70 * dpr, 8 * dpr, 70 * dpr); ctx.globalAlpha = 1;
      }
      ctx.fillStyle = RAR[d.item.rarity]; ctx.globalAlpha = 0.35; ctx.beginPath(); ctx.ellipse(sx, sy + 4 * dpr, 10 * dpr, 3.5 * dpr, 0, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
      const s = 16 * dpr * (age > 1150 ? 1 - (age - 1150) / 600 : 1);
      ctx.drawImage(itemIcon(d.item), sx - s, sy - s * 1.6, s * 2, s * 2);
      return true;
    });
  }

  // ---------- áreas de perigo do boss ----------
  function drawDangers(now) {
    S.dangers = (S.dangers || []).filter((d) => {
      const p = (now - d.t0) / d.ms;
      if (p >= 1) return false;
      const [sx, sy] = toScreen(d.x, d.y);
      ctx.save();
      ctx.fillStyle = `rgba(255,40,40,${0.12 + 0.1 * Math.sin(now / 60)})`;
      ctx.beginPath(); ctx.ellipse(sx, sy, d.r * zoom, d.r * zoom * 0.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,60,40,.35)';
      ctx.beginPath(); ctx.ellipse(sx, sy, d.r * zoom * p, d.r * zoom * 0.5 * p, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,90,70,.9)'; ctx.lineWidth = 2 * dpr;
      ctx.beginPath(); ctx.ellipse(sx, sy, d.r * zoom, d.r * zoom * 0.5, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
      return true;
    });
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
        // câmera suave + apresentação ao entrar no mapa
        const intro = S.enterAt ? Math.max(0, 1 - (now - S.enterAt) / 1100) : 0;
        const tx = Math.max(0, Math.min(S.map.w - vw, me.rx - vw / 2));
        const ty = Math.max(0, Math.min(S.map.h - vh, me.ry - vh / 2 + 20 + intro * intro * 40));
        if (S.camInit) { camX += (tx - camX) * Math.min(1, dt * 8); camY += (ty - camY) * Math.min(1, dt * 8); } else { camX = tx; camY = ty; S.camInit = true; }
        if (S.map.w < vw) camX = (S.map.w - vw) / 2;
        if (S.map.h < vh) camY = (S.map.h - vh) / 2;
      }
      const baseX = camX, baseY = camY;
      if (S.shake && now < S.shake.until) {
        const k = (S.shake.until - now) / S.shake.dur;
        camX += (Math.random() - 0.5) * S.shake.mag * k; camY += (Math.random() - 0.5) * S.shake.mag * k;
      }
      const sx = Math.max(0, camX), sy = Math.max(0, camY);
      const sw = Math.min(S.map.w - sx, vw), sh = Math.min(S.map.h - sy, vh);
      ctx.drawImage(S.ground, sx * GS, sy * GS, sw * GS, sh * GS, (sx - camX) * zoom, (sy - camY) * zoom, sw * zoom, sh * zoom);
      drawDangers(now);
      drawClickMark(now);
      drawEntities(now, me);
      drawDrops(now, me);
      drawFx(now);
      drawLighting(now, me);
      updateParticles(dt, now, vw, vh);
      drawFloats(now);
      // tela vermelha rápida quando o herói leva um golpe forte
      if (S.hurtFlash && now - S.hurtFlash < 260) {
        const a = 0.35 * (1 - (now - S.hurtFlash) / 260);
        const gr = ctx.createRadialGradient(cv.width / 2, cv.height / 2, Math.min(cv.width, cv.height) * 0.3, cv.width / 2, cv.height / 2, Math.max(cv.width, cv.height) * 0.7);
        gr.addColorStop(0, 'rgba(200,0,0,0)'); gr.addColorStop(1, `rgba(200,0,0,${a})`);
        ctx.fillStyle = gr; ctx.fillRect(0, 0, cv.width, cv.height);
      }
      // escurece e clareia ao entrar no mapa
      if (S.enterAt && now - S.enterAt < 700) { ctx.fillStyle = `rgba(5,6,14,${1 - (now - S.enterAt) / 700})`; ctx.fillRect(0, 0, cv.width, cv.height); }
      camX = baseX; camY = baseY;
      drawMinimap();
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  const toScreen = (x, y) => [Math.round((x - camX) * zoom), Math.round((y - camY) * zoom)];
  const spr = () => zoom / 2; // pixels de tela por pixel de sprite (sprites têm o dobro da resolução do mundo)
  function shake(mag, dur = 350) { S.shake = { mag, dur, until: performance.now() + dur }; }

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

  function drawEntities(now, me) {
    const list = [];
    S.monsters.forEach((m) => {
      if (m.dead && !(m.dyingAt && now - m.dyingAt < 900)) return;
      list.push(['m', m, m.ry]);
    });
    S.players.forEach((p) => {
      if (!p.info) return;
      if (p.dead && !(p.dyingAt && now - p.dyingAt < 1400)) return;
      list.push(['p', p, p.ry]);
    });
    if (S.map.npcs) S.map.npcs.forEach((n) => list.push(['n', n, n.y]));
    const vx0 = camX - 40, vx1 = camX + cv.width / zoom + 40, vy1 = camY + cv.height / zoom + 60;
    for (const pr of S.props || []) if (pr.x > vx0 && pr.x < vx1 && pr.y > camY - 10 && pr.y - pr.h / GS < vy1) list.push(['o', pr, pr.y]);
    list.sort((a, b) => a[2] - b[2]);
    const myTarget = S.me && S.me.target;
    const sc = spr();
    for (const [kind, e] of list) {
      if (kind === 'o') { drawProp(e, now, me); continue; }
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
      e.hpShow = e.hpShow === undefined ? e.hp : e.hpShow + (e.hp - e.hpShow) * 0.25;
      if (kind === 'm') {
        const name = monSprite(e);
        const meta = Sprites.meta('monsters', name);
        const ms = meta ? meta.scale : 1;
        const h = (MON_H[name] || 40) * ms * sc;
        const w = Math.max(10 * zoom, h * 0.45);
        if (e.boss && !e.dead) {
          // aura do boss (vermelha quando enfurecido)
          const col = S.boss && S.boss.enraged ? '255,50,40' : '190,100,255';
          ctx.save(); ctx.globalCompositeOperation = 'lighter';
          const ar = w * (1.4 + 0.15 * Math.sin(now / 160));
          const g2 = ctx.createRadialGradient(x, y - h * 0.4, 0, x, y - h * 0.4, ar * 1.6);
          g2.addColorStop(0, `rgba(${col},.28)`); g2.addColorStop(1, `rgba(${col},0)`);
          ctx.fillStyle = g2; ctx.fillRect(x - ar * 1.6, y - h * 0.4 - ar * 1.6, ar * 3.2, ar * 3.2);
          ctx.restore();
        }
        if (e.id === myTarget && !e.dead) { ctx.strokeStyle = '#ffd36b'; ctx.lineWidth = dpr * 2; ctx.beginPath(); ctx.ellipse(x, y, w, w * 0.34, 0, 0, Math.PI * 2); ctx.stroke(); }
        shadowAt(x, y, w * 0.8);
        const hurt = now < (e.hurtUntil || 0) && !e.dyingAt;
        Sprites.monster(ctx, name, act, t, x, y, sc, !e.flip, { once, white: hurt && (now - e.hurtUntil) > -90 });
        if (e.dead) continue;
        const top = y - h - 6 * dpr;
        hpBar(x, top, Math.max(28 * dpr, w * 1.6), e.hpShow / e.maxHp, e.boss ? '#c06bff' : e.elite ? '#ffb02e' : '#e0473a');
        if (e.boss || e.elite || e.id === myTarget) label(`${e.name} Nv.${e.level}`, x, top - 4 * dpr, e.boss ? '#e0b0ff' : e.elite ? '#ffd36b' : '#f0e6cc', 10);
      } else {
        const info = e.info;
        const isMe = e === me;
        shadowAt(x, y, 9 * zoom);
        if (e.id === myTarget) { ctx.strokeStyle = '#ff5a4a'; ctx.lineWidth = dpr * 2; ctx.beginPath(); ctx.ellipse(x, y, 12 * zoom, 4 * zoom, 0, 0, Math.PI * 2); ctx.stroke(); }
        if (e.buff) {
          const col = e.buff & 1 ? '255,140,40' : '90,180,255';
          ctx.strokeStyle = `rgba(${col},${0.55 + 0.25 * Math.sin(now / 150)})`; ctx.lineWidth = 2 * dpr;
          ctx.beginPath(); ctx.ellipse(x, y, 12 * zoom, 4 * zoom, 0, 0, Math.PI * 2); ctx.stroke();
          if (e.buff === 3) { ctx.strokeStyle = 'rgba(90,180,255,.6)'; ctx.beginPath(); ctx.ellipse(x, y, 14 * zoom, 5 * zoom, 0, 0, Math.PI * 2); ctx.stroke(); }
        }
        const rar = info.weaponRarity;
        if (rar && ['epic', 'legendary', 'ancestral'].includes(rar)) {
          ctx.globalAlpha = 0.35 + 0.15 * Math.sin(now / 200); ctx.fillStyle = RAR[rar];
          ctx.beginPath(); ctx.ellipse(x, y, 13 * zoom, 4 * zoom, 0, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
        }
        Sprites.hero(ctx, info.cls, info.ap, act, t, x, y, sc, e.flip, { once });
        if (e.dead) continue;
        const top = y - HERO_H * sc - 4 * dpr;
        hpBar(x, top, 16 * zoom, e.hpShow / e.maxHp, isMe ? '#6aa84f' : (e.flags & 1) ? '#ff5a4a' : '#4aa3ff');
        const pk = e.flags & 1, inDuel = e.flags & 2;
        label(`${pk ? '[PK] ' : ''}${info.name} ${info.level}`, x, top - 4 * dpr, pk ? '#ff6a5a' : inDuel ? '#ffb02e' : isMe ? '#ffd36b' : '#bfe0ff', 11);
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
      const pop = age < 140 ? 1 + (1 - age / 140) * 0.6 : 1;
      label(f.text, x, y, f.color, Math.round((f.big ? 16 : 12) * pop));
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
    ev.preventDefault(); // sem destaque/seleção do navegador ao tocar no mapa
    if (!S.map || !S.me || S.me.dead) return;
    if (S.panel && window.innerWidth < 700) closePanel();
    const wx = camX + ev.clientX * dpr / zoom, wy = camY + ev.clientY * dpr / zoom;
    // NPC da loja
    for (const n of S.map.npcs || []) {
      if (Math.hypot(n.x - wx, n.y - 10 - wy) < 16) { openPanel('shop'); return; }
    }
    // tocar num jogador abre o cartão (atacar / duelo)
    let pl = null, pd = 14;
    S.players.forEach((p, id) => {
      if (id === S.youId || !p.info || p.dead) return;
      const d = Math.hypot(p.rx - wx, p.ry - 14 - wy);
      if (d < pd) { pd = d; pl = p; }
    });
    if (pl) { openPlayerCard(pl); return; }
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
    $$('#skills .act.skill[data-id]').forEach((b) => {
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
      bb.classList.toggle('enraged', !!S.boss.enraged && !S.boss.dead);
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

  // nome completo no computador, primeira palavra no celular
  const skLabel = (n) => `<span class="sk-full">${esc(n)}</span><span class="sk-short">${esc(n.split(' ')[0])}</span>`;
  function renderSkills() {
    const box = $('#skills');
    box.innerHTML = '';
    for (const def of S.char.allSkills) {
      const sk = S.char.skills.find((x) => x.id === def.id);
      const b = document.createElement('button');
      b.type = 'button';
      if (!sk) {
        b.className = 'act skill locked'; b.disabled = true;
        b.innerHTML = `${skLabel(def.name)}<span class="mana">Nv. ${def.lvl}</span>`;
        b.title = `Libera no nível ${def.lvl}`;
      } else {
        b.className = 'act skill' + (sk.on ? '' : ' off') + (sk.buff ? ' buff' : '');
        b.dataset.id = sk.id; b.dataset.cd = sk.cd;
        b.setAttribute('aria-pressed', sk.on);
        b.title = sk.on ? 'O AUTO usa este poder. Toque para desligar.' : 'Desligado. Toque para o AUTO usar.';
        b.innerHTML = `${skLabel(sk.name)}<span class="mana">${sk.mana} MP</span><span class="cd"></span>`;
        b.onclick = () => send({ type: 'settings', settings: { skills: { [sk.id]: !sk.on } } });
      }
      box.appendChild(b);
    }
  }

  function renderQuests() {
    const q = S.quests; const box = $('#quests-body');
    if (!q) { box.innerHTML = '<p class="muted">Carregando…</p>'; return; }
    const h = Math.floor(q.resetIn / 3600000), mi = Math.floor((q.resetIn % 3600000) / 60000);
    const bar = (v, g) => `<div class="qbar"><span style="width:${Math.min(100, v / g * 100)}%"></span><em>${fmt.format(v)}/${fmt.format(g)}</em></div>`;
    const btn = (kind, id, ready, claimed) => claimed ? '<span class="q-done">Recebido</span>'
      : `<button class="btn small ${ready ? 'btn-gold' : ''}" type="button" data-claim="${kind}" data-id="${id}" ${ready ? '' : 'disabled'}>${ready ? 'Pegar prêmio' : 'Em andamento'}</button>`;
    box.innerHTML = `
      <h3 style="margin-top:0">Prêmio de login · dia ${q.login.streak}</h3>
      <ol class="login-days">${q.login.rewards.map((r, i) => `<li class="${i < q.login.today || (i === q.login.today && q.login.claimed) ? 'got' : ''} ${i === q.login.today ? 'now' : ''}"><b>Dia ${i + 1}</b><small>${esc(r)}</small></li>`).join('')}</ol>
      <div class="row" style="justify-content:flex-start">${btn('login', 'today', !q.login.claimed, q.login.claimed)}<small class="muted">Entre todo dia: se faltar um dia, a sequência recomeça.</small></div>
      <h3>Missões diárias <small class="muted">renovam em ${h}h ${mi}min</small></h3>
      <ul class="qlist">${q.daily.map((m) => `<li><div><b>${esc(m.text)}</b><small>Prêmio: ${esc(m.reward)}</small>${bar(m.prog, m.goal)}</div>${btn('daily', m.id, m.prog >= m.goal, m.claimed)}</li>`).join('')}</ul>
      <h3>Conquistas</h3>
      <ul class="qlist">${q.ach.map((a) => `<li class="${a.state === 'claimed' ? 'claimed' : ''}"><div><b>${esc(a.text)}</b><small>Prêmio: ${esc(a.reward)}</small>${a.state === 'open' ? bar(a.prog, a.goal) : ''}</div>${btn('ach', a.id, a.state === 'done', a.state === 'claimed')}</li>`).join('')}</ul>`;
    $$('#quests-body [data-claim]').forEach((b) => { b.onclick = () => { b.disabled = true; send({ type: 'claim', kind: b.dataset.claim, id: b.dataset.id }); }; });
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
    else if (name === 'quests') renderQuests();
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
      <p>PvP: <b>${c.pvp.kills}</b> vitórias · ${c.pvp.deaths} derrotas · duelos ${c.pvp.duelW}V/${c.pvp.duelL}D${c.pvp.pk ? ` · ${c.pvp.pk}× PK` : ''}</p>
      <h3>Poderes</h3>
      <ul class="skills-list">${c.allSkills.map((s) => `<li><b>${esc(s.name)}</b> <small class="muted">${c.level >= s.lvl ? 'liberado' : `libera no nível ${s.lvl}`} · ${s.mana} MP · ${(s.cd / 1000).toFixed(0)}s</small><br><small>${esc(s.desc)}</small></li>`).join('')}</ul>
      <p class="mode-note">Servidor <b>${esc(c.mode)}</b>: subir de nível é difícil e morrer custa ${Math.round(c.deathLoss * 100)}% da EXP do nível.</p>`;
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
      <label class="cfg-check"><input type="checkbox" id="cfg-pvp" ${st.pvpAuto ? 'checked' : ''}> Atacar jogadores automaticamente em Vulcanus (zona PvP)</label>
      <div class="cfg-row"><label for="cfg-quality">Qualidade gráfica</label>
        <select id="cfg-quality"><option value="baixa">Baixa (celular fraco)</option><option value="media">Média</option><option value="alta">Alta</option></select></div>
      <div class="cfg-row"><label for="cfg-vol">Volume <b id="cfg-vol-v"></b></label><input type="range" id="cfg-vol" min="0" max="100" step="5"></div>
      <label class="cfg-check"><input type="checkbox" id="cfg-mute"> Sem som</label>
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
    $('#cfg-pvp').onchange = (e) => sendS({ pvpAuto: e.target.checked });
    $('#cfg-quality').value = quality; $('#cfg-quality').onchange = (e) => setQuality(e.target.value);
    if (window.Sfx) {
      $('#cfg-vol').value = Math.round(Sfx.volume * 100); $('#cfg-vol-v').textContent = Math.round(Sfx.volume * 100) + '%';
      $('#cfg-vol').oninput = (e) => { Sfx.setVolume(Number(e.target.value) / 100); $('#cfg-vol-v').textContent = e.target.value + '%'; };
      $('#cfg-mute').checked = Sfx.muted; $('#cfg-mute').onchange = (e) => Sfx.setMuted(e.target.checked);
    }
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

  // ================= alertas e PvP =================
  function alertBanner(text) {
    const el = $('#alert-banner');
    el.textContent = text;
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  }
  function openPlayerCard(p) {
    const card = $('#pcard');
    const info = p.info;
    const cls = S.data.classes[info.cls];
    const pvpMap = S.data.world.find((w) => w.id === S.map.map && w.pvp);
    const myDuel = S.duel && S.duel.with === info.id;
    const canAttack = (pvpMap || myDuel) && !S.map.safe || myDuel;
    card.innerHTML = `<button class="close" type="button" aria-label="Fechar">×</button>
      <b>${(p.flags & 1) ? '<span style="color:#ff6a5a">[PK]</span> ' : ''}${esc(info.name)}</b><small>${esc(cls.name)} · Nível ${info.level}</small>
      <div class="row">
        <button class="btn small ${canAttack ? 'btn-danger' : ''}" type="button" data-act="attack" ${canAttack ? '' : 'disabled'}>Atacar</button>
        <button class="btn small btn-gold" type="button" data-act="duel" ${S.duel ? 'disabled' : ''}>Desafiar para duelo</button>
      </div>
      ${canAttack ? '' : '<small class="muted">Atacar só em Vulcanus (zona PvP) ou em duelo.</small>'}`;
    card.hidden = false;
    card.querySelector('.close').onclick = () => { card.hidden = true; };
    card.querySelector('[data-act="attack"]').onclick = () => { send({ type: 'target', id: info.id }); card.hidden = true; };
    card.querySelector('[data-act="duel"]').onclick = () => { send({ type: 'duel', id: info.id }); card.hidden = true; };
  }
  let inviteTimer = null;
  function showDuelInvite(m) {
    const box = $('#duel-invite');
    const cls = S.data.classes[m.cls];
    box.innerHTML = `<b>${esc(m.name)}</b> (${esc(cls ? cls.name : '')}, nível ${m.level}) desafiou você para um duelo de 3 minutos.
      <div class="row"><button class="btn small btn-gold" type="button" data-a="1">Aceitar</button><button class="btn small" type="button" data-a="0">Recusar</button></div>`;
    box.hidden = false;
    if (window.Sfx) Sfx.duel();
    const answer = (acc) => { send({ type: 'duelAnswer', id: m.id, accept: acc }); box.hidden = true; clearTimeout(inviteTimer); };
    box.querySelector('[data-a="1"]').onclick = () => answer(true);
    box.querySelector('[data-a="0"]').onclick = () => answer(false);
    clearTimeout(inviteTimer); inviteTimer = setTimeout(() => { box.hidden = true; }, 15000);
  }
  function renderDuelBar() {
    const bar = $('#duel-bar');
    if (!S.duel) { bar.hidden = true; return; }
    bar.hidden = false;
    const tick = () => {
      if (!S.duel) { bar.hidden = true; return; }
      const left = Math.max(0, S.duel.until - performance.now());
      bar.innerHTML = `Duelo contra <b>${esc(S.duel.name)}</b> · ${Math.floor(left / 60000)}:${String(Math.floor(left / 1000) % 60).padStart(2, '0')}
        <button class="btn small" type="button" id="duel-quit">Desistir</button>`;
      $('#duel-quit').onclick = () => send({ type: 'duelQuit' });
      setTimeout(tick, 1000);
    };
    tick();
  }

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
