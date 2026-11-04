// MU Idle Legends — cliente do mundo. Desenha o que o servidor manda e envia só intenções.
'use strict';
(function () {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const PA = window.PixelArt;
  const fmt = new Intl.NumberFormat(window.I18N ? I18N.locale : 'pt-BR');
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const charId = new URLSearchParams(location.search).get('c');

  const S = {
    gitems: new Map(), goldFx: [], inv: null,
    data: null, char: null, me: null, map: null, ground: null,
    players: new Map(), monsters: new Map(), fx: [], floats: [], clickMark: null,
    boss: null, chatUnread: 0, panel: null, selItem: null, rarFilter: 'all', youId: null, trainingInside: false, hitParticles: [],
  };
  const RAR = { common: '#c8c8c8', uncommon: '#5fd35f', rare: '#4aa3ff', epic: '#b45cff', legendary: '#ffb02e', ancestral: '#ff4d4d' };
  const RAR_NAME = { common: 'Comum', uncommon: 'Incomum', rare: 'Raro', epic: 'Épico', legendary: 'Lendário', ancestral: 'Ancestral' };
  const RAR_ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'ancestral'];
  const SLOT_NAME = { helm: 'Elmo', armor: 'Armadura', pants: 'Calças', gloves: 'Luvas', boots: 'Botas', weapon: 'Arma', shield: 'Escudo', wings: 'Asas', necklace: 'Colar', ring: 'Anel', ring2: 'Anel 2' };
  const STAT_PT = { str: 'Força', agi: 'Agilidade', ene: 'Energia', vit: 'Vitalidade', cmd: 'Comando' };
  const ACCENT = (it) => it.ic || RAR[it.rarity];
  const FX_COLOR = { fire: '#ff7a3d', energy: '#59c7ff', ice: '#bff0ff', arrow: '#efe4c8', arrow3: '#efe4c8', dark: '#c06bff',
    spirit: '#ff7ad9', lightning: '#ffffaa', meteor: '#ff4d1f', slash: '#ffffff', whirl: '#ffffff', heal: '#9affd0', claw: '#ff6060', boss: '#c06bff' };
  const RANGED = new Set(['fire', 'energy', 'ice', 'arrow', 'arrow3', 'dark', 'spirit']);
  
  // dentro do app Android (ou vindo da página /app) o botão Heróis volta para o app
  const inApp = () => { try { return /MUIdleApp/.test(navigator.userAgent) || sessionStorage.getItem('mui_app') === '1'; } catch (_) { return /MUIdleApp/.test(navigator.userAgent); } };
  const backHome = () => (inApp() ? '/app' : '/?herois');
  if (!charId) { location.href = inApp() ? '/app' : '/'; return; }

  // ================= conexão =================
  let ws = null, retry = 0, joined = false, leaving = false;
  function send(obj) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj)); }
  function connect() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${proto}://${location.host}/ws`);
    const sock = ws;
    sock.onopen = () => { retry = 0; setConn(true); send({ type: 'join', charId, room: S.room || 1 }); };
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
      case 'enter': onEnter(m); marketNotice(); return;
      case 's': return onSnap(m);
      case 'char': S.char = m; renderChar(); if (S.panel === 'market' && MK.tab === 'sell') renderMarket(); return;
      case 'pj': S.players.set(m.id, { ...(S.players.get(m.id) || { x: 0, y: 0, rx: null }), info: m }); if (m.eq) Sprites.preloadEquip(m.cls, m.eq); return;
      case 'pl': S.players.delete(m.id); return;
      case 'reward': if (window.Sfx) Sfx.coin(); return;
      case 'duelInvite': return showDuelInvite(m);
      case 'duel': S.duel = { with: m.with, name: m.name, until: performance.now() + m.until }; renderDuelBar(); if (window.Sfx) Sfx.duel(); feed(`Duelo contra ${m.name} começou! Vence quem derrubar o outro.`, 'pvp'); return;
      case 'duelEnd': S.duel = null; renderDuelBar(); feed(m.result === 'win' ? 'Você venceu o duelo!' : m.result === 'loss' ? 'Você perdeu o duelo.' : 'Duelo encerrado sem vencedor.', m.result === 'win' ? 'lvl' : 'warn'); return;
      case 'drop': {
        const it = m.item;
        if (m.x !== null && m.x !== undefined) S.drops.push({ x: m.x, y: m.y, dx: (Math.random() - 0.5) * 24, item: it, t0: performance.now() });
        const n = m.gain || 1;
        if (['legendary', 'ancestral'].includes(it.rarity) || it.slot === 'wings') goldFlash(`${it.name}!`);
        if (it.event || /^devil_(eye|key)_/.test(it.base)) feed(`Você encontrou: ${it.name}${n > 1 ? ' ×' + n : ''}!${m.src ? ` — ${m.src}` : ''}`, 'drop', ACCENT(it));
        else if (it.stack) feed(`Item: ${it.name} ×${n}${m.src ? ` — ${m.src}` : ''}`, 'drop', ACCENT(it));
        else feed(`Item: ${it.name}${it.plus ? ' +' + it.plus : ''} (${RAR_NAME[it.rarity]})${m.src ? ` — ${m.src}` : ''}`, 'drop', RAR[it.rarity]);
        return;
      }
      case 'gadd': S.gitems.set(m.g.gid, { ...m.g, t0: performance.now() }); return;
      case 'madd': S.monsters.set(m.m.id, { ...m.m, x: 0, y: 0, rx: null, ry: null, hp: m.m.maxHp, dead: false, bornAt: performance.now() }); return;
      case 'mdel': S.monsters.delete(m.id); return;
      case 'invasion': return onInvasion(m);
      case 'boxResult': return boxResult(m);
      case 'arenaInfo': AR.info = m; AR.skew = Date.now() - m.now; AR.busy = false; if (S.panel === 'arena') renderArena(); return;
      case 'arenaResult': AR.busy = false; feed(m.text, m.ok ? 'quest' : 'warn'); return;
      case 'arena': return onArena(m);
      case 'tradeInvite': return tradeInvite(m);
      case 'tradeInviteEnd': if (TR.inv && TR.inv.id === m.id) closeTradeInvite(); if (m.text) feed(m.text, 'warn'); return;
      case 'trade': return onTrade(m);
      case 'market': MK.data = m; MK.busy = false; if (m.view === 'mine') mkBadge(m.rows); if (S.panel === 'market' && (MK.tab === m.view || (MK.tab === 'sell' && m.view === 'mine' && MK.listed))) { if (MK.listed) { MK.listed = false; MK.tab = 'mine'; } renderMarket(); } return;
      case 'marketStripe': MK.stripe = m; MK.busy = false; if (S.panel === 'market') renderMarket(); return;
      case 'resetStatus': RSI.info = m; RSI.busy = false; if (S.panel === 'hero') renderHero(); return;
      case 'resetStatusResult': RSI.busy = false; feed(m.text, m.ok ? 'quest' : 'warn'); if (m.ok) goldFlash('RESET STATUS!'); else alertBanner(m.text); return;
      case 'marketWallet': MK.wallet = m; if (S.panel === 'market') renderMarket(); return;
      case 'marketPix': MK.pix = m; MK.busy = false; if (S.panel === 'market') renderMarket(); return;
      case 'marketOpen': MK.busy = false; if (m.text) { mkMsg(m.text, true); feed(m.text, 'quest'); } if (m.url && (/^https:\/\/([a-z0-9-]+\.)*stripe\.com\//.test(m.url) || /^http:\/\/localhost/.test(m.url))) location.assign(m.url); return;
      case 'marketMsg': MK.busy = false; if (!m.ok) MK.listed = false; mkMsg(m.text, m.ok); feed(m.text, m.ok ? 'quest' : 'warn'); if (S.panel === 'market') renderMarket(); return;
      case 'tradeMsg': tradeStatus(m.text, true); feed(m.text, 'warn'); return;
      case 'upgPreview': return upgPreview(m);
      case 'upgResult': return upgResult(m);
      case 'smithInfo': SM.info = m; SM.busy = false; if (S.panel === 'smith') renderSmith(); return;
      case 'smithResult': return smithResult(m);
      case 'vault': VT.data = m; VT.no = m.no; VT.busy = false; if (S.panel === 'vault') renderVault(); return;
      case 'vaultResult': VT.busy = false; vaultMsg(m.text, m.ok); if (!m.ok) feed(m.text, 'warn'); return;
      case 'cqInfo': CQ.info = m; if (S.panel === 'cquest') renderCQ(); return;
      case 'cqResult': feed(m.text, m.ok ? 'quest' : 'warn'); CQ.busy = false; return;
      case 'evolved': goldFlash(`${m.className}!`); if (window.Sfx) Sfx.levelUp(); return;
      case 'gdel': S.gitems.delete(m.gid); return;
      case 'chaosInfo': CH.info = m; if (S.panel === 'chaos') renderChaos(); return;
      case 'chaosResult': return chaosResult(m);
      case 'cmdres': return cmdResult(m);
      case 'log': return feed(m.text, m.kind === 'warn' ? 'warn' : m.kind === 'quest' ? 'quest' : m.kind === 'pvp' ? 'pvp' : '');
      case 'quests': S.quests = m; $('#quest-badge').hidden = !m.claimable; if (S.panel === 'quests') renderQuests(); return;
      case 'offline': return showOffline(m);
      case 'chat': return addChat(m, true);
      case 'chatlog': CHAT_CHANNELS.forEach((c) => { CHAT_LOGS[c] = []; }); m.lines.forEach((l) => addChat(l, false)); return;
      case 'social': if (m.action === 'partyChanged') { send({ type: 'social', area: 'party', action: 'info' }); return; } if (m.action === 'info') { S.social = m; renderSocialInfo(); return; } return;
      case 'socialInvite': { const ok = window.confirm(m.kind === 'guild' ? `${m.from} convidou você para a guilda ${m.guildName}. Aceitar?` : `${m.from} convidou você para a party. Aceitar?`); send({ type: 'social', area: m.kind, action: ok ? 'accept' : 'decline' }); return; }
      case 'kicked': S.kicked = true; centerMsg(esc(m.reason), true); return;
      case 'left': location.href = backHome(); return;
      case 'error':
        if (!joined) { S.kicked = true; centerMsg(esc(m.error), true); } else feed(m.error, 'warn');
        return;
      default:
    }
  }

  function onEnter(m) {
    joined = true;
    centerMsg(null);
    S.map = m; S.youId = m.you; S.trainingInside = false;
    S.monsters = new Map(m.monsters.map((mo) => [mo.id, { ...mo, x: 0, y: 0, rx: null, ry: null, hp: mo.maxHp, dead: false }]));
    const keep = S.players.get(m.you);
    S.players = new Map(m.players.map((p) => [p.id, { info: p, x: 0, y: 0, rx: null }]));
    S.players.set(m.you, keep && keep.info ? { ...keep, rx: null, dyingAt: 0, dead: false, attackUntil: 0, hurtUntil: 0 } : { info: null, x: 0, y: 0, rx: null });
    S.fx = []; S.floats = []; S.drops = []; S.dangers = []; S.parts = []; S.hitParticles = [];
    S.gitems = new Map((m.ground || []).map((g) => [g.gid, { ...g, t0: performance.now() }]));
    S.enterAt = performance.now(); S.camInit = false;
    const wInfo = S.data && S.data.world.find((w) => w.id === m.map);
    const ban = $('#map-banner');
    ban.innerHTML = `<b>${esc(m.name)}</b><small>${m.arena ? (m.pvp ? 'Evento · todos contra todos' : 'Evento · derrote os monstros') : m.safe ? 'Zona segura' : wInfo && wInfo.pvp ? 'Zona PvP · jogadores podem se atacar' : wInfo ? `Nível ${wInfo.minLevel}+${wInfo.expBonus ? ` · EXP +${wInfo.expBonus}%` : ''}` : ''}</small>`;
    if (!m.arena) { AR.hud = null; S.arenaZone = null; arenaHud(); }
    ban.classList.remove('show'); void ban.offsetWidth; ban.classList.add('show');
    if (window.Sfx) Sfx.ambient(m.theme);
    const built = buildGround(m);
    S.ground = built.canvas; S.props = built.props; S.lights = built.lights; S.waters = built.waters || []; S.emit = built.emit || []; S.vfx = []; S.dlights = [];
    if (is3d) { try { W3().enterMap(m, built); W3().preload([...new Set(m.monsters.map((mo) => mo.type))], [...new Set(m.players.map((p) => p.cls))]); } catch (e) { console.error('[3d]', e); } }
    if (m.room) { S.room = m.room; S.rooms = m.rooms || 4; }
    $('#map-name').textContent = m.name + (m.safe ? ' · zona segura' : (wInfo && wInfo.pvp ? ' · PvP' : '')) + (m.room ? ` · Sala ${m.room}` : '');
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
      // vivo de novo: tira a animação de morte (também quando o servidor reviveu antes de mandar o 'morto')
      if ((p.dead && !dead) || (!dead && p.dyingAt && now - p.dyingAt > 2500)) p.dyingAt = 0;
      Object.assign(p, { id, x, y, hp, maxHp, dead: !!dead, flip: !!flip, buff: buff || 0, flags: flags || 0 });
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

  function ent(id) { if (!id) return null; return id[0] === 'p' ? S.players.get(id) : S.monsters.get(id); }

  const PROJ = { fire: 'proj_fire', energy: 'proj_energy', ice: 'proj_ice', arrow: 'proj_arrow', arrow3: 'proj_arrow', dark: 'proj_dark', spirit: 'proj_spirit' };
  const IMPACT = { fire: 'impact_fire', energy: 'impact_energy', ice: 'impact_ice', arrow: 'impact_arrow', arrow3: 'impact_arrow', dark: 'impact_dark',
    spirit: 'impact_spirit', lightning: 'impact_lightning', meteor: 'impact_fire', claw: 'impact_blood', boss: 'impact_dark', slash: 'impact_energy', whirl: 'impact_energy' };
  const BURST = { meteor: 'burst_fire', fire: 'burst_fire', whirl: 'burst_energy', lightning: 'burst_lightning', spirit: 'burst_spirit', arrow3: 'burst_arrow', dark: 'burst_dark' };
  const MON_H = { slime: 26, goblin: 46, goblin_elite: 46, spider: 30, skeleton: 52, skeleton_king: 62 };
  const HERO_H = 56;
  const monSprite = (m) => m.sprite + (m.tint === 'elite' ? '_elite' : '');

  // efeitos extras de um golpe: círculo mágico, raio, meteoro, arco de espada, faíscas e luz no impacto
  function hitVfx(ev, a, t, now, delay, ranged) {
    const [cols, lc] = pal(ev.fx);
    const d = delay / 1000;
    const [tx, ty] = center(t);
    if (a && a.info && ranged && ev.fx !== 'arrow' && ev.fx !== 'arrow3') S.fx.push({ kind: 'circle', at: a, col: lc, t0: now, dur: Math.max(380, delay + 200), r: 16 });
    if (a && ev.fx === 'lightning' && !ev.aoe) { S.fx.push({ kind: 'bolt', from: a, to: t, col: lc, t0: now + delay * 0.5, dur: 220 }); if (a.info) S.fx.push({ kind: 'circle', at: a, col: lc, t0: now, dur: 420, r: 16 }); }
    if (ev.fx === 'meteor' && !ev.aoe) S.fx.push({ kind: 'meteor', x: t.rx, y: t.ry, t0: now + delay - 180, dur: 180 });
    if (a && a.info && !ranged && !ev.aoe) S.fx.push({ kind: 'slash', from: a, at: t, col: ev.c ? '255,220,120' : (a.info.eq && a.info.eq.wr && RAR[a.info.eq.wr] ? hexRgb(RAR[a.info.eq.wr]) : '235,245,255'), t0: now + delay * 0.35, dur: 200 });
    sparks(tx, ty, ev.c ? 18 : 8, cols, ev.c ? 120 : 75, { delay: d, life: 0.45, up: 10 });
    dlight(tx, ty, ev.c ? 96 : 58, lc, ev.c ? 420 : 300, ev.c ? 2 : 1.3, now + delay);
    if (ev.c) {
      S.fx.push({ kind: 'ring', x: t.rx, y: t.ry, r: 26, col: '255,230,150', t0: now + delay, dur: 300, w: 2 });
      S.fx.push({ kind: 'star', at: t, t0: now + delay, dur: 220 });
    }
    if (ev.fx === 'ice') sparks(tx, ty, 6, ['#ffffff', '#bff4ff'], 30, { delay: d, life: 0.9, g: 30, big: 0.8, add: true });
  }
  function hexRgb(h) { const n = parseInt(String(h).slice(1, 7), 16); return Number.isFinite(n) ? `${n >> 16 & 255},${n >> 8 & 255},${n & 255}` : '255,255,255'; }
  // morte de monstro: estilhaços com a cor da criatura + almas subindo; boss ganha explosão própria
  const DEATH_COL = { slime: ['#6ad84a', '#bfff8a', '#2a8a2a'], goblin: ['#8ab84a', '#c8a86a', '#5a3a1c'], goblin_elite: ['#ff6a3a', '#ffd36b'], spider: ['#6a4a8a', '#c8a0ff', '#2a1a3a'],
    skeleton: ['#e8e0c8', '#b8b098', '#ffffff'], skeleton_king: ['#e8e0c8', '#ff3030', '#c06bff'], ice_golem: ['#bff4ff', '#7ad8ff', '#ffffff'], lava_hound: ['#ff6a1a', '#ffd36b', '#3a1a10'] };
  function deathVfx(t, now) {
    if (!t.sprite) return;
    if (t.boss) { bossDeath(t, now); return; }
    const [cx, cy] = center(t);
    const cols = t.golden ? ['#ffd84a', '#fff6c0'] : DEATH_COL[monSprite(t)] || DEATH_COL[t.sprite] || ['#ffffff', '#c8c8c8'];
    sparks(cx, cy, t.elite ? 26 : 16, cols, 85, { up: 30, life: 0.65, g: 140, add: false, big: 0.6 });
    for (let k = 0; k < Math.round(5 * FXK[quality]); k++) puff(cx + (Math.random() - 0.5) * 14, cy, { vx: (Math.random() - 0.5) * 6, vy: -16 - Math.random() * 16, life: 1.1 + Math.random() * 0.5, col: t.elite ? '#ffd36b' : '#cfe8ff', kind: 'soul', s: 1, wob: 8, delay: 0.25 + Math.random() * 0.3 });
    S.fx.push({ kind: 'ring', x: t.rx, y: t.ry, r: 18 * (t.scale || 1), col: '255,255,255', t0: now, dur: 280, w: 1 });
    dlight(cx, cy, 50, '255,240,220', 300, 0.9, now);
  }

  function handleEvent(ev, now) {
    if (ev.k === 'h') {
      const a = ent(ev.a), t = ent(ev.t);
      if (!t) return;
      if (a) { a.attackStart = now; a.attackUntil = now + 340; a.atkT = t; }
      t.hurtUntil = now + 160;
      const color = ev.t === S.youId ? '#ff6b5b' : ev.c ? '#ffb02e' : '#ffffff';
      const ranged = RANGED.has(ev.fx) && a && !ev.aoe;
      const attackMeta = a && (a.info ? Sprites.frames('heroes', a.info.cls, 'attack') : a.sprite ? Sprites.frames('monsters', monSprite(a), 'attack') : null);
      const impactFrame = attackMeta ? Math.min(attackMeta.frames - 1, attackMeta.impactFrame ?? 2) : 2;
      const delay = ranged ? 220 : (a ? Math.round(impactFrame * 1000 / (attackMeta && attackMeta.fps || 12)) : 0);
      t.hurtUntil = now + delay + 160;
      t.hitAt = now + delay;
      t.hitDir = a && Number.isFinite(a.rx) && Number.isFinite(t.rx) ? (t.rx >= a.rx ? 1 : -1) : (Math.random() < .5 ? -1 : 1);
      const hitColors = { fire: '#ff9a3a', meteor: '#ff6a2a', ice: '#9beaff', lightning: '#e0b7ff', energy: '#8bdcff', arrow: '#fff0b0', arrow3: '#ffd36b', dark: '#d68aff', spirit: '#ff9acb', slash: '#fff4cf', whirl: '#c7e7ff', claw: '#ff887a', boss: '#d1a0ff' };
      burstHitPixels(t, hitColors[ev.fx] || (ev.c ? '#ffd36b' : '#ffffff'), ev.c ? 14 : 7, now + delay);
      if (ranged) S.fx.push({ kind: 'proj', from: a, to: t, fx: ev.fx, sprite: PROJ[ev.fx] || 'proj_energy', t0: now, dur: delay });
      else if (!ev.aoe && a && ev.a[0] === 'p' && a.info) {
        S.fx.push({ kind: 'crescent', at: t, from: a, sprite: a.info.cls === 'dark_lord' ? 'crescent_fire' : a.info.cls === 'magic_gladiator' ? 'crescent_dark' : 'crescent_energy', t0: now, dur: 240 });
      }
      S.fx.push({ kind: 'impact', at: t, sprite: IMPACT[ev.fx] || 'impact_energy', t0: now + delay, dur: 260 });
      hitVfx(ev, a, t, now, delay, ranged);
      S.floats.push({ at: t, text: ev.c ? `${ev.d}!` : String(ev.d), color, big: !!ev.c, t0: now + delay });
      if (window.Sfx) {
        setTimeout(() => {
          if (!window.Sfx) return;
          if (ev.a === S.youId) { if (ranged || ev.fx !== 'slash') Sfx.cast(ev.fx); if (ev.c) Sfx.crit(); else Sfx.hit(false); }
          else if (ev.t === S.youId) Sfx.hurt();
        }, delay);
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
      S.fx.push({ kind: 'ring', x: ev.x, y: ev.y, r: ev.r * 1.2, col: '255,90,60', t0: now, dur: 520, w: 4 });
      sparks(ev.x, ev.y - 4, 36, ['#ff4d1f', '#ffb02e', '#8a3aff', '#3a2a2a'], 140, { spread: ev.r * 0.6, up: 50, life: 0.8, g: 160, add: true });
      dlight(ev.x, ev.y, ev.r * 2.4, '255,90,50', 600, 2, now);
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
      const [cols, lc] = pal(ev.fx);
      S.fx.push({ kind: 'ring', x: ev.x, y: ev.y, r: ev.r * 1.1, col: lc, t0: now, dur: 420, w: 3 });
      if (a && a.info) S.fx.push({ kind: 'circle', at: a, col: lc, t0: now, dur: 520, r: 20 });
      if (ev.fx === 'meteor') S.fx.push({ kind: 'meteor', x: ev.x, y: ev.y, t0: now, dur: 170 });
      if (ev.fx === 'lightning') for (let k = 0; k < 3; k++) S.fx.push({ kind: 'bolt', x: ev.x + (Math.random() - 0.5) * ev.r, y: ev.y + (Math.random() - 0.5) * ev.r * 0.5, sky: true, col: lc, t0: now + k * 70, dur: 200 });
      sparks(ev.x, ev.y - 6, 26, cols, 110, { spread: ev.r * 0.8, up: 20, life: 0.7 });
      dlight(ev.x, ev.y, ev.r * 2.2, lc, 520, 1.8, now);
    } else if (ev.k === 'buff') {
      const t = ent(ev.t);
      if (t) {
        S.fx.push({ kind: 'burst', x: t.rx, y: t.ry, r: 40, sprite: ev.b === 'dmg' ? 'burst_fire' : 'burst_energy', t0: now, dur: 460 });
        S.fx.push({ kind: 'circle', at: t, col: ev.b === 'dmg' ? '255,150,50' : '100,190,255', t0: now, dur: 800, r: 22 });
        for (let k = 0; k < Math.round(18 * FXK[quality]); k++) { const a2 = k / 18 * Math.PI * 2; puff(t.rx + Math.cos(a2) * 12, t.ry + Math.sin(a2) * 4, { vx: 0, vy: -26 - Math.random() * 20, life: 0.9, col: ev.b === 'dmg' ? '#ffb02e' : '#7ad0ff', s: 1, wob: 8, delay: k * 0.02 }); }
        dlight(t.rx, t.ry - 16, 90, ev.b === 'dmg' ? '255,150,50' : '100,190,255', 700, 1.4, now);
        S.floats.push({ at: t, text: ev.b === 'dmg' ? 'DANO +' : 'DEFESA +', color: ev.b === 'dmg' ? '#ffb02e' : '#7ad0ff', big: true, t0: now });
        if (ev.t === S.youId && window.Sfx) Sfx.buff();
      }
    } else if (ev.k === 'heal') {
      const t = ent(ev.t);
      if (t) { S.floats.push({ at: t, text: '+' + ev.d, color: '#9affd0', t0: now }); S.fx.push({ kind: 'heal', at: t, t0: now, dur: 600 });
        for (let k = 0; k < Math.round(10 * FXK[quality]); k++) puff(t.rx + (Math.random() - 0.5) * 18, t.ry - Math.random() * 10, { vy: -22 - Math.random() * 18, life: 0.8, col: Math.random() < 0.5 ? '#9affd0' : '#ffffff', wob: 6, delay: Math.random() * 0.2 });
        dlight(t.rx, t.ry - 14, 60, '120,255,190', 500, 1, now); if (ev.fx === 'heal' && ev.t === S.youId && window.Sfx) Sfx.heal(); }
    } else if (ev.k === 'lv') {
      const t = ent(ev.t);
      if (t) {
        S.fx.push({ kind: 'lvl', at: t, t0: now, dur: 1200 }); S.floats.push({ at: t, text: 'LEVEL UP!', color: '#ffd36b', big: true, t0: now });
        S.fx.push({ kind: 'pillar', at: t, col: '255,215,110', t0: now, dur: 1300, w: 16 });
        S.fx.push({ kind: 'ring', x: t.rx, y: t.ry, r: 46, col: '255,215,110', t0: now, dur: 600, w: 3 });
        S.fx.push({ kind: 'circle', at: t, col: '255,215,110', t0: now, dur: 1300, r: 24 });
        for (let k = 0; k < Math.round(34 * FXK[quality]); k++) { const a2 = Math.random() * Math.PI * 2; puff(t.rx + Math.cos(a2) * 14, t.ry + Math.sin(a2) * 5, { vy: -30 - Math.random() * 50, life: 1.1, col: ['#ffd36b', '#fff2a8', '#ffffff'][k % 3], s: k % 4 ? 1 : 2, wob: 10, delay: Math.random() * 0.6 }); }
        dlight(t.rx, t.ry - 20, 150, '255,215,110', 1300, 2, now);
      }
      if (ev.t === S.youId) { feed('Subiu de nível!', 'lvl'); if (window.Sfx) Sfx.levelUp(); shake(4, 300); }
    } else if (ev.k === 'gold') {
      S.goldFx.push({ x: ev.x, y: ev.y, t0: now, tier: ev.tier, coins: Array.from({ length: ev.tier === 'ouro' ? 26 : ev.tier === 'prata' ? 18 : 12 }, () => ({ a: Math.random() * Math.PI * 2, v: 30 + Math.random() * 60, h: 20 + Math.random() * 40 })) });
      if (window.Sfx) Sfx.drop('legendary');
    } else if (ev.k === 'die') {
      const t = ent(ev.t); if (t) { t.dyingAt = now; deathVfx(t, now); }
    } else if (ev.k === 'pdie') {
      const t = ent(ev.t); if (t) { t.dyingAt = now; const [cx, cy] = center(t); sparks(cx, cy, 18, ['#ff6b5b', '#8a1a1a', '#ffffff'], 70, { up: 20, life: 0.7, g: 120, add: false }); }
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
    water: { base: '#1e5a6a', a: '#246a7a', b: '#184a58', blade: '#3a8a8a' },
    tower: { base: '#2a2238', a: '#322a42', b: '#221c2e', blade: '#3e3450' },
    desert: { base: '#d8b070', a: '#e4c088', b: '#c89c5a', blade: '#b88a4a' },
    sky: { base: '#a8c8e8', a: '#bcd8f4', b: '#94b4d8', blade: '#d8ecff' },
    darkforest: { base: '#1a2e1c', a: '#203822', b: '#142416', blade: '#2a4a2c' },
    void: { base: '#1a1024', a: '#22162e', b: '#140c1c', blade: '#2e1e3e' },
    castle: { base: '#2a2428', a: '#322a30', b: '#221c20', blade: '#3a3036' },
    devilsq: { base: '#24141e', a: '#2e1826', b: '#1c0e16', blade: '#3a1e2e' },
  };
  // Monta o chão (pintado uma vez) + objetos altos separados (balançam e entram na ordem de profundidade) + luzes
  function buildGround(m) {
    const W = m.w * GS, H = m.h * GS;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const base = c.getContext('2d');
    let g = base;
    const props = [], lights = [], waters = [], emit = [], rocks = [], structs = [];
    let PKIND = null; // tipo do objeto (para a versão 3D desenhar o modelo certo)
    const T = GROUND[m.theme] || GROUND.town;
    // pontos animados por quadro (em coordenadas do mundo): água, chamas, fumaça, chafariz
    const water = (x, y, rad, kind = 'water') => waters.push({ x: x / GS, y: y / GS, r: rad / GS, kind, ph: r() * 6 });
    const emitter = (x, y, kind) => emit.push({ x: x / GS, y: y / GS, kind, ph: r() * 6, acc: 0 });
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
      props.push({ img: pc, x: x / GS, y: y / GS, ax, ay, w, h, sway, ph: r() * 6.28, kind: PKIND });
      PKIND = null;
    };
    px(0, 0, W, H, T.base);
    // manchas grandes e suaves com borda pontilhada (estilo pixel art HD)
    for (let i = 0; i < W * H / 7000; i++) {
      const x = r() * W, y = r() * H, rad = 18 + r() * 54, col = r() < 0.5 ? T.a : T.b;
      disc(x, y, rad, col, 1);
      for (let k = 0; k < rad * 3; k++) { const a = r() * Math.PI * 2, d = rad + 1 + r() * 4; px(x + Math.cos(a) * d, y + Math.sin(a) * d, 2, 2, col); }
    }
    // tufos e pedrinhas
    for (let i = 0; i < W * H / 650; i++) {
      const x = r() * W, y = r() * H;
      px(x, y - 3, 1, 4, T.blade); px(x - 2, y - 1, 1, 2, T.blade); px(x + 2, y - 2, 1, 3, T.blade); px(x - 1, y, 4, 1, T.b);
    }
    for (let i = 0; i < W * H / 2600; i++) { const x = r() * W, y = r() * H; px(x, y, 4, 3, T.b); px(x, y, 2, 1, T.a); px(x + 1, y + 3, 3, 1, 'rgba(0,0,0,.18)'); }

    const treeArt = (x, y, s = 1, dark = false, pink = false) => {
      px(x - 4 * s, y - 18 * s, 8 * s, 20 * s, '#3a2410'); px(x - 3 * s, y - 18 * s, 6 * s, 20 * s, '#5a3a1c'); px(x - 3 * s, y - 18 * s, 2 * s, 20 * s, '#7a5230');
      px(x - 7 * s, y, 4 * s, 2 * s, '#5a3a1c'); px(x + 3 * s, y, 4 * s, 2 * s, '#5a3a1c');
      const pal = pink ? ['#4a0e3a', '#a8306a', '#e05a9a', '#ffb0dc'] : dark ? ['#10260e', '#1f4a1c', '#2d5a24', '#3f7a32'] : ['#163a14', '#2d6a2a', '#3f8a36', '#6ab84e'];
      disc(x, y - 30 * s, 17 * s, pal[0]); disc(x - 9 * s, y - 24 * s, 9 * s, pal[0]); disc(x + 10 * s, y - 25 * s, 9 * s, pal[0]);
      disc(x, y - 30 * s, 15 * s, pal[1]); disc(x - 9 * s, y - 24 * s, 7 * s, pal[1]); disc(x + 10 * s, y - 25 * s, 7 * s, pal[1]);
      disc(x - 3 * s, y - 34 * s, 10 * s, pal[2]); disc(x - 6 * s, y - 37 * s, 5 * s, pal[3]);
      for (let k = 0; k < 18 * s; k++) px(x + (r() - 0.5) * 28 * s, y - 30 * s + (r() - 0.5) * 26 * s, 2, 2, r() < 0.5 ? pal[3] : pal[0]);
    };
    const tree = (x, y, s = 1, dark = false, pink = false) => (PKIND = { k: 'tree', s, dark, pink }) && prop(x, y, Math.ceil(60 * s), Math.ceil(64 * s), Math.ceil(30 * s), Math.ceil(58 * s), (ax, ay) => treeArt(ax, ay, s, dark, pink), 1);
    const rock = (x, y, s = 1) => { rocks.push({ x: x / GS, y: y / GS, s }); shadow(x + 2, y + 3, 11 * s); disc(x, y, 9 * s, '#4a4a54', 1); disc(x, y - 1, 8 * s, '#7a7a86'); disc(x - 3 * s, y - 3 * s, 4 * s, '#a8a8b4'); px(x + 2 * s, y + 2 * s, 4 * s, 1, '#4a4a54'); };
    const flower = (x, y, col) => { px(x, y + 2, 1, 3, '#2d6a2a'); px(x - 1, y, 3, 2, col); px(x, y - 1, 1, 4, col); px(x, y, 1, 1, '#fff6c8'); };
    const torch = (x, y) => {
      PKIND = { k: 'torch' }; prop(x, y, 12, 40, 6, 36, (ax, ay) => {
        px(ax - 2, ay - 20, 4, 22, '#3a2410'); px(ax - 1, ay - 20, 2, 22, '#7a5230'); px(ax - 4, ay - 22, 8, 3, '#5a5a66');
        disc(ax, ay - 27, 4, '#ff6a1a'); disc(ax, ay - 28, 3, '#ffb02e'); px(ax - 1, ay - 31, 2, 3, '#fff2a8');
      });
      light(x, y - 28, 110, '255,150,50', 0.25);
      emitter(x, y - 28, 'flame');
    };
    const crystal = (x, y, col = ['#3a8ad8', '#bff0ff'], lightCol = '150,215,255') => {
      PKIND = { k: 'crystal', col }; prop(x, y, 30, 40, 15, 36, (ax, ay) => {
        for (const [dx, h, wd] of [[-6, 22, 5], [0, 34, 7], [7, 18, 5]]) {
          g.fillStyle = col[0]; g.beginPath(); g.moveTo(ax + dx, ay - h); g.lineTo(ax + dx + wd, ay); g.lineTo(ax + dx - wd, ay); g.fill();
          px(ax + dx - 1, ay - h + 6, 2, h - 8, col[1]);
        }
      });
      light(x, y - 16, 70, lightCol, 0.1);
    };

    if (m.theme === 'castle' || m.theme === 'devilsq') {
      // arena de evento: piso de pedra, muralhas com ameias e braseiros
      const dev = m.theme === 'devilsq';
      const M = (m.margin || 46) * GS;
      structs.push({ k: 'arena', m: M / GS, dev });
      const tiles = dev ? ['#3a2230', '#32202a', '#2a1a24', '#40283a'] : ['#4a4248', '#423a40', '#3a3238', '#524a50'];
      for (let y = 0, row = 0; y < H; y += 32, row++) for (let x = (row % 2) * 16 - 16; x < W; x += 32) {
        px(x + 1, y + 1, 30, 30, tiles[(r() * 4) | 0]); px(x + 1, y + 1, 30, 2, dev ? '#4a2c3e' : '#5e565c'); px(x + 1, y + 29, 30, 2, dev ? '#1a0c14' : '#2a2428');
        if (r() < 0.18) { const cx2 = x + 6 + r() * 18, cy2 = y + 6 + r() * 18; px(cx2, cy2, 6, 1, '#1a1418'); px(cx2 + 5, cy2 + 1, 1, 4, '#1a1418'); }
      }
      // emblema no centro
      const ecx = W / 2, ecy = H / 2;
      disc(ecx, ecy, 92, dev ? '#4a1a3a' : '#5a1a1a'); disc(ecx, ecy, 86, dev ? '#2a0e22' : '#2e0e0e'); disc(ecx, ecy, 60, dev ? '#3a1430' : '#481414'); disc(ecx, ecy, 56, dev ? '#24101c' : '#2a0c0c');
      for (let k = 0; k < 5; k++) {
        const a1 = -Math.PI / 2 + k * Math.PI * 4 / 5, a2 = -Math.PI / 2 + (k + 1) * Math.PI * 4 / 5;
        for (let t = 0; t <= 1; t += 0.01) px(ecx + Math.cos(a1) * 80 * (1 - t) + Math.cos(a2) * 80 * t, ecy + Math.sin(a1) * 80 * (1 - t) + Math.sin(a2) * 80 * t, 3, 3, dev ? '#a84aff' : '#d8402a');
      }
      light(ecx, ecy, 260, dev ? '170,80,255' : '255,70,40', 0.12);
      // muralhas
      const wallCol = dev ? ['#2a1424', '#3a1e30', '#1a0a14'] : ['#4a3a34', '#5e4a42', '#2a201c'];
      for (const [x0, y0, w0, h0] of [[0, 0, W, M], [0, H - M, W, M], [0, 0, M, H], [W - M, 0, M, H]]) {
        px(x0, y0, w0, h0, wallCol[2]);
        for (let y = y0; y < y0 + h0; y += 14) for (let x = x0 + ((y / 14) % 2) * 12; x < x0 + w0; x += 24) { px(x + 1, y + 1, 22, 12, r() < 0.5 ? wallCol[0] : wallCol[1]); px(x + 1, y + 1, 22, 2, dev ? '#4a2a3e' : '#7a6458'); }
      }
      // ameias na borda interna
      for (let x = M; x < W - M; x += 28) { px(x, M - 14, 16, 14, wallCol[1]); px(x, M - 14, 16, 3, dev ? '#5a3a4e' : '#8a7468'); px(x, H - M, 16, 10, wallCol[0]); }
      for (let y = M; y < H - M; y += 28) { px(M - 12, y, 12, 16, wallCol[1]); px(W - M, y, 12, 16, wallCol[1]); }
      px(M, M, W - 2 * M, 4, 'rgba(0,0,0,.35)'); px(M, M, 4, H - 2 * M, 'rgba(0,0,0,.35)');
      // torres nos cantos e braseiros
      for (const [tx, ty] of [[M / 2, M / 2], [W - M / 2, M / 2], [M / 2, H - M / 2], [W - M / 2, H - M / 2]]) { disc(tx, ty, M * 0.62, wallCol[2]); disc(tx, ty, M * 0.54, wallCol[1]); disc(tx - 4, ty - 4, M * 0.3, wallCol[0]); }
      for (const [bx, by] of [[M + 40, M + 40], [W - M - 40, M + 40], [M + 40, H - M - 30], [W - M - 40, H - M - 30], [W / 2, M + 30], [W / 2, H - M - 24]]) {
        PKIND = { k: 'brazier', dev }; prop(bx, by, 24, 34, 12, 30, (ax, ay) => {
          px(ax - 7, ay - 6, 14, 6, '#3a3a44'); px(ax - 5, ay - 16, 10, 10, '#5a5a66'); px(ax - 8, ay - 18, 16, 3, '#7a7a88');
          disc(ax, ay - 22, 6, dev ? '#8a3aff' : '#ff5a1a'); disc(ax, ay - 23, 4, dev ? '#d0a0ff' : '#ffb02e'); px(ax - 1, ay - 29, 2, 4, '#fff2a8');
        });
        light(bx, by - 22, 120, dev ? '180,100,255' : '255,140,60', 0.3);
        emitter(bx, by - 23, dev ? 'flameP' : 'flameB');
      }
    } else if (m.theme === 'town') {
      const cx = m.w, cy = m.h;
      structs.push({ k: 'plaza', x0: (cx - 360) / GS, y0: (cy - 240) / GS, x1: (cx + 360) / GS, y1: (cy + 240) / GS }, { k: 'fountain', x: cx / GS, y: cy / GS, r: 52 / GS }, { k: 'townwall', y: (H - 80) / GS }, { k: 'river', W: W / GS, H: (H - 80) / GS });
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
      water(cx, cy, 38, 'fountain'); emitter(cx, cy - 76, 'spray');
      px(cx - 8, cy - 64, 16, 40, '#9a9aa8'); px(cx - 8, cy - 64, 5, 40, '#c8c8d8'); disc(cx, cy - 70, 10, '#c8c8d8'); disc(cx - 3, cy - 73, 4, '#ffffff');
      for (let i = 0; i < 6; i++) {
        const hx = (60 + i * 120) * GS, hy = 70 * GS;
        structs.push({ k: 'house', x: hx / GS, y: hy / GS, w: 140 / GS, h: 100 / GS });
        shadow(hx + 80, hy + 104, 90);
        px(hx, hy, 140, 100, '#7a5a3a');
        for (let k = 0; k < 100; k += 10) { px(hx, hy + k, 140, 9, k % 20 ? '#a07a52' : '#94704a'); px(hx, hy + k + 9, 140, 1, '#5a3a22'); }
        px(hx - 12, hy - 40, 164, 44, '#5a1414');
        for (let k = 0; k < 40; k += 8) for (let j = 0; j < 164; j += 14) px(hx - 12 + j + (k / 8 % 2) * 7, hy - 40 + k, 13, 7, k < 8 ? '#b83a2a' : '#8a2a2a');
        px(hx - 12, hy + 2, 164, 4, '#3a0a0a');
        px(hx + 56, hy + 50, 28, 50, '#3a2418'); px(hx + 58, hy + 52, 24, 48, '#5a3a22'); px(hx + 76, hy + 76, 3, 3, '#e8b84a');
        for (const wx of [hx + 16, hx + 100]) { px(wx, hy + 26, 24, 22, '#3a2418'); px(wx + 2, hy + 28, 20, 18, '#ffd36b'); px(wx + 11, hy + 28, 2, 18, '#3a2418'); px(wx + 2, hy + 36, 20, 2, '#3a2418'); px(wx + 2, hy + 28, 8, 6, '#fff2a8'); light(wx + 12, hy + 38, 70, '255,210,120', 0.08); }
        // chaminé com fumaça
        px(hx + 108, hy - 58, 14, 22, '#4a3a34'); px(hx + 108, hy - 58, 14, 3, '#6a5a52'); px(hx + 110, hy - 52, 3, 16, '#5e4e46');
        emitter(hx + 115, hy - 60, 'smoke');
        torch(hx + 48, hy + 108); torch(hx + 92, hy + 108);
      }
      px(0, H - 80, W, 80, '#4a4a56');
      for (let x = 0; x < W; x += 20) for (let y = H - 80; y < H; y += 12) px(x + ((y / 12) % 2) * 10, y, 19, 11, r() < 0.5 ? '#6a6a78' : '#5a5a66');
      for (let x = 0; x < W; x += 32) { px(x, H - 96, 20, 16, '#6a6a78'); px(x, H - 96, 20, 3, '#8a8a98'); }
      for (let y = 0; y < H - 80; y += 2) {
        const xc = W - 70 + Math.sin(y / 70) * 20;
        px(xc - 52, y, 104, 2, '#4a7a3a'); px(xc - 46, y, 92, 2, '#8a7a5a'); px(xc - 40, y, 80, 2, '#1a4a8a'); px(xc - 30, y, 54, 2, '#2a6ab8');
        if (r() < 0.12) px(xc - 20 + r() * 30, y, 8, 1, '#9ad8ff');
        if (y % 90 === 0) water(xc - 8, y, 30, 'river');
      }
      const sx = 470 * GS, sy = 250 * GS;
      structs.push({ k: 'stall', x: sx / GS, y: sy / GS });
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
        water(x, y, rad, 'water');
      }
      for (let x = 0; x < W; x += 2) {
        const yc = H * 0.55 + Math.sin(x / 210) * 140;
        px(x, yc - 16, 2, 32, '#8a6a3a'); px(x, yc - 16, 2, 2, '#6a4a24'); if (r() < 0.1) px(x, yc - 8 + r() * 16, 2, 2, '#c8a86a');
      }
      for (let i = 0; i < 260; i++) flower(r() * W, r() * H, ['#ff7ad9', '#c06bff', '#ffd36b', '#9ac8ff'][i % 4]);
      for (let i = 0; i < 50; i++) { const x = r() * W, y = r() * H; px(x - 1, y - 4, 3, 6, '#e8e0d0'); disc(x, y - 6, 5, '#3a7ad8'); disc(x - 1, y - 7, 3, '#7ab8ff'); px(x - 2, y - 8, 2, 2, '#ffffff'); }
      for (let i = 0; i < 70; i++) tree(r() * W, r() * H, 1, false, r() < 0.25);
      for (let i = 0; i < 18; i++) crystal(r() * W, r() * H, ['#7a3ac0', '#f0d8ff'], '192,107,255');
      if (m.training && m.training.area) {
        const a = m.training.area, ax = a.x * GS, ay = a.y * GS, aw = a.w * GS, ah = a.h * GS;
        structs.push({ k: 'fence', x: a.x, y: a.y, w: a.w, h: a.h });
        // Clareira cercada com faixas de terra: uma área de treino legível sem mexer nas rotas da cidade.
        px(ax + 4, ay + 4, aw - 8, ah - 8, 'rgba(32,76,36,.72)');
        px(ax + 12, ay + 14, aw - 24, ah - 28, '#52633b');
        px(ax + 16, ay + 18, aw - 32, ah - 36, '#657247');
        for (let lane = 0; lane < 5; lane++) {
          const ly = ay + (lane + 0.5) * ah / 5;
          px(ax + 24, ly, aw - 48, 2, '#8a7444'); px(ax + 24, ly + 2, aw - 48, 1, '#b09559');
          for (let k = 0; k < 16; k++) px(ax + 30 + r() * (aw - 60), ly + (r() - 0.5) * 12, 2, 2, k % 2 ? '#9b8851' : '#7e7548');
        }
        // Cerca de madeira segmentada com uma entrada aberta para a trilha oeste.
        const rail = (x, y, w, h) => { px(x, y, w, h, '#493019'); px(x, y, w, Math.max(2, h / 3), '#b08045'); px(x, y + h - 2, w, 2, '#302116'); };
        rail(ax + 8, ay + 8, aw - 16, 6); rail(ax + 8, ay + ah - 14, aw - 16, 6);
        rail(ax + 8, ay + 8, 6, ah - 16); rail(ax + aw - 14, ay + 8, 6, ah - 16);
        for (let k = 0; k < 12; k++) {
          const x = ax + 12 + k * (aw - 24) / 11;
          px(x, ay + 2, 5, 18, '#4a2e18'); px(x, ay + 2, 2, 18, '#a0703d');
          px(x, ay + ah - 20, 5, 18, '#4a2e18'); px(x, ay + ah - 20, 2, 18, '#a0703d');
        }
        for (let k = 0; k < 9; k++) {
          const y = ay + 12 + k * (ah - 24) / 8;
          px(ax + 2, y, 18, 5, '#4a2e18'); px(ax + 2, y, 18, 2, '#a0703d');
          px(ax + aw - 20, y, 18, 5, '#4a2e18'); px(ax + aw - 20, y, 18, 2, '#a0703d');
        }
        // Marco de entrada e placa em pixel art.
        px(ax + 2, ay + ah / 2 - 16, 18, 32, '#4a2e18'); px(ax + 2, ay + ah / 2 - 16, 4, 32, '#b08045');
        px(ax + 16, ay + 18, 116, 22, '#37251b'); px(ax + 18, ay + 20, 112, 18, '#8a622f');
        px(ax + 23, ay + 24, 6, 10, '#e8b84a'); px(ax + 33, ay + 24, 4, 10, '#f3e4b1'); px(ax + 40, ay + 24, 4, 10, '#f3e4b1');
        px(ax + aw - 34, ay + ah - 30, 10, 16, '#5a3a20'); px(ax + aw - 36, ay + ah - 32, 14, 4, '#b08045');
      }
    } else if (m.theme === 'snow') {
      for (let i = 0; i < W * H / 900; i++) px(r() * W, r() * H, 2 + r() * 6, 1, r() < 0.5 ? '#dfe8f4' : '#ffffff');
      for (let i = 0; i < 8; i++) {
        const x = r() * W, y = r() * H, rad = 40 + r() * 50;
        disc(x, y, rad + 4, '#9ab8d8'); disc(x, y, rad, '#b8d8f0'); disc(x - rad * 0.25, y - rad * 0.25, rad * 0.5, '#e0f2ff');
        for (let k = 0; k < 6; k++) px(x - rad * 0.6 + r() * rad, y - rad * 0.4 + r() * rad * 0.8, 10, 1, '#ffffff');
        water(x, y, rad, 'ice');
      }
      for (let x = 0; x < W; x += 2) { const yc = H * 0.5 + Math.sin(x / 160) * 120; px(x, yc - 14, 2, 28, '#c8d4e4'); if (r() < 0.2) px(x, yc - 6 + r() * 12, 2, 2, '#a8b8cc'); }
      const pine = (x, y, s) => (PKIND = { k: 'pine', s }) && prop(x, y, Math.ceil(36 * s), Math.ceil(58 * s), Math.ceil(18 * s), Math.ceil(54 * s), (ax, ay) => {
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
        water(x, y, rad, 'lava');
      }
      for (let i = 0; i < 60; i++) { const x = r() * W, y = r() * H; px(x, y, 12, 3, '#d8cfb4'); px(x, y, 12, 1, '#fffbe8'); disc(x - 1, y + 1, 2, '#d8cfb4'); disc(x + 12, y + 1, 2, '#d8cfb4'); }
      if (!lavaMap) {
        for (let i = 0; i < 8; i++) { const x = r() * W, y = r() * H; disc(x, y, 7, '#d8cfb4'); px(x - 3, y - 2, 2, 3, '#1b1b2a'); px(x + 1, y - 2, 2, 3, '#1b1b2a'); px(x - 2, y + 4, 5, 3, '#d8cfb4'); }
        px(1720, 640, 360, 320, '#1a1218');
        structs.push({ k: 'altar', x: 1720 / GS, y: 640 / GS, w: 360 / GS, h: 320 / GS });
        for (let x = 1720; x < 2080; x += 20) for (let y = 640; y < 960; y += 20) { px(x + 1, y + 1, 18, 18, r() < 0.3 ? '#3a1a22' : '#2a161c'); px(x + 1, y + 1, 18, 1, '#4a2a32'); }
        px(1740, 760, 320, 80, '#5a0a1a'); px(1740, 760, 320, 4, '#e8b84a'); px(1740, 836, 320, 4, '#e8b84a');
        light(1900, 800, 260, '200,60,220', 0.08);
      }
      for (let x = 0; x < W; x += 8) { const h = 20 + (r() * 28 | 0); px(x, 0, 8, h, '#140e14'); px(x + 2, h, 4, 4, '#140e14'); }
      // pilares de pedra (ou espinhos de obsidiana em Vulcanus)
      for (let i = 0; i < (lavaMap ? 40 : 50); i++) {
        const x = r() * W, y = r() * H, hgt = Math.round(28 + r() * 22);
        if (lavaMap) {
          PKIND = { k: 'spike', h: hgt }; prop(x, y, 28, hgt + 8, 14, hgt + 4, (ax, ay) => {
            g.fillStyle = '#120a10'; g.beginPath(); g.moveTo(ax - 10, ay); g.lineTo(ax - 2, ay - hgt); g.lineTo(ax + 10, ay); g.fill();
            g.fillStyle = '#2a1a2a'; g.beginPath(); g.moveTo(ax - 6, ay); g.lineTo(ax - 2, ay - hgt + 6); g.lineTo(ax + 2, ay); g.fill();
            px(ax - 3, ay - hgt + 10, 2, hgt - 14, '#5a3a5a');
          });
        } else {
          PKIND = { k: 'pillar', h: hgt }; prop(x, y, 30, hgt + 12, 15, hgt + 8, (ax, ay) => {
            px(ax - 12, ay - hgt, 24, hgt, '#1c181e'); px(ax - 10, ay - hgt, 20, hgt, '#3a3240'); px(ax - 10, ay - hgt, 5, hgt, '#4e4454');
            px(ax - 13, ay - hgt - 6, 26, 6, '#4e4454'); px(ax - 13, ay - hgt - 6, 26, 2, '#6a5e70');
          });
        }
      }
      for (let i = 0; i < (lavaMap ? 10 : 24); i++) torch(r() * W, r() * H);
    }
    else if (m.theme === 'water') {
      // Atlans: areia do fundo do mar, corais, colunas afundadas, algas e brilho da água
      for (let i = 0; i < W * H / 1500; i++) px(r() * W, r() * H, 3 + r() * 10, 1, r() < 0.5 ? '#2e7a86' : '#164450');
      for (let i = 0; i < 14; i++) { const x = r() * W, y = r() * H, rad = 30 + r() * 50; disc(x, y, rad, '#2a7a7a'); disc(x - rad * 0.2, y - rad * 0.2, rad * 0.6, '#3a9a8a'); light(x, y, rad * 2, '80,220,255', 0.08); }
      const coral = (x, y, col) => (PKIND = { k: 'coral', col }) && prop(x, y, 30, 34, 15, 30, (ax, ay) => {
        for (let k = 0; k < 5; k++) { const dx = (k - 2) * 4, h = 10 + r() * 16; px(ax + dx - 1, ay - h, 3, h, col); disc(ax + dx, ay - h, 3, col); px(ax + dx, ay - h - 2, 1, 2, '#ffffff'); }
      }, 0.8);
      for (let i = 0; i < 70; i++) coral(r() * W, r() * H, ['#ff7aa0', '#ffb04a', '#c06bff', '#5affd0'][i % 4]);
      for (let i = 0; i < 22; i++) {
        const x = r() * W, y = r() * H, hgt = 40 + r() * 30, broken = r() < 0.5;
        PKIND = { k: 'column', h: hgt, broken }; prop(x, y, 26, hgt + 10, 13, hgt + 6, (ax, ay) => {
          const hh = broken ? hgt * 0.55 : hgt;
          px(ax - 9, ay - hh, 18, hh, '#6a8a8a'); px(ax - 9, ay - hh, 5, hh, '#9ababa'); for (let k = 4; k < hh; k += 6) px(ax - 9, ay - k, 18, 1, '#4a6a6a');
          px(ax - 11, ay - hh - 4, 22, 5, '#8aaaaa'); px(ax - 6, ay - hh + 6, 4, 8, '#3a8a5a');
        });
      }
      for (let i = 0; i < 26; i++) crystal(r() * W, r() * H, ['#2ab8d8', '#bff8ff'], '90,230,255');
      for (let i = 0; i < 120; i++) { const x = r() * W, y = r() * H; for (let k = 0; k < 10; k++) px(x + Math.sin(k / 2) * 2, y - k * 2, 2, 2, '#2a8a4a'); }
    } else if (m.theme === 'tower') {
      // Lost Tower: piso de pedra roxa, runas, cristais e tochas mágicas
      for (let y = 0; y < H; y += 32) for (let x = (y / 32 % 2) * 16; x < W; x += 32) {
        px(x, y, 31, 31, ['#2e2640', '#362e4a', '#28203a'][(r() * 3) | 0]); px(x, y, 31, 2, '#423a58'); px(x, y + 29, 31, 2, '#1a1426');
      }
      for (let i = 0; i < 30; i++) { const x = r() * W, y = r() * H, rad = 18 + r() * 14; for (let k = 0; k < 24; k++) { const a = k / 24 * Math.PI * 2; px(x + Math.cos(a) * rad, y + Math.sin(a) * rad * 0.5, 2, 2, '#b05aff'); } light(x, y, rad * 3, '180,90,255', 0.15); }
      for (let i = 0; i < 40; i++) {
        const x = r() * W, y = r() * H, hgt = Math.round(36 + r() * 24);
        PKIND = { k: 'pillar', h: hgt, tone: 'tower' }; prop(x, y, 30, hgt + 12, 15, hgt + 8, (ax, ay) => {
          px(ax - 12, ay - hgt, 24, hgt, '#1c1628'); px(ax - 10, ay - hgt, 20, hgt, '#3e3256'); px(ax - 10, ay - hgt, 5, hgt, '#54467a');
          px(ax - 13, ay - hgt - 6, 26, 6, '#54467a'); px(ax - 2, ay - hgt + 8, 4, 4, '#d08aff');
        });
      }
      for (let i = 0; i < 18; i++) crystal(r() * W, r() * H, ['#7a3ac0', '#f0d8ff'], '192,107,255');
      for (let i = 0; i < 20; i++) torch(r() * W, r() * H);
    } else if (m.theme === 'desert') {
      // Tarkan: dunas, rachaduras, cactos, ossos e pedras
      for (let k = 0; k < 40; k++) { const y0 = r() * H, amp = 10 + r() * 20; for (let x = 0; x < W; x += 2) { const y = y0 + Math.sin(x / (60 + k * 3)) * amp; px(x, y, 2, 2, '#c08848'); px(x, y - 2, 2, 1, '#f0d098'); } }
      for (let i = 0; i < 40; i++) { let x = r() * W, y = r() * H; for (let k = 0; k < 12; k++) { px(x, y, 2, 1, '#a07040'); x += 3; y += (r() - 0.5) * 6; } }
      const cactus = (x, y, s) => (PKIND = { k: 'cactus', s }) && prop(x, y, Math.ceil(30 * s), Math.ceil(46 * s), Math.ceil(15 * s), Math.ceil(42 * s), (ax, ay) => {
        px(ax - 3 * s, ay - 38 * s, 6 * s, 38 * s, '#3a7a3a'); px(ax - 3 * s, ay - 38 * s, 2 * s, 38 * s, '#5aa04a');
        px(ax - 10 * s, ay - 26 * s, 7 * s, 4 * s, '#3a7a3a'); px(ax - 10 * s, ay - 34 * s, 4 * s, 10 * s, '#3a7a3a');
        px(ax + 3 * s, ay - 20 * s, 7 * s, 4 * s, '#3a7a3a'); px(ax + 6 * s, ay - 28 * s, 4 * s, 10 * s, '#3a7a3a');
        for (let k = 0; k < 8; k++) px(ax - 3 * s + r() * 6 * s, ay - 36 * s + r() * 30 * s, 1, 1, '#e8f0c0');
      }, 0.3);
      for (let i = 0; i < 46; i++) cactus(r() * W, r() * H, r() < 0.3 ? 1.3 : 1);
      for (let i = 0; i < 30; i++) rock(r() * W, r() * H, 1 + r());
      for (let i = 0; i < 40; i++) { const x = r() * W, y = r() * H; px(x, y, 14, 3, '#efe4c8'); disc(x - 1, y + 1, 2, '#efe4c8'); disc(x + 14, y + 1, 2, '#efe4c8'); }
      for (let i = 0; i < 6; i++) { const x = r() * W, y = r() * H; disc(x, y, 14, '#efe4c8'); px(x - 6, y - 3, 4, 5, '#3a2a1a'); px(x + 2, y - 3, 4, 5, '#3a2a1a'); }
    } else if (m.theme === 'sky') {
      // Icarus: ilhas no céu (nuvens), caminhos de mármore, colunas e penas
      for (let i = 0; i < 70; i++) { const x = r() * W, y = r() * H, rad = 30 + r() * 70; disc(x, y, rad, '#d8ecff'); disc(x - rad * 0.3, y - rad * 0.2, rad * 0.6, '#ffffff'); }
      for (let x = 0; x < W; x += 2) { const yc = H * 0.5 + Math.sin(x / 200) * 150; px(x, yc - 18, 2, 36, '#e8e4dc'); if ((x / 2) % 16 === 0) px(x, yc - 18, 2, 36, '#c8c4bc'); }
      for (let i = 0; i < 30; i++) {
        const x = r() * W, y = r() * H, hgt = Math.round(44 + r() * 26);
        PKIND = { k: 'marble', h: hgt }; prop(x, y, 26, hgt + 12, 13, hgt + 8, (ax, ay) => {
          px(ax - 8, ay - hgt, 16, hgt, '#d8d4cc'); px(ax - 8, ay - hgt, 4, hgt, '#ffffff'); for (let k = 0; k < 16; k += 4) px(ax - 8 + k, ay - hgt, 1, hgt, '#bcb8b0');
          px(ax - 11, ay - hgt - 5, 22, 5, '#f0ece4'); px(ax - 11, ay - 4, 22, 4, '#c8c4bc');
        });
      }
      for (let i = 0; i < 20; i++) crystal(r() * W, r() * H, ['#e8b84a', '#fff2a8'], '255,220,140');
    } else if (m.theme === 'darkforest') {
      // Aida: floresta sombria, cogumelos que brilham, névoa e raízes
      for (let i = 0; i < W * H / 1200; i++) px(r() * W, r() * H, 4 + r() * 10, 2, r() < 0.5 ? '#264a2a' : '#0e1c10');
      for (let i = 0; i < 60; i++) { const x = r() * W, y = r() * H; px(x - 1, y - 5, 3, 6, '#d8d0c0'); disc(x, y - 7, 5, '#3affb0'); disc(x - 1, y - 8, 3, '#bfffe8'); light(x, y - 6, 40, '80,255,180', 0.2); }
      for (let i = 0; i < 90; i++) tree(r() * W, r() * H, r() < 0.3 ? 1.4 : 1.1, true);
      for (let i = 0; i < 16; i++) crystal(r() * W, r() * H, ['#2a8a5a', '#bfffd8'], '90,255,170');
    } else if (m.theme === 'void') {
      // Kalima: terra do vazio, rachaduras roxas, obeliscos e cristais escuros
      for (let i = 0; i < W * H / 1400; i++) px(r() * W, r() * H, 3 + r() * 12, 2, r() < 0.5 ? '#2a1a3a' : '#0a0610');
      for (let i = 0; i < 46; i++) {
        let x = r() * W, y = r() * H;
        for (let k = 0; k < 30; k++) { px(x - 2, y - 2, 5, 5, '#3a0a5a'); px(x - 1, y - 1, 3, 3, '#a02aff'); px(x, y, 1, 1, '#ff8ae8'); if (k % 10 === 0) light(x, y, 50, '170,60,255', 0.2); x += 3 + r() * 3; y += (r() - 0.5) * 8; }
      }
      for (let i = 0; i < 34; i++) {
        const x = r() * W, y = r() * H, hgt = Math.round(40 + r() * 30);
        PKIND = { k: 'obelisk', h: hgt }; prop(x, y, 28, hgt + 10, 14, hgt + 6, (ax, ay) => {
          g.fillStyle = '#0e0818'; g.beginPath(); g.moveTo(ax - 9, ay); g.lineTo(ax - 4, ay - hgt); g.lineTo(ax + 4, ay - hgt); g.lineTo(ax + 9, ay); g.fill();
          px(ax - 2, ay - hgt + 10, 4, hgt - 20, '#5a1a8a'); px(ax - 1, ay - hgt + 14, 2, 6, '#ff8ae8');
        });
      }
      for (let i = 0; i < 24; i++) crystal(r() * W, r() * H, ['#5a1a8a', '#ff8ae8'], '220,90,255');
    }
    props.sort((a, b) => a.y - b.y);
    return { canvas: c, props, lights, waters, emit, rocks, structs };
  }

  // ================= desenho =================
  const cv = $('#world');
  const ctx = cv.getContext('2d');
  let zoom = 2, dpr = 1, camX = 0, camY = 0;
  // ---- gráfico 2D ou 3D (escolha do jogador; o servidor e as regras são os mesmos) ----
  const GFX = (() => {
    let q = null; try { q = new URLSearchParams(location.search).get('gfx'); } catch (_) { /* nada */ }
    if (q === '2d' || q === '3d') { try { localStorage.setItem('mui_gfx', q); } catch (_) { /* nada */ } return q; }
    try { return localStorage.getItem('mui_gfx') || '2d'; } catch (_) { return '2d'; }
  })();
  let is3d = false; // vira true quando o motor 3D carregou e iniciou
  const W3 = () => window.World3D;
  function load3D() {
    const files = ['vendor/three/three.min.js', 'vendor/three/GLTFLoader.js', 'vendor/three/SkeletonUtils.js', 'vendor/three/RoomEnvironment.js',
      'vendor/three/CopyShader.js', 'vendor/three/LuminosityHighPassShader.js', 'vendor/three/EffectComposer.js', 'vendor/three/RenderPass.js',
      'vendor/three/ShaderPass.js', 'vendor/three/MaskPass.js', 'vendor/three/UnrealBloomPass.js', 'world3d.js?v=3', 'world3d-actors.js?v=3', 'world3d-fx.js?v=1'];
    return files.reduce((p, f) => p.then(() => new Promise((res, rej) => { const sc = document.createElement('script'); sc.src = '/js/' + f; sc.onload = res; sc.onerror = rej; document.head.appendChild(sc); })), Promise.resolve())
      .then(() => {
        const w = W3();
        if (!w || !w.init || !w.init(cv, quality)) throw new Error('webgl');
        is3d = w.on = true;
        document.body.classList.add('gfx3d');
        w.setColors = {}; for (const [id, st] of Object.entries((S.data && S.data.sets) || {})) if (st.color) w.setColors[id] = st.color;
        w.wingColor = (base) => { const m = /^(festive_\d+)_wings$/.exec(base || ''); return m && w.setColors[m[1]] ? w.setColors[m[1]] : null; };
        resize();
        return true;
      }).catch((e) => { is3d = false; console.warn('[3d] usando 2D:', e && e.message); feed('Seu aparelho não abriu o gráfico 3D. Jogando em 2D.', 'warn'); return false; });
  }
  function setGfx(mode) { try { localStorage.setItem('mui_gfx', mode); } catch (_) { /* nada */ } location.reload(); }
  function resize() {
    dpr = Math.min(3, window.devicePixelRatio || 1);
    cv.width = Math.round(window.innerWidth * dpr);
    cv.height = Math.round(window.innerHeight * dpr);
    zoom = Math.max(2, Math.floor(Math.min(window.innerWidth, window.innerHeight) / 200)) * dpr;
    // 3D: câmera um pouco mais perto (estilo MU); as sobreposições usam o mesmo zoom
    if (is3d) { zoom *= 1.5; W3().resize(window.innerWidth, window.innerHeight); }
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
    // direção do movimento (suavizada): decide se o herói anda de lado, de frente ou de costas
    if (dt > 0) { e.vx = (e.vx || 0) * 0.8 + ((e.rx - ox) / dt) * 0.2; e.vy = (e.vy || 0) * 0.8 + ((e.ry - oy) / dt) * 0.2; }
    if (e.phase === undefined) e.phase = Math.random() * 1000;
  }

  // ---------- qualidade gráfica ----------
  const QUALITY = {
    baixa: { parts: 18, lights: false, sway: false, atmosphere: false },
    media: { parts: 52, lights: true, sway: true, atmosphere: false },
    alta: { parts: 112, lights: true, sway: true, atmosphere: true },
    ultra: { parts: 180, lights: true, sway: true, atmosphere: true },
  };
  const qStore = (() => { try { return window.localStorage; } catch (_) { return null; } })();
  let quality = (() => { try { return qStore && qStore.getItem('mui_quality'); } catch (_) { return null; } })() || (window.innerWidth < 700 ? 'media' : 'alta');
  if (!QUALITY[quality]) quality = 'media';
  function setQuality(q) { if (!QUALITY[q]) return; quality = q; try { if (qStore) qStore.setItem('mui_quality', q); } catch (_) { /* sem armazenamento */ } S.parts = []; if (is3d) W3().setQuality(q); }
  const DARKNESS = { dungeon: 0.62, lava: 0.4, water: 0.3, tower: 0.55, darkforest: 0.5, void: 0.58 };

  // ---------- partículas do ambiente (com limite fixo, reaproveitadas) ----------
  S.parts = [];
  function spawnParticle(theme, vw, vh) {
    const x = camX + Math.random() * vw, y = camY + Math.random() * vh;
    const p = { x, y, t: 0 };
    switch (theme) {
      case 'town': { const roll = Math.random(); Object.assign(p, roll < 0.08
        ? { kind: 'bird', vx: 18 + Math.random() * 16, vy: (Math.random() - 0.5) * 3, life: 5 + Math.random() * 4, col: '#283642', s: 2 }
        : roll < 0.5 ? { kind: 'leaf', vx: 6 + Math.random() * 8, vy: 4 + Math.random() * 6, life: 6 + Math.random() * 4, col: ['#6ab84e', '#c8a83a', '#9ac85a'][(Math.random() * 3) | 0], s: 2 }
        : { kind: 'mote', vx: 3 + Math.random() * 4, vy: (Math.random() - 0.5) * 2, life: 5 + Math.random() * 4, col: ['#ffe8b0', '#fff4d8', '#e8c890'][(Math.random() * 3) | 0], s: 1 }); break; }
      case 'grass': Object.assign(p, Math.random() < 0.12
        ? { kind: 'butterfly', vx: (Math.random() - 0.5) * 10, vy: (Math.random() - 0.5) * 7, life: 5 + Math.random() * 3, col: ['#ffe08a', '#ffffff', '#ff9ad0'][(Math.random() * 3) | 0], s: 3 }
        : { kind: 'leaf', vx: 8 + Math.random() * 8, vy: 3 + Math.random() * 5, life: 7, col: ['#7ab456', '#c8d86a', '#5a9a3a'][(Math.random() * 3) | 0], s: 2 }); break;
      case 'forest': Object.assign(p, Math.random() < 0.45
        ? { kind: 'spark', vx: (Math.random() - 0.5) * 6, vy: (Math.random() - 0.5) * 5, life: 4 + Math.random() * 3, col: ['#e8ff8a', '#bfff6a'][(Math.random() * 2) | 0], s: 2 }
        : { kind: 'leaf', vx: 5 + Math.random() * 6, vy: 5 + Math.random() * 5, life: 7, col: ['#4a8a36', '#8a6a2a', '#6aa04e'][(Math.random() * 3) | 0], s: 2 }); break;
      case 'cave': Object.assign(p, Math.random() < 0.3
        ? { kind: 'drip', y: camY + Math.random() * vh * 0.6, vx: 0, vy: 60 + Math.random() * 30, life: 1.5, col: '#9ad8ff', s: 1 }
        : { kind: 'dust', vx: (Math.random() - 0.5) * 3, vy: (Math.random() - 0.5) * 3, life: 6, col: '#a898b0', s: 1 }); break;
      case 'castle': case 'devilsq': { const dev = theme === 'devilsq'; Object.assign(p, Math.random() < 0.55
        ? { kind: 'ember', y: camY + vh + 4, vx: (Math.random() - 0.5) * 10, vy: -16 - Math.random() * 22, life: 4 + Math.random() * 3, col: dev ? ['#d08aff', '#ff8ae8', '#8a3aff'][(Math.random() * 3) | 0] : ['#ff8a2a', '#ffd36b', '#ff4d1f'][(Math.random() * 3) | 0], s: 2 }
        : { kind: 'dust', x: camX - 6, vx: 22 + Math.random() * 20, vy: (Math.random() - 0.5) * 5, life: 8, col: dev ? '#8a6a8a' : '#a89480', s: 2 }); break; }
      case 'noria': {
        const roll = Math.random();
        Object.assign(p, roll < 0.13
          ? { kind: 'butterfly', vx: (Math.random() - 0.5) * 10, vy: (Math.random() - 0.5) * 7, life: 5 + Math.random() * 3, col: ['#ff9ad0', '#aeeaff', '#ffe08a'][(Math.random() * 3) | 0], s: 3 }
          : roll < 0.55 ? { kind: 'leaf', vx: 4 + Math.random() * 6, vy: 5 + Math.random() * 5, life: 7, col: ['#ff9ad0', '#ffc0e4'][(Math.random() * 2) | 0], s: 2 }
          : { kind: 'spark', vx: (Math.random() - 0.5) * 4, vy: -2 - Math.random() * 4, life: 3 + Math.random() * 3, col: ['#9ad8ff', '#d8a0ff', '#fff2a8'][(Math.random() * 3) | 0], s: 2 });
        break;
      }
      case 'snow': Object.assign(p, Math.random() < 0.08
        ? { kind: 'gust', x: camX - 30, vx: 90 + Math.random() * 60, vy: 6, life: 6, col: '#ffffff', s: 1 }
        : Math.random() < 0.1 ? { kind: 'spark', vx: (Math.random() - 0.5) * 3, vy: 2 + Math.random() * 3, life: 3 + Math.random() * 2, col: ['#bff4ff', '#ffffff'][(Math.random() * 2) | 0], s: 2 }
        : { kind: 'snow', y: camY - 4, vx: 10 + Math.random() * 10, vy: 22 + Math.random() * 22, life: 12, col: '#ffffff', s: Math.random() < 0.3 ? 3 : 2 }); break;
      case 'lava': Object.assign(p, Math.random() < 0.7
        ? { kind: 'ember', y: camY + vh + 4, vx: (Math.random() - 0.5) * 8, vy: -20 - Math.random() * 25, life: 4 + Math.random() * 3, col: ['#ff8a2a', '#ffd36b', '#ff4d1f'][(Math.random() * 3) | 0], s: 2 }
        : { kind: 'ash', y: camY - 4, vx: 3, vy: 8 + Math.random() * 8, life: 10, col: '#6a6060', s: 2 }); break;
      case 'dungeon': Object.assign(p, Math.random() < 0.5
        ? { kind: 'ember', vx: (Math.random() - 0.5) * 4, vy: -6 - Math.random() * 8, life: 4, col: '#ff9a3a', s: 2 }
        : { kind: 'dust', vx: (Math.random() - 0.5) * 3, vy: (Math.random() - 0.5) * 3, life: 6, col: '#8a7a8a', s: 1 }); break;
      case 'water': Object.assign(p, { kind: 'spark', y: camY + vh + 4, vx: (Math.random() - 0.5) * 4, vy: -10 - Math.random() * 14, life: 6, col: ['#bff8ff', '#7ae0ff'][(Math.random() * 2) | 0], s: Math.random() < 0.3 ? 3 : 2 }); break;
      case 'tower': Object.assign(p, { kind: 'spark', vx: (Math.random() - 0.5) * 5, vy: -4 - Math.random() * 6, life: 4, col: ['#d08aff', '#ffffff'][(Math.random() * 2) | 0], s: 2 }); break;
      case 'desert': Object.assign(p, { kind: 'dust', x: camX - 6, vx: 40 + Math.random() * 30, vy: (Math.random() - 0.5) * 6, life: 8, col: '#e8c890', s: 2 }); break;
      case 'sky': Object.assign(p, Math.random() < 0.2
        ? { kind: 'bird', x: camX - 6, vx: 24 + Math.random() * 14, vy: (Math.random() - 0.5) * 3, life: 7, col: '#4a5267', s: 3 }
        : Math.random() < 0.5
        ? { kind: 'dust', x: camX - 6, vx: 18 + Math.random() * 12, vy: (Math.random() - 0.5) * 4, life: 10, col: '#ffffff', s: 3 }
        : { kind: 'leaf', y: camY - 4, vx: 6, vy: 10 + Math.random() * 8, life: 10, col: '#fff2a8', s: 2 }); break;
      case 'darkforest': Object.assign(p, Math.random() < (QUALITY[quality].atmosphere ? 0.6 : 0.3)
        ? { kind: 'rain', y: camY - 10 + Math.random() * vh * 0.3, vx: -30, vy: 240 + Math.random() * 60, life: 0.4 + Math.random() * 0.8, col: '#9ab8c8', s: 1 }
        : { kind: 'spark', vx: (Math.random() - 0.5) * 8, vy: (Math.random() - 0.5) * 6, life: 4 + Math.random() * 3, col: ['#c8ff6a', '#6affb8'][(Math.random() * 2) | 0], s: 2 }); break;
      case 'void': Object.assign(p, { kind: 'ember', y: camY + vh + 4, vx: (Math.random() - 0.5) * 6, vy: -12 - Math.random() * 16, life: 5, col: ['#a02aff', '#ff8ae8', '#5a1a8a'][(Math.random() * 3) | 0], s: 2 }); break;
      default: return null;
    }
    return p;
  }
  function updateParticles(dt, now, vw, vh) {
    const Q = QUALITY[quality];
    const theme = S.map.theme;
    const weakDevice = (navigator.deviceMemory && navigator.deviceMemory <= 3) || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4);
    const want = Math.max(12, Math.round(Q.parts * (weakDevice ? 0.72 : 1)));
    while (S.parts.length < want) { const p = spawnParticle(theme, vw, vh); if (!p) break; p.t = Math.random() * p.life * 0.5; S.parts.push(p); }
    ctx.save();
    for (let i = S.parts.length - 1; i >= 0; i--) {
      const p = S.parts[i];
      p.t += dt;
      const sway = ['leaf', 'snow', 'butterfly'].includes(p.kind) ? Math.sin(now / 600 + i) * 8 : 0;
      p.x += (p.vx + sway) * dt; p.y += p.vy * dt;
      const out = p.x < camX - 20 || p.x > camX + vw + 20 || p.y < camY - 30 || p.y > camY + vh + 30;
      if (p.t > p.life || out) { const np = spawnParticle(theme, vw, vh); if (np) S.parts[i] = np; else S.parts.splice(i, 1); continue; }
      const fade = Math.min(1, p.t / 0.6, (p.life - p.t) / 0.8);
      const tw = p.kind === 'spark' ? 0.5 + 0.5 * Math.sin(now / 120 + i * 3) : 1;
      ctx.globalAlpha = Math.max(0, fade * tw * (p.kind === 'dust' ? 0.5 : 0.9));
      ctx.fillStyle = p.col;
      const [sx, sy] = toScreen(p.x, p.y);
      const sz = p.s * dpr * (zoom >= 4 * dpr ? 1.5 : 1);
      if (p.kind === 'butterfly') {
        const flap = Math.abs(Math.sin(now / 68 + i * 2)) * sz;
        ctx.fillRect(sx - sz - flap, sy - sz, sz, sz); ctx.fillRect(sx + flap, sy - sz, sz, sz);
        ctx.fillStyle = '#fff4d0'; ctx.fillRect(sx - dpr, sy - sz, 2 * dpr, 2 * sz);
        ctx.fillStyle = p.col; ctx.fillRect(sx - sz * 2, sy, sz, sz); ctx.fillRect(sx + sz, sy, sz, sz);
      } else if (p.kind === 'bird') {
        const wing = Math.sin(now / 55 + i * 3) > 0 ? -sz : sz;
        ctx.fillRect(sx - sz, sy, sz * 2, Math.max(1, dpr)); ctx.fillRect(sx - sz * 2, sy + wing, sz, Math.max(1, dpr)); ctx.fillRect(sx + sz, sy + wing, sz, Math.max(1, dpr));
      } else if (p.kind === 'rain' || p.kind === 'drip') {
        const len = (p.kind === 'rain' ? 7 : 3) * zoom / 2;
        ctx.fillRect(sx, sy, Math.max(1, dpr), len); if (p.kind === 'rain') ctx.fillRect(sx - Math.max(1, dpr), sy + len * 0.6, Math.max(1, dpr), len * 0.5);
        // respingo no fim da vida da gota
        if (p.life - p.t < dt * 1.5 && Math.random() < 0.6) puff(p.x, p.y + 2, { vx: (Math.random() - 0.5) * 30, vy: -18, g: 120, life: 0.22, col: '#c8e0f0', s: 1, add: false });
      } else if (p.kind === 'gust') {
        ctx.globalAlpha *= 0.35; ctx.fillRect(sx, sy, 22 * zoom / 2, Math.max(1, dpr));
      } else if (p.kind === 'mote') {
        ctx.globalAlpha *= 0.5 + 0.5 * Math.sin(now / 400 + i); ctx.fillRect(sx, sy, sz, sz);
      } else ctx.fillRect(sx, sy, sz, sz);
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

  const ATMOSPHERE = { town: '230,185,112', noria: '105,204,139', snow: '126,189,255', dungeon: '190,125,92', lava: '255,96,42', water: '70,196,224', tower: '175,120,255', desert: '255,196,117', sky: '190,221,255', darkforest: '112,255,168', void: '194,92,255', castle: '255,145,102', devilsq: '213,92,255' };
  function drawAtmosphere(now) {
    const Q = QUALITY[quality];
    if (!S.map || !Q.atmosphere) return;
    const col = ATMOSPHERE[S.map.theme];
    if (col) {
      ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = quality === 'ultra' ? 0.055 : 0.032;
      ctx.fillStyle = `rgb(${col})`; ctx.fillRect(0, 0, cv.width, cv.height); ctx.restore();
    }
    const v = ctx.createRadialGradient(cv.width * 0.5, cv.height * 0.46, Math.min(cv.width, cv.height) * 0.24, cv.width * 0.5, cv.height * 0.46, Math.max(cv.width, cv.height) * 0.72);
    v.addColorStop(0, 'rgba(7,10,20,0)'); v.addColorStop(1, 'rgba(5,8,18,.24)');
    ctx.fillStyle = v; ctx.fillRect(0, 0, cv.width, cv.height);
    if (S.map.theme === 'water' && quality === 'ultra') {
      ctx.save(); ctx.globalAlpha = 0.12; ctx.fillStyle = '#c8f6ff';
      for (let i = 0; i < 28; i++) {
        const x = ((i * 79 + now * (0.018 + (i % 3) * 0.004)) % (cv.width + 30)) - 15;
        const y = (i * 47 + Math.sin(now / 600 + i) * 8) % cv.height;
        ctx.fillRect(Math.round(x), Math.round(y), (i % 4 + 2) * dpr, dpr);
      }
      ctx.restore();
    }
  }

  function burstHitPixels(target, color, count, startAt) {
    if (!target || S.hitParticles.length > 360) return;
    const x = Number.isFinite(target.rx) ? target.rx : target.x, y = (Number.isFinite(target.ry) ? target.ry : target.y) - 18;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2, speed = 18 + Math.random() * 58;
      S.hitParticles.push({ x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed - 12, t0: startAt, life: 0.24 + Math.random() * 0.3, color, size: Math.random() < .25 ? 2 : 1 });
    }
  }
  function drawHitParticles(now, dt) {
    const Q = QUALITY[quality];
    const keep = [];
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (const p of S.hitParticles) {
      const age = (now - p.t0) / 1000;
      if (age < 0) { keep.push(p); continue; }
      if (age >= p.life) continue;
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 45 * dt;
      ctx.globalAlpha = Math.max(0, 1 - age / p.life);
      ctx.fillStyle = p.color;
      const [x, y] = toScreen(p.x, p.y), pxSize = p.size * dpr;
      ctx.fillRect(Math.round(x), Math.round(y), pxSize, pxSize);
      if (Q.lights && p.size > 1) { ctx.globalAlpha *= .28; ctx.fillRect(Math.round(x - pxSize), Math.round(y - pxSize), pxSize * 3, pxSize * 3); }
      keep.push(p);
    }
    ctx.restore(); S.hitParticles = keep;
  }

  // ================= VFX: partículas reaproveitadas, luzes dinâmicas e efeitos de magia =================
  const VFX_MAX = { baixa: 90, media: 260, alta: 560, ultra: 900 };
  const FXK = { baixa: 0.35, media: 0.65, alta: 1, ultra: 1.4 };
  S.vfx = []; S.dlights = [];
  const vfxPool = [];
  // paletas e cor de luz de cada elemento
  const FXPAL = {
    fire: [['#ff4d1f', '#ff8a2a', '#ffd36b', '#fff2a8'], '255,130,40'], meteor: [['#ff4d1f', '#ff8a2a', '#ffd36b'], '255,110,30'],
    ice: [['#7ad8ff', '#bff4ff', '#ffffff', '#4aa8ff'], '120,210,255'], lightning: [['#e0b7ff', '#ffffff', '#9a8aff', '#7ad0ff'], '190,160,255'],
    energy: [['#8bdcff', '#ffffff', '#5ab8ff'], '120,200,255'], dark: [['#d68aff', '#8a3aff', '#ff8ae8'], '190,90,255'],
    spirit: [['#ff9acb', '#ffd0ea', '#ffffff'], '255,150,210'], arrow: [['#fff0b0', '#ffd36b'], '255,230,160'], arrow3: [['#ffd36b', '#fff0b0'], '255,210,120'],
    slash: [['#fff4cf', '#ffffff', '#ffd36b'], '255,240,200'], whirl: [['#c7e7ff', '#ffffff', '#7ad0ff'], '170,220,255'],
    claw: [['#ff887a', '#ff4a3a'], '255,90,70'], boss: [['#d1a0ff', '#8a3aff', '#ff6ad8'], '200,110,255'],
  };
  const pal = (fx) => FXPAL[fx] || FXPAL.energy;
  function puff(x, y, o) {
    if (S.vfx.length >= VFX_MAX[quality]) return null;
    const p = vfxPool.pop() || {};
    p.x = x; p.y = y; p.vx = o.vx || 0; p.vy = o.vy || 0; p.g = o.g || 0; p.life = o.life || 0.6; p.t = -(o.delay || 0);
    p.col = o.col || '#ffffff'; p.s = o.s || 1; p.add = o.add !== false; p.drag = o.drag || 0; p.kind = o.kind || 'dot'; p.grow = o.grow || 0; p.wob = o.wob || 0; p.ph = Math.random() * 6.28;
    S.vfx.push(p); return p;
  }
  function sparks(x, y, n, cols, spd = 60, o = {}) {
    n = Math.round(n * FXK[quality]);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = spd * (0.35 + Math.random() * 0.8);
      puff(x + (o.spread ? (Math.random() - 0.5) * o.spread : 0), y + (o.spread ? (Math.random() - 0.5) * o.spread * 0.5 : 0), {
        vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.7 - (o.up || 0), g: o.g ?? 70, life: (o.life || 0.5) * (0.6 + Math.random() * 0.7),
        col: cols[(Math.random() * cols.length) | 0], s: Math.random() < (o.big ?? 0.3) ? 2 : 1, drag: o.drag ?? 1.6, delay: o.delay, kind: o.kind, wob: o.wob, add: o.add,
      });
    }
  }
  function dlight(x, y, r, color, dur, a = 1, t0 = performance.now()) {
    if (!QUALITY[quality].lights || S.dlights.length > 48) return;
    S.dlights.push({ x, y, r, color, t0, dur, a });
  }
  function drawVfx(dt) {
    if (!S.vfx.length) return;
    const keep = [], px = zoom / 2;
    ctx.save();
    let mode = '';
    for (const p of S.vfx) {
      p.t += dt;
      if (p.t < 0) { keep.push(p); continue; }
      if (p.t >= p.life) { vfxPool.push(p); continue; }
      if (p.drag) { const d = Math.max(0, 1 - p.drag * dt); p.vx *= d; p.vy *= d; }
      p.vy += p.g * dt; p.x += (p.vx + (p.wob ? Math.sin(p.t * 6 + p.ph) * p.wob : 0)) * dt; p.y += p.vy * dt;
      keep.push(p);
      const sx = Math.round((p.x - camX) * zoom), sy = Math.round((p.y - camY) * zoom);
      if (sx < -30 || sy < -30 || sx > cv.width + 30 || sy > cv.height + 30) continue;
      const m = p.add ? 'lighter' : 'source-over'; if (m !== mode) { ctx.globalCompositeOperation = m; mode = m; }
      const k = p.t / p.life;
      const sz = Math.max(1, Math.round((p.s + p.grow * p.t) * px));
      ctx.fillStyle = p.col;
      if (p.kind === 'smoke') { ctx.globalAlpha = 0.28 * (1 - k) * Math.min(1, p.t / 0.35); ctx.fillRect(sx - sz / 2, sy - sz / 2, sz, sz); continue; }
      if (p.kind === 'rain') {
        ctx.globalAlpha = 0.5 * Math.min(1, (1 - k) * 4);
        const len = 6 * px;
        ctx.fillRect(sx, sy, Math.max(1, px * 0.5), len); ctx.fillRect(sx - Math.round(px * 0.5), sy + len * 0.5, Math.max(1, px * 0.5), len * 0.5);
        continue;
      }
      ctx.globalAlpha = p.kind === 'soul' ? (1 - k) * (0.6 + 0.4 * Math.sin(p.t * 14 + p.ph)) : 1 - k * k;
      ctx.fillRect(sx - (sz >> 1), sy - (sz >> 1), sz, sz);
      if (p.add && sz > 1 && quality !== 'baixa') { ctx.globalAlpha *= 0.22; ctx.fillRect(sx - sz * 1.5, sy - sz * 1.5, sz * 3, sz * 3); }
    }
    ctx.restore(); S.vfx = keep;
  }
  // ---------- cenário vivo: água, chamas, fumaça, chafariz, auras de boss, asas ----------
  function inView(x, y, pad) { return x > camX - pad && x < camX + cv.width / zoom + pad && y > camY - pad && y < camY + cv.height / zoom + pad; }
  function drawAmbient(now, dt, me) {
    const Q = QUALITY[quality], px = zoom / 2, k = FXK[quality];
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    // água: brilhos que correm e um reflexo de luz que pulsa
    for (const w of S.waters || []) {
      if (!inView(w.x, w.y, w.r + 10)) continue;
      const [sx, sy] = toScreen(w.x, w.y), R = w.r * zoom;
      if (w.kind === 'lava') {
        if (Q.lights) glowAt(sx, sy, R * 1.6, '255,110,30', 0.18 + 0.08 * Math.sin(now / 300 + w.ph));
        if (Math.random() < dt * 3 * k) {
          const a = Math.random() * 6.28, d = Math.random() * w.r * 0.7;
          sparks(w.x + Math.cos(a) * d, w.y + Math.sin(a) * d * 0.5, 4, ['#ffd36b', '#ff8a2a', '#ff4d1f'], 40, { up: 30, life: 0.6, g: 120 });
        }
        continue;
      }
      const n = w.kind === 'river' ? 3 : Math.max(3, Math.round(w.r / 6));
      const col = w.kind === 'ice' ? '255,255,255' : '200,240,255';
      for (let i = 0; i < n; i++) {
        const ph = now / (w.kind === 'river' ? 700 : 1600) + i * 1.7 + w.ph;
        const u = ((ph * 0.37) % 1 + 1) % 1, v = Math.sin(i * 2.3 + w.ph) * 0.6;
        const lx = w.kind === 'river' ? sx + v * R * 0.5 : sx + (u - 0.5) * R * 1.4 * Math.sqrt(1 - v * v), ly = w.kind === 'river' ? sy + (u - 0.5) * R * 2.2 : sy + v * R * 0.45;
        const a = Math.sin(u * Math.PI) * (w.kind === 'ice' ? 0.5 + 0.5 * Math.sin(now / 200 + i * 3) : 0.7);
        ctx.fillStyle = `rgba(${col},${a * 0.55})`;
        const len = Math.round((w.kind === 'ice' ? 1 : 3 + (i % 3)) * px);
        ctx.fillRect(Math.round(lx), Math.round(ly), len * 2, Math.max(1, Math.round(px * 0.5)));
        if (w.kind === 'ice') ctx.fillRect(Math.round(lx + len - px * 0.25), Math.round(ly - len * 0.6), Math.max(1, Math.round(px * 0.5)), Math.round(len * 1.6));
      }
      if (Q.lights && w.kind !== 'ice') {
        // reflexo do céu: uma faixa clara que desliza devagar pela superfície
        const sw = ((now / 4000 + w.ph) % 1) * 2 - 0.5;
        ctx.save(); ctx.beginPath(); ctx.ellipse(sx, sy, R * 0.92, R * (w.kind === 'river' ? 1 : 0.92), 0, 0, Math.PI * 2); ctx.clip();
        const gr = ctx.createLinearGradient(sx - R + sw * R * 2 - R * 0.4, sy - R, sx - R + sw * R * 2 + R * 0.4, sy + R);
        gr.addColorStop(0, 'rgba(200,240,255,0)'); gr.addColorStop(0.5, 'rgba(200,240,255,.10)'); gr.addColorStop(1, 'rgba(200,240,255,0)');
        ctx.fillStyle = gr; ctx.fillRect(sx - R, sy - R, R * 2, R * 2); ctx.restore();
      }
    }
    // chamas de tochas e braseiros: labareda pixelada que tremula + faíscas subindo
    for (const e of S.emit || []) {
      if (!inView(e.x, e.y, 30)) continue;
      const [sx, sy] = toScreen(e.x, e.y);
      if (e.kind === 'flame' || e.kind === 'flameB' || e.kind === 'flameP') {
        const big = e.kind !== 'flame' ? 1.5 : 1, purple = e.kind === 'flameP';
        const f1 = Math.sin(now / 70 + e.ph) * 0.5 + Math.sin(now / 37 + e.ph * 2) * 0.5;
        const h = (5 + f1 * 1.5) * px * big, w = 3 * px * big;
        ctx.fillStyle = purple ? 'rgba(170,90,255,.55)' : 'rgba(255,110,30,.55)'; ctx.fillRect(Math.round(sx - w), Math.round(sy - h * 0.6), Math.round(w * 2), Math.round(h));
        ctx.fillStyle = purple ? 'rgba(230,190,255,.7)' : 'rgba(255,200,80,.7)'; ctx.fillRect(Math.round(sx - w * 0.5 + f1 * px * 0.5), Math.round(sy - h), Math.round(w), Math.round(h * 0.9));
        ctx.fillStyle = 'rgba(255,250,210,.8)'; ctx.fillRect(Math.round(sx - px * 0.5), Math.round(sy - h * 0.7), Math.max(1, Math.round(px)), Math.round(h * 0.5));
        if (Q.lights) glowAt(sx, sy - h * 0.3, 16 * zoom * big, purple ? '170,90,255' : '255,140,50', 0.16 + 0.06 * f1);
        e.acc += dt * 2.2 * k * big;
        if (e.acc > 1) { e.acc = 0; puff(e.x + (Math.random() - 0.5) * 2, e.y - 3, { vx: (Math.random() - 0.5) * 8, vy: -14 - Math.random() * 14, life: 0.9, col: purple ? '#d0a0ff' : ['#ffd36b', '#ff8a2a'][(Math.random() * 2) | 0], wob: 6 }); }
      } else if (e.kind === 'smoke') {
        e.acc += dt * 1.6 * k;
        if (e.acc > 1) { e.acc = 0; puff(e.x, e.y, { vx: 5 + Math.random() * 4, vy: -9 - Math.random() * 5, life: 3.2, col: '#d8d4d0', kind: 'smoke', s: 2, grow: 1.6, add: false, wob: 3 }); }
      } else if (e.kind === 'spray') {
        e.acc += dt * 14 * k;
        while (e.acc > 1) { e.acc -= 1; puff(e.x + (Math.random() - 0.5) * 2, e.y, { vx: (Math.random() - 0.5) * 34, vy: -26 - Math.random() * 16, g: 110, life: 0.75, col: Math.random() < 0.5 ? '#bff0ff' : '#ffffff', s: 1 }); }
      }
    }
    // bosses: olhos em brasa, partículas orbitando e brasas subindo
    S.monsters.forEach((mo) => {
      if (!mo.boss || mo.dead || !inView(mo.rx, mo.ry, 60)) return;
      const meta = Sprites.meta('monsters', monSprite(mo)); if (!meta) return;
      const s2 = spr() * (mo.scale || 1) * (meta.scale || 1), [x, y] = toScreen(mo.rx, mo.ry);
      const rage = S.boss && S.boss.enraged, col = rage ? '255,60,40' : '255,70,70';
      const dir = mo.flip ? 1 : -1, ex = x + dir * 4.5 * s2, ey = y - 55 * s2;
      if (monSprite(mo) === 'skeleton_king' && !(mo.attackUntil > now)) {
        const pulse = 0.55 + 0.35 * Math.sin(now / 180);
        glowAt(ex - 1.5 * s2, ey, 5 * s2, col, pulse); glowAt(ex + 1.5 * s2, ey, 5 * s2, col, pulse);
        glowAt(ex, ey, 12 * s2, col, 0.18 * pulse);
      }
      const n = Math.round(6 * k);
      for (let i = 0; i < n; i++) {
        const a = now / 900 + i / n * Math.PI * 2, rr = 26 * s2;
        const ox = Math.cos(a) * rr, oy = Math.sin(a) * rr * 0.35, front = Math.sin(a) > 0;
        ctx.fillStyle = front ? `rgba(${rage ? '255,150,90' : '220,170,255'},.9)` : `rgba(${rage ? '255,90,40' : '160,90,255'},.5)`;
        const sz = Math.max(1, Math.round(px * (front ? 1.5 : 1)));
        ctx.fillRect(Math.round(x + ox), Math.round(y - 30 * s2 + oy), sz, sz);
      }
      if (Math.random() < dt * 8 * k) puff(mo.rx + (Math.random() - 0.5) * 30, mo.ry - Math.random() * 10, { vy: -18 - Math.random() * 20, life: 1.3, col: rage ? '#ff6a3a' : '#c890ff', wob: 6, s: Math.random() < 0.3 ? 2 : 1 });
    });
    // asas soltam partículas mágicas; armas excelentes faíscam
    const WCOL = { uncommon: '#9affb0', rare: '#9ad0ff', epic: '#d8a0ff', legendary: '#ffe08a', ancestral: '#ff9a9a' };
    S.players.forEach((pl) => {
      const eq = pl.info && pl.info.eq;
      if (!eq || pl.dead || !inView(pl.rx, pl.ry, 40)) return;
      if (eq.wings) {
        pl.wingAcc = (pl.wingAcc || 0) + dt * (3 + Math.min(4, pl.speed / 20 || 0)) * k * (eq.wingPlus >= 9 ? 1.6 : 1);
        if (pl.wingAcc > 1) {
          pl.wingAcc = 0;
          const side = Math.random() < 0.5 ? -1 : 1, back = pl.flip ? 1 : -1;
          puff(pl.rx + side * (8 + Math.random() * 10) + back * 3, pl.ry - 26 - Math.random() * 14, { vx: back * 6 + (Math.random() - 0.5) * 6, vy: 4 + Math.random() * 6, life: 0.9, col: WCOL[eq.wingRarity] || '#bfe8ff', wob: 5, s: Math.random() < 0.25 ? 2 : 1 });
        }
      }
      const hot = ['legendary', 'ancestral'].includes(eq.wr) || eq.wp >= 9;
      if (hot && eq.w) {
        pl.wpnAcc = (pl.wpnAcc || 0) + dt * 2.5 * k * (eq.wp >= 13 ? 2 : 1);
        if (pl.wpnAcc > 1) { pl.wpnAcc = 0; const fr = pl.flip ? -1 : 1; puff(pl.rx + fr * (6 + Math.random() * 8), pl.ry - 18 - Math.random() * 16, { vy: -8 - Math.random() * 8, life: 0.6, col: WCOL[eq.wr] || '#9ad0ff', s: 1 }); }
      }
    });
    ctx.restore();
  }
  // brilho radial aditivo (luz pintada direto na cena)
  // em chão claro (neve, céu, deserto) a luz aditiva estoura para branco: atenua
  const LIGHT_K = { snow: 0.3, sky: 0.35, desert: 0.5, town: 0.75, noria: 0.8 };
  let LK = 1;
  function glowAt(sx, sy, rad, rgb, a) {
    a *= LK;
    if (rad <= 0 || a <= 0) return;
    const g2 = ctx.createRadialGradient(sx, sy, 0, sx, sy, rad);
    g2.addColorStop(0, `rgba(${rgb},${Math.min(1, a)})`); g2.addColorStop(0.45, `rgba(${rgb},${Math.min(1, a) * 0.35})`); g2.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = g2; ctx.fillRect(sx - rad, sy - rad, rad * 2, rad * 2);
  }
  // raio com zigue-zague (regerado a cada 45ms)
  function boltPath(x1, y1, x2, y2, seed, jag) {
    let s = seed >>> 0; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 - 0.5; };
    const pts = [[x1, y1]], n = 8, nx = -(y2 - y1), ny = x2 - x1, L = Math.hypot(nx, ny) || 1;
    for (let i = 1; i < n; i++) { const t = i / n, o = rnd() * jag * Math.sin(t * Math.PI); pts.push([x1 + (x2 - x1) * t + nx / L * o, y1 + (y2 - y1) * t + ny / L * o]); }
    pts.push([x2, y2]); return pts;
  }
  function strokePath(pts, col, w) { ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.stroke(); }
  // explosão de derrota do boss: anéis, clarão, partículas e tremor controlado
  function bossDeath(t, now) {
    const [cx, cy] = center(t);
    const col = t.tint && t.tint[0] === '#' ? t.tint : '#c06bff';
    S.fx.push({ kind: 'ring', x: t.rx, y: t.ry, r: 120, col: '255,220,150', t0: now, dur: 700, w: 4 });
    S.fx.push({ kind: 'ring', x: t.rx, y: t.ry, r: 80, col: '200,120,255', t0: now + 140, dur: 650, w: 3 });
    S.fx.push({ kind: 'burst', x: t.rx, y: t.ry - 10, r: 70, sprite: 'burst_dark', t0: now, dur: 620 });
    S.fx.push({ kind: 'burst', x: t.rx, y: t.ry - 10, r: 50, sprite: 'burst_fire', t0: now + 120, dur: 560 });
    S.fx.push({ kind: 'pillar', at: { rx: t.rx, ry: t.ry }, col: '255,230,170', t0: now + 200, dur: 1400, w: 26 });
    sparks(cx, cy, 70, ['#ffffff', '#ffd36b', col, '#ff8ae8'], 150, { up: 40, life: 1.1, big: 0.5, g: 50 });
    for (let i = 0; i < Math.round(26 * FXK[quality]); i++) puff(cx + (Math.random() - 0.5) * 40, cy + (Math.random() - 0.5) * 20, { vx: (Math.random() - 0.5) * 12, vy: -20 - Math.random() * 30, life: 1.6 + Math.random(), col: Math.random() < 0.5 ? '#e0c0ff' : '#ffffff', kind: 'soul', s: 2, wob: 10, delay: Math.random() * 0.5 });
    dlight(t.rx, t.ry - 20, 260, '255,220,160', 1500, 2.2, now);
    S.flash = { t0: now, dur: 380, col: '255,245,225' };
    shake(12, 900);
  }

  // ---------- luz e escuridão ----------
  const lightCv = document.createElement('canvas');
  function drawLighting(now, me) {
    const Q = QUALITY[quality];
    const dark = DARKNESS[S.map.theme] || 0;
    LK = LIGHT_K[S.map.theme] ?? 1;
    const vis = (S.lights || []).filter((l) => l.x + l.r > camX && l.x - l.r < camX + cv.width / zoom && l.y + l.r > camY && l.y - l.r < camY + cv.height / zoom);
    if (Q.lights) S.players.forEach((player) => {
      const equipment = player.info && player.info.eq;
      if (!equipment || player.rx < camX - 120 || player.rx > camX + cv.width / zoom + 120 || player.ry < camY - 120 || player.ry > camY + cv.height / zoom + 120) return;
      const glowByRarity = { uncommon: '95,220,120', rare: '90,170,255', epic: '190,100,255', legendary: '255,190,70', ancestral: '255,90,120' };
      const rarity = equipment.wingRarity || equipment.wr || (equipment.wp >= 9 ? 'legendary' : equipment.wp >= 6 ? 'rare' : null);
      const glow = glowByRarity[rarity] || (equipment.wings ? '130,220,255' : null);
      if (glow) vis.push({ x: player.rx, y: player.ry - 24, r: equipment.wings ? 94 : 70, color: glow, flicker: .12, ph: (player.phase || 0) });
    });
    // luzes passageiras: impactos, magias, explosões, level up
    S.dlights = S.dlights.filter((l) => now - l.t0 < l.dur);
    for (const l of S.dlights) {
      const k = (now - l.t0) / l.dur; if (k < 0) continue;
      vis.push({ x: l.x, y: l.y, r: l.r * (0.7 + 0.3 * (1 - k)), color: l.color, flicker: 0, ph: 0, a: l.a * (1 - k) * (1 - k * 0.5) });
    }
    // projéteis carregam a própria luz
    if (Q.lights) for (const f of S.fx) {
      if (f.kind !== 'proj' || now < f.t0 || !f.from || !f.to) continue;
      const p = Math.min(1, (now - f.t0) / f.dur), [ax, ay] = center(f.from), [bx, by] = center(f.to);
      vis.push({ x: ax + (bx - ax) * p, y: ay + (by - ay) * p, r: 56, color: pal(f.fx)[1], flicker: 0.2, ph: f.t0, a: 1.6 });
    }
    // bosses vivos iluminam o chão ao redor
    if (Q.lights) S.monsters.forEach((mo) => { if (mo.boss && !mo.dead) vis.push({ x: mo.rx, y: mo.ry - 20, r: 130, color: S.boss && S.boss.enraged ? '255,60,40' : '180,90,255', flicker: 0.15, ph: 1, a: 1.2 }); });
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
      for (const l of vis) hole(l.x, l.y, l.r * (1 + Math.sin(now / 90 + l.ph) * l.flicker * 0.3), Math.min(0.95, 0.95 * (l.a === undefined ? 1 : l.a)));
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
      const la = 0.22 * (l.a === undefined ? 1 : l.a) * LK;
      g2.addColorStop(0, `rgba(${l.color},${Math.min(0.6, la)})`); g2.addColorStop(0.5, `rgba(${l.color},${Math.min(0.6, la) * 0.3})`); g2.addColorStop(1, `rgba(${l.color},0)`);
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

  // ---------- ícones de itens e sprites sazonais ----------
  const iconCache = new Map();
  const TIP = { el: null, map: new WeakMap(), cur: null };
  const christmasSprite = new Image();
  christmasSprite.src = '/assets/special-christmas-pixel-art.svg';
  christmasSprite.onload = () => { iconCache.clear(); if (typeof renderBag === 'function' && S.panel === 'bag') renderBag(); };
  PA.itemsReady.then((ok) => { if (!ok) return; iconCache.clear(); if (S.panel) try { renderPanel(S.panel); } catch (_) {} });
  const christmasCrops = {
    helm:[5,5,66,66], armor:[72,5,66,67], pants:[138,5,65,68], gloves:[205,17,53,49], boots:[263,5,57,67],
    wings:[0,70,108,58], pendant:[99,68,58,61], ring1:[158,74,44,53], ring2:[202,72,48,53], sword:[252,66,68,66],
    bow:[5,124,76,67], shield:[155,125,74,65]
  };
  function drawItemIcon(ctx, item, x, y, scale, fallbackColor) {
    // ícone detalhado 48x48: ocupa o quadro inteiro (o ícone simples tem margem de 1 célula)
    if (PA.drawItem(ctx, item, x - scale, y - scale, scale * 16)) return;
    const part = String(item.base || '').match(/^festive_\\d+_(\\w+)$/);
    const crop = part && christmasCrops[part[1]];
    const size = scale * 10;
    if (crop && christmasSprite.complete && christmasSprite.naturalWidth) {
      const [sx,sy,sw,sh] = crop;
      const ratio = Math.min(size / sw, size / sh);
      const dw = sw * ratio, dh = sh * ratio;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(christmasSprite, sx, sy, sw, sh, x + (size-dw)/2, y + (size-dh)/2, dw, dh);
      return;
    }
    PA.drawIcon(ctx, item.icon, x, y, scale, fallbackColor || item.ic || RAR[item.rarity] || '#c8c8c8');
  }
  christmasSprite.onerror = () => { christmasSprite.src = ''; };
  function itemIcon(item) {
    const k = (item.base || item.icon) + item.rarity + (item.ic || '');
    let c = iconCache.get(k);
    if (!c) { c = document.createElement('canvas'); c.width = 48; c.height = 48; drawItemIcon(c.getContext('2d'), item, 3, 3, 3); iconCache.set(k, c); }
    return c;
  }
  // itens no chão (materiais com dono e tempo)
  function drawGroundItems(now) {
    if (!S.gitems || !S.gitems.size) return;
    for (const g of S.gitems.values()) {
      const left = g.ttl - (now - g.t0);
      if (left <= 0) { S.gitems.delete(g.gid); continue; }
      const mine = g.owner === S.youId;
      const [sx, sy] = toScreen(g.x, g.y);
      if (sx < -40 || sy < -40 || sx > cv.width + 40 || sy > cv.height + 40) continue;
      const bob = Math.sin(now / 260 + g.x) * 2 * dpr;
      const col = g.base === 'zen' ? '#ffd36b' : (g.ic || RAR[g.rarity] || '#fff');
      ctx.globalAlpha = (mine ? 1 : 0.55) * (left < 8000 ? 0.5 + 0.5 * Math.abs(Math.sin(now / 180)) : 1);
      ctx.fillStyle = col; ctx.globalAlpha *= 0.35; ctx.beginPath(); ctx.ellipse(sx, sy + 3 * dpr, 9 * dpr, 3 * dpr, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = (mine ? 1 : 0.55) * (left < 8000 ? 0.5 + 0.5 * Math.abs(Math.sin(now / 180)) : 1);
      const s = 12 * dpr;
      ctx.drawImage(itemIcon({ icon: g.icon, rarity: g.rarity, ic: g.base === 'zen' ? '#ffd36b' : g.ic }), sx - s, sy - s * 1.7 + bob, s * 2, s * 2);
      ctx.globalAlpha = 1;
      label(`${g.name}${g.qty > 1 ? ' ×' + fmt.format(g.qty) : ''}${mine ? '' : ` (${g.ownerName})`}`, sx, sy - s * 1.8 + bob, mine ? col : '#9a9aa8', 9);
    }
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

  // ---------- explosão dourada quando um monstro dourado morre ----------
  const GOLD_TIER = { bronze: '#f0b070', prata: '#e8f0ff', ouro: '#ffd84a' };
  function drawGoldFx(now) {
    if (!S.goldFx.length) return;
    S.goldFx = S.goldFx.filter((g) => {
      const age = Math.max(0, (now - g.t0) / 1000);
      if (age > 1.4) return false;
      const [sx, sy] = toScreen(g.x, g.y);
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const r = (12 + age * 90) * zoom;
      ctx.strokeStyle = `rgba(255,214,90,${Math.max(0, 1 - age / 0.8)})`; ctx.lineWidth = 3 * dpr;
      ctx.beginPath(); ctx.ellipse(sx, sy - 10 * zoom, r, r * 0.5, 0, 0, Math.PI * 2); ctx.stroke();
      const rg = ctx.createRadialGradient(sx, sy - 14 * zoom, 0, sx, sy - 14 * zoom, 40 * zoom);
      rg.addColorStop(0, `rgba(255,236,150,${Math.max(0, 0.7 - age)})`); rg.addColorStop(1, 'rgba(255,200,60,0)');
      ctx.fillStyle = rg; ctx.fillRect(sx - 40 * zoom, sy - 54 * zoom, 80 * zoom, 80 * zoom);
      ctx.restore();
      for (const c of g.coins) {
        const d = c.v * age * zoom, lift = (c.h * age - 60 * age * age) * zoom;
        ctx.globalAlpha = Math.max(0, 1 - age / 1.4);
        ctx.fillStyle = (Math.floor(now / 90 + c.a * 10) % 2) ? '#ffd84a' : '#fff6c0';
        ctx.fillRect(sx + Math.cos(c.a) * d - 1.5 * dpr, sy - 12 * zoom + Math.sin(c.a) * d * 0.5 - lift - 1.5 * dpr, 3 * dpr, 3 * dpr);
      }
      ctx.globalAlpha = 1;
      return true;
    });
  }

  // ---------- áreas de perigo do boss ----------
  function drawDangers(now) {
    S.dangers = (S.dangers || []).filter((d) => {
      const p = Math.max(0, (now - d.t0) / d.ms);
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
  let frameErrAt = 0;
  // um erro de desenho nunca pode parar o jogo: o quadro seguinte sempre é agendado
  function frame(now) {
    try { drawFrame(now); } catch (e) {
      if (performance.now() - frameErrAt > 5000) { frameErrAt = performance.now(); console.error('[frame]', e); }
      if (S.camBase) { camX = S.camBase[0]; camY = S.camBase[1]; S.camBase = null; }
      try { ctx.restore(); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.setLineDash([]); } catch (_) { /* nada */ }
    }
    requestAnimationFrame(frame);
  }
  function drawFrame(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    ctx.imageSmoothingEnabled = false;
    if (is3d) ctx.clearRect(0, 0, cv.width, cv.height);
    else { ctx.fillStyle = '#0b1020'; ctx.fillRect(0, 0, cv.width, cv.height); }
    if (S.map && S.ground) {
      LK = LIGHT_K[S.map.theme] ?? 1;
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
      S.camBase = [baseX, baseY];
      if (S.shake && now < S.shake.until) {
        const k = (S.shake.until - now) / S.shake.dur;
        camX += (Math.random() - 0.5) * S.shake.mag * k; camY += (Math.random() - 0.5) * S.shake.mag * k;
      }
      const sx = Math.max(0, camX), sy = Math.max(0, camY);
      const sw = Math.min(S.map.w - sx, vw), sh = Math.min(S.map.h - sy, vh);
      if (is3d) {
        // 3D: a câmera olha para o centro da mesma janela que o 2D mostraria
        W3().setView(camX + vw / 2, camY + vh / 2, zoom, cv.width, cv.height);
        W3().setActors(actors3d(now, me));
        W3().render(now);
      } else ctx.drawImage(S.ground, sx * GS, sy * GS, sw * GS, sh * GS, (sx - camX) * zoom, (sy - camY) * zoom, sw * zoom, sh * zoom);
      drawArenaZone(now);
      drawDangers(now);
      drawClickMark(now);
      drawGroundItems(now);
      drawEntities(now, me);
      drawDrops(now, me);
      drawGoldFx(now);
      drawFx(now);
      drawAmbient(now, dt, me);
      drawVfx(dt);
      if (!is3d) drawLighting(now, me);
      updateParticles(dt, now, vw, vh);
      drawHitParticles(now, dt);
      if (!is3d) drawAtmosphere(now);
      drawFloats(now);
      // tela vermelha rápida quando o herói leva um golpe forte
      if (S.hurtFlash && now - S.hurtFlash < 260) {
        const a = 0.35 * (1 - (now - S.hurtFlash) / 260);
        const gr = ctx.createRadialGradient(cv.width / 2, cv.height / 2, Math.min(cv.width, cv.height) * 0.3, cv.width / 2, cv.height / 2, Math.max(cv.width, cv.height) * 0.7);
        gr.addColorStop(0, 'rgba(200,0,0,0)'); gr.addColorStop(1, `rgba(200,0,0,${a})`);
        ctx.fillStyle = gr; ctx.fillRect(0, 0, cv.width, cv.height);
      }
      // clarão de tela (derrota de boss)
      if (S.flash && now - S.flash.t0 < S.flash.dur) {
        const k = Math.max(0, (now - S.flash.t0) / S.flash.dur);
        ctx.fillStyle = `rgba(${S.flash.col},${0.55 * (1 - k)})`; ctx.fillRect(0, 0, cv.width, cv.height);
      }
      // escurece e clareia ao entrar no mapa
      if (S.enterAt && now - S.enterAt < 700) { ctx.fillStyle = `rgba(5,6,14,${1 - (now - S.enterAt) / 700})`; ctx.fillRect(0, 0, cv.width, cv.height); }
      camX = baseX; camY = baseY; S.camBase = null;
      drawMinimap();
    }
  }
  requestAnimationFrame(frame);

  const toScreen = (x, y) => { if (is3d) { const p = W3().project(x, y, 0); return [Math.round(p[0]), Math.round(p[1])]; } return [Math.round((x - camX) * zoom), Math.round((y - camY) * zoom)]; };
  const spr = () => zoom / 2; // pixels de tela por pixel de sprite (sprites têm o dobro da resolução do mundo)
  function shake(mag, dur = 350) { S.shake = { mag, dur, until: performance.now() + dur }; }

  // herói: parado = de frente; andando para os lados = de lado (virado para onde vai); para baixo = de frente; para cima = de costas
  function heroAnim(e, now) {
    if (e.dyingAt || now < (e.attackUntil || 0) || (now < (e.hurtUntil || 0) && now >= (e.hitAt || 0))) { if (now < (e.attackUntil || 0)) { e.face = 'side'; e.faceLeft = !!e.flip; } return [...animOf(e, now), e.flip]; }
    const speed = e.speed || 0;
    if (speed > 10) {
      const vx = e.vx || 0, vy = e.vy || 0, run = speed > 65;
      if (Math.abs(vx) >= Math.abs(vy) * 0.85) { e.faceLeft = vx < 0; e.face = 'side'; return [run ? 'run' : 'walk', now + e.phase, false, e.faceLeft]; }
      e.face = vy > 0 ? 'front' : 'back';
      return [(run ? 'run_' : 'walk_') + e.face, now + e.phase, false, false];
    }
    // parado: continua virado para o último lado em que andou (direita, esquerda, frente ou costas)
    if (e.face === 'side') return ['idle', now + e.phase, false, !!e.faceLeft];
    if (e.face === 'back') return ['idle_back', now + e.phase, false, false];
    return ['idle_front', now + e.phase, false, false];
  }
  function animOf(e, now) {
    if (e.dyingAt) return ['death', now - e.dyingAt, true];
    if (now < (e.attackUntil || 0)) return ['attack', now - (e.attackStart || now), true];
    if (now < (e.hurtUntil || 0) && now >= (e.hitAt || 0)) return ['hit', now - (e.hitAt || now), true];
    const speed = e.speed || 0;
    if (speed > 65) return ['run', now + e.phase, false];
    if (speed > 10) return ['walk', now + e.phase, false];
    return ['idle', now + e.phase, false];
  }

  // Poeira pixelada sincronizada com o passo, sem adicionar spritesheets ou pesar o celular.
  function drawRunPuff(x, y, now, phase, flip, color) {
    const step = (now / 105 + (phase || 0) / 170) % 1;
    if (step > 0.42) return;
    const side = flip ? 1 : -1;
    const fade = (1 - step / 0.42) * 0.34;
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.fillStyle = color || '#d8c59a';
    for (let i = 0; i < 3; i++) {
      const lift = step * (8 + i * 2) * zoom;
      const spread = (i * 3 + step * 5) * zoom;
      ctx.fillRect(Math.round(x + side * spread), Math.round(y - 2 * dpr - lift), Math.max(1, Math.round((2 - i * 0.35) * dpr)), Math.max(1, Math.round(dpr)));
    }
    ctx.restore();
  }
  function shadowAt(x, y, w) {
    ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(x, y, w, w * 0.32, 0, 0, Math.PI * 2); ctx.fill();
  }

  // lista do que o motor 3D precisa desenhar neste quadro (só aparência: posição, animação e equipamento)
  const MON_H3 = (e) => { const d = W3().MON && W3().MON[e.type]; return ((d && d.h) || 1.6) * (e.scale || 1) * W3().K; };
  function actors3d(now, me) {
    const out = [];
    S.monsters.forEach((m) => {
      if (m.rx === null || m.rx === undefined) return;
      if (m.dead && !(m.dyingAt && now - m.dyingAt < 1400)) return;
      const [act] = animOf(m, now);
      const tgt = m.atkT || (me && now < (m.attackUntil || 0) && Math.hypot(me.rx - m.rx, me.ry - m.ry) < 120 ? me : null);
      out.push({ key: 'm' + m.id, kind: 'mon', mtype: m.type, tint: m.tint, golden: m.golden || null, scale: m.scale || 1, x: m.rx, y: m.ry, vx: m.vx, vy: m.vy, speed: m.speed, act,
        atkAt: m.attackStart, atkDur: (m.attackUntil || 0) - (m.attackStart || 0), hitAt: m.hitAt, flip: m.flip, faceX: tgt ? tgt.rx : undefined, faceY: tgt ? tgt.ry : undefined, flash: now < (m.hurtUntil || 0) && now >= (m.hitAt || 0) && !m.dyingAt });
    });
    S.players.forEach((p) => {
      if (!p.info || p.rx === null || p.rx === undefined) return;
      if (p.dead && !(p.dyingAt && now - p.dyingAt < 2400)) return;
      const [act0] = heroAnim(p, now);
      const act = act0.replace(/_(front|back)$/, '');
      const info = p.info;
      const eq = info.eq ? { ...info.eq, wg: info.eq.w && (['epic', 'legendary', 'ancestral'].includes(info.eq.wr) ? RAR[info.eq.wr] : info.eq.wp >= 7 ? '#7ad0ff' : null) } : null;
      const tgt = p.atkT && now < (p.attackUntil || 0) ? p.atkT : null;
      out.push({ key: 'p' + p.id, kind: 'hero', cls: info.cls, eq, x: p.rx, y: p.ry, vx: p.vx, vy: p.vy, speed: p.speed, act,
        atkAt: p.attackStart, atkDur: (p.attackUntil || 0) - (p.attackStart || 0), hitAt: p.hitAt, flip: p.flip, faceX: tgt ? tgt.rx : undefined, faceY: tgt ? tgt.ry : undefined, flash: false });
    });
    for (const n of S.map.npcs || []) out.push({ key: 'n' + n.kind + n.x + '_' + n.y, kind: 'npc', npc: n.kind, x: n.x, y: n.y, speed: 0, act: 'idle' });
    return out;
  }
  function drawEntities3D(now, me) {
    const myTarget = S.me && S.me.target;
    const K3 = W3().K;
    const head = (x, y, h) => { const p = W3().project(x, y, h); return [p[0], p[1]]; };
    for (const n of S.map.npcs || []) {
      const [x, y] = head(n.x, n.y, 1.95 * K3);
      const sub = { chaos: ['Chaos Machine', '#ff9ad8'], sevina: ['Evolução de classe', '#9affd0'], marlon: ['Evolução de classe', '#9affd0'], castle_guard: ['Chaos Castle', '#ff7a5a'], charon: ['Devil Square', '#c88aff'],
        teleport: ['Viajar para outro mapa', '#c88aff'], guild: ['Guildas e membros', '#ffd36b'], smith: ['Aprimorar +9 a +15', '#9affd0'], vault: ['Guardar itens e Zen', '#9affd0'] }[n.kind] || ['Loja', '#9affd0'];
      label(n.name, x, y - 4 * dpr, '#ffd36b');
      label(sub[0], x, y - 17 * dpr, sub[1], 10);
    }
    S.monsters.forEach((e) => {
      if (e.dead || e.rx === null || e.rx === undefined) return;
      const [fx, fy] = toScreen(e.rx, e.ry);
      const w = Math.max(10 * zoom, MON_H3(e) * zoom * 0.35);
      if (e.id === myTarget) { ctx.strokeStyle = '#ffd36b'; ctx.lineWidth = dpr * 2; ctx.beginPath(); ctx.ellipse(fx, fy, w, w * 0.4, 0, 0, Math.PI * 2); ctx.stroke(); }
      if (e.boss) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; const col = S.boss && S.boss.enraged ? '255,50,40' : '190,100,255'; const ar = w * (1.6 + 0.15 * Math.sin(now / 160)); const g2 = ctx.createRadialGradient(fx, fy, 0, fx, fy, ar); g2.addColorStop(0, `rgba(${col},.32)`); g2.addColorStop(1, `rgba(${col},0)`); ctx.fillStyle = g2; ctx.fillRect(fx - ar, fy - ar, ar * 2, ar * 2); ctx.restore(); }
      if (e.golden) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; const ar = w * 1.5; const g3 = ctx.createRadialGradient(fx, fy, 0, fx, fy, ar); g3.addColorStop(0, 'rgba(255,205,70,.35)'); g3.addColorStop(1, 'rgba(255,190,40,0)'); ctx.fillStyle = g3; ctx.fillRect(fx - ar, fy - ar, ar * 2, ar * 2); ctx.restore(); }
      e.hpShow = e.hpShow === undefined ? e.hp : e.hpShow + (e.hp - e.hpShow) * 0.25;
      const [x, top0] = head(e.rx, e.ry, MON_H3(e) * 1.08);
      const top = top0 - 4 * dpr;
      if (e.golden) {
        const bw = Math.max(34 * dpr, w * 1.8), bh = 4 * dpr, bx = Math.round(x - bw / 2);
        ctx.fillStyle = '#3a2a06'; ctx.fillRect(bx - 2 * dpr, top - 2 * dpr, bw + 4 * dpr, bh + 4 * dpr);
        ctx.fillStyle = '#0b1020'; ctx.fillRect(bx, top, bw, bh);
        const gg = ctx.createLinearGradient(0, top, 0, top + bh); gg.addColorStop(0, '#fff3a0'); gg.addColorStop(1, '#e09a10');
        ctx.fillStyle = gg; ctx.fillRect(bx, top, Math.max(0, bw * Math.min(1, e.hpShow / e.maxHp)), bh);
        label(`♛ ${e.name} Nv.${e.level}`, x, top - 4 * dpr, GOLD_TIER[e.golden] || '#ffd36b', 10);
        return;
      }
      hpBar(x, top, Math.max(28 * dpr, w * 1.6), e.hpShow / e.maxHp, e.boss ? '#c06bff' : e.elite ? '#ffb02e' : '#e0473a');
      if (e.boss || e.elite || e.id === myTarget) label(`${e.name} Nv.${e.level}`, x, top - 4 * dpr, e.boss ? '#e0b0ff' : e.elite ? '#ffd36b' : '#f0e6cc', 10);
    });
    S.players.forEach((e) => {
      if (!e.info || e.dead || e.rx === null || e.rx === undefined) return;
      const info = e.info, isMe = e === me;
      const [fx, fy] = toScreen(e.rx, e.ry);
      if (e.id === myTarget) { ctx.strokeStyle = '#ff5a4a'; ctx.lineWidth = dpr * 2; ctx.beginPath(); ctx.ellipse(fx, fy, 12 * zoom, 4.5 * zoom, 0, 0, Math.PI * 2); ctx.stroke(); }
      if (e.buff) { const col = e.buff & 1 ? '255,140,40' : '90,180,255'; ctx.strokeStyle = `rgba(${col},${0.55 + 0.25 * Math.sin(now / 150)})`; ctx.lineWidth = 2 * dpr; ctx.beginPath(); ctx.ellipse(fx, fy, 12 * zoom, 4.5 * zoom, 0, 0, Math.PI * 2); ctx.stroke(); }
      const rar = info.weaponRarity;
      if (rar && ['epic', 'legendary', 'ancestral'].includes(rar)) { ctx.globalAlpha = 0.3 + 0.15 * Math.sin(now / 200); ctx.fillStyle = RAR[rar]; ctx.beginPath(); ctx.ellipse(fx, fy, 13 * zoom, 4.6 * zoom, 0, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; }
      e.hpShow = e.hpShow === undefined ? e.hp : e.hpShow + (e.hp - e.hpShow) * 0.25;
      const [x, top0] = head(e.rx, e.ry, 2.05 * K3);
      const top = top0 - 4 * dpr;
      hpBar(x, top, 16 * zoom, e.hpShow / e.maxHp, isMe ? '#6aa84f' : (e.flags & 1) ? '#ff5a4a' : '#4aa3ff');
      const pk = e.flags & 1, inDuel = e.flags & 2, pvpOn = e.flags & 4;
      const enemy = !isMe && hostileTo(e);
      const vipT = info.vip || 0;
      label(`${pk ? '[PK] ' : ''}${pvpOn ? '⚔ ' : ''}${vipT === 2 ? '◆ ' : vipT === 1 ? '★ ' : ''}${info.name} ${info.level}`, x, top - 4 * dpr, pk ? '#ff6a5a' : inDuel ? '#ffb02e' : enemy ? '#ff9a6a' : vipT === 2 ? '#7fe3ff' : vipT === 1 || isMe ? '#ffd36b' : '#bfe0ff', 11);
    });
  }
  function drawEntities(now, me) {
    if (is3d) return drawEntities3D(now, me);
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
        if (e.kind === 'chaos') {
          // Chaos Goblin com o brilho da Chaos Machine
          ctx.save(); ctx.globalCompositeOperation = 'lighter';
          const r = 26 * zoom * (1 + 0.08 * Math.sin(now / 220));
          const gr = ctx.createRadialGradient(x, y - 14 * zoom, 0, x, y - 14 * zoom, r);
          gr.addColorStop(0, 'rgba(170,90,255,.45)'); gr.addColorStop(1, 'rgba(170,90,255,0)');
          ctx.fillStyle = gr; ctx.fillRect(x - r, y - 14 * zoom - r, r * 2, r * 2); ctx.restore();
          Sprites.monster(ctx, 'goblin', 'idle', now, x, y, sc * 1.05, false, { tint: '#8a3aff' });
          label(e.name, x, y - HERO_H * sc - 4 * dpr, '#d8b0ff');
          label('Chaos Machine', x, y - HERO_H * sc - 17 * dpr, '#ff9ad8', 10);
          continue;
        }
        if (e.kind === 'sevina' || e.kind === 'marlon') {
          ctx.save(); ctx.globalCompositeOperation = 'lighter';
          const r2 = 22 * zoom * (1 + 0.06 * Math.sin(now / 260));
          const g4 = ctx.createRadialGradient(x, y - 14 * zoom, 0, x, y - 14 * zoom, r2);
          g4.addColorStop(0, e.kind === 'sevina' ? 'rgba(160,220,255,.4)' : 'rgba(255,190,90,.4)'); g4.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = g4; ctx.fillRect(x - r2, y - 14 * zoom - r2, r2 * 2, r2 * 2); ctx.restore();
          if (e.kind === 'sevina') Sprites.hero(ctx, 'fairy_elf', { hair: 1, skin: 0 }, 'idle_front', now, x, y, sc, true, { equip: { w: null, armor: 'phoenix', helm: null } });
          else Sprites.hero(ctx, 'dark_knight', { hair: 4, skin: 1 }, 'idle_front', now, x, y, sc, true, { equip: { helm: 'storm', armor: 'storm', gloves: 'storm', boots: 'storm' } });
          label(e.name, x, y - HERO_H * sc - 4 * dpr, e.kind === 'sevina' ? '#bfe8ff' : '#ffcf7a');
          label('Evolução de classe', x, y - HERO_H * sc - 17 * dpr, '#9affd0', 10);
          continue;
        }
        if (e.kind === 'castle_guard' || e.kind === 'charon' || e.kind === 'teleport') {
          const guard = e.kind === 'castle_guard';
          ctx.save(); ctx.globalCompositeOperation = 'lighter';
          const r3 = 22 * zoom * (1 + 0.07 * Math.sin(now / 240));
          const g5 = ctx.createRadialGradient(x, y - 14 * zoom, 0, x, y - 14 * zoom, r3);
          g5.addColorStop(0, guard ? 'rgba(255,70,50,.42)' : 'rgba(170,80,255,.42)'); g5.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = g5; ctx.fillRect(x - r3, y - 14 * zoom - r3, r3 * 2, r3 * 2); ctx.restore();
          if (guard) Sprites.hero(ctx, 'dark_knight', { hair: 0, skin: 1 }, 'idle_front', now, x, y, sc, true, { equip: { helm: 'abyss', armor: 'abyss', gloves: 'abyss', boots: 'abyss' } });
          else Sprites.hero(ctx, 'dark_wizard', { hair: 3, skin: 0 }, 'idle_front', now, x, y, sc, false, { equip: { armor: 'abyss', helm: 'abyss' } });
          label(e.name, x, y - HERO_H * sc - 4 * dpr, guard ? '#ffb0a0' : '#d8b0ff');
          label(e.kind === 'teleport' ? 'Viajar para outro mapa' : guard ? 'Chaos Castle' : 'Devil Square', x, y - HERO_H * sc - 17 * dpr, guard ? '#ff7a5a' : '#c88aff', 10);
          continue;
        }
        if (e.kind === 'guild') {
          ctx.save(); ctx.globalCompositeOperation = 'lighter';
          const rg = 22 * zoom * (1 + 0.05 * Math.sin(now / 300));
          const glow = ctx.createRadialGradient(x, y - 14 * zoom, 0, x, y - 14 * zoom, rg);
          glow.addColorStop(0, 'rgba(255,211,107,.38)'); glow.addColorStop(1, 'rgba(255,211,107,0)');
          ctx.fillStyle = glow; ctx.fillRect(x - rg, y - 14 * zoom - rg, rg * 2, rg * 2); ctx.restore();
          Sprites.hero(ctx, 'fairy_elf', { hair: 2, skin: 1 }, 'idle_front', now, x, y, sc, false, { equip: { armor: 'phoenix', gloves: 'phoenix', boots: 'phoenix' } });
          label(e.name, x, y - HERO_H * sc - 4 * dpr, '#ffe7a0');
          label('Guildas e membros', x, y - HERO_H * sc - 17 * dpr, '#ffd36b', 10);
          continue;
        }
        if (e.kind === 'smith') {
          drawForge(x, y, now);
          const ph = now % 1600, hit = ph < 500;
          Sprites.hero(ctx, 'dark_knight', { hair: 2, skin: 2 }, hit ? 'attack' : 'idle', hit ? ph : now, x - 10 * zoom, y, sc, false, { once: hit, equip: { armor: 'bronze', gloves: 'bronze', w: 'sword' } });
          label(e.name, x, y - HERO_H * sc - 4 * dpr, '#ffb46a');
          label('Aprimorar +9 a +15', x, y - HERO_H * sc - 17 * dpr, '#9affd0', 10);
          continue;
        }
        if (e.kind === 'vault') { drawVaultChest(x, y, now); label(e.name, x, y - 30 * zoom - 4 * dpr, '#ffd36b'); label('Guardar itens e Zen', x, y - 30 * zoom - 17 * dpr, '#9affd0', 10); continue; }
        Sprites.hero(ctx, 'dark_wizard', { hair: 1, skin: 1 }, 'idle_front', now, x, y, sc, true);
        label(e.name, x, y - HERO_H * sc - 4 * dpr, '#ffd36b');
        label('Loja', x, y - HERO_H * sc - 17 * dpr, '#9affd0', 10);
        continue;
      }
      const [x, y] = toScreen(e.rx, e.ry);
      const [act, t, once, heroFlip] = kind === 'p' ? heroAnim(e, now) : animOf(e, now);
      const runBob = /^run/.test(act) ? Math.round(Math.abs(Math.sin((now + (e.phase || 0)) * 0.018)) * 1.5 * zoom) : 0;
      const idleBob = /^idle/.test(act) ? Math.sin((now + (e.phase || 0)) / 390) * 0.55 * zoom : 0;
      const recoilAge = (now - (e.hitAt || 0)) / 1000;
      const recoil = recoilAge >= 0 && recoilAge < .18 ? Math.sin((recoilAge / .18) * Math.PI) * (e.hitDir || 1) * 2.1 * zoom : 0;
      e.hpShow = e.hpShow === undefined ? e.hp : e.hpShow + (e.hp - e.hpShow) * 0.25;
      if (kind === 'm') {
        const name = monSprite(e);
        const meta = Sprites.meta('monsters', name);
        const ms = meta ? meta.scale : 1;
        const h = (MON_H[name] || 40) * ms * sc * (e.scale || 1);
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
        if (e.golden && !e.dead) {
          // aura dourada e brilhos subindo
          ctx.save(); ctx.globalCompositeOperation = 'lighter';
          const ar = w * (1.3 + 0.12 * Math.sin(now / 140));
          const g3 = ctx.createRadialGradient(x, y - h * 0.45, 0, x, y - h * 0.45, ar * 1.5);
          g3.addColorStop(0, 'rgba(255,205,70,.42)'); g3.addColorStop(1, 'rgba(255,190,40,0)');
          ctx.fillStyle = g3; ctx.fillRect(x - ar * 1.5, y - h * 0.45 - ar * 1.5, ar * 3, ar * 3);
          for (let k = 0; k < 5; k++) {
            const ph = ((now / 900 + k / 5 + (e.x % 7) / 7) % 1);
            const sx2 = x + Math.sin(k * 2.3 + now / 400) * w * 0.7, sy2 = y - ph * h * 1.2;
            ctx.globalAlpha = 1 - ph; ctx.fillStyle = '#fff1a8'; ctx.fillRect(sx2 - dpr, sy2 - dpr, 2 * dpr, 2 * dpr);
          }
          ctx.restore();
          if (e.bornAt && now - e.bornAt < 700) { const k = Math.max(0, (now - e.bornAt) / 700); ctx.strokeStyle = `rgba(255,214,90,${1 - k})`; ctx.lineWidth = 3 * dpr; ctx.beginPath(); ctx.ellipse(x, y, w * (0.5 + k * 1.6), w * (0.18 + k * 0.55), 0, 0, Math.PI * 2); ctx.stroke(); }
        }
        if (e.id === myTarget && !e.dead) { ctx.strokeStyle = '#ffd36b'; ctx.lineWidth = dpr * 2; ctx.beginPath(); ctx.ellipse(x, y, w, w * 0.34, 0, 0, Math.PI * 2); ctx.stroke(); }
        shadowAt(x, y, w * 0.8);
        const hurt = now < (e.hurtUntil || 0) && !e.dyingAt;
        if (act === 'run') drawRunPuff(x, y, now, e.phase, e.flip, '#b9a486');
        const mTint = e.tint && e.tint[0] === '#' ? e.tint : null, flashW = hurt && (now - e.hurtUntil) > -90;
        Sprites.monster(ctx, name, act, t, x + recoil, y - runBob - idleBob, sc * (e.scale || 1), !e.flip, { once, tint: mTint });
        // clarão branco do golpe por cima do sprite (não some em chão claro)
        if (flashW) Sprites.monster(ctx, name, act, t, x + recoil, y - runBob - idleBob, sc * (e.scale || 1), !e.flip, { once, white: true, alpha: 0.65, tint: mTint });
        if (e.dead) continue;
        const top = y - h - 6 * dpr;
        if (e.golden) {
          // barra de vida dourada com moldura
          const bw = Math.max(34 * dpr, w * 1.8), bh = 4 * dpr, bx = Math.round(x - bw / 2);
          ctx.fillStyle = '#3a2a06'; ctx.fillRect(bx - 2 * dpr, top - 2 * dpr, bw + 4 * dpr, bh + 4 * dpr);
          ctx.fillStyle = '#0b1020'; ctx.fillRect(bx, top, bw, bh);
          const gg = ctx.createLinearGradient(0, top, 0, top + bh); gg.addColorStop(0, '#fff3a0'); gg.addColorStop(1, '#e09a10');
          ctx.fillStyle = gg; ctx.fillRect(bx, top, Math.max(0, bw * Math.min(1, e.hpShow / e.maxHp)), bh);
          ctx.strokeStyle = '#ffd36b'; ctx.lineWidth = dpr; ctx.strokeRect(bx - 1.5 * dpr, top - 1.5 * dpr, bw + 3 * dpr, bh + 3 * dpr);
          label(`♛ ${e.name} Nv.${e.level}`, x, top - 4 * dpr, GOLD_TIER[e.golden] || '#ffd36b', 10);
          continue;
        }
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
        const eq = info.eq ? { ...info.eq, wg: info.eq.w && (['epic', 'legendary', 'ancestral'].includes(info.eq.wr) ? RAR[info.eq.wr] : info.eq.wp >= 7 ? '#7ad0ff' : null) } : undefined;
        if (act === 'run') drawRunPuff(x, y, now, e.phase, heroFlip, '#c9b98f');
        Sprites.hero(ctx, info.cls, info.ap, act, t, x + recoil, y - runBob - idleBob, sc, heroFlip, { once, equip: eq });
        if (e.dead) continue;
        const top = y - HERO_H * sc - 4 * dpr;
        hpBar(x, top, 16 * zoom, e.hpShow / e.maxHp, isMe ? '#6aa84f' : (e.flags & 1) ? '#ff5a4a' : '#4aa3ff');
        const pk = e.flags & 1, inDuel = e.flags & 2, pvpOn = e.flags & 4;
        const enemy = !isMe && hostileTo(e);
        if (enemy && e.id !== myTarget) { ctx.strokeStyle = `rgba(255,70,60,${0.35 + 0.2 * Math.sin(now / 200)})`; ctx.lineWidth = dpr * 1.5; ctx.beginPath(); ctx.ellipse(x, y, 11 * zoom, 3.6 * zoom, 0, 0, Math.PI * 2); ctx.stroke(); }
        const vipT = info.vip || 0;
        label(`${pk ? '[PK] ' : ''}${pvpOn ? '⚔ ' : ''}${vipT === 2 ? '◆ ' : vipT === 1 ? '★ ' : ''}${info.name} ${info.level}`, x, top - 4 * dpr, pk ? '#ff6a5a' : inDuel ? '#ffb02e' : enemy ? '#ff9a6a' : vipT === 2 ? '#7fe3ff' : vipT === 1 || isMe ? '#ffd36b' : '#bfe0ff', 11);
      }
    }
  }
  function hpBar(cx, y, w, frac, color) {
    const h = 3 * dpr;
    ctx.fillStyle = '#0b1020'; ctx.fillRect(Math.round(cx - w / 2) - dpr, y - dpr, w + 2 * dpr, h + 2 * dpr);
    ctx.fillStyle = color; ctx.fillRect(Math.round(cx - w / 2), y, Math.max(0, w * Math.min(1, frac)), h);
  }
  function label(text, x, y, color, size = 11) {
    ctx.font = `700 ${Math.round(size * 1.12 * dpr)}px "Exo 2", "Segoe UI", system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    // contorno escuro: dá para ler em cima de qualquer chão
    ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(2, 3 * dpr); ctx.strokeStyle = 'rgba(8,10,20,.92)'; ctx.strokeText(text, x, y);
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
        const wx = ax + (bx - ax) * p, wy = ay + (by - ay) * p;
        const [x, y] = toScreen(wx, wy);
        const [cols, lc] = pal(f.fx);
        // rastro: partículas soltas + brilho no núcleo
        const rate = { baixa: 0.25, media: 0.55, alta: 1, ultra: 1.6 }[quality];
        if (Math.random() < rate) puff(wx + (Math.random() - 0.5) * 3, wy + (Math.random() - 0.5) * 3, { vx: (ax - bx) * 0.15 + (Math.random() - 0.5) * 14, vy: (ay - by) * 0.15 + (Math.random() - 0.5) * 14 - (f.fx === 'fire' ? 14 : 0), life: f.fx === 'arrow' || f.fx === 'arrow3' ? 0.18 : 0.38, col: cols[(Math.random() * cols.length) | 0], s: Math.random() < 0.35 ? 2 : 1, drag: 2 });
        if (QUALITY[quality].lights) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; glowAt(x, y, 14 * zoom, lc, 0.45); ctx.restore(); }
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
      } else if (f.kind === 'ring') {
        // onda de choque achatada (perspectiva do chão)
        const [x, y] = toScreen(f.x, f.y), e2 = 1 - (1 - p) * (1 - p), r = f.r * zoom * (0.15 + e2 * 0.85);
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = `rgba(${f.col},${(1 - p) * 0.9})`; ctx.lineWidth = Math.max(1, (f.w || 2) * dpr * (1 - p * 0.5));
        ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.42, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = `rgba(${f.col},${(1 - p) * 0.35})`; ctx.lineWidth = Math.max(1, (f.w || 2) * 2.4 * dpr);
        ctx.beginPath(); ctx.ellipse(x, y, r * 0.86, r * 0.36, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      } else if (f.kind === 'circle') {
        // círculo mágico girando sob quem conjura
        const [x, y] = toScreen(f.at.rx, f.at.ry);
        const a = Math.min(1, p * 5, (1 - p) * 4), r = f.r * zoom * (0.7 + Math.min(1, p * 4) * 0.3), rot = now / 600;
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = `rgba(${f.col},${0.75 * a})`; ctx.lineWidth = Math.max(1, dpr * 1.5);
        ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.4, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.ellipse(x, y, r * 0.72, r * 0.29, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = `rgba(${f.col},${0.9 * a})`;
        const sz = Math.max(1, Math.round(zoom / 2));
        for (let k = 0; k < 10; k++) { const an = rot + k / 10 * Math.PI * 2; ctx.fillRect(Math.round(x + Math.cos(an) * r * 0.86) - sz, Math.round(y + Math.sin(an) * r * 0.86 * 0.4) - sz, sz * 2, sz * 2); }
        ctx.beginPath();
        for (let k = 0; k <= 5; k++) { const an = -rot * 1.3 + k * Math.PI * 4 / 5, px2 = x + Math.cos(an) * r * 0.72, py2 = y + Math.sin(an) * r * 0.72 * 0.4; if (k) ctx.lineTo(px2, py2); else ctx.moveTo(px2, py2); }
        ctx.stroke();
        ctx.fillStyle = `rgba(${f.col},${0.12 * a})`; ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.4, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      } else if (f.kind === 'bolt') {
        // relâmpago: do atacante ao alvo, ou do céu (área)
        let x1, y1, x2, y2;
        if (f.sky) { [x2, y2] = toScreen(f.x, f.y); x1 = x2 + (Math.random() - 0.5) * 30 * zoom; y1 = y2 - 140 * zoom; }
        else { const [ax, ay] = center(f.from), [bx, by] = center(f.to); [x1, y1] = toScreen(ax, ay - 6); [x2, y2] = toScreen(bx, by); }
        const pts = boltPath(x1, y1, x2, y2, Math.floor(now / 45) + (f.t0 | 0), 16 * zoom);
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineJoin = 'miter';
        strokePath(pts, `rgba(${f.col},${0.35 * (1 - p)})`, 6 * dpr);
        strokePath(pts, `rgba(255,255,255,${1 - p})`, 2 * dpr);
        const br = boltPath(pts[3][0], pts[3][1], pts[3][0] + (Math.random() - 0.5) * 40 * zoom, pts[3][1] + 20 * zoom, Math.floor(now / 45) * 7, 8 * zoom).slice(0, 5);
        strokePath(br, `rgba(${f.col},${0.7 * (1 - p)})`, 1.5 * dpr);
        glowAt(x2, y2, 30 * zoom, f.col, 0.6 * (1 - p));
        ctx.restore();
      } else if (f.kind === 'meteor') {
        // bola de fogo caindo em diagonal até o ponto de impacto
        const [x2, y2] = toScreen(f.x, f.y), x = x2 - (1 - p) * 70 * zoom, y = y2 - (1 - p) * 150 * zoom;
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        for (let k = 5; k >= 0; k--) { const q = k * 0.06; glowAt(x - q * 70 * zoom, y - q * 150 * zoom, (10 - k) * zoom, k ? '255,120,30' : '255,230,160', 0.5 - k * 0.07); }
        ctx.restore();
        puff(f.x - (1 - p) * 70, f.y - (1 - p) * 150, { vx: (Math.random() - 0.5) * 10, vy: -10, life: 0.4, col: ['#ff4d1f', '#ffb02e', '#ffd36b'][(Math.random() * 3) | 0], s: 2, drag: 1 });
      } else if (f.kind === 'slash') {
        // arco luminoso do golpe de espada, do lado do alvo
        const [ax, ay] = center(f.from), dir = f.at.rx >= f.from.rx ? 1 : -1;
        const [x, y] = toScreen(ax + dir * 8, ay);
        const r = 22 * zoom, a0 = -1.9 + p * 0.6, a1 = a0 + 2.6 * Math.min(1, p * 2.2);
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.translate(x, y); ctx.scale(dir, 0.65);
        for (let k = 0; k < 3; k++) {
          ctx.strokeStyle = `rgba(${f.col},${(1 - p) * (k === 0 ? 0.95 : 0.35 / k)})`; ctx.lineWidth = (k === 0 ? 2.5 : 6 + k * 4) * dpr;
          ctx.beginPath(); ctx.arc(0, 0, r - k * 2 * dpr, a0, a1); ctx.stroke();
        }
        ctx.restore();
      } else if (f.kind === 'star') {
        // estrela branca rápida no golpe crítico
        const [cx, cy] = center(f.at); const [x, y] = toScreen(cx, cy), L = (10 + p * 16) * zoom, a = 1 - p;
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = `rgba(255,250,220,${a})`;
        const t2 = Math.max(1, Math.round(dpr * 1.5));
        ctx.fillRect(x - L, y - t2, L * 2, t2 * 2); ctx.fillRect(x - t2, y - L * 0.8, t2 * 2, L * 1.6);
        glowAt(x, y, L * 0.9, '255,230,160', 0.5 * a);
        ctx.restore();
      } else if (f.kind === 'pillar') {
        // coluna de luz (level up / derrota de boss)
        const [x, y] = toScreen(f.at.rx, f.at.ry), a = Math.min(1, p * 6) * (1 - p), w = f.w * zoom * (1 - p * 0.4), h = 130 * zoom;
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        const gr = ctx.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
        gr.addColorStop(0, `rgba(${f.col},0)`); gr.addColorStop(0.5, `rgba(${f.col},${0.55 * a})`); gr.addColorStop(1, `rgba(${f.col},0)`);
        ctx.fillStyle = gr; ctx.fillRect(x - w / 2, y - h, w, h);
        ctx.fillStyle = `rgba(255,255,255,${0.5 * a})`; ctx.fillRect(Math.round(x - w * 0.08), y - h, Math.max(1, Math.round(w * 0.16)), h);
        glowAt(x, y, w * 1.6, f.col, 0.5 * a);
        ctx.restore();
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
    const p = Math.max(0, (now - c.t0) / 500); if (p >= 1) { S.clickMark = null; return; }
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

  // ================= PvP no cliente (só para a interface; o servidor decide) =================
  function hostileTo(p) {
    if (!S.me || !p || !p.info || p.dead || p.id === S.youId) return false;
    if (S.duel && S.duel.with === p.id) return true;
    if (!S.map || S.map.safe) return false;
    const pvpMap = S.data.world.find((w) => w.id === S.map.map && w.pvp);
    if (pvpMap) return true;
    return !!S.me.pvpOn && !!(p.flags & 4);
  }
  function hostileList() {
    const me = S.players.get(S.youId); if (!me) return [];
    const out = [];
    S.players.forEach((p, id) => { p.id = id; if (hostileTo(p)) out.push(p); });
    return out.sort((a, b) => Math.hypot(a.rx - me.rx, a.ry - me.ry) - Math.hypot(b.rx - me.rx, b.ry - me.ry));
  }
  function cycleTarget() {
    const list = hostileList();
    if (!list.length) { feed('Nenhum jogador inimigo por perto.', 'warn'); return; }
    const cur = list.findIndex((p) => p.id === (S.me && S.me.target));
    const next = list[(cur + 1) % list.length];
    send({ type: 'target', id: next.id });
    S.clickMark = { x: next.rx, y: next.ry, t0: performance.now() };
  }

  // ================= toque / clique no mapa =================
  cv.addEventListener('pointerdown', (ev) => {
    ev.preventDefault(); // sem destaque/seleção do navegador ao tocar no mapa
    if (!S.map || !S.me || S.me.dead) return;
    if (S.panel && window.innerWidth < 700) closePanel();
    let wx = camX + ev.clientX * dpr / zoom, wy = camY + ev.clientY * dpr / zoom;
    if (is3d) { const p = W3().pick(ev.clientX, ev.clientY); if (!p) return; wx = p[0]; wy = p[1]; }
    // itens no chão
    if (S.gitems && S.gitems.size) {
      let best = null, bd = 16;
      for (const g of S.gitems.values()) { const d = Math.hypot(g.x - wx, g.y - 10 - wy); if (d < bd) { bd = d; best = g; } }
      if (best) {
        if (best.owner === S.youId) send({ type: 'pickup', gid: best.gid });
        else feed(`Este item é de ${best.ownerName}.`, 'warn');
        return;
      }
    }
    // NPCs (loja e Chaos Goblin)
    for (const n of S.map.npcs || []) {
      if (Math.hypot(n.x - wx, n.y - 10 - wy) < 16) {
        if (n.kind === 'sevina' || n.kind === 'marlon') { CQ.npc = n.kind; openPanel('cquest'); return; }
        if (n.kind === 'guild') { openPanel('guild'); return; }
        if (n.kind === 'vault') { if (S.panel !== 'vault') openPanel('vault'); return; }
        if (n.kind === 'smith') { if (S.panel !== 'smith') openPanel('smith'); return; }
        if (n.kind === 'teleport') { openPanel('maps'); return; }
        if (n.kind === 'castle_guard' || n.kind === 'charon') { AR.kind = n.kind === 'charon' ? 'devil' : 'castle'; if (S.panel === 'arena') renderPanel('arena'); else openPanel('arena'); send({ type: 'arena', action: 'info', kind: AR.kind }); return; }
        openPanel(n.kind === 'chaos' ? 'chaos' : 'shop'); return;
      }
    }
    // tocar num jogador abre o cartão (atacar / duelo)
    let pl = null, pd = 14;
    S.players.forEach((p, id) => {
      if (id === S.youId || !p.info || p.dead) return;
      const d = Math.hypot(p.rx - wx, p.ry - 14 - wy);
      if (d < pd) { pd = d; pl = p; }
    });
    if (pl) {
      // inimigo: ataca na hora; outros: abre o cartão (duelo)
      const pid = [...S.players.entries()].find(([, v]) => v === pl)[0]; pl.id = pid;
      if (hostileTo(pl)) { send({ type: 'target', id: pid }); S.clickMark = { x: pl.rx, y: pl.ry, t0: performance.now() }; return; }
      openPlayerCard(pl); return;
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
    const el = $(fill), pct = max ? Math.max(0, Math.min(100, v / max * 100)) : 0;
    el.style.width = `${pct}%`;
    // rastro de dano: a parte perdida fica clara e escorrega devagar
    const bar = el.parentElement;
    if (bar && bar.classList.contains('gbar')) {
      let gh = bar.querySelector('.ghost');
      if (!gh) { gh = document.createElement('i'); gh.className = 'ghost'; bar.insertBefore(gh, el); gh.style.width = `${pct}%`; gh._p = pct; }
      if (pct < gh._p) { gh.classList.add('slow'); } else gh.classList.remove('slow');
      if (pct !== gh._p) { gh.style.width = `${pct}%`; gh._p = pct; }
      if (bar.classList.contains('hp')) bar.classList.toggle('low', pct > 0 && pct < 25);
    }
    $(text).textContent = label || `${fmt.format(Math.max(0, Math.round(v)))}/${fmt.format(max)}`;
  }
  function renderHud() {
    const me = S.me; if (!me) return;
    const area = S.map && S.map.training && S.map.training.area;
    const inTraining = !!(area && Number.isFinite(me.x) && Number.isFinite(me.y) && me.x >= area.x && me.x <= area.x + area.w && me.y >= area.y && me.y <= area.y + area.h);
    $('#training-hud').hidden = !inTraining;
    if (inTraining && !S.trainingInside) alertBanner('ÁREA DE TREINAMENTO — NÓRIA · Nível recomendado: 1–10');
    S.trainingInside = inTraining;
    const target = me.target && S.monsters.get(me.target);
    const targetHud = $('#target-hud');
    if (target && !target.dead) {
      targetHud.hidden = false;
      targetHud.innerHTML = `<b>${esc(target.name)} · Nv. ${target.level}</b><br><span>HP ${fmt.format(Math.max(0, target.hp))}/${fmt.format(target.maxHp)} · EXP ${fmt.format(target.exp || 0)} · Ataque ${target.dmgMin}–${target.dmgMax} · Defesa ${target.defense}</span>`;
    } else targetHud.hidden = true;
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
    const headingToTraining = !!(me.auto && area && S.map && S.map.safe && !inTraining);
    $('#auto-state').textContent = me.auto ? (inTraining ? 'treinando' : headingToTraining ? 'indo à área' : S.map && S.map.safe && !(S.monsters.size && !area) ? 'na cidade' : 'lutando') : 'desligado';
    $('#pts-badge').hidden = !(me.free > 0);
    const pb = $('#btn-pvp');
    pb.setAttribute('aria-pressed', !!me.pvpOn);
    const pvpMapNow = S.map && S.data.world.find((w) => w.id === S.map.map && w.pvp);
    $('#pvp-state').textContent = pvpMapNow ? 'zona PvP' : me.pvpOn ? (S.map && S.map.safe ? 'na cidade' : 'ligado') : 'desligado';
    const hl = hostileList();
    $('#btn-ptarget').hidden = !(me.pvpOn || pvpMapNow || S.duel);
    $('#ptarget-n').textContent = hl.length ? `${hl.length} perto` : 'nenhum';
    // recargas
    $$('#skills .act.skill[data-id]').forEach((b) => {
      const cd = me.cds[b.dataset.id] || 0, total = Number(b.dataset.cd) || 1;
      b.querySelector('.cd').style.height = `${Math.min(100, cd / total * 100)}%`;
      // brilho rápido quando um poder de recarga longa fica pronto
      if (b._cd > 0 && cd <= 0 && total >= 2000) { b.classList.remove('ready-flash'); void b.offsetWidth; b.classList.add('ready-flash'); }
      b._cd = cd;
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
    setTimeout(() => el.remove(), cls === 'chat-toast' ? 15000 : 6200);
  }

  // ================= ficha do personagem =================
  function renderChar() {
    const c = S.char;
    $('#me-name').textContent = c.name;
    const meP = S.players.get(S.youId) || { rx: null };
    meP.info = { id: c.id, name: c.name, cls: c.cls, ap: c.ap, level: c.level, weaponRarity: (c.items.find((i) => i.equipped && i.slot === 'weapon') || {}).rarity, vip: c.vip ? c.vip.tier : 0,
      eq: (() => {
        // igual ao gearVisual do servidor (o brilho/aura do 3D usa o nível médio, Excellent e Ancient)
        const o = { w: null }; let plus = 0, exc = 0; const sets = {};
        for (const i of c.items) {
          if (!i.equipped) continue;
          if (i.slot === 'weapon') { o.w = i.base; o.wr = i.rarity; o.wp = i.plus || 0; if (i.excellent) o.we = 1; }
          else if (i.slot === 'wings') { o.wings = i.base; o.wingRarity = i.rarity; o.wingPlus = i.plus || 0; }
          else if (['helm', 'armor', 'pants', 'gloves', 'boots'].includes(i.slot)) {
            if (i.set && Sprites.ARMOR.includes(i.slot)) o[i.slot] = i.set;
            plus += i.plus || 0; if (i.excellent) exc++; if (i.set) sets[i.set] = (sets[i.set] || 0) + 1;
          }
        }
        const lvl = Math.floor(plus / 5); if (lvl) o.ap = lvl; if (exc) o.ax = exc;
        if (Object.entries(sets).some(([k, n]) => n >= 4 && S.data && S.data.sets[k] && S.data.sets[k].seasonal)) o.anc = 1;
        return o;
      })() };
    S.players.set(S.youId || c.id, meP);
    renderSkills();
    if (S.panel === 'chaos') { clearTimeout(CH.t); CH.t = setTimeout(() => send({ type: 'chaosInfo' }), 250); }
    if (S.panel && S.panel !== 'rank' && S.panel !== 'chaos') renderPanel(S.panel);
    if (TR.s) renderTrade();
  }

  // nome completo no computador, primeira palavra no celular
  const skLabel = (n) => { const nm = window.I18N ? I18N.t(n) : n; return `<span class="sk-full">${esc(nm)}</span><span class="sk-short">${esc(nm.split(' ')[0])}</span>`; };
  function renderSkills() {
    const box = $('#skills');
    box.innerHTML = '';
    for (const def of S.char.allSkills) {
      const sk = S.char.skills.find((x) => x.id === def.id);
      if (!sk && def.evo) continue; // poderes de evolução aparecem quando liberados
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
    if (name === 'smith') { SM.result = null; send({ type: 'smith', action: 'info', id: SM.sel }); }
    if (name !== 'bag') S.jewelSel = null;
    if (name === 'vault') { VT.sel = null; vaultSend({ action: 'open', no: VT.no }); }
    if (name === 'chat') { S.chatUnread = 0; $('#chat-badge').hidden = true; setTimeout(() => { const l = $('#chat-lines'); l.scrollTop = l.scrollHeight; }, 0); }
    renderPanel(name);
  }
  function closePanel() {
    if (!S.panel) return;
    if (S.panel === 'admin') ADM.open = false;
    $(`#panel-${S.panel}`).hidden = true;
    S.panel = null;
    $$('.menu [data-panel]').forEach((b) => b.setAttribute('aria-expanded', 'false'));
  }
  function renderPanel(name) {
    if (!S.char) return;
    if (name === 'bag') renderBag();
    else if (name === 'hero') { send({ type: 'resetStatus' }); renderHero(); }
    else if (name === 'maps') renderMaps();
    else if (name === 'shop') renderShop();
    else if (name === 'config') renderConfig();
    else if (name === 'quests') renderQuests();
    else if (name === 'rank') renderRank();
    else if (name === 'chaos') { renderChaos(); send({ type: 'chaosInfo' }); }
    else if (name === 'vault') renderVault();
    else if (name === 'market') { MK.msg = null; mkLoad(MK.tab); send({ type: 'market', action: 'wallet' }); renderMarket(); }
    else if (name === 'arena') renderArena();
    else if (name === 'smith') renderSmith();
    else if (name === 'cquest') { renderCQ(); send({ type: 'cqInfo', npc: CQ.npc }); }
    else if (name === 'guild') send({ type: 'social', area: 'guild', action: 'info' });
    else if (name === 'admin') { if (!ADM.open) { ADM.open = true; renderAdmin(); } }
  }
  $$('.menu [data-panel]').forEach((b) => { b.onclick = () => openPanel(b.dataset.panel); });
  $$('.panel [data-close]').forEach((b) => { b.onclick = closePanel; });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePanel(); });

  // aviso de novidade: Mercado de players com dinheiro real (aparece ao entrar no jogo, some em 15 s)
  let mkNoticeShown = false;
  function marketNotice() {
    if (mkNoticeShown) return;
    mkNoticeShown = true;
    setTimeout(() => {
      const n = document.createElement('div');
      n.className = 'mk-notice'; n.setAttribute('role', 'status'); n.setAttribute('aria-live', 'polite');
      n.innerHTML = `<div class="mk-notice-ico" aria-hidden="true">💰</div>
        <div class="mk-notice-txt"><b>Mercado de players ATIVO com dinheiro real!</b>
        <span>Venda seus itens por <em>R$</em> ou <em>US$</em> e receba de verdade, ou compre direto de outros jogadores. O item chega na hora na bolsa.</span></div>
        <div class="mk-notice-act"><button type="button" class="btn small btn-gold" data-open>Abrir Mercado</button><button type="button" class="mk-notice-x" data-x aria-label="Fechar aviso">×</button></div>
        <i class="mk-notice-bar" aria-hidden="true"></i>`;
      document.body.appendChild(n);
      requestAnimationFrame(() => n.classList.add('show'));
      const close = () => { if (!n.isConnected) return; n.classList.remove('show'); n.classList.add('hide'); setTimeout(() => n.remove(), 400); };
      const timer = setTimeout(close, 15000);
      n.querySelector('[data-x]').onclick = () => { clearTimeout(timer); close(); };
      n.querySelector('[data-open]').onclick = () => { clearTimeout(timer); close(); MK.tab = 'browse'; MK.cur = 'brl'; if (S.panel !== 'market') openPanel('market'); };
    }, 1600);
  }

  // ================= mercado entre jogadores (Zen, R$ e US$) =================
  const MK = { tab: 'browse', data: null, q: '', cat: '', rarity: '', sort: 'asc', page: 0, sel: null, busy: false, msg: null, listed: false, cur: 'zen', sellCur: 'zen', stripe: null, wallet: null, pix: null };
  const mkMoney = (v, cur) => (cur === 'brl' ? 'R$ ' + (v / 100).toFixed(2).replace('.', ',') : cur === 'usd' ? 'US$ ' + (v / 100).toFixed(2) : `${fmt.format(v)} Zen`);
  const mkSend = (o) => { MK.busy = true; send({ type: 'market', ...o }); };
  const CUR_LABEL = { zen: 'Zen', brl: 'R$ (Real)', usd: 'US$ (Dólar)' };
  function mkFilters() { return { q: MK.q, cat: MK.cat, rarity: MK.rarity, sort: MK.sort, page: MK.page, cur: MK.cur }; }
  function mkLoad(tab) {
    if (tab === 'browse') mkSend({ action: 'browse', ...mkFilters() });
    else if (tab === 'mine') mkSend({ action: 'mine' });
    else if (tab === 'sell') { send({ type: 'market', action: 'stripeStatus' }); send({ type: 'market', action: 'wallet' }); }
  }
  function mkMsg(text, ok) { MK.msg = text ? { text, ok } : null; }
  function mkBadge(rows) { const n = (rows || []).filter((r) => r.status !== 'active' && r.status !== 'reserved' && !r.collected).length + (rows || []).filter((r) => r.status === 'reserved' && r.mode === 'pix').length; const b = $('#mk-badge'); if (b) { b.hidden = !n; b.textContent = n || ''; } }
  function mkIcon(it) { const d = document.createElement('div'); d.className = 'ic'; d.style.setProperty('--r', RAR[it.rarity]); d.appendChild(iconCanvas(it)); d.onclick = () => openItemInfo(it, 'market'); return d; }
  function mkBtn(label, cls, fn, off) { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn small ' + (cls || ''); b.textContent = label; b.disabled = MK.busy || !!off; b.onclick = fn; return b; }
  function mkRow(r, right) {
    const row = document.createElement('div'); row.className = 'mk-row' + (r.status && r.status !== 'active' && r.status !== 'reserved' ? ' done' : '');
    const it = r.item;
    row.appendChild(mkIcon(it));
    if (r.price) tipBind(row.querySelector('canvas'), it, { price: 'Preço no mercado: ' + mkMoney(r.price, r.cur) });
    const nm = document.createElement('div'); nm.className = 'nm';
    nm.innerHTML = `<b style="color:${RAR[it.rarity]}">${esc(it.name)}${it.plus ? ' +' + it.plus : ''}${it.qty > 1 ? ' ×' + fmt.format(it.qty) : ''}</b><small>${RAR_NAME[it.rarity] || ''}${it.excellent ? ' · Excellent' : ''}${it.req ? ' · Nv. ' + it.req : ''} · ${right.sub}</small>`;
    row.appendChild(nm);
    const pr = document.createElement('div'); pr.className = 'pr'; pr.innerHTML = `<b class="${r.cur === 'zen' ? '' : 'brl'}">${mkMoney(r.price, r.cur)}</b>`;
    for (const bt of right.btns || (right.btn ? [{ label: right.btn, cls: right.cls, fn: right.fn, off: right.off }] : [])) pr.appendChild(mkBtn(bt.label, bt.cls, bt.fn, bt.off));
    row.appendChild(pr);
    return row;
  }
  const mkLeft = (ms) => { const h = Math.max(0, Math.round((ms - Date.now()) / 3600000)); return h >= 1 ? `${h}h` : `${Math.max(1, Math.round((ms - Date.now()) / 60000))} min`; };
  const payHow = (r) => (r.cur === 'zen' ? '' : r.mode === 'pix' ? ' · Pix' : r.mode === 'platform' ? ' · cartão' : ' · cartão');
  // aviso de comissão / bloqueio, mostrado em todas as abas
  function walletBanner(body) {
    const w = MK.wallet; if (!w) return;
    if (!w.blocked && w.dueBrl < w.limit && !w.usdOwed) return;
    const b = document.createElement('div'); b.className = 'mk-sell mk-wallet' + (w.blocked ? ' bad' : '');
    const parts = [];
    if (w.blocked) parts.push(`<b>Conta BLOQUEADA no mercado e nas trocas</b>${w.blockNote ? ` (${esc(w.blockNote)})` : ''}.`);
    if (w.dueBrl > 0) parts.push(`Comissão pendente: <b>${mkMoney(w.dueBrl, 'brl')}</b>${!w.blocked && w.dueBrl >= w.limit && w.deadline ? ` · pague até ${new Date(w.deadline).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} para não ser bloqueado` : ''}.`);
    if (w.usdOwed > 0) parts.push(`Seu saldo de vendas em dólar: <b>${mkMoney(w.usdOwed, 'usd')}</b> (o administrador faz o pagamento${w.payoutInfo ? '' : ' — cadastre como quer receber na aba Vender → US$'}).`);
    b.innerHTML = `<div class="row"><span>${parts.join(' ')}</span>${w.dueBrl >= w.limit || (w.blocked && w.dueBrl > 0) ? '<button class="btn btn-gold small" type="button" id="mk-paynow">Pagar comissão</button>' : ''}</div>`;
    body.appendChild(b);
    setTimeout(() => { const pb = $('#mk-paynow'); if (pb) pb.onclick = () => mkSend({ action: 'payNow' }); }, 0);
  }
  function renderMarket() {
    $$('.mk-tabs [data-mk]').forEach((b) => { b.classList.toggle('active', b.dataset.mk === MK.tab); b.setAttribute('aria-selected', b.dataset.mk === MK.tab); b.onclick = () => { MK.tab = b.dataset.mk; MK.msg = null; mkLoad(MK.tab); renderMarket(); }; });
    $('#market-zen').textContent = S.char ? `· ${fmt.format(S.me ? S.me.zen ?? S.char.zen : S.char.zen)} Zen` : '';
    const msg = $('#mk-msg'); msg.hidden = !MK.msg; if (MK.msg) { msg.textContent = MK.msg.text; msg.classList.toggle('bad', !MK.msg.ok); }
    const body = $('#market-body'); body.innerHTML = '';
    walletBanner(body);
    // instruções do Pix logo depois de reservar
    if (MK.pix) {
      const px = MK.pix, pb = document.createElement('div'); pb.className = 'mk-sell mk-pix';
      pb.innerHTML = `<b>Pague ${mkMoney(px.amount, 'brl')} no Pix de ${esc(px.seller)}</b><div class="row"><code class="pix-key">${esc(px.key)}</code><button class="btn small" type="button" id="mk-pixcopy">Copiar chave</button></div>
        <p class="muted" style="margin:0">Item: ${esc(px.item)}. Depois de pagar, toque em "Já paguei". O item chega na sua bolsa quando o vendedor confirmar (reservado por ${px.hours} h).</p>
        <div class="row"><button class="btn btn-gold small" type="button" id="mk-pixpaid">Já paguei</button><button class="btn small" type="button" id="mk-pixclose">Fechar</button></div>`;
      body.appendChild(pb);
      setTimeout(() => {
        $('#mk-pixcopy').onclick = () => { try { navigator.clipboard.writeText(px.key); mkMsg('Chave Pix copiada.', true); } catch (_) { /* sem área de transferência */ } renderMarket(); };
        $('#mk-pixpaid').onclick = () => { MK.pix = null; mkSend({ action: 'pixPaid', id: px.id }); };
        $('#mk-pixclose').onclick = () => { MK.pix = null; renderMarket(); };
      }, 0);
    }
    const d = MK.data && MK.data.view === MK.tab && (MK.tab !== 'browse' || (MK.data.cur || 'zen') === MK.cur) ? MK.data : null;
    if (MK.tab === 'browse') {
      const cs = document.createElement('div'); cs.className = 'mk-cur';
      cs.innerHTML = ['zen', 'brl', 'usd'].map((c) => `<button type="button" data-cur="${c}" class="${MK.cur === c ? 'on' : ''}">Itens por ${CUR_LABEL[c]}</button>`).join('');
      body.appendChild(cs);
      $$('[data-cur]', cs).forEach((b) => { b.onclick = () => { MK.cur = b.dataset.cur; MK.page = 0; MK.data = null; mkLoad('browse'); renderMarket(); }; });
      const f = document.createElement('div'); f.className = 'mk-filters';
      f.innerHTML = `<input type="search" id="mk-q" placeholder="Procurar item…" value="${esc(MK.q)}" maxlength="40">
        <select id="mk-cat"><option value="">Tudo</option><option value="weapon">Armas</option><option value="armor">Armaduras</option><option value="jewelry">Anéis e colares</option><option value="wings">Asas</option><option value="material">Joias e materiais</option><option value="other">Outros</option></select>
        <select id="mk-rar"><option value="">Qualquer raridade</option>${RAR_ORDER.map((r) => `<option value="${r}">${RAR_NAME[r]}</option>`).join('')}</select>
        <select id="mk-sort"><option value="asc">Mais barato</option><option value="desc">Mais caro</option><option value="new">Mais novo</option></select>`;
      body.appendChild(f);
      $('#mk-cat').value = MK.cat; $('#mk-rar').value = MK.rarity; $('#mk-sort').value = MK.sort;
      const go = () => { MK.q = $('#mk-q').value.trim(); MK.cat = $('#mk-cat').value; MK.rarity = $('#mk-rar').value; MK.sort = $('#mk-sort').value; MK.page = 0; mkLoad('browse'); };
      let tq = null; $('#mk-q').oninput = () => { clearTimeout(tq); tq = setTimeout(go, 400); };
      ['#mk-cat', '#mk-rar', '#mk-sort'].forEach((k) => { $(k).onchange = go; });
      const list = document.createElement('div'); list.className = 'mk-list';
      if (!d) list.innerHTML = '<p class="mk-empty">Carregando…</p>';
      else if (!d.rows.length) list.innerHTML = '<p class="mk-empty">Nenhum item à venda com esses filtros.</p>';
      else d.rows.forEach((r) => {
        const own = S.char && ('p' + r.sellerId === String(S.char.id) || r.sellerId === String(S.char.id));
        list.appendChild(mkRow(r, { sub: `${esc(r.seller)} · ${mkLeft(r.expires)}${payHow(r)}`, btn: own ? 'Seu' : 'Comprar', cls: 'btn-gold', off: own, fn: () => {
          const name = `${esc(r.item.name)}${r.item.plus ? ' +' + r.item.plus : ''}`;
          if (r.cur !== 'zen' && r.mode === 'pix') tradeDialog(`<h3>Comprar ${name} por Pix?</h3><p>Preço: <b style="color:#9affd0">${mkMoney(r.price, 'brl')}</b> · vendedor ${esc(r.seller)}</p><p class="muted">Você paga direto no Pix do vendedor. O item fica reservado para você e chega na sua bolsa quando ele confirmar que recebeu.</p>`,
            [{ label: 'Comprar por Pix', cls: 'btn-gold', fn: () => mkSend({ action: 'buy', id: r.id, price: r.price }) }, { label: 'Cancelar' }]);
          else if (r.cur !== 'zen') tradeDialog(`<h3>Comprar ${name} com dinheiro real?</h3><p>Preço: <b style="color:#9affd0">${mkMoney(r.price, r.cur)}</b> · vendedor ${esc(r.seller)}</p><p class="muted">Você vai para a página segura do Stripe pagar com cartão. O item fica reservado por 30 minutos e chega na sua bolsa sozinho assim que o pagamento for confirmado.</p>`,
            [{ label: 'Pagar com cartão', cls: 'btn-gold', fn: () => mkSend({ action: 'buy', id: r.id, price: r.price }) }, { label: 'Cancelar' }]);
          else tradeDialog(`<h3>Comprar ${name}?</h3><p>Preço: <b style="color:#ffd36b">${fmt.format(r.price)} Zen</b> · vendedor ${esc(r.seller)}</p>`,
            [{ label: 'Comprar', cls: 'btn-gold', fn: () => mkSend({ action: 'buy', id: r.id, price: r.price, back: mkFilters() }) }, { label: 'Cancelar' }]);
        } }));
      });
      body.appendChild(list);
      if (d && (d.page > 0 || d.more)) {
        const pg = document.createElement('div'); pg.className = 'mk-pager';
        pg.innerHTML = `<button class="btn small" type="button" id="mk-prev" ${d.page > 0 ? '' : 'disabled'}>‹ Anterior</button><span class="muted">Página ${d.page + 1}</span><button class="btn small" type="button" id="mk-next" ${d.more ? '' : 'disabled'}>Próxima ›</button>`;
        body.appendChild(pg);
        $('#mk-prev').onclick = () => { MK.page = Math.max(0, MK.page - 1); mkLoad('browse'); };
        $('#mk-next').onclick = () => { MK.page++; mkLoad('browse'); };
      }
    } else if (MK.tab === 'sell') {
      const bag = (S.char ? S.char.items : []).filter((i) => !i.equipped && !i.locked && i.slot !== 'quest');
      if (MK.sel && !bag.some((i) => i.id === MK.sel)) MK.sel = null;
      const grid = document.createElement('div'); grid.className = 'mk-bag';
      bag.forEach((it) => { const b = slotButton(it, () => { MK.sel = it.id; renderMarket(); }); if (it.id === MK.sel) b.classList.add('sel'); grid.appendChild(b); });
      if (!bag.length) grid.innerHTML = '<p class="muted" style="grid-column:1/-1">Nenhum item da bolsa pode ser vendido agora.</p>';
      const cs = document.createElement('div'); cs.className = 'mk-cur';
      cs.innerHTML = ['zen', 'brl', 'usd'].map((c) => `<button type="button" data-scur="${c}" class="${MK.sellCur === c ? 'on' : ''}">Vender em ${CUR_LABEL[c]}</button>`).join('');
      body.appendChild(cs);
      $$('[data-scur]', cs).forEach((b) => { b.onclick = () => { MK.sellCur = b.dataset.scur; if (MK.sellCur !== 'zen') mkLoad('sell'); renderMarket(); }; });
      const cur = MK.sellCur, real = cur !== 'zen', st = MK.stripe, w = MK.wallet;
      let mode = cur === 'zen' ? 'zen' : cur === 'usd' ? 'platform' : null;
      if (real && w && w.blocked) { body.insertAdjacentHTML('beforeend', '<p class="mk-empty">Sua conta está bloqueada: pague a comissão pendente para voltar a vender.</p>'); return; }
      if (cur === 'brl') {
        const sb = document.createElement('div'); sb.className = 'mk-sell mk-stripe';
        if (!st || !w) sb.innerHTML = '<p class="muted" style="margin:0">Verificando suas formas de recebimento…</p>';
        else if (st.enabled && st.ready) { mode = 'connect'; sb.innerHTML = `<div class="row"><span>✔ Conta Stripe conectada (${esc(st.countries[st.country] || st.country)}). Cada venda cai direto na sua conta; o jogo desconta 10% na hora.</span><button class="btn small" type="button" id="mk-dash">Ver meus recebimentos</button></div>`; }
        else {
          if (w.pixKey) mode = 'pix';
          sb.innerHTML = `<p style="margin:0"><b>Receber por Pix:</b> o comprador paga direto na sua chave Pix e você confirma no jogo. A comissão de 10% vai acumulando; quando chegar a ${mkMoney(w.limit, 'brl')} você recebe um link para pagar (prazo de ${w.graceH} h, senão a conta é bloqueada no mercado e nas trocas).</p>
            <div class="row"><input id="mk-pixkey" maxlength="120" placeholder="Sua chave Pix (CPF, e-mail, telefone ou aleatória)" value="${esc(w.pixKey)}"><button class="btn small" type="button" id="mk-pixsave">Salvar chave</button></div>
            ${st.enabled ? `<p class="muted" style="margin:0">Ou conecte uma conta Stripe para receber por cartão com a comissão descontada automaticamente${st.connected ? ' (seu cadastro ainda não terminou)' : ''}:</p>
            <div class="row">${st.connected ? '' : `<select id="mk-country">${Object.entries(st.countries).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select>`}<button class="btn small" type="button" id="mk-connect">${st.connected ? 'Continuar cadastro no Stripe' : 'Conectar conta Stripe'}</button>${st.connected ? '<button class="btn small" type="button" id="mk-recheck">Verificar de novo</button>' : ''}</div>` : ''}`;
        }
        body.appendChild(sb);
      } else if (cur === 'usd') {
        const sb = document.createElement('div'); sb.className = 'mk-sell mk-stripe';
        if (!w || !st) sb.innerHTML = '<p class="muted" style="margin:0">Carregando…</p>';
        else if (!st.enabled) { mode = null; sb.innerHTML = '<p style="margin:0">As vendas em dólar ainda não estão ligadas no servidor.</p>'; }
        else sb.innerHTML = `<p style="margin:0"><b>Venda em dólar:</b> o comprador paga com cartão no Stripe do jogo e recebe o item na hora. Você fica com 90% no seu saldo em dólar e o administrador faz o pagamento.</p>
          <div class="row"><input id="mk-payout" maxlength="200" placeholder="Como quer receber (PayPal, Wise, Pix…) e o endereço" value="${esc(w.payoutInfo)}"><button class="btn small" type="button" id="mk-payoutsave">Salvar</button></div>`;
        body.appendChild(sb);
      }
      setTimeout(() => {
        const c = $('#mk-connect'); if (c) c.onclick = () => { const sel = $('#mk-country'); mkSend({ action: 'stripeConnect', country: sel ? sel.value : '' }); };
        const d2 = $('#mk-dash'); if (d2) d2.onclick = () => mkSend({ action: 'stripeDashboard' });
        const rc = $('#mk-recheck'); if (rc) rc.onclick = () => { MK.stripe = null; send({ type: 'market', action: 'stripeStatus' }); renderMarket(); };
        const ps = $('#mk-pixsave'); if (ps) ps.onclick = () => mkSend({ action: 'setInfo', pixKey: $('#mk-pixkey').value });
        const po = $('#mk-payoutsave'); if (po) po.onclick = () => mkSend({ action: 'setInfo', payoutInfo: $('#mk-payout').value });
      }, 0);
      if (!mode) return;
      const minC = cur === 'brl' ? (st ? st.min : 500) : cur === 'usd' ? (w ? w.usdMin : 100) : 1;
      body.insertAdjacentHTML('beforeend', `<p class="muted" style="margin:0 0 6px">Escolha um item da bolsa e o preço em ${CUR_LABEL[cur]}. O item fica guardado no anúncio por 48 horas; a comissão do mercado é 10% da venda.</p>`);
      body.appendChild(grid);
      const it = bag.find((i) => i.id === MK.sel);
      const box = document.createElement('div'); box.className = 'mk-sell';
      if (!it) box.innerHTML = '<p class="muted" style="margin:0">Toque em um item acima.</p>';
      else {
        box.innerHTML = `<div class="row"><b style="color:${RAR[it.rarity]}">${esc(it.name)}${it.plus ? ' +' + it.plus : ''}</b><button class="btn small btn-ghost" type="button" id="mk-info">Detalhes</button></div>
          <div class="row">${it.stack ? `<label>Qtd. <input type="number" id="mk-qty" min="1" max="${it.qty}" value="${it.qty}" style="width:90px"></label>` : ''}<input type="number" id="mk-price" min="${real ? minC / 100 : 1}" step="${real ? '0.01' : '1'}" placeholder="${real ? `Preço em ${cur === 'brl' ? 'R$' : 'US$'} (mín. ${mkMoney(minC, cur)})` : 'Preço em Zen'}" inputmode="${real ? 'decimal' : 'numeric'}">
          <button class="btn btn-gold" type="button" id="mk-list">Anunciar</button></div><p class="mk-sum" id="mk-sum">Coloque o preço para ver quanto você recebe.</p>`;
        const val = () => (real ? Math.round(Number(String($('#mk-price').value).replace(',', '.')) * 100) : Math.floor(Number($('#mk-price').value)));
        const sum = () => {
          const v = val(); const fee = real ? Math.max(1, Math.round(v * 0.1)) : Math.floor(v * 0.1);
          const where = mode === 'connect' ? ' na sua conta Stripe' : mode === 'pix' ? ' no seu Pix' : mode === 'platform' ? ' no seu saldo em dólar' : '';
          $('#mk-sum').innerHTML = v > 0 ? (mode === 'pix' ? `Preço ${mkMoney(v, cur)} · você recebe <b>${mkMoney(v, cur)}</b> no seu Pix e fica devendo a comissão de ${mkMoney(fee, cur)}`
            : `Preço ${mkMoney(v, cur)} · comissão 10%: ${mkMoney(fee, cur)} · você recebe <b>${mkMoney(v - fee, cur)}</b>${where}`) : 'Coloque o preço para ver quanto você recebe.';
        };
        setTimeout(() => {
          $('#mk-price').oninput = sum;
          $('#mk-info').onclick = () => openItemInfo(it, 'market');
          $('#mk-list').onclick = () => {
            const price = val(); const qty = $('#mk-qty') ? Math.floor(Number($('#mk-qty').value)) : 1;
            if (!(price > 0)) { mkMsg('Coloque um preço.', false); renderMarket(); return; }
            MK.listed = true; mkSend({ action: 'list', item: it.id, price, qty, cur });
          };
        }, 0);
      }
      body.appendChild(box);
    } else {
      const list = document.createElement('div'); list.className = 'mk-list';
      const rows = d ? d.rows : null;
      // compras por Pix esperando o vendedor
      if (d && d.buying && d.buying.length) {
        const bx = document.createElement('div'); bx.className = 'mk-list'; bx.style.marginBottom = '8px';
        bx.insertAdjacentHTML('beforeend', '<p class="muted" style="margin:0">Suas compras por Pix esperando o vendedor confirmar:</p>');
        d.buying.forEach((r) => bx.appendChild(mkRow(r, { sub: `Pix: <code>${esc(r.pixKey || '')}</code> · ${esc(r.seller)}${r.paid ? ' · você avisou que pagou' : ''}`,
          btns: [...(r.paid ? [] : [{ label: 'Já paguei', cls: 'btn-gold', fn: () => mkSend({ action: 'pixPaid', id: r.id }) }]), { label: 'Cancelar', fn: () => mkSend({ action: 'pixCancel', id: r.id }) }] })));
        body.appendChild(bx);
      }
      const pending = rows ? rows.filter((r) => r.status !== 'active' && r.status !== 'reserved' && !r.collected) : [];
      if (pending.length) {
        const zen = pending.filter((r) => r.status === 'sold').reduce((a, r) => a + r.price - r.fee, 0), items = pending.filter((r) => r.status !== 'sold').length;
        const bar = document.createElement('div'); bar.className = 'mk-sell';
        bar.innerHTML = `<div class="row"><span>Para coletar: ${zen ? `<b style="color:#ffd36b">${fmt.format(zen)} Zen</b>` : ''}${zen && items ? ' e ' : ''}${items ? `${items} item(ns) de volta` : ''}</span><button class="btn btn-gold" type="button" id="mk-collect" ${MK.busy ? 'disabled' : ''}>Coletar tudo</button></div>`;
        body.appendChild(bar);
        setTimeout(() => { const b = $('#mk-collect'); if (b) b.onclick = () => mkSend({ action: 'collect' }); }, 0);
      }
      if (!rows) list.innerHTML = '<p class="mk-empty">Carregando…</p>';
      else if (!rows.length) list.innerHTML = '<p class="mk-empty">Você não tem anúncios. Use a aba Vender.</p>';
      else rows.forEach((r) => {
        let right;
        if (r.status === 'reserved' && r.mode === 'pix') right = { sub: `${esc(r.reservedBy || 'um comprador')} vai pagar por Pix${r.paid ? ' · <b>avisou que pagou</b>' : ''}`,
          btns: [{ label: 'Recebi o Pix', cls: 'btn-gold', fn: () => tradeDialog(`<h3>Confirmar que recebeu ${mkMoney(r.price, 'brl')}?</h3><p class="muted">Confira no app do seu banco antes. O item vai para ${esc(r.reservedBy || 'o comprador')} e a comissão de ${mkMoney(r.fee, 'brl')} é somada à sua conta.</p>`, [{ label: 'Confirmar', cls: 'btn-gold', fn: () => mkSend({ action: 'pixConfirm', id: r.id }) }, { label: 'Voltar' }]) },
            { label: 'Não recebi', fn: () => mkSend({ action: 'pixCancel', id: r.id }) }] };
        else if (r.status === 'reserved') right = { sub: 'um comprador está pagando agora' };
        else if (r.status === 'active') right = { sub: `à venda · termina em ${mkLeft(r.expires)}${payHow(r)}`, btn: 'Cancelar', fn: () => mkSend({ action: 'cancel', id: r.id }) };
        else if (r.status === 'sold') right = { sub: `vendido para ${esc(r.buyer || '?')} · ${r.cur === 'zen' ? (r.collected ? 'Zen coletado' : `receber ${fmt.format(r.price - r.fee)} Zen`) : r.mode === 'pix' ? `pago no seu Pix (comissão ${mkMoney(r.fee, 'brl')})` : r.mode === 'platform' ? `${mkMoney(r.price - r.fee, 'usd')} no seu saldo em dólar` : `${mkMoney(r.price - r.fee, r.cur)} enviados à sua conta Stripe`}`, ...(r.cur === 'zen' && !r.collected ? { btn: 'Coletar', cls: 'btn-gold', fn: () => mkSend({ action: 'collect', id: r.id }) } : {}) };
        else right = { sub: `${r.status === 'expired' ? 'expirou' : 'cancelado'} · ${r.collected ? 'item devolvido' : 'item para coletar'}`, ...(!r.collected ? { btn: 'Coletar', cls: 'btn-gold', fn: () => mkSend({ action: 'collect', id: r.id }) } : {}) };
        list.appendChild(mkRow(r, right));
      });
      if (d) body.insertAdjacentHTML('beforeend', `<p class="muted" style="margin:0 0 6px">${rows.filter((r) => r.status === 'active' || r.status === 'reserved').length}/${d.max} anúncios ativos.</p>`);
      body.appendChild(list);
    }
  }

  function iconCanvas(it, noTip) {
    const c = document.createElement('canvas'); c.width = 48; c.height = 48;
    drawItemIcon(c.getContext('2d'), it, 3, 3, 3, ACCENT(it));
    if (!noTip && it && it.name) TIP.map.set(c, { it });
    return c;
  }
  function slotButton(it, onClick) {
    const b = document.createElement('button');
    const picked = MS.on && MS.ids.has(it.id);
    b.type = 'button'; b.className = 'islot' + (MS.on ? (picked ? ' picked' : '') : (S.selItem === it.id ? ' sel' : ''));
    if (MS.on && !it.equipped) b.setAttribute('aria-pressed', picked);
    b.style.setProperty('--r', RAR[it.rarity]);
    b.setAttribute('aria-label', `${it.name}${it.plus ? ' +' + it.plus : ''}${it.stack && it.qty > 1 ? ', ' + fmt.format(it.qty) + ' unidades' : ''}, ${RAR_NAME[it.rarity]}`);
    b.appendChild(iconCanvas(it));
    if (it.plus) b.insertAdjacentHTML('beforeend', `<span class="plus">+${it.plus}</span>`);
    if (it.stack) b.insertAdjacentHTML('beforeend', `<span class="qty">${it.qty > 999 ? '999+' : it.qty}</span>`);
    b.dataset.id = it.id;
    b.onclick = (ev) => { if (UP.justDragged) { UP.justDragged = false; return; } onClick(ev); };
    if (it.base === 'jewel_of_bless' || it.base === 'jewel_of_soul') { b.classList.add('jewel-drag'); b.addEventListener('pointerdown', (ev) => jewelDown(ev, it, b)); }
    if (S.jewelSel && it.id !== S.jewelSel) b.classList.add(jewelFits(it) ? 'drop-ok' : 'drop-no');
    if (S.jewelSel === it.id) b.classList.add('sel');
    return b;
  }
  // venda de vários itens de uma vez
  const MS = { on: false, ids: new Set(), confirm: false };
  const HIGH_RAR = ['epic', 'legendary', 'ancestral'];
  function bagVisible() {
    return S.char.items.filter((i) => !i.equipped && (S.rarFilter === 'all' || i.rarity === S.rarFilter));
  }
  function renderMulti() {
    const bar = $('#multi-bar'), btn = $('#btn-multi');
    btn.setAttribute('aria-pressed', MS.on); btn.classList.toggle('btn-gold', MS.on);
    btn.textContent = MS.on ? 'Cancelar' : 'Vender vários';
    bar.hidden = !MS.on;
    if (!MS.on) return;
    const sel = S.char.items.filter((i) => MS.ids.has(i.id) && !i.equipped);
    const total = sel.reduce((a, i) => a + (i.value || 0), 0);
    const high = sel.filter((i) => HIGH_RAR.includes(i.rarity)).length;
    $('#multi-info').innerHTML = sel.length
      ? `<span class="zen">${sel.length} marcados · ${fmt.format(total)} Zen</span>${high ? ` <span class="bad">${high} valiosos</span>` : ''}`
      : 'Toque nos itens para marcar.';
    const sb = $('#multi-sell');
    sb.disabled = !sel.length;
    sb.textContent = MS.confirm ? `Confirmar venda de ${sel.length}` : 'Vender';
    sb.classList.toggle('danger', MS.confirm);
  }
  $('#btn-multi').onclick = () => { MS.on = !MS.on; MS.ids.clear(); MS.confirm = false; S.selItem = null; renderBag(); };
  $('#multi-all').onclick = () => { bagVisible().forEach((i) => MS.ids.add(i.id)); MS.confirm = false; renderBag(); };
  $('#multi-none').onclick = () => { MS.ids.clear(); MS.confirm = false; renderBag(); };
  $('#multi-sell').onclick = () => {
    const ids = S.char.items.filter((i) => MS.ids.has(i.id) && !i.equipped).map((i) => i.id);
    if (!ids.length) return;
    const high = S.char.items.some((i) => MS.ids.has(i.id) && HIGH_RAR.includes(i.rarity));
    if ((high || ids.length >= 10) && !MS.confirm) { MS.confirm = true; renderMulti(); return; }
    send({ type: 'sellMany', ids });
    MS.ids.clear(); MS.confirm = false; renderMulti();
  };
  function pickItem(it) {
    if (S.jewelSel && it.id !== S.jewelSel) { upgAsk(S.jewelSel, it.id); return; }
    if (MS.on) {
      if (it.equipped) return;
      if (MS.ids.has(it.id)) MS.ids.delete(it.id); else MS.ids.add(it.id);
      MS.confirm = false;
    } else S.selItem = it.id;
    renderBag();
  }

  function renderBag() {
    const c = S.char;
    const bag = c.items.filter((i) => !i.equipped);
    for (const id of [...MS.ids]) if (!bag.some((i) => i.id === id)) MS.ids.delete(id);
    $('#bag-count').textContent = `${bag.length}/${c.invMax}`;
    const slots = $('#equip-slots'); slots.innerHTML = '';
    for (const slot of Object.keys(SLOT_NAME)) {
      const it = c.items.find((i) => i.equipped && (i.eqSlot || i.slot) === slot);
      if (it) slots.appendChild(slotButton(it, () => { if (S.jewelSel) { upgAsk(S.jewelSel, it.id); return; } if (!MS.on) { S.selItem = it.id; renderBag(); } }));
      else { const e = document.createElement('div'); e.className = 'islot empty'; e.innerHTML = `<span class="slotname">${SLOT_NAME[slot]}</span>`; slots.appendChild(e); }
    }
    const rf = $('#rar-filter');
    rf.innerHTML = ['all', ...RAR_ORDER].map((r) => `<button type="button" data-r="${r}" class="${S.rarFilter === r ? 'on' : ''}" ${r !== 'all' ? `style="color:${RAR[r]}"` : ''}>${r === 'all' ? 'Todas' : RAR_NAME[r]}</button>`).join('');
    $$('button', rf).forEach((b) => { b.onclick = () => { S.rarFilter = b.dataset.r; renderBag(); }; });
    const grid = $('#bag-grid'); grid.innerHTML = '';
    bag.filter((i) => S.rarFilter === 'all' || i.rarity === S.rarFilter)
      .sort((a, b) => RAR_ORDER.indexOf(b.rarity) - RAR_ORDER.indexOf(a.rarity) || b.req - a.req)
      .forEach((it) => grid.appendChild(slotButton(it, () => pickItem(it))));
    if (!bag.length) grid.innerHTML = '<p class="muted" style="grid-column:1/-1;margin:4px 0">Bolsa vazia. Monstros deixam itens ao morrer.</p>';
    renderMulti();
    if (MS.on) $('#item-detail').innerHTML = '';
    else renderItemDetail();
  }
  function statLine(st) {
    const parts = [];
    if (st.dmg) parts.push(`Dano ${st.dmg[0]}–${st.dmg[1]}`);
    if (st.def) parts.push(`Defesa +${st.def}`);
    if (st.hp) parts.push(`Vida +${st.hp}`);
    if (st.wdmg) parts.push(`Dano +${st.wdmg}%`);
    if (st.absorb) parts.push(`Absorve ${st.absorb}% do dano`);
    return parts.join(' · ');
  }
  function renderItemDetail() {
    const box = $('#item-detail');
    const it = S.char.items.find((i) => i.id === S.selItem);
    if (!it) { box.innerHTML = '<p class="muted">Toque em um item para ver detalhes.</p>'; return; }
    const cur = S.char.items.find((i) => i.equipped && i.slot === it.slot && i.id !== it.id && i.eqSlot !== 'ring2');
    let cmp = '';
    if (cur && !it.equipped) {
      const a = (it.stats.dmg ? it.stats.dmg[0] + it.stats.dmg[1] : 0) + (it.stats.def || 0) * 2 + (it.stats.hp || 0) / 4;
      const b = (cur.stats.dmg ? cur.stats.dmg[0] + cur.stats.dmg[1] : 0) + (cur.stats.def || 0) * 2 + (cur.stats.hp || 0) / 4;
      cmp = `<p>${a > b ? '<span style="color:#a8e08a">Melhor</span>' : a < b ? '<span class="bad">Pior</span>' : 'Igual'} que o equipado (${esc(statLine(cur.stats))})</p>`;
    }
    const set = it.set && S.data.sets[it.set] ? `<p class="muted">Conjunto ${esc(S.data.sets[it.set].name)} — ${esc(S.data.sets[it.set].bonus)}</p>` : '';
    if (it.slot === 'material' && it.event) {
      box.innerHTML = `<h3 style="color:${ACCENT(it)}">${esc(it.name)} ×${fmt.format(it.qty)}</h3>
        <p style="color:${RAR[it.rarity]}">Item de evento · ${it.event === 'castle' ? 'Chaos Castle' : 'Devil Square'}</p>
        ${it.desc ? `<p>${esc(it.desc)}</p>` : ''}
        <div class="row"><button class="btn small btn-ghost" type="button" data-act="sell">Vender ${it.qty > 1 ? 'todas ' : ''}por ${fmt.format(it.value)} Zen</button></div>`;
      $('[data-act]', box).onclick = () => { if (!confirm(`Vender ${it.name}${it.qty > 1 ? ' ×' + it.qty : ''}?`)) return; S.selItem = null; send({ type: 'sell', id: it.id }); };
      return;
    }
    if (it.base === 'jewel_of_bless' || it.base === 'jewel_of_soul') {
      const on = S.jewelSel === it.id;
      box.innerHTML = `<h3 style="color:${ACCENT(it)}">${esc(it.name)} ×${fmt.format(it.qty)}</h3>
        <p style="color:${RAR[it.rarity]}">Joia de aprimoramento · ${it.base === 'jewel_of_bless' ? '+0 até +6' : '+6 até +9'}</p>
        <p>${on ? '<b style="color:#ffd36b">Agora toque no equipamento que quer aprimorar.</b>' : 'Arraste a joia até o equipamento (ou toque em "Usar" e depois no equipamento). Do +9 ao +15, só no Ferreiro Mestre.'}</p>
        <div class="row"><button class="btn small btn-gold" type="button" data-jw>${on ? 'Cancelar' : 'Usar em um equipamento'}</button>
          <button class="btn small btn-ghost" type="button" data-act="sell">Vender ${it.qty > 1 ? 'todas ' : ''}por ${fmt.format(it.value)} Zen</button></div>`;
      $('[data-jw]', box).onclick = () => { S.jewelSel = on ? null : it.id; renderBag(); };
      $('[data-act]', box).onclick = () => { if (!confirm(`Vender ${it.name} ×${it.qty}?`)) return; S.selItem = null; S.jewelSel = null; send({ type: 'sell', id: it.id }); };
      return;
    }
    if (it.slot === 'material') {
      box.innerHTML = `<h3 style="color:${ACCENT(it)}">${esc(it.name)} ×${fmt.format(it.qty)}</h3>
        <p style="color:${RAR[it.rarity]}">Material · empilha até ${fmt.format(it.stack)}</p>
        ${it.desc ? `<p>${esc(it.desc)}</p>` : ''}
        <div class="row"><button class="btn small btn-gold" type="button" data-go="chaos">Abrir a Chaos Machine</button>
          <button class="btn small btn-ghost" type="button" data-act="sell">Vender ${it.qty > 1 ? 'todas ' : ''}por ${fmt.format(it.value)} Zen</button></div>`;
      $('[data-go]', box).onclick = () => openPanel('chaos');
      $('[data-act]', box).onclick = () => { S.selItem = null; send({ type: 'sell', id: it.id }); };
      return;
    }
    if (it.slot === 'quest') {
      box.innerHTML = `<h3 style="color:${ACCENT(it)}">${esc(it.name)}${it.qty > 1 ? ' ×' + it.qty : ''}</h3><p class="muted">Item de missão</p>${it.desc ? `<p>${esc(it.desc)}</p>` : ''}`;
      return;
    }
    if (it.slot === 'box') {
      box.innerHTML = `<h3 style="color:${ACCENT(it)}">${esc(it.name)} ×${fmt.format(it.qty)}</h3>
        <p class="muted">Recompensa da Invasão Dourada</p>
        ${it.desc ? `<p>${esc(it.desc)}</p>` : ''}
        <p class="box-list-title">Pode conter:</p><ul class="box-list">${(it.contents || []).map((c) => `<li>${esc(c)}</li>`).join('')}</ul>
        <div class="row"><button class="btn small btn-gold" type="button" data-open>Abrir</button>
          <button class="btn small btn-ghost" type="button" data-act="sell">Vender ${it.qty > 1 ? 'todas ' : ''}por ${fmt.format(it.value)} Zen</button></div>`;
      $('[data-open]', box).onclick = () => openBox(it);
      $('[data-act]', box).onclick = () => { S.selItem = null; send({ type: 'sell', id: it.id }); };
      return;
    }
    // requisitos: verde = atendido, vermelho = falta (quem decide de verdade é o servidor)
    const R = it.reqs || {};
    const ok = (v) => (v ? 'req-ok' : 'req-no');
    const lines = [];
    const evoNames = S.char.evolutions || [];
    if (R.classes) {
      const names = R.classes.map((k) => (S.data.classes[k] ? S.data.classes[k].name : k));
      lines.push([R.classes.includes(S.char.cls), `Classe: ${names.length === Object.keys(S.data.classes).length ? 'todas' : names.join(', ')}`]);
    }
    if (R.minEvo) lines.push([(S.char.evo || 0) >= R.minEvo, `Evolução: ${evoNames[R.minEvo] || 'evolução ' + R.minEvo}`]);
    lines.push([S.char.level >= (R.level || it.req), `Nível ${R.level || it.req}`]);
    for (const k of ['str', 'agi', 'ene', 'vit', 'cmd']) if (R[k]) lines.push([(S.char.stats[k] || 0) >= R[k], `${STAT_PT[k]} ${fmt.format(R[k])}`]);
    if (R.enabled === false) lines.push([false, 'Item desativado']);
    if (it.locked) lines.push([false, 'Bloqueado']);
    const canEq = lines.every(([v]) => v);
    const catTxt = it.cat === 'cape' ? `Capa do Dark Lord · nível ${it.tier}` : it.cat === 'wings' ? `Asa de nível ${it.tier}` : SLOT_NAME[it.slot];
    const extra = [];
    if (R.twoHand) extra.push('Duas mãos (sem escudo)');
    if (it.slot === 'ring') extra.push('Anel esquerdo ou direito');
    const high = ['epic', 'legendary', 'ancestral'].includes(it.rarity);
    box.innerHTML = `<div class="mu-tip mu-tip-inline">${muTipHtml(it)}</div>
      ${it.equipped && it.eqSlot === 'ring2' ? '<p class="muted">Anel direito</p>' : ''}${R.enabled === false ? '<p class="bad">Item desativado</p>' : ''}
      ${it.chaos ? '<p style="color:#d8b0ff">Arma do Caos: base para criar asas e a capa do Dark Lord na Chaos Machine (o + e a raridade aumentam a chance).</p>' : ''}
      ${cmp}
      <div class="row">${it.equipped
        ? '<button class="btn small" type="button" data-act="unequip">Desequipar</button>'
        : `<button class="btn small btn-gold" type="button" data-act="equip" ${canEq ? '' : 'disabled'}>Equipar</button>
           ${it.slot === 'ring' && canEq ? '<button class="btn small" type="button" data-act="equip" data-slot="ring2">No anel direito</button>' : ''}
           <button class="btn small btn-ghost" type="button" data-act="sell">Vender por ${fmt.format(it.value)} Zen</button>`}
        ${['weapon', 'helm', 'armor', 'gloves', 'boots', 'wings'].includes(it.slot) ? '<button class="btn small" type="button" data-look>👁 Ver no herói</button>' : ''}</div>`;
    const lk = $('[data-look]', box); if (lk) lk.onclick = () => openItemInfo(it, 'bag');
    $$('[data-act]', box).forEach((b) => {
      b.onclick = () => {
        if (b.dataset.act === 'sell') S.selItem = null;
        send({ type: b.dataset.act, id: it.id, slot: b.dataset.slot || (it.slot === 'ring' ? 'ring' : undefined) });
      };
    });
  }
  const WEAPONS = { dark_knight: ['sword'], magic_gladiator: ['sword', 'staff'], dark_wizard: ['staff'], fairy_elf: ['bow'], dark_lord: ['scepter'], summoner: ['book'] };
  $('#btn-autoequip').onclick = () => send({ type: 'autoequip' });

  // ranking dentro do jogo
  const RK = { by: 'level', seq: 0 };
  async function renderRank() {
    $$('#rank-tabs [data-by]').forEach((t) => { const on = t.dataset.by === RK.by; t.classList.toggle('on', on); t.setAttribute('aria-selected', on); });
    const last = { level: 'Poder', resets: 'Resets', power: 'Poder', bosses: 'Bosses', pvp: 'PvP' }[RK.by];
    $('#g-rank-last').textContent = last;
    const tb = $('#g-rank-body');
    if (!tb.children.length) tb.innerHTML = '<tr><td colspan="5" class="muted">Carregando…</td></tr>';
    const seq = ++RK.seq;
    try {
      const r = await fetch(`/api/ranking?by=${RK.by}`, { credentials: 'same-origin' });
      const { ranking } = await r.json();
      if (seq !== RK.seq || S.panel !== 'rank') return;
      const val = (x) => RK.by === 'pvp' ? `${x.pvp_kills} · ${x.duel_wins} duelos` : RK.by === 'bosses' ? x.bosses_killed : RK.by === 'resets' ? x.resets : fmt.format(x.combat_power);
      const medal = ['🥇', '🥈', '🥉'];
      tb.innerHTML = ranking.length ? ranking.map((x, i) => `<tr class="${S.char && x.name === S.char.name ? 'me' : ''}">
        <td>${medal[i] || i + 1}</td><td>${esc(x.name)}</td><td>${esc((S.data.classes[x.class] || {}).name || x.class)}</td><td>${x.level}</td><td>${val(x)}</td></tr>`).join('')
        : '<tr><td colspan="5" class="muted">Nenhum herói ainda.</td></tr>';
    } catch (e) {
      if (seq === RK.seq) tb.innerHTML = '<tr><td colspan="5" class="muted">Não foi possível carregar o ranking.</td></tr>';
    }
  }
  $$('#rank-tabs [data-by]').forEach((t) => { t.onclick = () => { RK.by = t.dataset.by; $('#g-rank-body').innerHTML = ''; renderRank(); }; });

  const RSI = { info: null, busy: false };
  function resetStatusBtn() {
    const i = RSI.info;
    if (!i) return '<button class="btn small rs-btn" type="button" disabled>RESET STATUS…</button>';
    const label = i.free ? 'RESET STATUS – GRATUITO' : 'RESET STATUS – R$ 5,00';
    return `<button class="btn small rs-btn ${i.free ? 'btn-gold' : ''}" type="button" id="rs-btn" ${RSI.busy || !i.free ? 'disabled' : ''}>${label}</button>
      <small class="muted">${i.free ? 'Seu primeiro reset é grátis.' : 'Cada reset adicional custa R$ 5,00 na Loja.'}</small>`;
  }
  function renderHero() {
    const c = S.char, me = S.me || {};
    const names = { str: 'Força', agi: 'Agilidade', vit: 'Vitalidade', ene: 'Energia', cmd: 'Comando' };
    const keys = ['str', 'agi', 'vit', 'ene'].concat(c.cls === 'dark_lord' ? ['cmd'] : []);
    $('#hero-body').innerHTML = `
      <p>${esc(c.name)} · <b class="cls-name">${esc(c.className || S.data.classes[c.cls].name)}</b> · Nível ${c.level}${c.resets ? ` · ${c.resets} resets` : ''}</p>
      ${c.evolutions && c.evo < c.evolutions.length - 1 ? `<p class="muted small">Próxima evolução: ${esc(c.evolutions[c.evo + 1])} (missão com ${c.evo === 0 && !['magic_gladiator', 'dark_lord'].includes(c.cls) ? 'a Priestess Sevina, em Devias' : 'Marlon, em Lorencia'})</p>` : ''}
      <p class="free-pts">${c.free > 0 ? `${c.free} pontos para distribuir` : 'Nenhum ponto livre'}</p>
      <div class="rs-row">${resetStatusBtn()}</div>
      <div class="stat-rows">${keys.map((k) => `<div class="stat-row"><span>${names[k]}</span><b>${c.stats[k]}</b>
        <button class="btn small" type="button" data-stat="${k}" data-n="1" ${c.free < 1 ? 'disabled' : ''} aria-label="Adicionar 1 ponto em ${names[k]}">+1</button>
        <button class="btn small" type="button" data-stat="${k}" data-n="${Math.min(10, c.free) || 10}" ${c.free < 1 ? 'disabled' : ''} aria-label="Adicionar até 10 pontos em ${names[k]}">+${Math.min(10, c.free) || 10}</button></div>`).join('')}</div>
      <label class="cfg-check"><input type="checkbox" id="auto-stats" ${c.settings.autoStats ? 'checked' : ''}> Distribuir pontos automaticamente ao subir de nível</label>
      <div class="derived">
        <div><span>Dano</span><br>${c.dmg[0]}–${c.dmg[1]}</div><div><span>Defesa</span><br>${c.def}</div>
        <div><span>Vida</span><br>${fmt.format(c.maxHp)}</div><div><span>Mana</span><br>${fmt.format(c.maxMp)}</div>
        <div><span>Ataque a cada</span><br>${(c.atkMs / 1000).toFixed(2)}s</div><div><span>Crítico</span><br>${Math.round(c.crit * 100)}%</div>
        <div><span>Poder de combate</span><br>${fmt.format(c.power)}</div><div><span>Monstros derrotados</span><br>${fmt.format(c.kills)}</div>
        ${c.absorb ? `<div><span>Absorção (asa/capa)</span><br>${c.absorb}%</div>` : ''}${c.masterResets ? `<div><span>Master Reset</span><br>${c.masterResets}</div>` : ''}
      </div>
      ${c.fullSet ? '<p style="color:#a8e08a">Bônus de conjunto completo ativo: +10% defesa, +5% dano.</p>' : ''}
      <p>PvP: <b>${c.pvp.kills}</b> vitórias · ${c.pvp.deaths} derrotas · duelos ${c.pvp.duelW}V/${c.pvp.duelL}D${c.pvp.pk ? ` · ${c.pvp.pk}× PK` : ''}</p>
      <h3>Poderes</h3>
      <ul class="skills-list">${c.allSkills.map((s) => `<li><b>${esc(s.name)}</b> <small class="muted">${s.evo && (c.evo || 0) < s.evo ? `libera com ${esc(s.evoName)}` : c.level >= s.lvl ? 'liberado' : `libera no nível ${s.lvl}`} · ${s.mana} MP · ${(s.cd / 1000).toFixed(0)}s</small><br><small>${esc(s.desc)}</small></li>`).join('')}</ul>
      <p class="mode-note">Servidor <b>${esc(c.mode)}</b>: subir de nível é difícil e morrer custa ${Math.round(c.deathLoss * 100)}% da EXP do nível.</p>`;
    $$('#hero-body [data-stat]').forEach((b) => { b.onclick = () => send({ type: 'stat', stat: b.dataset.stat, n: Number(b.dataset.n) }); });
    $('#auto-stats').onchange = (e) => send({ type: 'settings', settings: { autoStats: e.target.checked } });
    const rb = $('#rs-btn');
    if (rb) rb.onclick = () => tradeDialog(`<h3>RESETAR ATRIBUTOS?</h3><p>Deseja realmente resetar todos os pontos distribuídos do seu personagem?</p>
      <p class="muted">Todos os pontos investidos serão devolvidos para você distribuir novamente${RSI.info && RSI.info.points ? ` (${fmt.format(RSI.info.points)} pontos)` : ''}. ${RSI.info && RSI.info.free ? 'Este reset é grátis.' : 'Cada reset depois do primeiro custa R$ 5,00 na Loja.'}</p>`,
      [{ label: 'CONFIRMAR', cls: 'btn-gold', fn: () => { RSI.busy = true; renderHero(); send({ type: 'resetStatus', action: 'use' }); } }, { label: 'CANCELAR' }]);
    void me;
  }

  function renderMaps() {
    const ul = $('#tp-list'); ul.innerHTML = '';
    const rs = $('#room-switch');
    if (rs) {
      rs.innerHTML = `<span>Sala</span>` + Array.from({ length: S.rooms || 4 }, (_, i) => i + 1).map((r) => `<button class="btn small ${r === S.room ? 'btn-gold' : ''}" type="button" data-room="${r}" ${r === S.room ? 'aria-pressed="true"' : ''}>${r}</button>`).join('');
      $$('[data-room]', rs).forEach((b) => { b.onclick = () => { const r = Number(b.dataset.room); if (r === S.room) return; S.room = r; try { localStorage.setItem('mui_room', String(r)); } catch (_) { /* ok */ } send({ type: 'room', room: r }); setTimeout(renderMaps, 400); }; });
    }
    for (const w of S.data.world) {
      const li = document.createElement('li');
      const here = S.map && S.map.map === w.id;
      if (here) li.className = 'here';
      const img = document.createElement('img');
      img.src = `/assets/maps/${w.id}.jpg`; img.alt = '';
      li.appendChild(img);
      const info = document.createElement('div');
      info.innerHTML = `<b>${esc(w.name)}</b><small>${w.safe ? 'Cidade · zona segura · loja' : `Nível ${w.minLevel}+${w.expBonus ? ` · <span class="exp-bonus">EXP +${w.expBonus}%</span>` : ''} · ${esc(w.monsters.join(', '))}`}</small>`;
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

  // ---------- VIP ----------
  const brl = new Intl.NumberFormat(window.I18N ? I18N.locale : 'pt-BR', { style: 'currency', currency: 'BRL' });
  const dateFmt = (t) => new Date(t).toLocaleDateString(window.I18N ? I18N.locale : 'pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  function vipHtml() {
    const V = S.data.vip; if (!V) return '';
    const me = S.char.vip || {};
    const mine = me.tier ? `<p class="vip-mine">Seu VIP: <b style="color:${me.tier === 2 ? '#7fe3ff' : '#ffd36b'}">${esc(me.name)}</b> até ${dateFmt(me.until)}</p>` : '<p class="muted">Você ainda não tem VIP.</p>';
    return `<div class="vip-box"><h3>VIP</h3>${mine}<div class="vip-plans">${V.plans.map((p) => `
      <div class="vip-plan t${p.tier}"><b style="color:${p.color}">${p.tier === 2 ? '◆' : '★'} ${esc(p.name)}</b>
        <ul>${p.perks.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
        <div class="row">${V.days.map((d) => `<button class="btn small ${d === 30 ? 'btn-gold' : ''}" type="button" data-vip="${p.id}" data-days="${d}" ${V.enabled ? '' : 'disabled'}>${d} dias · ${brl.format(p.prices[d] / 100)}</button>`).join('')}</div>
      </div>`).join('')}</div>
      ${V.enabled ? `<div class="vip-gift"><label class="adt-check"><input type="checkbox" id="vip-gift-on"> 🎁 Dar de presente para outro jogador</label>
        <div class="row" id="vip-gift-row" hidden><input type="text" id="vip-gift-to" maxlength="40" placeholder="Nome de usuário da conta (o login, não o herói)" autocomplete="off"></div>
        <p class="muted small" id="vip-gift-hint" hidden>Você paga e o VIP vai para a conta digitada. A pessoa recebe um aviso no jogo.</p></div>` : ''}
      ${V.enabled ? '<p class="muted small">Pagamento seguro pelo Stripe. O VIP vale para todos os heróis da conta e soma dias se você renovar.</p>' : '<p class="muted small">Pagamentos em breve.</p>'}</div>`;
  }
  async function buyVip(plan, days, btn, root) {
    const on = root && $('#vip-gift-on', root) && $('#vip-gift-on', root).checked;
    const giftTo = on ? $('#vip-gift-to', root).value.trim() : '';
    if (on && !giftTo) { feed('Digite o nome de usuário de quem vai ganhar o VIP.', 'warn'); $('#vip-gift-to', root).focus(); return; }
    btn.disabled = true;
    try {
      const r = await fetch('/api/vip/checkout', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'mui' },
        body: JSON.stringify({ plan, days, giftTo: giftTo || undefined, back: `/game.html?c=${encodeURIComponent(charId)}` }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.url) throw new Error(j.error || 'Não foi possível abrir o pagamento. Tente de novo.');
      location.href = j.url;
    } catch (e) { feed(e.message, 'warn'); btn.disabled = false; }
  }
  function bindVip(root) {
    $$('[data-vip]', root).forEach((b) => { b.onclick = () => buyVip(b.dataset.vip, Number(b.dataset.days), b, root); });
    const g = $('#vip-gift-on', root);
    if (g) g.onchange = () => { $('#vip-gift-row', root).hidden = !g.checked; $('#vip-gift-hint', root).hidden = !g.checked; $$('[data-vip]', root).forEach((b) => { b.textContent = b.textContent.replace(/^🎁 /, ''); if (g.checked) b.textContent = '🎁 ' + b.textContent; }); if (g.checked) $('#vip-gift-to', root).focus(); };
  }


  async function renderPremiumStore(root) {
    const holder = $('#premium-store', root);
    if (!holder) return;
    holder.innerHTML = '<p class="muted">Carregando conjuntos…</p>';
    try {
      const data = await admApi('GET', '/api/premium-store');
      const catalog = Array.isArray(data.catalog) ? data.catalog : [];
      const orders = Array.isArray(data.orders) ? data.orders : [];
      if (!catalog.length) throw new Error('A loja não retornou produtos. Atualize a página ou tente novamente.');
      holder.innerHTML = '<section class="premium-shop"><div class="premium-art-wrap"><img class="premium-art" src="/assets/special-christmas-pixel-art.svg" alt="Set natalino em pixel art 2D" loading="lazy"><div><h3>Conjuntos semi-full</h3><b>Especial Christmas</b><p class="muted small">Armadura natalina, asas, pingente, dois anéis, espada, arco e escudo.</p></div></div><p class="muted small">30 conjuntos semi-full e pacotes promocionais de Box Kundun com itens raros e épicos, sem atributos full. Os atributos dos conjuntos aumentam junto com o preço; até o tier inicial supera os equipamentos base de monstros e bosses. Confira os seis atributos antes de comprar. O primeiro reset de status é grátis; cada reset adicional custa R$ 5,00.</p>' +
        (orders.length ? '<div class="premium-orders"><b>Pedidos prontos para resgatar</b>' + orders.map(o => '<div class="row"><span>' + esc(o.product) + ' · ' + brl.format(o.amount_cents / 100) + '</span><button class="btn small btn-gold" type="button" data-premium-claim="' + o.id + '">Resgatar neste personagem</button></div>').join('') + '</div>' : '') +
        '<div class="premium-grid">' + catalog.map(p => {
          const isBox = p.type === 'box';
          const detail = p.type === 'reset' ? 'Reset de atributos para o personagem selecionado'
            : isBox
              ? p.qty + ' caixas · itens raros/épicos · até +8 · semi-full'
              : p.pieces + ' peças · nível ' + p.req + '+ · melhoria +' + p.plus + ' · todas as classes';
          const attrsHtml = p.type === 'set' ? '<details class="premium-stats"><summary>Ver os 6 atributos antes de comprar</summary><ul>' + Object.entries(p.attributes || {}).map(([label, value]) => '<li><span>' + esc(label) + '</span><b>' + esc(value) + '</b></li>').join('') + '</ul><small>Excellent semi-full: cada peça recebe 2–4 opções aleatórias, definidas no resgate.</small></details>' : '';
          return '<article class="premium-card" style="--set-tone:' + esc(p.tone) + '">' +
            '<canvas width="72" height="72" data-premium-icon="' + esc(p.id) + '"></canvas><div><b>' + esc(p.name) + '</b>' +
            '<small>' + detail + '</small>' + attrsHtml + '<span>' + brl.format(p.price / 100) + '</span>' +
            '<button class="btn small btn-gold" type="button" data-premium-buy="' + esc(p.id) + '"' + (!p.enabled || !data.enabled || (p.type === 'reset' && !(RSI.info && !RSI.info.free)) ? ' disabled' : '') + '>' + (p.type === 'reset' && RSI.info && RSI.info.free ? 'Use o reset grátis no Herói' : data.enabled ? (p.type === 'reset' ? 'Comprar reset · R$ 5,00' : isBox ? 'Comprar caixas' : 'Comprar conjunto') : 'Pagamento indisponível') + '</button>' + (p.type === 'set' ? '<button class="btn small premium-preview-trigger" type="button" data-premium-preview="' + esc(p.id) + '">Ver no personagem</button>' : '') + '</div></article>';
        }).join('') + '</div></section>';
      Array.from(holder.querySelectorAll('[data-premium-icon]')).forEach((canvas, i) => {
        const product = catalog[i];
        const pc = canvas.getContext('2d');
        const piece = product && product.type === 'set' ? { base: product.id + '_' + ['armor','wings','sword','helm','shield'][i % 5] }
          : product && product.type === 'box' ? { base: 'kundun_promo', icon: 'box' } : product && product.type === 'reset' ? { base: 'reset_status', icon: 'scroll' } : null;
        if (!(piece && PA.drawItem(pc, piece, 0, 0, 72)))
          PA.drawIcon(pc, product && product.type === 'box' ? 'box' : ['wings','armor','sword','bow','shield'][i % 5], 0, 0, 6, product ? product.tone : '#d82f3f');
      });
      $$('[data-premium-preview]', holder).forEach(btn => { btn.onclick = () => {
        const product = catalog.find(p => p.id === btn.dataset.premiumPreview);
        if (!product) return;
        const dialog = document.createElement('dialog');
        dialog.className = 'premium-preview-dialog';
        dialog.innerHTML = '<div class="premium-preview-head"><div><b>Prévia no personagem</b><small>' + esc(product.name) + '</small></div><button class="btn small" type="button" data-preview-close aria-label="Fechar">✕</button></div><canvas width="260" height="280" aria-label="Prévia do equipamento no personagem"></canvas><p class="muted small">Prévia visual aproximada com os sprites atuais e a aparência do seu personagem. Não equipa nem compra o item.</p><ul class="premium-preview-stats">' + Object.entries(product.attributes || {}).map(([label, value]) => '<li><span>' + esc(label) + '</span><b>' + esc(value) + '</b></li>').join('') + '</ul><small>Excellent semi-full: 2–4 opções aleatórias por peça.</small><button class="btn small btn-gold" type="button" data-preview-close>Fechar prévia</button>';
        document.body.appendChild(dialog);
        const close = () => { if (dialog.open) dialog.close(); dialog.remove(); };
        dialog.querySelectorAll('[data-preview-close]').forEach(b => { b.onclick = close; });
        dialog.addEventListener('click', e => { if (e.target === dialog) close(); });
        dialog.addEventListener('cancel', e => { e.preventDefault(); close(); });
        dialog.showModal();
        const canvas = dialog.querySelector('canvas'), ctx = canvas.getContext('2d');
        const cls = S.char.cls, ap = S.char.ap || {};
        const current = (S.players.get(S.youId) && S.players.get(S.youId).info && S.players.get(S.youId).info.eq) || {};
        // as peças de verdade deste conjunto (elmo, armadura, luvas, botas, asa e arma do conjunto)
        const equip = { ...current, helm: product.id, armor: product.id, gloves: product.id, boots: product.id, wings: product.id + '_wings', wingRarity: 'epic',
          w: cls === 'fairy_elf' ? product.id + '_bow' : ['dark_knight', 'magic_gladiator'].includes(cls) ? product.id + '_sword' : current.w || null, wg: product.tone || null };
        if (is3d) {
          canvas.width = 300; canvas.height = 320;
          W3().preview(canvas, { kind: 'hero', cls, eq: equip });
          dialog.addEventListener('close', () => { canvas.remove(); }, { once: true });
          return;
        }
        Sprites.preloadEquip(cls, equip);
        let raf = 0;
        const draw = () => {
          if (!dialog.open) { cancelAnimationFrame(raf); return; }
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.imageSmoothingEnabled = false;
          ctx.fillStyle = 'rgba(8,12,25,.55)'; ctx.fillRect(0, 0, canvas.width, canvas.height);
          Sprites.hero(ctx, cls, ap, 'idle', performance.now(), canvas.width / 2, canvas.height - 16, 2.25, false, { equip });
          raf = requestAnimationFrame(draw);
        };
        Sprites.ready.then(draw).catch(() => { ctx.fillStyle = '#eee'; ctx.fillText('Prévia indisponível', 55, 140); });
        dialog.addEventListener('close', () => { cancelAnimationFrame(raf); dialog.remove(); }, { once: true });
      }; });
      $$('[data-premium-buy]', holder).forEach(btn => { btn.onclick = async () => {
        btn.disabled = true;
        try {
          const res = await fetch('/api/premium-store/checkout', { method:'POST', credentials:'same-origin', headers:{'Content-Type':'application/json','X-Requested-With':'mui'}, body:JSON.stringify({product:btn.dataset.premiumBuy, charId, back:'/game.html?c=' + encodeURIComponent(charId)}) });
          const j = await res.json().catch(()=>({}));
          if (!res.ok || !j.url) throw new Error(j.error || 'Não foi possível iniciar a compra.');
          location.href = j.url;
        } catch(e) { feed(e.message,'warn'); btn.disabled=false; }
      }; });
      $$('[data-premium-claim]', holder).forEach(btn => { btn.onclick = async () => {
        btn.disabled=true;
        try {
          const res=await fetch('/api/premium-store/claim',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-Requested-With':'mui'},body:JSON.stringify({orderId:Number(btn.dataset.premiumClaim),charId})});
          const j=await res.json().catch(()=>({}));
          if(!res.ok) throw new Error(j.error||'Não foi possível resgatar.');
          feed((j.type==='box' ? j.qty+' Boxes Kundun resgatadas para ' : 'Conjunto resgatado para ')+S.char.name+'.','info'); renderPremiumStore(root);
        } catch(e) { feed(e.message,'warn'); btn.disabled=false; }
      }; });
    } catch (e) { holder.innerHTML = '<p class="muted">' + esc(e.message) + '</p>'; }
  }

  function renderShop() {
    const body = $('#shop-body');
    if (!S.map || !S.map.safe) {
      body.innerHTML = vipHtml() + '<p>A Mercadora Pasi fica na praça de Lorencia.</p><button class="btn btn-gold" type="button" id="go-town">Teleportar para Lorencia</button><div id="premium-store"></div>';
      $('#go-town').onclick = () => { send({ type: 'teleport', map: 'lorencia' }); };
      bindVip(body);
      renderPremiumStore(body);
      return;
    }
    body.innerHTML = vipHtml() + `<p>Seu Zen: <b>${fmt.format(S.char.zen)}</b></p>` + Object.entries(S.data.shop).map(([id, s]) => `
      <div class="shop-item"><canvas width="48" height="48" style="width:36px;height:36px" data-icon="${s.icon || (id === 'pot_hp' ? 'potion_hp' : 'potion_mp')}"></canvas>
        <div><b>${esc(s.name)}</b> — ${fmt.format(s.price)} Zen<br><small class="muted">${esc(s.desc)} · você tem ${fmt.format(s.item ? S.char.items.filter((i) => i.base === s.item).reduce((a, i) => a + (Number(i.qty) || 1), 0) : id === 'pot_hp' ? S.char.pots.hp : S.char.pots.mp)}</small></div>
        <div class="row">${(s.item ? [1, 5, 10] : [10, 50, 100]).map((q) => `<button class="btn small" type="button" data-buy="${id}" data-q="${q}" ${S.char.zen < q * s.price ? 'disabled' : ''}>${q}× · ${fmt.format(q * s.price)}</button>`).join('')}</div>
      </div>`).join('') + '<p class="muted">Para vender itens, abra a Bolsa e toque no item.</p><div id="premium-store"></div>';
    $$('#shop-body canvas[data-icon]').forEach((c) => { const ic = c.dataset.icon; const sh = Object.values(S.data.shop).find((x) => (x.icon || '') === ic && x.item); if (!PA.drawItem(c.getContext('2d'), { base: sh && sh.item, icon: ic }, 0, 0, 48)) PA.drawIcon(c.getContext('2d'), ic, 6, 6, 3, ic === 'scroll' ? '#7affc8' : '#3a7aff');
      const row = c.closest('.shop-item'); const btn = row && row.querySelector('[data-buy]'); const sp = btn && S.data.shop[btn.dataset.buy];
      if (sp) tipBind(c, { name: sp.name, desc: sp.desc, icon: ic, base: sp.item, rarity: sp.item ? 'rare' : 'common', slot: sp.item ? 'material' : 'potion' }, { price: `Preço: ${fmt.format(sp.price)} Zen` }); });
    $$('#shop-body [data-buy]').forEach((b) => { b.onclick = () => send({ type: 'buy', item: b.dataset.buy, qty: Number(b.dataset.q) }); });
    bindVip(body);
    renderPremiumStore(body);
  }

  // ---------- painel do administrador (o servidor confere a conta em toda ação) ----------
  async function admApi(method, url, body) {
    const r = await fetch(url, { method, credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'mui' }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `Erro ${r.status}`);
    return j;
  }
  const ADM = { data: null, target: null };
  const SLOT_PT = { weapon: 'Arma', helm: 'Elmo', armor: 'Armadura', gloves: 'Luvas', boots: 'Botas', ring: 'Anel' };
  function admMsg(text, bad) { const m = $('#adm-msg'); if (m) { m.textContent = text; m.className = 'adm-msg ' + (bad ? 'bad' : 'ok'); } }
  async function renderAdmin() {
    const body = $('#admin-body');
    if (!S.char.admin) { body.innerHTML = '<p>Acesso restrito.</p>'; return; }
    body.innerHTML = '<p class="muted">Carregando…</p>';
    try { ADM.data = await admApi('GET', '/api/admin/overview'); } catch (e) { body.innerHTML = `<p class="bad">${esc(e.message)}</p>`; return; }
    const D = ADM.data;
    const bySlot = {};
    D.items.forEach((it) => { (bySlot[it.slot] = bySlot[it.slot] || []).push(it); });
    const opts = Object.entries(bySlot).map(([slot, list]) => `<optgroup label="${esc(SLOT_PT[slot] || slot)}">${list.sort((a, b) => b.req - a.req).map((it) => `<option value="${it.id}">${esc(it.name)} (nv. ${it.req})</option>`).join('')}</optgroup>`).join('');
    const rar = D.rarities.map((r) => `<option value="${r}" ${r === 'ancestral' ? 'selected' : ''}>${esc(RAR_NAME[r] || r)}</option>`).join('');
    const st = D.stripe;
    body.innerHTML = `
      <p class="adm-msg" id="adm-msg" role="status"></p>
      <section class="adm-sec"><h3>Personagem</h3>
        <div class="adm-row"><input id="adm-name" maxlength="16" value="${esc(S.char.name)}" aria-label="Nome do personagem"><button class="btn small" type="button" id="adm-find">Buscar</button><button class="btn small" type="button" id="adm-me">Eu</button></div>
        <div id="adm-char" class="adm-char"></div>
        <p class="muted small">Também dá para usar comandos no Chat: digite <code>/ajuda</code>.</p>
      </section>
      <section class="adm-sec"><h3>Ações rápidas</h3>
        <div class="adm-grid">
          <button class="btn btn-gold" type="button" data-adm="kit">Melhor equipamento (ancestral +15)</button><button class="btn btn-gold" type="button" data-adm="festive">Dar set Especial Christmas completo</button>
          <button class="btn btn-gold" type="button" data-adm="maxlevel">Nível máximo (${D.maxLevel})</button>
          <button class="btn btn-gold" type="button" data-adm="maxstats">Atributos no máximo</button>
        </div>
        <div class="adm-row"><label>Nível <input type="number" id="adm-level" min="1" max="${D.maxLevel}" value="100"></label><button class="btn small" type="button" data-adm="level">Definir nível</button></div>
        <div class="adm-row"><label>Pontos <input type="number" id="adm-points" value="1000"></label><button class="btn small" type="button" data-adm="points">Dar pontos</button></div>
        <div class="adm-row"><label>Zen <input type="number" id="adm-zen" value="1000000"></label><button class="btn small" type="button" data-adm="zen">Dar Zen</button></div>
      </section>
      <section class="adm-sec"><h3>Dar item</h3>
        <div class="adm-row"><select id="adm-item" aria-label="Item">${opts}</select></div>
        <div class="adm-row"><select id="adm-rar" aria-label="Raridade">${rar}</select>
          <label>+<input type="number" id="adm-plus" min="0" max="15" value="15"></label>
          <label>Qtd <input type="number" id="adm-qty" min="1" max="10" value="1"></label>
          <button class="btn small btn-gold" type="button" data-adm="item">Dar item</button></div>
      </section>
      <section class="adm-sec"><h3>VIP</h3>
        <p class="muted small">Stripe: chave ${st.key ? '✔' : '✘'} · webhook ${st.webhook ? '✔' : '✘'} · modo <b>${esc(st.mode)}</b><br>Endereço do webhook: <code>${esc(st.url)}</code><br>Vendas: ${D.revenue.count} · ${brl.format(D.revenue.cents / 100)}</p>
        <div class="adm-prices">${D.plans.map((p) => `<div><b style="color:${p.color}">${esc(p.name)}</b>${D.days.map((d) => `<label>${d} dias R$ <input type="number" step="0.01" min="1" data-price="${p.id}" data-d="${d}" value="${(p.prices[d] / 100).toFixed(2)}"></label>`).join('')}<ul class="small">${p.perks.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>`).join('')}</div>
        <button class="btn small" type="button" id="adm-save-prices">Salvar preços</button>
        <h4>Loja semi-full (30 sets · R$ 45 a R$ 90)</h4>
        <p class="muted small">Preços validados pelo servidor. A compra fica resgatável após a confirmação do Stripe.</p>
        <div class="premium-admin">${D.premiumSets.map(p => '<label><span>'+esc(p.name)+'</span><input type="number" step="0.01" min="45" max="90" data-premium-price="'+p.id+'" value="'+(p.price/100).toFixed(2)+'"><input type="checkbox" data-premium-enabled="'+p.id+'" '+(p.enabled?'checked':'')+' aria-label="Ativar '+esc(p.name)+'"></label>').join('')}</div>
        <button class="btn small" type="button" id="adm-save-premium">Salvar loja de conjuntos</button>
        <h4>Dar ou remover VIP</h4>
        <div class="adm-row"><input id="adm-vip-user" placeholder="Nome de usuário da conta" maxlength="32" aria-label="Nome de usuário da conta">
          <select id="adm-vip-plan" aria-label="Plano">${D.plans.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select>
          <label>Dias <input type="number" id="adm-vip-days" min="1" max="3650" value="30"></label></div>
        <div class="adm-row"><button class="btn small btn-gold" type="button" id="adm-vip-give">Dar VIP</button><button class="btn small" type="button" id="adm-vip-del">Remover VIP</button></div>
        <h4>Dar VIP para todas as contas</h4>
        <div class="adm-row"><select id="adm-vipall-plan" aria-label="Plano para todos">${D.plans.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}<option value="both">Os dois VIPs</option></select>
          <label>Dias <input type="number" id="adm-vipall-days" min="1" max="3650" value="7"></label>
          <button class="btn small btn-gold" type="button" id="adm-vipall">Dar para todos</button></div>
        <h4>VIPs ativos (${D.vips.length})</h4>
        <ul class="adm-list">${D.vips.map((v) => `<li><b>${esc(v.username)}</b> · ${esc(v.name)} até ${dateFmt(v.until)}</li>`).join('') || '<li class="muted">Nenhum ainda.</li>'}</ul>
        <h4>Últimos pagamentos</h4>
        <ul class="adm-list">${D.payments.map((p) => `<li>${dateFmt(p.created_at)} · <b>${esc(p.username || '?')}</b> · ${esc((D.plans.find((x) => x.id === p.plan) || {}).name || p.plan)} ${p.days} dias · ${p.provider === 'admin' ? esc(p.note || 'dado pelo ADM') : brl.format(p.amount_cents / 100)}</li>`).join('') || '<li class="muted">Nenhum ainda.</li>'}</ul>
      </section>`;
    const name = () => $('#adm-name').value.trim();
    const showChar = (c) => {
      ADM.target = c;
      $('#adm-char').innerHTML = c ? `<b>${esc(c.name)}</b> · ${esc(S.data.classes[c.cls] ? S.data.classes[c.cls].name : c.cls)} · Nível ${c.level} · conta <b>${esc(c.account)}</b> · ${c.online ? 'online' : 'offline'}<br>
        <small>Força ${fmt.format(c.stats.str)} · Agilidade ${fmt.format(c.stats.agi)} · Vitalidade ${fmt.format(c.stats.vit)} · Energia ${fmt.format(c.stats.ene)} · pontos livres ${fmt.format(c.free)} · ${fmt.format(c.zen)} Zen · bolsa ${c.bag}/${S.char.invMax}${c.vip && c.vip.tier ? ` · ${esc(c.vip.name)} até ${dateFmt(c.vip.until)}` : ''}</small>` : '';
      if (c) $('#adm-vip-user').value = c.account;
    };
    const find = async () => { try { showChar((await admApi('POST', '/api/admin/char', { name: name() })).char); admMsg(''); } catch (e) { showChar(null); admMsg(e.message, true); } };
    $('#adm-find').onclick = find;
    $('#adm-me').onclick = () => { $('#adm-name').value = S.char.name; find(); };
    $('#adm-name').onkeydown = (e) => { if (e.key === 'Enter') find(); };
    $$('[data-adm]', body).forEach((b) => {
      b.onclick = async () => {
        const a = b.dataset.adm;
        const req = { name: name(), action: a === 'maxlevel' ? 'level' : a };
        if (a === 'maxlevel') req.level = 'max';
        if (a === 'level') req.level = Number($('#adm-level').value);
        if (a === 'points') req.n = Number($('#adm-points').value);
        if (a === 'zen') req.n = Number($('#adm-zen').value);
        if (a === 'item') Object.assign(req, { base: $('#adm-item').value, rarity: $('#adm-rar').value, plus: Number($('#adm-plus').value), qty: Number($('#adm-qty').value) });
        b.disabled = true;
        try { const r = await admApi('POST', '/api/admin/action', req); admMsg(r.message); showChar(r.char); } catch (e) { admMsg(e.message, true); }
        b.disabled = false;
      };
    });
    $('#adm-save-prices').onclick = async () => {
      const prices = {};
      $$('[data-price]', body).forEach((i) => { (prices[i.dataset.price] = prices[i.dataset.price] || {})[i.dataset.d] = Math.round(Number(i.value) * 100); });
      try { const r = await admApi('POST', '/api/admin/vip-prices', { prices }); admMsg(r.message); S.data.vip.plans = r.plans; } catch (e) { admMsg(e.message, true); }
    };
    $('#adm-save-premium').onclick = async () => {
      const products = {};
      $$('[data-premium-price]', body).forEach(i => { const key=i.dataset.premiumPrice; products[key]={price:Math.round(Number(i.value)*100),enabled:!!$('[data-premium-enabled="'+key+'"]',body)?.checked}; });
      try { const r=await admApi('POST','/api/admin/premium-store',{products}); admMsg(r.message); ADM.data.premiumSets=r.products; } catch(e) { admMsg(e.message,true); }
    };
    const vip = async (days) => {
      try { const r = await admApi('POST', '/api/admin/vip', { username: $('#adm-vip-user').value.trim(), plan: $('#adm-vip-plan').value, days }); admMsg(r.message); setTimeout(() => { if (S.panel === 'admin') renderAdmin(); }, 900); }
      catch (e) { admMsg(e.message, true); }
    };
    $('#adm-vip-give').onclick = () => vip(Number($('#adm-vip-days').value));
    $('#adm-vip-del').onclick = () => vip(0);
    $('#adm-vipall').onclick = async () => {
      const sel = $('#adm-vipall-plan'), days = Number($('#adm-vipall-days').value);
      const nm = sel.options[sel.selectedIndex].text;
      if (!(days >= 1)) return admMsg('Coloque quantos dias.', true);
      if (!confirm(`Dar ${nm} por ${days} dia(s) para TODAS as contas do jogo?`)) return;
      const b = $('#adm-vipall'); b.disabled = true;
      try { const r = await admApi('POST', '/api/admin/vip-all', { plan: sel.value, days }); admMsg(r.message); setTimeout(() => { if (S.panel === 'admin') renderAdmin(); }, 900); }
      catch (e) { admMsg(e.message, true); }
      b.disabled = false;
    };
    // Chaos Machine, drops, comandos e histórico (admin-tools.js)
    if (window.MUAdminTools) {
      const box = document.createElement('div');
      body.appendChild(box);
      MUAdminTools.mount(box, { api: admApi, classes: S.data.classes, sendCmd, openChat: () => { closePanel(); openPanel('chat'); } });
    }
    find();
  }

  function renderConfig() {
    const st = S.char.settings;
    $('#config-body').innerHTML = (S.char.admin ? '<button class="btn btn-gold adm-open" type="button" id="open-admin">Painel do administrador</button>' : '') + `
      <div class="cfg-row"><label for="cfg-hp">Usar poção de vida abaixo de <b id="cfg-hp-v">${Math.round(st.potHp * 100)}%</b></label>
        <input type="range" id="cfg-hp" min="0" max="90" step="5" value="${Math.round(st.potHp * 100)}"></div>
      <div class="cfg-row"><label for="cfg-mp">Usar poção de mana abaixo de <b id="cfg-mp-v">${Math.round(st.potMp * 100)}%</b></label>
        <input type="range" id="cfg-mp" min="0" max="90" step="5" value="${Math.round(st.potMp * 100)}"></div>
      <label class="cfg-check"><input type="checkbox" id="cfg-return" ${st.returnToFarm ? 'checked' : ''}> Voltar sozinho ao farm depois de morrer</label>
      <label class="cfg-check"><input type="checkbox" id="cfg-stats" ${st.autoStats ? 'checked' : ''}> Distribuir pontos automaticamente</label>
      <div class="cfg-row"><label for="cfg-loot">Guardar itens a partir de</label>
        <select id="cfg-loot">${RAR_ORDER.map((r) => `<option value="${r}" ${st.lootMin === r ? 'selected' : ''}>${RAR_NAME[r]}</option>`).join('')}</select>
        <small class="muted">Itens abaixo disso viram Zen na hora.</small></div>
      <label class="cfg-check"><input type="checkbox" id="cfg-pvp" ${st.pvpAuto ? 'checked' : ''}> Atacar jogadores inimigos automaticamente (Vulcanus ou PvP ligado)</label>
      <div class="cfg-row"><label for="cfg-gfx">Gráfico do jogo</label>
        <select id="cfg-gfx"><option value="2d">2D (pixel art)</option><option value="3d">3D (realista)</option></select></div>
      <div class="cfg-row"><label for="cfg-quality">Qualidade gráfica</label>
        <select id="cfg-quality"><option value="baixa">Baixa (celular fraco)</option><option value="media">Média</option><option value="alta">Alta</option><option value="ultra">Ultra (mais efeitos)</option></select></div>
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
    $('#cfg-gfx').value = is3d ? '3d' : '2d'; $('#cfg-gfx').onchange = (e) => setGfx(e.target.value);
    if (window.Sfx) {
      $('#cfg-vol').value = Math.round(Sfx.volume * 100); $('#cfg-vol-v').textContent = Math.round(Sfx.volume * 100) + '%';
      $('#cfg-vol').oninput = (e) => { Sfx.setVolume(Number(e.target.value) / 100); $('#cfg-vol-v').textContent = e.target.value + '%'; };
      $('#cfg-mute').checked = Sfx.muted; $('#cfg-mute').onchange = (e) => Sfx.setMuted(e.target.checked);
    }
    const oa = $('#open-admin'); if (oa) oa.onclick = () => openPanel('admin');
  }

  // ================= chat =================
  function addChat(l, notify) {
    const channel = CHAT_CHANNELS.includes(l.channel) ? l.channel : (l.from ? 'global' : 'information');
    CHAT_LOGS[channel].push(l);
    if (CHAT_LOGS[channel].length > 100) CHAT_LOGS[channel].shift();
    if (channel === activeChatChannel) paintChat();
    if (notify) {
      const labels = { local: 'LOCAL', global: 'GLOBAL', private: 'PRIVADO', guild: 'GUILDA', party: 'PARTY', information: 'INFORMAÇÕES' };
      const colors = { local: '#f2ead8', global: '#f0c64e', private: '#e99bdf', guild: '#7ddc86', party: '#77b8ff', information: '#ff9c52' };
      const name = l.from || 'Servidor';
      const message = l.en && window.I18N && I18N.lang === 'en' ? l.en : l.text;
      feed(`[${labels[channel]}] ${name}: ${message}`, 'chat-toast', colors[channel]);
      if (channel === 'private' && S.panel !== 'chat') {
        S.chatUnread++;
        const badge = $('#chat-badge');
        badge.textContent = S.chatUnread > 99 ? '99+' : String(S.chatUnread);
        badge.classList.add('badge-count');
        badge.hidden = false;
      }
    }
  }
  const CHAT_CHANNELS = ['local','global','private','guild','party','information'];
  const CHAT_LOGS = Object.fromEntries(CHAT_CHANNELS.map((c) => [c, []]));
  let activeChatChannel = 'global';
  function paintChat() {
    const ul = $('#chat-lines'); ul.replaceChildren();
    for (const l of CHAT_LOGS[activeChatChannel]) {
      const li = document.createElement('li');
      if (!l.from) { li.className = 'sys'; li.textContent = l.en && window.I18N && I18N.lang === 'en' ? l.en : l.text; if (/DOURAD|Dourad|Golden|GOLDEN/.test(l.text)) li.classList.add('gold'); }
      else {
        if (l.vipTier === 1 || l.vipTier === 2) {
          const tag = document.createElement('span'); tag.className = 'chat-vip vip-' + l.vipTier;
          tag.textContent = l.vipTier === 2 ? '[VIP PLATINUM] ' : '[VIP GOLD] '; li.appendChild(tag);
        }
        const b = document.createElement('b'); b.textContent = l.from + ': '; li.appendChild(b); li.append(l.text);
      }
      ul.appendChild(li);
    }
    ul.scrollTop = ul.scrollHeight;
    $('#chat-title').textContent = 'Chat · ' + ({local:'Local',global:'Global',private:'Privado',guild:'Guilda',party:'Party',information:'Informações'}[activeChatChannel]);
    $('#chat-target').hidden = activeChatChannel !== 'private';
    $$('.chat-tabs [data-chat-channel]').forEach((b) => b.classList.toggle('active', b.dataset.chatChannel === activeChatChannel));
  }
  function renderSocialInfo() {
    if (!S.social) return;
    const g = S.social.guild, party = S.social.party;
    $('#social-summary').textContent = `Guilda: ${g ? g.name + ' · ' + g.members + ' membro(s)' : 'nenhuma'} · Party: ${party ? party.members.join(', ') : 'nenhuma'}`;
  }
  $$('.chat-tabs [data-chat-channel]').forEach((b) => { b.onclick = () => { activeChatChannel = b.dataset.chatChannel; paintChat(); }; });
  $$('[data-social]').forEach((b) => {
    b.onclick = () => {
      const [area, action] = b.dataset.social.split(':');
      const target = area === 'guild' && action === 'create' ? $('#guild-name').value : area === 'guild' ? $('#guild-target').value : $('#party-target').value;
      send({ type: 'social', area, action, target });
    };
  });
  $('#chat-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const inp = e.target.text, v = inp.value.trim();
    if (v.startsWith('//')) send({ type: 'chat', text: inp.value, channel: 'global' });
    else if (v.startsWith('/')) { sendCmd(v); chatSys(v, 'cmd'); }
    else if (v) send({ type: 'chat', text: inp.value, channel: activeChatChannel, target: $('#chat-target').value });
    inp.value = '';
  });
  function sendCmd(text) { send({ type: 'cmd', text, nonce: Date.now().toString(36) + Math.random().toString(36).slice(2, 6) }); }
  function chatSys(text, cls) {
    const li = document.createElement('li');
    li.className = 'sys ' + (cls || ''); li.textContent = text;
    const ul = $('#chat-lines'); ul.appendChild(li);
    while (ul.children.length > 120) ul.firstChild.remove();
    ul.scrollTop = ul.scrollHeight;
    return li;
  }
  // resposta dos comandos de administração (só quem enviou recebe)
  function cmdResult(m) {
    m.lines.forEach((l, i) => chatSys(l, m.ok ? (i ? 'cmdres' : 'cmdres ok') : 'cmdres err'));
    if (m.confirm) {
      const li = chatSys('', 'cmdres');
      li.innerHTML = `<button class="btn small btn-danger" type="button">Confirmar</button> <button class="btn small" type="button">Cancelar</button>`;
      const [yes, no] = $$('button', li);
      yes.onclick = () => { sendCmd('/confirm ' + m.confirm.code); li.remove(); };
      no.onclick = () => { sendCmd('/cancel ' + m.confirm.code); li.remove(); };
      setTimeout(() => li.remove(), m.confirm.secs * 1000);
    }
    if (S.panel !== 'chat') feed(m.lines[0], m.ok ? 'quest' : 'warn');
  }

  // ================= Evolução de classe (Sevina e Marlon) =================
  const CQ = { npc: 'sevina', info: null, busy: false };
  // ================= Eventos: Chaos Castle e Devil Square =================
  const AR = { kind: 'castle', info: null, hud: null, skew: 0, busy: false };
  const mmss = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  const hhmm = (ms) => { const d = new Date(ms); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
  function onArena(m) {
    if (m.phase === 'notice' || m.phase === 'start') {
      const el = $('#gold-banner');
      el.textContent = window.I18N && I18N.lang === 'en' ? I18N.t(m.text) : m.text;
      el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
      feed(m.text, 'gold');
      if (window.Sfx && m.phase === 'start') Sfx.boss();
    }
    if (m.phase === 'start' || m.phase === 'hud') { AR.hud = m; AR.hudSkew = Date.now() - m.now; S.arenaZone = m.zone ? { ...m.zone, full: m.full } : null; arenaHud(); }
    if (m.phase === 'elim') feed(m.text, 'pvp');
    if (m.phase === 'result') { AR.hud = null; S.arenaZone = null; arenaHud(); showArenaResult(m); }
  }
  function arenaHud() {
    const el = $('#arena-hud'), H = AR.hud;
    if (!H || !S.map || !S.map.arena) { el.hidden = true; return; }
    el.hidden = false;
    el.classList.toggle('devil', H.kind === 'devil');
    $('#ah-title').textContent = H.name;
    $('#ah-time').textContent = mmss(H.endsAt - (Date.now() - (AR.hudSkew || 0)));
    $('#ah-alive').textContent = `${H.alive}/${H.total}`;
    $('#ah-mons').textContent = H.monsters;
    $('#ah-score').textContent = fmt.format(H.score);
    $('#ah-pos').textContent = H.me ? `${H.pos}º` : 'eliminado';
  }
  setInterval(arenaHud, 500);
  $('#ah-quit').onclick = () => { if (confirm('Sair do evento? Você será eliminado e a entrada não volta.')) send({ type: 'arena', action: 'quit', kind: AR.hud ? AR.hud.kind : AR.kind }); };
  function drawArenaZone(now) {
    const z = S.arenaZone;
    if (!z || !S.map || !S.map.arena || !z.full) return;
    const [ax, ay] = toScreen(z.x0, z.y0), [bx, by] = toScreen(z.x1, z.y1);
    const [fx0, fy0] = toScreen(z.full.x0, z.full.y0), [fx1, fy1] = toScreen(z.full.x1, z.full.y1);
    if (z.x0 > z.full.x0 + 1) {
      ctx.fillStyle = `rgba(200,20,20,${0.22 + 0.1 * Math.sin(now / 250)})`;
      ctx.fillRect(fx0, fy0, fx1 - fx0, ay - fy0); ctx.fillRect(fx0, by, fx1 - fx0, fy1 - by);
      ctx.fillRect(fx0, ay, ax - fx0, by - ay); ctx.fillRect(bx, ay, fx1 - bx, by - ay);
    }
    ctx.strokeStyle = `rgba(255,${120 + Math.round(60 * Math.sin(now / 200))},80,.9)`; ctx.lineWidth = Math.max(2, 3 * dpr);
    ctx.setLineDash([8 * dpr, 6 * dpr]); ctx.strokeRect(ax, ay, bx - ax, by - ay); ctx.setLineDash([]);
  }
  function renderArena() {
    const body = $('#arena-body'), I = AR.info;
    if (!I || I.kind !== AR.kind) { body.innerHTML = '<p class="muted">Carregando…</p>'; $('#arena-title').textContent = AR.kind === 'devil' ? 'Devil Square' : 'Chaos Castle'; return; }
    $('#arena-title').textContent = I.name;
    const now = Date.now() - AR.skew;
    const my = I.myCat >= 0 ? I.categories[I.myCat] : null;
    const phaseTxt = !I.enabled ? 'Evento desativado' : I.phase === 'running' ? 'Partida em andamento' : I.phase === 'open' ? 'Inscrições abertas · começa em' : `Próximo às ${hhmm(I.slot)} · inscrições abrem em`;
    const cd = I.phase === 'open' ? I.slot - now : I.openAt - now;
    const canReg = I.enabled && I.phase === 'open' && my && my.entry.have > 0 && I.registered === null && !I.inMatch;
    const rw = I.rewards ? `<div class="ar-rw"><b>Vencedor:</b> ${I.rewards.winner.map(esc).join(', ') || '—'}</div><div class="ar-rw"><b>2º:</b> ${I.rewards.second.map(esc).join(', ') || '—'} · <b>3º:</b> ${I.rewards.third.map(esc).join(', ') || '—'}</div><div class="ar-rw"><b>Participação:</b> ${I.rewards.participant.map(esc).join(', ') || '—'}</div>` : '';
    body.innerHTML = `<div class="ar-count"><span id="ar-phase">${phaseTxt}</span>${I.enabled && I.phase !== 'running' ? `<b id="ar-cd">${mmss(cd)}</b>` : ''}</div>
      ${I.registered !== null ? `<p class="req-ok">✔ Você está inscrito no ${esc(I.categories[I.registered].name)}. Fique online: o item de entrada só é usado quando a partida começar.</p>` : ''}
      ${!I.atNpc ? `<p class="chaos-warn">Fale com ${I.kind === 'castle' ? 'o Guarda do Chaos Castle' : 'Charon'} em Lorencia para se inscrever. <button class="btn small" type="button" id="ar-go">Ir para Lorencia</button></p>` : ''}
      <table class="ar-cats"><thead><tr><th>Categoria</th><th>Nível</th><th>Entrada</th><th>Inscritos</th></tr></thead><tbody>
      ${I.categories.map((c) => `<tr class="${c.i === I.myCat ? 'mine' : ''}"><td>${esc(c.name)}${c.running ? ' ⚔' : ''}</td><td>${c.minLevel}${c.maxLevel >= 9999 ? '+' : '–' + c.maxLevel}${c.minResets ? ` · ${c.minResets}+ resets` : ''}</td>
        <td class="${c.entry.have ? 'ok' : 'no'}">${esc(c.entry.name)} (${c.entry.have})</td><td>${c.registered}/${I.maxPlayers}</td></tr>`).join('')}</tbody></table>
      ${my ? '' : '<p class="bad">Seu nível não se encaixa em nenhuma categoria.</p>'}
      <div class="ar-actions">
        ${I.inMatch ? '<button class="btn btn-gold" type="button" data-ar="quit">Sair do evento</button>' : ''}
        ${I.registered === null && !I.inMatch ? `<button class="btn btn-gold" type="button" data-ar="register" ${canReg ? '' : 'disabled'}>Confirmar inscrição</button>` : ''}
        ${I.registered !== null && I.phase === 'open' ? '<button class="btn" type="button" data-ar="unregister">Cancelar inscrição</button>' : ''}
        ${I.kind === 'castle' && I.buyZen ? `<button class="btn small" type="button" data-ar="buy" ${I.zen >= I.buyZen ? '' : 'disabled'}>Comprar ${esc(I.categories[0].entry.name)} (${fmt.format(I.buyZen)} Zen)</button>` : ''}
      </div>
      ${rw ? `<h4>Prêmios da sua categoria</h4>${rw}` : ''}
      <h4>Regras</h4>
      <ul class="ar-rules">
        <li>Inscrições abrem antes do horário; a partida dura ${I.durationMin} min e precisa de ${I.minPlayers}+ participante${I.minPlayers > 1 ? 's' : ''} (máximo ${I.maxPlayers}).</li>
        ${I.kind === 'castle' ? `<li>Todos contra todos e contra os soldados do castelo. Vence o último de pé.</li>${I.shrink ? '<li>A área segura diminui com o tempo: fora dela você perde vida.</li>' : ''}${I.disguise ? '<li>Todos entram disfarçados de guerreiro do castelo (seus itens continuam com você).</li>' : ''}<li>Se o tempo acabar, vence quem tiver mais pontos (jogadores e monstros derrotados).</li>`
    : '<li>Ondas de monstros sem parar. Quem fizer mais pontos vence.</li><li>Use o Devil\'s Invitation do nível da sua categoria.</li>'}
        <li>Quem morre ou sai é eliminado e volta para Lorencia (sem perder EXP). O item de entrada só é gasto quando a partida começa.</li>
      </ul>`;
    $$('[data-ar]', body).forEach((b) => { b.onclick = () => {
      if (AR.busy) return;
      if (b.dataset.ar === 'quit' && !confirm('Sair do evento? Você será eliminado e a entrada não volta.')) return;
      AR.busy = true; send({ type: 'arena', action: b.dataset.ar, kind: I.kind });
    }; });
    const go = $('#ar-go'); if (go) go.onclick = () => send({ type: 'teleport', map: 'lorencia' });
  }
  setInterval(() => {
    if (S.panel !== 'arena' || !AR.info) return;
    const I = AR.info, el = $('#ar-cd'); if (!el) return;
    const now = Date.now() - AR.skew;
    const ms = I.phase === 'open' ? I.slot - now : I.openAt - now;
    el.textContent = mmss(ms);
    if (ms <= 0) send({ type: 'arena', action: 'info', kind: I.kind });
  }, 1000);
  function showArenaResult(m) {
    const el = $('#arena-result');
    el.innerHTML = `<h3 id="ar-res-title">${esc(m.name)}</h3>
      <p>${m.winner ? `Vencedor: <b style="color:#ffd36b">${esc(m.winner)}</b>` : 'Terminou sem vencedor'}</p>
      <div class="place">${m.place}º <small style="font-size:16px;color:var(--bone-dim)">de ${m.total}</small></div>
      <p>${fmt.format(m.score)} pontos · ${m.mk} monstros${m.pk ? ` · ${m.pk} jogadores` : ''}</p>
      <p class="rw">${m.rewards && m.rewards.length ? 'Prêmios: ' + m.rewards.map(esc).join(', ') : 'Sem prêmio desta vez.'}</p>
      <ul>${(m.top || []).map((x) => `<li><span>${x.place}º ${esc(x.name)}</span><span>${fmt.format(x.score)} pts</span></li>`).join('')}</ul>
      <button class="btn btn-gold" type="button" id="ar-res-ok">OK</button>`;
    el.hidden = false;
    if (m.place === 1 && m.winner) { goldFlash(`${m.name}!`); if (window.Sfx) Sfx.levelUp(); }
    $('#ar-res-ok').onclick = () => { el.hidden = true; };
  }

  // ================= Troca entre jogadores =================
  const TR = { s: null, inv: null, sel: null, view: null, invTimer: null };
  function heroIcon(cls, size = 56) {
    const c = document.createElement('canvas'); c.width = size * 2; c.height = size * 2; c.className = 'tr-hero';
    try { Sprites.hero(c.getContext('2d'), cls, { hair: 1, skin: 1 }, 'idle', 0, size, size * 2 - 6, 1.6, false); } catch (_) { /* sem sprite */ }
    return c;
  }
  function tradeInvite(m) {
    TR.inv = m;
    const box = $('#trade-invite');
    box.innerHTML = `<div class="ti-heads"><span data-h="a"></span><b>⇄</b><span data-h="b"></span></div>
      <p><b>${esc(m.from.name)}</b> <small>(${esc(m.from.className)}, nível ${m.from.level})</small> deseja trocar itens com você.</p>
      <div class="ti-bar"><i id="ti-bar"></i></div>
      <div class="row"><button class="btn btn-ok" type="button" data-a="1">ACEITAR</button><button class="btn btn-danger" type="button" data-a="0">RECUSAR</button><small id="ti-left"></small></div>`;
    $('[data-h="a"]', box).appendChild(heroIcon(m.from.cls)); $('[data-h="b"]', box).appendChild(heroIcon(m.to.cls));
    box.hidden = false; box.classList.remove('pop'); void box.offsetWidth; box.classList.add('pop');
    if (window.Sfx) Sfx.duel();
    const end = performance.now() + m.ms;
    clearInterval(TR.invTimer);
    TR.invTimer = setInterval(() => {
      const left = Math.max(0, end - performance.now());
      const b = $('#ti-bar'); if (b) b.style.width = (left / m.ms * 100) + '%';
      const l = $('#ti-left'); if (l) l.textContent = Math.ceil(left / 1000) + 's';
      if (!left) closeTradeInvite();
    }, 200);
    const answer = (acc) => { if (!TR.inv) return; send({ type: 'trade', action: 'answer', id: m.id, accept: acc }); closeTradeInvite(); };
    $('[data-a="1"]', box).onclick = () => answer(true);
    $('[data-a="0"]', box).onclick = () => answer(false);
  }
  function closeTradeInvite() { TR.inv = null; clearInterval(TR.invTimer); $('#trade-invite').hidden = true; }
  function tradeStatus(t, bad) { const e = $('#tr-status'); if (e) { e.textContent = t || ''; e.className = 'tr-status' + (bad ? ' bad' : ''); } }
  function onTrade(m) {
    if (m.phase === 'closed' || m.phase === 'done') {
      TR.s = null; TR.sel = null;
      $('#trade-win').hidden = true; $('#trade-dlg').hidden = true; closeItemInfo();
      if (m.phase === 'done') { goldFlash('Troca concluída!'); if (window.Sfx) Sfx.coin(); feed(m.text, 'quest'); }
      else if (m.text) { feed(m.text, 'warn'); alertBanner(m.text); }
      return;
    }
    const first = !TR.s;
    TR.s = m;
    if (first) { closeTradeInvite(); if (S.panel) closePanel(); if (window.Sfx) Sfx.click(); }
    renderTrade();
    if (m.text) tradeStatus(m.text);
    // se o item aberto nos detalhes saiu da oferta, avisa
    if (TR.view && TR.view.side === 'them' && !m.them.items.some((i) => i.id === TR.view.id)) { $('#item-info-body').insertAdjacentHTML('afterbegin', '<p class="bad">Este item não está mais sendo oferecido.</p>'); TR.view = null; }
  }
  function tradeSlots(list, side) {
    let h = '';
    for (let i = 0; i < 12; i++) h += list[i] ? `<button type="button" class="islot tr-slot" data-side="${side}" data-id="${list[i].id}" style="--r:${RAR[list[i].rarity]}" aria-label="${esc(list[i].name)}"></button>` : `<div class="islot empty tr-slot" data-side="${side}" data-empty="${i}"></div>`;
    return h;
  }
  function renderTrade() {
    const m = TR.s; if (!m) return;
    const win = $('#trade-win'); win.hidden = false;
    const offered = new Map(m.me.items.map((i) => [i.id, i.qty]));
    const bag = (S.char ? S.char.items : []).filter((i) => !i.equipped);
    $('#tr-body').innerHTML = `
      <div class="tr-cols">
        <section class="tr-side mine ${m.me.confirmed ? 'ok' : ''}"><h3>SUA OFERTA <small>${esc(m.me.name)} · Nv. ${m.me.level}</small></h3>
          <div class="tr-grid" id="tr-mine">${tradeSlots(m.me.items, 'me')}</div>
          <div class="tr-zen"><label>Zen <input id="tr-zen" inputmode="numeric" value="${fmt.format(m.me.zen)}" aria-label="Zen oferecido"></label><button class="btn small" type="button" id="tr-zen-set">Oferecer</button></div>
          <p class="tr-sub">${m.me.items.length}/12 itens · fica com ${fmt.format(Math.max(0, m.myZen - m.me.zen))} de ${fmt.format(m.myZen)} Zen</p>
          <p class="tr-state">${m.me.confirmed ? '✔ Você confirmou' : 'Aguardando sua confirmação'}</p></section>
        <section class="tr-side theirs ${m.them.confirmed ? 'ok' : ''}"><h3>OFERTA DE ${esc(m.them.name.toUpperCase())} <small>Nv. ${m.them.level} <i class="dot ${m.them.online ? 'on' : ''}" title="${m.them.online ? 'conectado' : 'desconectado'}"></i></small></h3>
          <div class="tr-grid" id="tr-theirs">${tradeSlots(m.them.items, 'them')}</div>
          <div class="tr-zen them"><span>Zen</span><b>${fmt.format(m.them.zen)}</b></div>
          <p class="tr-sub">${m.them.items.length}/12 itens</p>
          <p class="tr-state">${m.them.confirmed ? '✔ Confirmou' : 'Ainda não confirmou'}</p></section>
      </div>
      <h4 class="tr-inv-h">Sua bolsa <small>toque para adicionar · arraste para um espaço da sua oferta</small></h4>
      <div class="bag-grid tr-bag" id="tr-bag"></div>`;
    for (const el of $$('#tr-mine [data-id], #tr-theirs [data-id]')) {
      const list = el.dataset.side === 'me' ? m.me.items : m.them.items;
      const it = list.find((x) => x.id === el.dataset.id);
      el.appendChild(iconCanvas(it));
      if (it.plus) el.insertAdjacentHTML('beforeend', `<span class="plus">+${it.plus}</span>`);
      if (it.stack) el.insertAdjacentHTML('beforeend', `<span class="qty">${it.qty}</span>`);
      el.onclick = () => openItemInfo(it, el.dataset.side);
    }
    const bg = $('#tr-bag');
    for (const it of bag) {
      const left = (Number(it.qty) || 1) - (offered.get(it.id) || 0);
      if (offered.has(it.id) && (!it.stack || left <= 0)) continue;
      const b = slotButton(offered.has(it.id) ? { ...it, qty: left } : it, () => tradePick(it));
      b.classList.remove('sel', 'drop-ok', 'drop-no');
      if (TR.sel === it.id) b.classList.add('sel');
      b.addEventListener('pointerdown', (ev) => tradeDrag(ev, it));
      b.style.touchAction = 'none';
      bg.appendChild(b);
    }
    if (!bg.children.length) bg.innerHTML = '<p class="muted" style="grid-column:1/-1;margin:2px 0">Nada para oferecer.</p>';
    $('#tr-zen').oninput = (e) => { const d = e.target.value.replace(/[^\d]/g, ''); e.target.value = d ? fmt.format(Number(d)) : ''; };
    $('#tr-zen-set').onclick = () => send({ type: 'trade', action: 'zen', amount: Number($('#tr-zen').value.replace(/[^\d]/g, '') || 0) });
    $('#tr-confirm').textContent = m.me.confirmed ? 'AGUARDANDO…' : 'CONFIRMAR TROCA';
    $('#tr-confirm').disabled = m.me.confirmed;
    if (m.me.confirmed && !m.them.confirmed) tradeStatus('Você confirmou a oferta atual. Aguardando a confirmação do outro jogador.');
  }
  function tradePick(it) {
    TR.sel = it.id;
    const d = $('#trade-dlg');
    const off = TR.s.me.items.find((x) => x.id === it.id);
    const max = (Number(it.qty) || 1);
    d.innerHTML = `<h3 style="color:${RAR[it.rarity]}">${esc(it.name)}${it.plus ? ' +' + it.plus : ''}</h3>
      ${it.stack ? `<label>Quantidade (até ${fmt.format(max)}) <input type="number" id="tr-qty" min="1" max="${max}" value="${off ? off.qty : max}"></label>` : ''}
      <div class="row"><button class="btn btn-gold" type="button" id="tr-add">Adicionar à troca</button><button class="btn" type="button" id="tr-info">Ver detalhes</button><button class="btn btn-ghost" type="button" id="tr-x">Fechar</button></div>`;
    d.hidden = false;
    $('#tr-add').onclick = () => { send({ type: 'trade', action: 'add', item: it.id, qty: it.stack ? Number($('#tr-qty').value) : 1 }); d.hidden = true; TR.sel = null; };
    $('#tr-info').onclick = () => { d.hidden = true; openItemInfo(it, 'bag'); };
    $('#tr-x').onclick = () => { d.hidden = true; TR.sel = null; renderTrade(); };
  }
  function tradeDrag(ev, it) {
    if (ev.button > 0) return;
    const sx = ev.clientX, sy = ev.clientY;
    let ghost = null, over = null;
    const move = (e) => {
      if (!ghost) { if (Math.hypot(e.clientX - sx, e.clientY - sy) < 10) return; ghost = document.createElement('div'); ghost.className = 'jewel-ghost'; ghost.appendChild(iconCanvas(it)); document.body.appendChild(ghost); UP.justDragged = true; }
      e.preventDefault();
      ghost.style.left = e.clientX + 'px'; ghost.style.top = e.clientY + 'px';
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const zone = el && el.closest && el.closest('#tr-mine');
      if (over && !zone) over.classList.remove('drop-hover');
      over = zone; if (over) over.classList.add('drop-hover');
    };
    const up = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
      if (!ghost) return;
      ghost.remove();
      if (over) { over.classList.remove('drop-hover'); if (it.stack) tradePick(it); else send({ type: 'trade', action: 'add', item: it.id, qty: 1 }); }
      setTimeout(() => { UP.justDragged = false; }, 50);
    };
    window.addEventListener('pointermove', move, { passive: false }); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
  }
  // janela de detalhes completa (somente leitura) com comparação com o que está equipado
  // ---------- Janela de informações do item (estilo MU): uma estrutura só para bolsa, equipamentos, baú, troca, mercado e loja ----------
  const KIND_TXT = { sword: 'Espada', bow: 'Arco', staff: 'Cajado', scepter: 'Cetro', book: 'Livro', axe: 'Machado', firesword: 'Espada' };
  const EXC_CAT = (slot) => slot === 'weapon' ? 'weapon' : slot === 'shield' ? 'shield' : slot === 'gloves' ? 'gloves' : slot === 'boots' ? 'boots' : ['helm', 'armor', 'pants'].includes(slot) ? 'armor' : null;
  function muGrade(it) {
    const ex = S.data && S.data.excellent;
    const cat = EXC_CAT(it.slot);
    const pool = ex && cat ? (ex.pools[cat] || []) : [];
    if (!cat || !pool.length) return null;
    const have = new Set((it.excellentOptions || []).map((o) => o.id));
    const possible = Math.min(ex.max || 4, pool.length);
    const n = have.size;
    return { grade: n >= possible ? 'FULL' : n > 0 ? 'SEMI FULL' : 'NORMAL', n, possible, missing: pool.filter((id) => !have.has(id)).map((id) => (ex.names[id] || { name: id }).name) };
  }
  function muClass(it) {
    if (it.rarity === 'legendary' || it.rarity === 'ancestral') return 'Lendário';
    if (it.set && S.data.sets[it.set] && S.data.sets[it.set].seasonal) return 'Ancient';
    if (it.excellent) return 'Excelente';
    return 'Normal';
  }
  function muTipHtml(it, opt = {}) {
    const L = [];
    const line = (t, cls = '') => L.push(`<div class="mt-l ${cls}">${t}</div>`);
    const R = it.reqs || {};
    const st = it.stats || {};
    const equipable = !!SLOT_NAME[it.slot];
    const g = equipable ? muGrade(it) : null;
    const nameCol = it.excellent ? '#7cff6a' : RAR[it.rarity];
    line(`${it.excellent ? '<span>Excelente</span> ' : ''}<span>${esc(it.name)}</span>${it.plus ? ` [+${it.plus}]` : ''}${it.stack && it.qty > 1 ? ' ×' + fmt.format(it.qty) : ''}${g && g.grade === 'FULL' ? ' <b class="mt-full">FULL</b>' : ''}`, 'mt-name" style="color:' + nameCol);
    let type = it.slot === 'material' ? (it.event ? 'Item de evento' : 'Material') : it.slot === 'box' ? 'Caixa' : it.slot === 'quest' ? 'Item de missão'
      : it.cat === 'cape' ? `Capa · nível ${it.tier}` : it.cat === 'wings' ? `Asas · nível ${it.tier}`
      : it.slot === 'weapon' ? `<span>${KIND_TXT[it.kind] || 'Arma'}</span> · <span>${R.twoHand ? 'arma de duas mãos' : 'arma de uma mão'}</span>` : esc(SLOT_NAME[it.slot] || (it.slot === 'potion' ? 'Poção' : ''));
    if (type) line(it.slot === 'weapon' ? type : `<span>${type}</span>`, 'mt-type');
    if (equipable) {
      line(`<span style="color:${RAR[it.rarity]}">${RAR_NAME[it.rarity]}</span> · <span>${muClass(it)}</span>${g ? ` · <b class="mt-grade mt-g-${g.grade.replace(' ', '')}">${g.grade}</b>` : ''}`, 'mt-cls');
      if (it.plus !== undefined) line(`Aprimoramento: +${it.plus || 0} / +15`, 'mt-dim');
    }
    L.push('<div class="mt-sep"></div>');
    if (st.dmg) line(`Dano: ${fmt.format(st.dmg[0])} ~ ${fmt.format(st.dmg[1])}`);
    if (st.def) line(`Defesa: ${fmt.format(st.def)}`);
    if (st.hp) line(`Vida adicional: +${fmt.format(st.hp)}`);
    if (st.wdmg) line(`Aumenta o dano em +${st.wdmg}%`, 'mt-spec');
    if (st.absorb) line(`Absorve ${st.absorb}% do dano recebido`, 'mt-spec');
    if (equipable) {
      const lvl = R.level || it.req;
      const meets = (v, need) => (v >= need ? '' : 'mt-bad');
      if (lvl) line(`Nível necessário: ${fmt.format(lvl)}`, S.char ? meets(S.char.level, lvl) : '');
      for (const k of ['str', 'agi', 'ene', 'vit', 'cmd']) if (R[k]) line(`${STAT_PT[k]} necessária: ${fmt.format(R[k])}`, S.char ? meets(S.char.stats[k] || 0, R[k]) : '');
      if (R.minEvo) line(`Evolução necessária: ${(S.char && S.char.evolutions && S.char.evolutions[R.minEvo]) || R.minEvo}`, S.char ? meets(S.char.evo || 0, R.minEvo) : '');
      if (R.classes) {
        const all = R.classes.length === Object.keys(S.data.classes).length;
        const names = R.classes.map((k) => (S.data.classes[k] ? S.data.classes[k].name : k)).join(' / ');
        const okc = !S.char || R.classes.includes(S.char.cls);
        line(all ? 'Classe permitida: todas as classes' : `<span>Classe permitida:</span> ${esc(names)}`, okc ? '' : 'mt-bad');
        if (!okc) line('Não pode ser equipado por esta classe.', 'mt-bad');
      }
    }
    const exo = Array.isArray(it.excellentOptions) ? it.excellentOptions : [];
    if (exo.length) {
      L.push('<div class="mt-sep"></div>');
      for (const o of exo) line(`${/^Luck/.test(o.name) ? '' : '<span>Aumenta</span> '}<span>${esc(o.name)}</span> +${o.value}${o.unit || ''}`, /^Luck|Skill/.test(o.name) ? 'mt-spec' : 'mt-exc');
    }
    if (g && g.grade === 'SEMI FULL' && g.missing.length) {
      line(`Possui ${g.n} de ${g.possible} opções · faltam (sorteáveis):`, 'mt-dim');
      line(g.missing.map((n) => `<span>${esc(n)}</span>`).join(' · '), 'mt-miss');
    }
    if (it.set && S.data.sets[it.set]) { L.push('<div class="mt-sep"></div>'); line(`Conjunto ${esc(S.data.sets[it.set].name)}: ${esc(S.data.sets[it.set].bonus)}`, 'mt-spec'); }
    if (it.desc && !equipable) line(esc(it.desc), 'mt-dim');
    if (it.locked) line('Bloqueado', 'mt-bad');
    if (it.slot === 'quest') line('Não pode ser trocado', 'mt-bad');
    const price = opt.price || (it.value ? `Preço de venda: ${fmt.format(it.value)} Zen` : '');
    if (price) { L.push('<div class="mt-sep"></div>'); line(esc(price), 'mt-price'); }
    return `<div class="mu-tip-body">${L.join('')}</div>`;
  }
  // tooltip que acompanha o mouse (computador); no celular o toque abre os detalhes com a mesma estrutura
  const canHover = window.matchMedia && matchMedia('(hover: hover) and (pointer: fine)').matches;
  function tipBind(el, it, opt) { if (el && it) TIP.map.set(el, { it, opt }); return el; }
  function tipFind(t) {
    for (let e = t, k = 0; e && k < 4; e = e.parentElement, k++) {
      if (TIP.map.has(e)) return TIP.map.get(e);
      if (k > 0 && e.querySelectorAll) { const cs = e.querySelectorAll('canvas'); if (cs.length === 1 && TIP.map.has(cs[0])) return TIP.map.get(cs[0]); }
    }
    return null;
  }
  function tipPlace(x, y) {
    const el = TIP.el, w = el.offsetWidth, h = el.offsetHeight, vw = innerWidth, vh = innerHeight;
    let nx = x + 18, ny = y + 14;
    if (nx + w > vw - 6) nx = Math.max(6, x - w - 14);
    if (ny + h > vh - 6) ny = Math.max(6, vh - h - 6);
    el.style.transform = `translate(${Math.round(nx)}px,${Math.round(ny)}px)`;
  }
  if (canHover) {
    TIP.el = document.createElement('div'); TIP.el.className = 'mu-tip'; TIP.el.hidden = true; TIP.el.setAttribute('role', 'tooltip');
    document.body.appendChild(TIP.el);
    document.addEventListener('mouseover', (ev) => {
      const f = tipFind(ev.target);
      if (!f) { if (TIP.cur) { TIP.cur = null; TIP.el.hidden = true; } return; }
      if (TIP.cur !== f) {
        TIP.cur = f;
        TIP.el.innerHTML = '';
        const ic = document.createElement('div'); ic.className = 'mt-icon'; ic.style.setProperty('--r', RAR[f.it.rarity] || '#888'); ic.appendChild(iconCanvas(f.it, true));
        TIP.el.appendChild(ic);
        TIP.el.insertAdjacentHTML('beforeend', muTipHtml(f.it, f.opt));
        TIP.el.hidden = false;
      }
      tipPlace(ev.clientX, ev.clientY);
    });
    document.addEventListener('mousemove', (ev) => { if (TIP.cur) tipPlace(ev.clientX, ev.clientY); }, { passive: true });
    document.addEventListener('mousedown', () => { TIP.cur = null; TIP.el.hidden = true; }, true);
    document.addEventListener('scroll', () => { TIP.cur = null; TIP.el.hidden = true; }, true);
  }

  function itemInfoHtml(it) {
    const R = it.reqs || {};
    const cls = S.char ? S.char.cls : null;
    const typeTxt = it.slot === 'material' ? (it.event ? 'Item de evento' : 'Material') : it.slot === 'box' ? 'Caixa' : it.slot === 'quest' ? 'Item de missão' : it.cat === 'cape' ? `Capa · nível ${it.tier}` : it.cat === 'wings' ? `Asa · nível ${it.tier}` : (SLOT_NAME[it.slot] || it.slot);
    const equipable = !!SLOT_NAME[it.slot];
    const rows = [];
    const st = it.stats || {};
    if (st.dmg) rows.push(['Dano', `${st.dmg[0]}–${st.dmg[1]}`]);
    if (st.def) rows.push(['Defesa', `+${st.def}`]);
    if (st.hp) rows.push(['Vida', `+${st.hp}`]);
    if (st.wdmg) rows.push(['Dano extra', `+${st.wdmg}%`]);
    if (st.absorb) rows.push(['Absorção', `${st.absorb}%`]);
    if (Array.isArray(it.excellentOptions) && it.excellentOptions.length) {
      rows.push(['Opções Excellent', it.excellentOptions.map((o) => `${o.name} +${o.value}${o.unit || ''}`).join(' · ')]);
    }
    if (equipable) rows.push(['Aprimoramento', `+${it.plus || 0}`]);
    if (it.stack) rows.push(['Quantidade', fmt.format(it.qty)]);
    const req = [];
    if (equipable) {
      if (R.level || it.req) req.push([S.char && S.char.level >= (R.level || it.req), `Nível ${R.level || it.req}`]);
      if (R.classes) { const names = R.classes.map((k) => (S.data.classes[k] ? S.data.classes[k].name : k)); req.push([R.classes.includes(cls), `Classes: ${names.length === Object.keys(S.data.classes).length ? 'todas' : names.join(', ')}`]); }
      if (R.minEvo) req.push([(S.char.evo || 0) >= R.minEvo, `Evolução ${R.minEvo}`]);
      for (const k of ['str', 'agi', 'ene', 'vit', 'cmd']) if (R[k]) req.push([(S.char.stats[k] || 0) >= R[k], `${STAT_PT[k]} ${fmt.format(R[k])}`]);
    }
    const restr = [];
    if (R.twoHand) restr.push('Arma de duas mãos (sem escudo)');
    if (it.slot === 'quest') restr.push('Não pode ser trocado');
    if (it.locked) restr.push('Bloqueado');
    if (it.set && S.data.sets[it.set]) restr.push(`Conjunto ${S.data.sets[it.set].name}: ${S.data.sets[it.set].bonus}`);
    let cmp = '';
    if (equipable && S.char) {
      const slot = it.slot;
      const cur = S.char.items.find((i) => i.equipped && i.slot === slot && i.eqSlot !== 'ring2' && i.id !== it.id);
      if (!cur) cmp = '<p class="muted">Comparação: nenhum equipamento equipado nesta posição.</p>';
      else {
        const a = it.stats || {}, b = cur.stats || {};
        const avg = (x) => (x.dmg ? (x.dmg[0] + x.dmg[1]) / 2 : 0);
        const line = (label, va, vb, suf = '') => { if (!va && !vb) return ''; const d = Math.round((va - vb) * 10) / 10; return `<tr><td>${label}</td><td>${fmt.format(Math.round(va))}${suf}</td><td>${fmt.format(Math.round(vb))}${suf}</td><td class="${d > 0 ? 'up' : d < 0 ? 'down' : 'same'}">${d > 0 ? '+' : ''}${fmt.format(d)}${suf}</td></tr>`; };
        cmp = `<h4>Comparação com o seu ${esc(cur.name)}${cur.plus ? ' +' + cur.plus : ''}</h4><table class="ii-cmp"><thead><tr><th></th><th>Este</th><th>Seu</th><th>Diferença</th></tr></thead><tbody>
          ${line('Dano médio', avg(a), avg(b))}${line('Defesa', a.def || 0, b.def || 0)}${line('Vida', a.hp || 0, b.hp || 0)}${line('Dano extra', a.wdmg || 0, b.wdmg || 0, '%')}${line('Absorção', a.absorb || 0, b.absorb || 0, '%')}${line('Chance crítica', a.critChance || 0, b.critChance || 0, '%')}${line('Dano crítico', a.critDamage || 0, b.critDamage || 0, '%')}${line('Reflexão', a.reflect || 0, b.reflect || 0, '%')}${line('Redução de dano', a.reduction || 0, b.reduction || 0, '%')}${line('Velocidade de ataque', a.attackSpeed || 0, b.attackSpeed || 0)}${line('Aprimoramento', it.plus || 0, cur.plus || 0)}
          </tbody></table>`;
      }
    }
    void rows; void req; void typeTxt;
    return `<div class="mu-tip mu-tip-inline">${muTipHtml(it)}</div>
      ${it.contents ? `<p class="box-list-title">Pode conter:</p><ul class="box-list">${it.contents.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>` : ''}
      ${R.twoHand ? '<ul class="ii-restr"><li>Arma de duas mãos (sem escudo)</li></ul>' : ''}
      ${cmp}`;
  }
  function openItemInfo(it, side) {
    TR.view = { id: it.id, side };
    const box = $('#item-info');
    $('#item-info-body').innerHTML = '';
    $('#item-info-body').appendChild((() => { const c = document.createElement('div'); c.className = 'ii-icon'; c.style.setProperty('--r', RAR[it.rarity]); c.appendChild(iconCanvas(it)); return c; })());
    $('#item-info-body').insertAdjacentHTML('beforeend', itemInfoHtml(it));
    itemPreview(it, $('#item-info-body'));
    $('#item-info-actions').innerHTML = (side === 'me' ? '<button class="btn" type="button" id="ii-remove">Tirar da oferta</button>' : '') + '<button class="btn btn-gold" type="button" id="ii-close">FECHAR</button>';
    box.hidden = false;
    $('#ii-close').onclick = closeItemInfo;
    const rm = $('#ii-remove'); if (rm) rm.onclick = () => { send({ type: 'trade', action: 'remove', item: it.id }); closeItemInfo(); };
  }
  function closeItemInfo() { $('#item-info').hidden = true; TR.view = null; PV.on = false; }
  // ---------- inspeção: o item vestido no seu herói, girando (de frente, de lado, andando, de costas) ----------
  const PV = { on: false };
  const PV_VIEWS = [['idle_front', false, 'De frente'], ['walk_front', false, 'Andando'], ['idle', false, 'De lado'], ['walk', true, 'Andando de lado'], ['walk_back', false, 'De costas']];
  function itemPreview(it, root) {
    PV.on = false;
    const visual = ['weapon', 'helm', 'armor', 'gloves', 'boots', 'wings'].includes(it.slot);
    if (!visual || !S.char) return;
    const me = S.players.get(S.youId);
    const eq = { ...((me && me.info && me.info.eq) || {}) };
    if (it.slot === 'weapon') { eq.w = it.base; eq.wr = it.rarity; eq.wp = it.plus || 0; eq.wg = ['epic', 'legendary', 'ancestral'].includes(it.rarity) ? RAR[it.rarity] : (it.plus || 0) >= 7 ? '#7ad0ff' : null; }
    else if (it.slot === 'wings') { eq.wings = it.base; eq.wingRarity = it.rarity; eq.wingPlus = it.plus || 0; }
    else if (it.set) eq[it.slot] = it.set;
    const box = document.createElement('div'); box.className = 'ii-preview';
    box.innerHTML = '<canvas width="240" height="190" aria-label="Prévia do item no seu herói"></canvas><div class="ii-pv-bar"><button type="button" class="btn small" data-pv="-1" aria-label="Girar">◀</button><span></span><button type="button" class="btn small" data-pv="1" aria-label="Girar">▶</button></div>';
    root.insertBefore(box, root.children[1] || null);
    const cv2 = box.querySelector('canvas'), g = cv2.getContext('2d'), lab = box.querySelector('span');
    let vi = 0, auto = performance.now();
    const turn = (d) => { vi = (vi + d + PV_VIEWS.length) % PV_VIEWS.length; auto = performance.now(); };
    box.querySelectorAll('[data-pv]').forEach((b) => { b.onclick = () => turn(Number(b.dataset.pv)); });
    cv2.onclick = () => turn(1);
    if (is3d) {
      // 3D: o herói de verdade girando com o item vestido
      cv2.width = 300; cv2.height = 260; box.querySelector('.ii-pv-bar').hidden = true;
      W3().preview(cv2, { kind: 'hero', cls: S.char.cls, eq });
      return;
    }
    Sprites.preloadEquip(S.char.cls, eq);
    PV.on = true;
    const token = PV.token = {};
    const step = (now) => {
      if (!PV.on || PV.token !== token || !box.isConnected) return;
      if (now - auto > 2600) turn(1);
      const [act, flip, name] = PV_VIEWS[vi];
      lab.textContent = name;
      g.clearRect(0, 0, cv2.width, cv2.height);
      const grd = g.createRadialGradient(120, 168, 4, 120, 168, 70); grd.addColorStop(0, 'rgba(255,211,107,.25)'); grd.addColorStop(1, 'rgba(255,211,107,0)');
      g.fillStyle = grd; g.fillRect(0, 100, 240, 90);
      g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.ellipse(120, 176, 26, 7, 0, 0, Math.PI * 2); g.fill();
      Sprites.hero(g, S.char.cls, S.char.ap, act, now, 120, 176, 1.6, flip, { equip: eq });
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  function tradeDialog(html, buttons) {
    const d = $('#trade-dlg');
    d.innerHTML = html + `<div class="row">${buttons.map((b, i) => `<button class="btn ${b.cls || ''}" type="button" data-b="${i}">${esc(b.label)}</button>`).join('')}</div>`;
    d.hidden = false;
    $$('[data-b]', d).forEach((el) => { el.onclick = () => { d.hidden = true; const f = buttons[Number(el.dataset.b)].fn; if (f) f(); }; });
  }
  $('#tr-confirm').onclick = () => {
    const m = TR.s; if (!m) return;
    const list = (arr) => arr.length ? arr.map((i) => `<li style="color:${RAR[i.rarity]}">${i.qty > 1 ? i.qty + '× ' : ''}${esc(i.name)}${i.plus ? ' +' + i.plus : ''}</li>`).join('') : '<li class="muted">nada</li>';
    tradeDialog(`<h3>Resumo da troca</h3><div class="tr-sum"><div><b>Você entrega</b><ul>${list(m.me.items)}</ul><p>${fmt.format(m.me.zen)} Zen</p></div><div><b>Você recebe</b><ul>${list(m.them.items)}</ul><p>${fmt.format(m.them.zen)} Zen</p></div></div>`,
      [{ label: 'Confirmar', cls: 'btn-gold', fn: () => send({ type: 'trade', action: 'confirm', ver: m.ver }) }, { label: 'Voltar', cls: '' }]);
  };
  const cancelTrade = () => tradeDialog('<h3>Deseja realmente cancelar esta troca?</h3>', [{ label: 'Sim, cancelar', cls: 'btn-danger', fn: () => send({ type: 'trade', action: 'cancel' }) }, { label: 'Continuar negociando', cls: 'btn-gold' }]);
  $('#tr-cancel').onclick = cancelTrade;
  $('#tr-x').onclick = cancelTrade;

  // ================= Aprimoramento (+0 a +15) =================
  const UP = { justDragged: false, drag: null, pend: null };
  const SM = { info: null, sel: null, busy: false, result: null };
  function jewelFits(it) {
    const j = S.char && S.char.items.find((i) => i.id === S.jewelSel);
    if (!j || !it || it.id === j.id) return false;
    const ok = ['weapon', 'shield', 'helm', 'armor', 'pants', 'gloves', 'boots', 'wings'].includes(it.slot);
    const pl = it.plus || 0;
    return ok && pl < 9 && (j.base === 'jewel_of_bless' ? pl < 6 : pl >= 6);
  }
  // arrastar a joia com mouse ou dedo (Pointer Events): solta em cima do equipamento
  function jewelDown(ev, it, btn) {
    if (MS.on || ev.button > 0) return;
    const sx = ev.clientX, sy = ev.clientY;
    let ghost = null, over = null;
    const move = (e) => {
      if (!ghost) {
        if (Math.hypot(e.clientX - sx, e.clientY - sy) < 8) return;
        ghost = document.createElement('div'); ghost.className = 'jewel-ghost'; ghost.appendChild(iconCanvas(it)); document.body.appendChild(ghost);
        S.jewelSel = it.id; renderBag(); UP.justDragged = true;
      }
      e.preventDefault();
      ghost.style.left = e.clientX + 'px'; ghost.style.top = e.clientY + 'px';
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const slot = el && el.closest && el.closest('#panel-bag .islot[data-id]');
      if (over && over !== slot) over.classList.remove('drop-hover');
      over = slot && slot.dataset.id !== it.id ? slot : null;
      if (over) over.classList.add('drop-hover');
    };
    const up = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
      if (!ghost) return;
      ghost.remove();
      if (over) { over.classList.remove('drop-hover'); upgAsk(it.id, over.dataset.id); }
      else { S.jewelSel = null; renderBag(); }
      setTimeout(() => { UP.justDragged = false; }, 50);
    };
    window.addEventListener('pointermove', move, { passive: false }); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
  }
  function upgAsk(jewel, item) { UP.pend = { jewel, item }; send({ type: 'upgPreview', jewel, item }); }
  const statTxt = (st) => statLine(st || {}) || '—';
  function upgPreview(m) {
    if (!m.ok) { feed(m.text, 'warn'); alertBanner(m.text); S.jewelSel = null; renderBag(); return; }
    const box = $('#upg-modal');
    box.innerHTML = `<h3>${esc(m.name)} +${m.from} → <b style="color:#ffd36b">+${m.to}</b></h3>
      <p class="upg-chance">Chance de sucesso: <b>${m.chance}%</b></p>
      <p class="muted small">${esc(m.jewelName)} será usada. ${m.fail === 'keep' ? 'Se falhar, o item continua +' + m.from + ' (não quebra nem perde nível).' : m.fail === 'minus1' ? 'Se falhar, o item perde 1 nível.' : 'Se falhar, o item volta para +0.'}</p>
      <ul class="upg-stats"><li><span>Agora</span><b>${esc(statTxt(m.now))}</b></li><li><span>Depois</span><b style="color:#a8e08a">${esc(statTxt(m.next))}</b></li></ul>
      <div class="row"><button class="btn btn-gold" type="button" id="upg-go">Aprimorar</button><button class="btn" type="button" id="upg-no">Cancelar</button></div>`;
    box.hidden = false;
    $('#upg-go').onclick = () => { $('#upg-go').disabled = true; send({ type: 'upgDirect', jewel: m.jewel, item: m.item }); };
    $('#upg-no').onclick = () => { box.hidden = true; S.jewelSel = null; renderBag(); };
  }
  function upgResult(m) {
    const box = $('#upg-modal'); box.hidden = true;
    if (!m.ok) { feed(m.text, 'warn'); alertBanner(m.text); S.jewelSel = null; if (S.panel === 'bag') renderBag(); return; }
    feed(m.text, m.success ? 'quest' : 'warn');
    if (m.success) { goldFlash(`+${m.to}!`); if (window.Sfx) Sfx.levelUp(); } else { alertBanner(m.text); shake(5, 300); if (window.Sfx) Sfx.hurt(); }
    S.jewelSel = null;
    if (m.item) S.selItem = m.item.id;
    if (S.panel === 'bag') renderBag();
  }
  // Ferreiro Mestre: bigorna, fornalha e fogo
  function drawForge(x, y, now) {
    const u = zoom * 1.4;
    const R = (c, a, b, w, h) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x + a * u), Math.round(y + b * u), Math.ceil(w * u), Math.ceil(h * u)); };
    // fornalha atrás
    R('#2a1a14', 4, -26, 22, 26); R('#4a3428', 5, -25, 20, 24); R('#1a0c08', 9, -16, 12, 10);
    const f = Math.sin(now / 90) * 1.5;
    R('#ff5a1a', 10, -14 + f / 2, 10, 7); R('#ffb02e', 12, -12 + f / 2, 6, 4); R('#fff2a8', 14, -11, 2, 2);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const r = 26 * zoom * (1 + 0.1 * Math.sin(now / 130));
    const g = ctx.createRadialGradient(x + 15 * u, y - 12 * u, 0, x + 15 * u, y - 12 * u, r);
    g.addColorStop(0, 'rgba(255,140,40,.45)'); g.addColorStop(1, 'rgba(255,90,20,0)');
    ctx.fillStyle = g; ctx.fillRect(x + 15 * u - r, y - 12 * u - r, r * 2, r * 2); ctx.restore();
    // bigorna na frente
    R('#1a1a22', 8, -6, 14, 3); R('#5a5a66', 8, -7, 14, 2); R('#3a3a44', 12, -4, 6, 4); R('#2a2a34', 10, 0, 10, 2);
    if (Math.floor(now / 700) % 2) { R('#ffd36b', 14, -9, 1, 1); R('#ffb02e', 17, -10, 1, 1); R('#fff2a8', 11, -11, 1, 1); }
  }
  function renderSmith() {
    const body = $('#smith-body'), I = SM.info;
    if (!I) { body.innerHTML = '<p class="muted">Acendendo a fornalha…</p>'; return; }
    const sel = I.sel;
    body.innerHTML = `${!I.atNpc ? '<p class="chaos-warn">O Ferreiro Mestre fica em Lorencia. <button class="btn small" type="button" id="sm-go">Ir para Lorencia</button></p>' : ''}
      <p class="muted small">Coloque um equipamento +9 ou maior. Cada tentativa gasta as joias e o Zen da tabela, mesmo se falhar${I.fail === 'keep' ? ', mas o item nunca quebra nem perde nível' : ''}.</p>
      <div class="sm-items">${I.items.length ? I.items.map((it) => `<button type="button" class="sm-item ${sel && sel.id === it.id ? 'on' : ''}" data-id="${it.id}" ${it.max ? 'disabled' : ''}><span class="sm-ic" data-ic="${it.id}"></span><span><b style="color:${RAR[it.rarity]}">${esc(it.name)} +${it.plus}</b><small>${it.equipped ? 'equipado' : 'na bolsa'}${it.max ? ' · máximo' : ''}</small></span></button>`).join('')
    : '<p class="muted">Nenhum equipamento +9 ou maior com você. Use Jewel of Bless e Jewel of Soul direto no item até chegar a +9.</p>'}</div>
      ${sel && sel.to ? `<div class="sm-box">
        <h3>${esc(sel.item.name)} <span>+${sel.from} → <b style="color:#ffd36b">+${sel.to}</b></span></h3>
        <p class="upg-chance">Chance de sucesso: <b>${sel.chance}%</b></p>
        <ul class="upg-stats"><li><span>Agora</span><b>${esc(statTxt(sel.now))}</b></li><li><span>Depois</span><b style="color:#a8e08a">${esc(statTxt(sel.next))}</b></li></ul>
        <table class="sm-mats"><tbody>${sel.mats.filter((x) => x.need > 0).map((x) => `<tr class="${x.have >= x.need ? 'ok' : 'no'}"><td><span class="sm-ic" data-mic="${x.base}"></span>${esc(x.name)}</td><td>${fmt.format(x.have)}/${x.need}</td></tr>`).join('')}
          <tr class="${I.zen >= sel.zen ? 'ok' : 'no'}"><td>Zen</td><td>${fmt.format(sel.zen)}</td></tr></tbody></table>
        <div class="row"><button class="btn btn-gold" type="button" id="sm-do" ${SM.busy || !I.atNpc || sel.mats.some((x) => x.have < x.need) || I.zen < sel.zen ? 'disabled' : ''}>Aprimorar</button><button class="btn" type="button" id="sm-cancel">Cancelar</button></div>
      </div>` : ''}
      ${SM.result ? `<p class="sm-result ${SM.result.success ? 'ok' : 'bad'}" role="status">${esc(SM.result.text)}</p>` : ''}`;
    for (const el of $$('[data-ic]', body)) { const it = I.items.find((x) => x.id === el.dataset.ic); el.appendChild(iconCanvas(it)); }
    for (const el of $$('[data-mic]', body)) { const x = sel.mats.find((m) => m.base === el.dataset.mic); el.appendChild(chaosIcon({ icon: x.icon, ic: x.ic, rarity: 'rare' }, 22)); }
    $$('.sm-item', body).forEach((b) => { b.onclick = () => { SM.sel = b.dataset.id; SM.result = null; send({ type: 'smith', action: 'info', id: SM.sel }); }; });
    const go = $('#sm-go'); if (go) go.onclick = () => send({ type: 'teleport', map: 'lorencia' });
    const d = $('#sm-do'); if (d) d.onclick = () => { if (SM.busy) return; SM.busy = true; d.disabled = true; $('#smith-panel-fx').classList.remove('hit'); void $('#smith-panel-fx').offsetWidth; $('#smith-panel-fx').classList.add('hit'); send({ type: 'smith', action: 'upgrade', id: sel.id }); };
    const c = $('#sm-cancel'); if (c) c.onclick = () => { SM.sel = null; SM.result = null; send({ type: 'smith', action: 'info' }); };
  }
  function smithResult(m) {
    SM.busy = false;
    SM.result = m.ok ? { success: m.success, text: m.text } : { success: false, text: m.text };
    feed(m.text, m.ok && m.success ? 'quest' : 'warn');
    if (m.ok && m.success) { goldFlash(`+${m.to}!`); if (window.Sfx) Sfx.levelUp(); }
    else if (m.ok) { shake(5, 300); if (window.Sfx) Sfx.hurt(); }
  }

  // ================= Baú Pessoal =================
  // baú desenhado em pixel: madeira, ferragens douradas e um brilho suave
  function drawVaultChest(x, y, now) {
    const u = zoom * 1.6, W = 18 * u, Hh = 12 * u, L = Math.round(x - W / 2), T = Math.round(y - Hh);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const r = 22 * zoom * (1 + 0.05 * Math.sin(now / 300));
    const gr = ctx.createRadialGradient(x, y - Hh / 2, 0, x, y - Hh / 2, r);
    gr.addColorStop(0, 'rgba(255,200,90,.35)'); gr.addColorStop(1, 'rgba(255,200,90,0)');
    ctx.fillStyle = gr; ctx.fillRect(x - r, y - Hh / 2 - r, r * 2, r * 2); ctx.restore();
    const R = (c, a, b, w, h) => { ctx.fillStyle = c; ctx.fillRect(Math.round(L + a * u), Math.round(T + b * u), Math.ceil(w * u), Math.ceil(h * u)); };
    R('#1a0f08', -1, -1, 20, 14);           // contorno
    R('#6b3d1f', 0, 4, 18, 8);              // corpo
    R('#8a5229', 0, 0, 18, 4);              // tampa
    R('#a8683a', 1, 1, 16, 1);              // luz da tampa
    R('#4a2a14', 0, 4, 18, 1);              // fresta
    R('#d8a840', 2, 0, 2, 12); R('#d8a840', 14, 0, 2, 12);   // ferragens
    R('#ffe08a', 2, 0, 1, 12); R('#ffe08a', 14, 0, 1, 12);
    R('#d8a840', 7, 3, 4, 4); R('#2a1a0a', 8, 5, 2, 1);    // fechadura
  }
  const VT = { no: 1, data: null, sel: null, filter: 'all', busy: false };
  const VCATS = [['all', 'Todos'], ['weapon', 'Armas'], ['armor', 'Armaduras'], ['wings', 'Asas'], ['accessory', 'Acessórios'], ['jewel', 'Joias'], ['material', 'Materiais'], ['other', 'Outros']];
  function vaultCat(it) {
    if (it.slot === 'weapon' || it.slot === 'shield') return 'weapon';
    if (['helm', 'armor', 'pants', 'gloves', 'boots'].includes(it.slot)) return 'armor';
    if (it.slot === 'wings') return 'wings';
    if (it.slot === 'ring' || it.slot === 'necklace') return 'accessory';
    if (it.slot === 'material') return /^jewel_/.test(it.base) ? 'jewel' : 'material';
    return 'other';
  }
  function vaultSend(o) {
    if (VT.busy && o.action !== 'open') return;
    VT.busy = o.action !== 'open';
    clearTimeout(VT.bt); VT.bt = setTimeout(() => { VT.busy = false; }, 4000);
    send({ type: 'vault', no: VT.no, nonce: Date.now().toString(36) + Math.random().toString(36).slice(2, 7), ...o });
  }
  function vaultMsg(t, ok) { const e = $('#vault-msg'); if (!e) return; e.textContent = t || ''; e.className = 'vault-msg ' + (ok ? 'ok' : 'bad'); }
  function renderVault() {
    const D = VT.data;
    const grid = $('#vault-grid');
    if (!D || !S.char) { grid.innerHTML = '<p class="muted">Abrindo o baú…</p>'; return; }
    $('#vault-sub').textContent = '· todos os personagens da conta';
    // abas dos baús
    $('#vault-tabs').innerHTML = D.vaults.length > 1 ? D.vaults.map((v) => `<button type="button" role="tab" data-no="${v.no}" class="${v.no === D.no ? 'on' : ''}" aria-selected="${v.no === D.no}" ${v.locked ? `disabled title="${esc(v.locked)}"` : ''}>${esc(v.name)}${v.locked ? ' 🔒' : ''}</button>`).join('') : '';
    $$('#vault-tabs [data-no]').forEach((b) => { b.onclick = () => { VT.no = Number(b.dataset.no); VT.sel = null; VT.data = null; renderVault(); vaultSend({ action: 'open', no: VT.no }); }; });
    $('#vault-used').textContent = `${D.used}/${D.capacity} ocupados · ${D.capacity - D.used} livres`;
    $('#vault-filter').innerHTML = VCATS.map(([k, n]) => `<button type="button" data-f="${k}" class="${VT.filter === k ? 'on' : ''}" aria-pressed="${VT.filter === k}">${n}</button>`).join('');
    $$('#vault-filter [data-f]').forEach((b) => { b.onclick = () => { VT.filter = b.dataset.f; renderVault(); }; });
    // grade
    const byPos = new Map(D.items.map((i) => [i.pos, i]));
    grid.style.setProperty('--cols', D.cols);
    grid.innerHTML = '';
    const selBag = VT.sel && VT.sel.from === 'bag';
    for (let pos = 0; pos < D.capacity; pos++) {
      const it = byPos.get(pos);
      let b;
      if (it) {
        b = slotButton(it, () => {
          const selectedBagItem = VT.sel && VT.sel.from === 'bag' && S.char ? S.char.items.find((x) => String(x.id) === String(VT.sel.id)) : null;
          if (selectedBagItem && selectedBagItem.stack && it.stack && selectedBagItem.base === it.base && selectedBagItem.rarity === it.rarity && Number(selectedBagItem.plus || 0) === Number(it.plus || 0)) {
            vaultSend({ action: 'put', id: selectedBagItem.id, pos });
            VT.sel = null; return;
          }
          VT.sel = VT.sel && VT.sel.id === it.id ? null : { from: 'vault', id: it.id }; renderVault();
        });
        b.classList.toggle('sel', !!(VT.sel && VT.sel.id === it.id));
        b.classList.remove('picked');
        if (VT.filter !== 'all' && vaultCat(it) !== VT.filter) b.classList.add('dim');
        b.draggable = true;
        b.ondragstart = (e) => { e.dataTransfer.setData('text/plain', JSON.stringify({ from: 'vault', id: it.id })); };
      } else {
        b = document.createElement('button'); b.type = 'button'; b.className = 'islot empty' + (VT.sel ? ' target' : '');
        b.setAttribute('aria-label', `Espaço ${pos + 1} vazio`);
        b.onclick = () => {
          if (!VT.sel) return;
          if (VT.sel.from === 'bag') vaultSend({ action: 'put', id: VT.sel.id, pos });
          else vaultSend({ action: 'move', id: VT.sel.id, pos });
          VT.sel = null;
        };
      }
      b.dataset.pos = pos;
      b.ondragover = (e) => { e.preventDefault(); b.classList.add('over'); };
      b.ondragleave = () => b.classList.remove('over');
      b.ondrop = (e) => {
        e.preventDefault(); b.classList.remove('over');
        let d; try { d = JSON.parse(e.dataTransfer.getData('text/plain')); } catch (_) { return; }
        if (d.from === 'bag') vaultSend({ action: 'put', id: d.id, pos });
        else if (d.from === 'vault' && d.id !== (it && it.id)) vaultSend({ action: 'move', id: d.id, pos });
        VT.sel = null;
      };
      grid.appendChild(b);
    }
    // Zen
    $('#vz-vault').textContent = fmt.format(D.zen);
    $('#vz-char').textContent = fmt.format(S.char.zen);
    // bolsa
    const bag = S.char.items.filter((i) => !i.equipped);
    $('#vault-bagcount').textContent = `${bag.length}/${S.char.invMax}`;
    const bg = $('#vault-bag'); bg.innerHTML = '';
    bag.sort((a, b) => RAR_ORDER.indexOf(b.rarity) - RAR_ORDER.indexOf(a.rarity) || b.req - a.req).forEach((it) => {
      const b = slotButton(it, () => {
        const selectedVaultItem = VT.sel && VT.sel.from === 'vault' && D ? D.items.find((x) => String(x.id) === String(VT.sel.id)) : null;
        if (selectedVaultItem && selectedVaultItem.stack && it.stack && selectedVaultItem.base === it.base && selectedVaultItem.rarity === it.rarity && Number(selectedVaultItem.plus || 0) === Number(it.plus || 0)) {
          vaultSend({ action: 'take', id: selectedVaultItem.id });
          VT.sel = null; return;
        }
        VT.sel = VT.sel && VT.sel.id === it.id ? null : { from: 'bag', id: it.id }; renderVault();
      });
      b.classList.toggle('sel', !!(selBag && VT.sel.id === it.id)); b.classList.remove('picked');
      b.draggable = true;
      b.ondragstart = (e) => { e.dataTransfer.setData('text/plain', JSON.stringify({ from: 'bag', id: it.id })); };
      bg.appendChild(b);
    });
    if (!bag.length) bg.innerHTML = '<p class="muted" style="grid-column:1/-1;margin:2px 0">Bolsa vazia.</p>';
    bg.ondragover = (e) => { e.preventDefault(); bg.classList.add('over'); };
    bg.ondragleave = () => bg.classList.remove('over');
    bg.ondrop = (e) => {
      e.preventDefault(); bg.classList.remove('over');
      let d; try { d = JSON.parse(e.dataTransfer.getData('text/plain')); } catch (_) { return; }
      if (d.from === 'vault') vaultSend({ action: 'take', id: d.id });
    };
    // detalhe do item escolhido
    const det = $('#vault-detail');
    const it = VT.sel ? (VT.sel.from === 'bag' ? bag.find((i) => i.id === VT.sel.id) : D.items.find((i) => i.id === VT.sel.id)) : null;
    if (!it) { VT.sel = null; det.innerHTML = '<p class="muted">Toque em um item da bolsa e depois em um espaço vazio do baú para guardar (no computador, pode arrastar). Toque em um item do baú para ver e retirar.</p>'; return; }
    const R = it.reqs || {};
    const reqTxt = [R.level || it.req ? `nível ${R.level || it.req}` : '', ...['str', 'agi', 'ene', 'vit', 'cmd'].filter((k) => R[k]).map((k) => `${STAT_PT[k]} ${fmt.format(R[k])}`)].filter(Boolean).join(' · ');
    det.innerHTML = `<h3 style="color:${RAR[it.rarity]}">${esc(it.name)}${it.plus ? ' +' + it.plus : ''}${it.stack ? ' ×' + fmt.format(it.qty) : ''}</h3>
      <p style="color:${RAR[it.rarity]}">${RAR_NAME[it.rarity]}${it.excellent ? ` · Excellent semi-full (${it.excellentOptions.length})` : ''} · ${esc(SLOT_NAME[it.slot] || (it.slot === 'material' ? 'Material' : it.slot === 'box' ? 'Caixa' : it.slot === 'quest' ? 'Item de missão' : ''))}</p>
      ${statLine(it.stats || {}) ? `<p>${esc(statLine(it.stats))}</p>` : ''}${it.excellentOptions && it.excellentOptions.length ? `<ul class="ii-restr">${it.excellentOptions.map((o) => `<li style="color:${RAR[it.rarity]}">${esc(o.name)} +${o.value}${esc(o.unit || '')}</li>`).join('')}</ul>` : ''}${it.desc ? `<p class="muted">${esc(it.desc)}</p>` : ''}
      ${reqTxt && it.slot !== 'material' ? `<p class="muted">Requisitos: ${esc(reqTxt)}</p>` : ''}
      <div class="row">${VT.sel.from === 'bag'
        ? '<button class="btn small btn-gold" type="button" data-v="put">Guardar no baú</button>'
        : '<button class="btn small btn-gold" type="button" data-v="take">Retirar para a bolsa</button><span class="muted small">ou toque num espaço vazio para mover</span>'}</div>`;
    const btn = $('[data-v]', det);
    btn.onclick = () => { const a = btn.dataset.v; vaultSend({ action: a, id: it.id }); VT.sel = null; };
  }
  $('#vault-sort').onclick = () => { if (VT.data && VT.data.used) vaultSend({ action: 'sort' }); };
  function vaultZen(action, all) {
    const raw = $('#vz-amt').value.replace(/[^\d]/g, '');
    const amount = Number(raw);
    if (!all && !(amount > 0)) { vaultMsg('Digite uma quantidade de Zen.', false); $('#vz-amt').focus(); return; }
    vaultSend({ action, amount: all ? undefined : amount, all: !!all });
    $('#vz-amt').value = '';
  }
  $('#vz-form').onsubmit = (e) => { e.preventDefault(); vaultZen('zenIn', false); };
  $$('#vz-form [data-z]').forEach((b) => { if (b.type !== 'submit') b.onclick = () => vaultZen(b.dataset.z, !!b.dataset.all); });
  $('#vz-amt').oninput = (e) => { const d = e.target.value.replace(/[^\d]/g, ''); e.target.value = d ? fmt.format(Number(d)) : ''; };

  function renderCQ() {
    const body = $('#cq-body');
    const I = CQ.info;
    if (!I || I.npc !== CQ.npc) { body.innerHTML = '<p class="muted">Carregando…</p>'; $('#cq-title').textContent = CQ.npc === 'marlon' ? 'Marlon' : 'Priestess Sevina'; return; }
    $('#cq-title').textContent = I.npcName;
    if (!I.quest) { body.innerHTML = `<p class="cq-class">${esc(I.className)}</p><p>${esc(I.msg)}</p>`; return; }
    const Q = I.quest;
    const stepHtml = Q.steps.map((st) => `<li class="${st.done ? 'done' : st.current ? 'cur' : ''}"><span class="cq-ico" data-ico="${st.i}"></span>
      <span><b>${st.done ? '✔ ' : ''}${st.qty}× ${esc(st.name)}</b><small class="${st.have >= st.qty ? 'req-ok' : 'req-no'}">na bolsa: ${st.have}/${st.qty}</small>${st.where.length ? `<small class="muted">${st.where.map((w) => `<span>${esc(w)}</span>`).join(' · ')}</small>` : ''}</span></li>`).join('');
    const cur = Q.started && !Q.allDelivered ? Q.steps[Q.step] : null;
    body.innerHTML = `
      ${Q.wrongNpc ? `<p class="chaos-warn">Sua missão atual é com ${esc(Q.npcName)}.</p>` : ''}
      ${!I.atNpc ? `<p class="chaos-warn">Vá até ${esc(I.npcName)}${I.npc === 'sevina' ? ', em Devias' : ', em Lorencia'}.</p>` : ''}
      <h3>${esc(Q.name)}</h3>
      <p class="cq-evo"><span>${esc(Q.from)}</span> → <b>${esc(Q.to)}</b></p>
      <ul class="req-list">${Q.reqs.map((r) => `<li class="${r.ok ? 'req-ok' : 'req-no'}">${r.ok ? '✔' : '✘'} ${esc(r.text)}${r.now ? ` <small>(${esc(r.now)})</small>` : ''}</li>`).join('')}</ul>
      <h4>Etapas ${Q.started ? `(${Math.min(Q.step, Q.steps.length)}/${Q.steps.length})` : ''}</h4>
      <ol class="cq-steps">${stepHtml}</ol>
      <div class="row cq-btns">
        ${!Q.started ? `<button class="btn btn-gold" type="button" data-cq="start" ${Q.canStart ? '' : 'disabled'}>Iniciar missão</button>` : ''}
        ${Q.started && !Q.allDelivered ? `<button class="btn btn-gold" type="button" data-cq="deliver" ${cur && cur.have >= cur.qty && I.atNpc ? '' : 'disabled'}>Entregar itens</button>` : ''}
        ${Q.started ? `<button class="btn btn-gold" type="button" data-cq="complete" ${Q.canComplete ? '' : 'disabled'}>Concluir evolução</button>` : ''}
        ${Q.started ? '<button class="btn small btn-ghost" type="button" data-cq="abandon">Abandonar</button>' : ''}
      </div>
      <p class="muted small">Ao evoluir você mantém nível, EXP, resets, pontos, itens e equipamentos, e libera poderes e equipamentos da nova classe.</p>`;
    $$('[data-ico]', body).forEach((el) => { const st = Q.steps[Number(el.dataset.ico)]; el.appendChild(chaosIcon({ icon: st.icon, ic: st.ic, rarity: st.rarity }, 30)); });
    $$('[data-cq]', body).forEach((b) => {
      b.onclick = () => {
        if (CQ.busy) return;
        if (b.dataset.cq === 'abandon' && !b.dataset.sure) { b.dataset.sure = 1; b.textContent = 'Os itens entregues não voltam. Abandonar?'; return; }
        CQ.busy = true; b.disabled = true;
        send({ type: 'cqAct', action: b.dataset.cq, npc: CQ.npc });
      };
    });
  }

  // ================= Box Kundun =================
  const BOX = { it: null, busy: false, res: null, t0: 0 };
  function openBox(it) {
    BOX.it = it; BOX.res = null; BOX.busy = true; BOX.t0 = performance.now();
    const d = $('#box-dialog');
    $('#box-title').textContent = it.name;
    const stage = $('#box-stage'); stage.innerHTML = ''; stage.className = 'box-stage opening';
    const ic = chaosIcon(it, 96); stage.appendChild(ic);
    $('#box-out').innerHTML = '<p class="muted">Abrindo…</p>';
    $('#box-again').hidden = true;
    if (!d.open) d.showModal();
    send({ type: 'openBox', id: it.id });
  }
  function boxResult(m) {
    BOX.res = m;
    // a animação dura pelo menos 1,4 s, mas o prêmio já veio decidido do servidor
    const wait = Math.max(0, 1400 - (performance.now() - BOX.t0));
    setTimeout(() => {
      BOX.busy = false;
      const stage = $('#box-stage'), out = $('#box-out');
      stage.className = 'box-stage ' + (m.ok ? (m.high ? 'open legendary' : 'open') : 'fail');
      if (!m.ok) { out.innerHTML = `<p class="bad">${esc(m.text)}</p>`; return; }
      stage.innerHTML = '';
      const r = m.reward;
      const shown = m.item || { icon: r.kind === 'zen' ? 'zen' : r.kind === 'pot' ? (r.pot === 'mp' ? 'potion_mp' : 'potion_hp') : 'jewel', rarity: 'rare' };
      stage.appendChild(chaosIcon(shown, 96));
      const col = m.item ? (m.item.ic || RAR[m.item.rarity]) : '#ffd36b';
      out.innerHTML = `<p class="box-prize" style="color:${col}">${esc(r.text)}</p>${m.item && m.item.rarity && m.item.slot !== 'material' ? `<p style="color:${RAR[m.item.rarity]}">${RAR_NAME[m.item.rarity]}</p>` : ''}`;
      if (m.high) goldFlash(r.text);
      if (window.Sfx) { if (m.high) Sfx.levelUp(); else Sfx.coin(); }
      const left = S.char && S.char.items.find((i) => i.id === (BOX.it && BOX.it.id));
      const again = $('#box-again'); again.hidden = !left;
      if (left) again.onclick = () => openBox(left);
    }, wait);
  }
  $('#box-dialog').addEventListener('click', (e) => { if (e.target.closest('[data-close]') && !BOX.busy) e.currentTarget.close(); });
  // brilho dourado na tela (itens lendários, asas)
  function goldFlash(text) {
    const el = $('#gold-flash');
    el.innerHTML = `<span>${esc(text)}</span>`;
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  }

  // ================= Invasão Dourada =================
  function onInvasion(m) {
    S.inv = { active: m.active, endsAt: m.endsAt, nextAt: m.nextAt, skew: Date.now() - m.now, enabled: m.enabled };
    if (m.text) {
      const txt = window.I18N && I18N.lang === 'en' ? (m.textEn || I18N.t(m.text)) : m.text;
      const el = $('#gold-banner');
      el.textContent = txt;
      el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
      if (window.Sfx && m.phase === 'start') Sfx.boss();
    }
    invTimer();
  }
  function invTimer() {
    const el = $('#inv-timer');
    const I = S.inv;
    if (!I || (!I.active && !I.enabled)) { el.hidden = true; return; }
    const now = Date.now() - (I.skew || 0);
    const ms = I.active ? I.endsAt - now : I.nextAt - now;
    const s = Math.max(0, Math.round(ms / 1000));
    const t = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    el.hidden = false;
    el.classList.toggle('on', !!I.active);
    $('#inv-label').textContent = I.active ? 'Invasão Dourada' : 'Próxima invasão';
    $('#inv-time').textContent = t;
  }
  setInterval(invTimer, 1000);
  $('#inv-timer').onclick = () => feed(S.inv && S.inv.active ? 'Monstros dourados estão nos mapas de caça! Derrote-os para ganhar Box Kundun.' : 'A cada 40 minutos monstros dourados invadem os mapas de caça.', 'gold');

  // ================= Chaos Machine =================
  const CH = { info: null, tab: 'wing1', sel: {}, busy: false, t: 0 };
  const FAIL_TXT = { lose_all: 'Se falhar: perde o item principal, os materiais e o Zen.', keep_main: 'Se falhar: o item principal volta para a bolsa; perde os materiais e o Zen.', keep_items: 'Se falhar: só o Zen é cobrado; os itens voltam.' };
  function chaosIcon(it, size = 40) {
    const c = document.createElement('canvas'); c.width = 48; c.height = 48; c.style.width = c.style.height = size + 'px';
    drawItemIcon(c.getContext('2d'), it, 3, 3, 3, it.ic || RAR[it.rarity] || '#c8c8c8');
    return c;
  }
  function renderChaos() {
    const body = $('#chaos-body');
    const I = CH.info;
    if (!I) { body.innerHTML = '<p class="muted">Ligando a Chaos Machine…</p>'; return; }
    const tabs = $('#chaos-tabs');
    tabs.innerHTML = I.recipes.map((r) => `<button type="button" role="tab" data-r="${r.id}" class="${CH.tab === r.id ? 'on' : ''}" aria-selected="${CH.tab === r.id}">${esc(r.name)}</button>`).join('');
    $$('button', tabs).forEach((b) => { b.onclick = () => { CH.tab = b.dataset.r; renderChaos(); }; });
    const r = I.recipes.find((x) => x.id === CH.tab) || I.recipes[0];
    const okCands = r.candidates.filter((c) => c.ok);
    let selId = CH.sel[r.id];
    if (!okCands.some((c) => c.item.id === selId)) selId = CH.sel[r.id] = okCands[0] ? okCands[0].item.id : null;
    const sel = r.candidates.find((c) => c.item.id === selId) || null;
    const missing = [];
    if (!r.enabled) missing.push('Receita desativada no momento.');
    if (!r.classOk) missing.push(r.classes.length === 1 && r.classes[0] === 'dark_lord' ? 'Só o Dark Lord faz esta receita.' : 'Sua classe não faz esta receita.');
    if (r.noResults) missing.push('Nenhuma asa disponível nesta receita.');
    if (!sel) missing.push(r.candidates.length ? 'Nenhum item principal válido na bolsa.' : `Falta o item principal: ${r.main.bases.map((b) => b.name).join(' ou ')}.`);
    const mats = (sel && sel.mats) || r.materials;
    mats.forEach((m) => { if (m.have < m.qty && !(m.pairKey && !r.candidates.length)) missing.push(`Falta ${m.qty - m.have}× ${m.name}.`); });
    if (I.zen < r.zen) missing.push(`Faltam ${fmt.format(r.zen - I.zen)} Zen.`);
    if (I.npcRequired && !I.atNpc) missing.push('Vá até o Chaos Goblin em Lorencia.');
    const res = sel && sel.result ? r.results.filter((x) => x.base === sel.result) : r.results;
    const src = I.sources || { list: {} };
    body.innerHTML = `
      ${I.npcRequired && !I.atNpc ? `<p class="chaos-warn">A Chaos Machine fica com o Chaos Goblin, em Lorencia. <button class="btn small" type="button" id="chaos-go">Ir para Lorencia</button></p>` : ''}
      <div class="chaos-machine" id="chaos-machine">
        <div class="chaos-slot main ${sel ? 'filled' : ''}" id="chaos-main" title="Item principal"></div>
        <span class="chaos-plus">+</span>
        ${mats.map((m) => `<div class="chaos-slot ${m.have >= m.qty ? 'filled' : 'need'}" data-mat="${m.item}"><b class="${m.have >= m.qty ? '' : 'bad'}">${m.have}/${m.qty}</b></div>`).join('<span class="chaos-plus">+</span>')}
        <span class="chaos-plus">+</span>
        <div class="chaos-zen ${I.zen >= r.zen ? '' : 'bad'}"><b>${fmt.format(r.zen)}</b><small>Zen</small></div>
        <span class="chaos-plus">=</span>
        <div class="chaos-results" id="chaos-res"></div>
      </div>
      <div class="chaos-rate"><span>Chance de sucesso</span><b id="chaos-chance">${sel ? sel.chance + '%' : '—'}</b><small>máximo desta receita: ${r.maxChance}%</small></div>
      <p class="muted small">${esc(FAIL_TXT[r.onFail])}</p>
      ${r.id === 'wing1' || r.id === 'wing2' ? '<p class="chaos-luck">🎲 Resultado aleatório: qualquer classe pode receber qualquer asa, conforme as chances acima. A classe só importa na hora de equipar.</p>' : ''}
      <h4>${r.mode === 'evolve' ? 'Escolha o item para evoluir' : r.mode === 'pair' ? "Escolha o Devil's Eye" : r.id === 'wing2' ? 'Escolha a asa de nível 1' : 'Escolha a Arma do Caos'}</h4>
      ${r.mode === 'pair' ? `<p class="muted small"><span>O Devil's Eye e o Devil's Key precisam ter o mesmo nível (+1 a +7).</span> <span>Chance: +1 a +4: ${r.rates.low}% · +5 a +7: ${r.rates.high}%.</span></p>`
    : `<p class="muted small"><span>Aceita: ${r.main.bases.map((b) => esc(b.name)).join(', ')}${r.main.minPlus ? ` (+${r.main.minPlus} ou mais)` : ''}.</span> <span>${r.id === 'wing2' ? 'A asa nova começa em +0, preserva a raridade e exige nível 120.' : r.id === 'wing1' ? 'A asa recebe modelo e raridade aleatórios; todas exigem nível 120.' : 'O + e a raridade aumentam a chance.'}</span></p>`}
      <div class="chaos-cands" id="chaos-cands">${r.candidates.length ? '' : '<p class="muted">Nenhum na bolsa.</p>'}</div>
      ${missing.length ? `<ul class="chaos-missing">${missing.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
      <button class="btn btn-gold chaos-go" type="button" id="chaos-do" ${missing.length || CH.busy ? 'disabled' : ''}>${r.mode === 'evolve' ? 'Evoluir' : 'Combinar'}${sel ? ` (${sel.chance}%)` : ''}</button>
      <details class="chaos-src"><summary>Onde conseguir os materiais</summary>
        <ul>${[...new Set([...mats.filter((m) => !m.pairKey).map((m) => m.item), ...(r.mode !== 'evolve' ? (r.mode === 'pair' && sel ? [sel.item.base] : r.mode === 'pair' ? [] : r.main.bases.map((b) => b.base)) : [])])].map((k) => {
    const nm = (mats.find((m) => m.item === k) || r.main.bases.find((b) => b.base === k) || { name: k }).name;
    return `<li><b>${esc(nm)}</b>: ${(src.list[k] || []).map((x) => `<span>${esc(x)}</span>`).join(' · ') || '<span>criado na Chaos Machine</span>'}</li>`; }).join('')}
          ${r.mode === 'evolve' ? `<li><b>${esc(r.main.bases.map((b) => b.name).join(' / '))}</b>: <span>${r.id === 'cape2' ? 'crie na aba "Criar Capa do Dark Lord"' : 'crie na aba "Criar Asa Nível 1"'}</span></li>` : ''}</ul>
      </details>`;
    const mainBox = $('#chaos-main');
    if (sel) { mainBox.appendChild(chaosIcon(sel.item)); if (sel.item.plus) mainBox.insertAdjacentHTML('beforeend', `<span class="plus">+${sel.item.plus}</span>`); }
    else mainBox.innerHTML = '<small>?</small>';
    $$('[data-mat]', body).forEach((el) => { const m = mats.find((x) => x.item === el.dataset.mat); el.prepend(chaosIcon(m, 32)); el.title = m.name; });
    const resBox = $('#chaos-res');
    res.slice(0, 12).forEach((x) => { const d = document.createElement('div'); d.className = 'chaos-out' + (x.canEquip === false ? ' other' : ''); d.title = x.name + (x.canEquip === false ? ' (sua classe não equipa)' : ''); d.appendChild(chaosIcon(x, 34)); d.insertAdjacentHTML('beforeend', `<small>${esc(x.name)}${x.pct !== null && x.pct !== undefined ? `<br><b>${x.pct}%</b>` : ''}</small>`); resBox.appendChild(d); });
    if (!res.length) resBox.innerHTML = '<small class="muted">—</small>';
    const cands = $('#chaos-cands');
    r.candidates.forEach((c) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'chaos-cand' + (c.item.id === selId ? ' sel' : '') + (c.ok ? '' : ' off');
      b.appendChild(chaosIcon(c.item, 30));
      b.insertAdjacentHTML('beforeend', `<span><b style="color:${RAR[c.item.rarity]}">${esc(c.item.name)}${c.item.plus ? ' +' + c.item.plus : ''}</b><small>${c.ok ? `${c.chance}% de chance` : esc(c.why)}</small></span>`);
      if (c.ok) b.onclick = () => { CH.sel[r.id] = c.item.id; renderChaos(); };
      else b.disabled = true;
      cands.appendChild(b);
    });
    const go = $('#chaos-go'); if (go) go.onclick = () => send({ type: 'teleport', map: 'lorencia' });
    $('#chaos-do').onclick = () => {
      if (CH.busy || !sel) return;
      CH.busy = true; $('#chaos-do').disabled = true;
      $('#chaos-machine').classList.add('spin');
      send({ type: 'chaos', recipe: r.id, main: sel.item.id });
    };
  }
  function chaosResult(m) {
    const show = () => {
      CH.busy = false;
      const mach = $('#chaos-machine'); if (mach) mach.classList.remove('spin');
      const box = $('#chaos-result');
      if (!m.ok) { feed(m.text, 'warn'); if (S.panel === 'chaos') renderChaos(); return; }
      box.innerHTML = '';
      box.className = 'chaos-result ' + (m.success ? 'win' : 'lose');
      if (m.item) box.appendChild(chaosIcon(m.item, 64));
      box.insertAdjacentHTML('beforeend', `<b>${m.success ? 'Sucesso!' : 'Falhou'}</b><p>${esc(m.text)}</p>${m.item ? `<small style="color:${RAR[m.item.rarity]}">${RAR_NAME[m.item.rarity]} · ${m.item.tier === 2 ? 'Asa nível 2' : 'Asa nível 1'} · requisito: nível 120</small>` : ''}${m.lost && m.lost.length ? `<small>Perdeu: ${m.lost.map(esc).join(', ')}</small>` : ''}${m.kept ? '<small>O item principal voltou para a bolsa.</small>' : ''}<button class="btn small" type="button">OK</button>`);
      box.hidden = false;
      $('button', box).onclick = () => { box.hidden = true; };
      if (window.Sfx) { if (m.success) Sfx.levelUp(); else Sfx.warn(); }
    };
    // a máquina gira um pouco antes de mostrar o resultado
    if (CH.busy) setTimeout(show, 900); else show();
  }

  // ================= relatório offline =================
  function showOffline(r) {
    const h = Math.floor(r.secs / 3600), m = Math.floor((r.secs % 3600) / 60);
    $('#offline-body').innerHTML = `
      <p>Seu herói continuou lutando em <b>${esc(r.map)}</b> por ${h ? h + 'h ' : ''}${m}min${r.capped ? ' (limite de 8 horas)' : ''}.</p>
      <dl><dt>Monstros</dt><dd>${fmt.format(r.kills)}</dd><dt>EXP</dt><dd>+${fmt.format(r.exp)}</dd>
        <dt>Níveis</dt><dd>${r.levels ? '+' + r.levels : '—'}</dd><dt>Zen</dt><dd>+${fmt.format(r.zen)}</dd>
        <dt>Poções usadas</dt><dd>${fmt.format(r.potsUsed)}</dd></dl>
      ${r.died ? '<p class="bad" style="color:#ff9a7a">As poções de vida acabaram e o herói caiu. Compre mais na loja de Lorencia.</p>' : ''}
      ${r.items.length ? `<p>Itens encontrados:</p><ul>${r.items.map((i) => `<li style="color:${ACCENT(i)}">${esc(i.name)}${i.plus ? ' +' + i.plus : ''}${i.qty > 1 ? ' ×' + fmt.format(i.qty) : ''}</li>`).join('')}</ul>` : ''}`;
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
    p.id = info.id;
    const canAttack = hostileTo(p);
    card.innerHTML = `<button class="close" type="button" aria-label="Fechar">×</button>
      <b>${(p.flags & 1) ? '<span style="color:#ff6a5a">[PK]</span> ' : ''}${esc(info.name)}</b><small>${esc(info.className || cls.name)} · Nível ${info.level}</small>
      <div class="row">
        <button class="btn small ${canAttack ? 'btn-danger' : ''}" type="button" data-act="attack" ${canAttack ? '' : 'disabled'}>Atacar</button>
        <button class="btn small btn-gold" type="button" data-act="duel" ${S.duel ? 'disabled' : ''}>Desafiar para duelo</button>
        <button class="btn small" type="button" data-act="trade" ${TR.s || (S.map && S.map.arena) ? 'disabled' : ''}>Trocar itens</button>
      </div>
      ${canAttack ? '' : `<small class="muted">${S.map.safe ? 'Na cidade não há PvP: desafie para um duelo.' : !S.me.pvpOn ? 'Ligue o botão PvP para atacar.' : 'Este jogador está com o PvP desligado.'}</small>`}`;
    card.hidden = false;
    card.querySelector('.close').onclick = () => { card.hidden = true; };
    card.querySelector('[data-act="attack"]').onclick = () => { send({ type: 'target', id: info.id }); card.hidden = true; };
    card.querySelector('[data-act="duel"]').onclick = () => { send({ type: 'duel', id: info.id }); card.hidden = true; };
    card.querySelector('[data-act="trade"]').onclick = () => { send({ type: 'trade', action: 'invite', to: info.id }); card.hidden = true; };
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
  $('#btn-pvp').onclick = () => send({ type: 'pvp', on: !(S.me && S.me.pvpOn) });
  $('#btn-ptarget').onclick = cycleTarget;
  $('#btn-pot-hp').onclick = () => send({ type: 'potion', kind: 'hp' });
  $('#btn-pot-mp').onclick = () => send({ type: 'potion', kind: 'mp' });
  $('#btn-exit').onclick = () => { leaving = true; send({ type: 'leave' }); setTimeout(() => { location.href = backHome(); }, 800); };
  PA.drawIcon($('#btn-pot-hp canvas').getContext('2d'), 'potion_hp', 6, 6, 3, '#fff');
  PA.drawIcon($('#btn-pot-mp canvas').getContext('2d'), 'potion_mp', 6, 6, 3, '#3a7aff');
  PA.itemsReady.then(() => { for (const [id, k] of [['#btn-pot-hp', 'potion_hp'], ['#btn-pot-mp', 'potion_mp']]) { const cv = $(id + ' canvas'); if (!cv) continue; const g = cv.getContext('2d'); const w = cv.width; const keep = g.getImageData(0, 0, w, cv.height); g.clearRect(0, 0, w, cv.height); if (!PA.drawItem(g, { icon: k }, 0, 0, Math.min(w, cv.height))) g.putImageData(keep, 0, 0); } });

  // ================= escolha da sala =================
  async function pickRoom() {
    let last = 1;
    try { last = Number(localStorage.getItem('mui_room')) || 1; } catch (_) { /* ok */ }
    let rooms = [1, 2, 3, 4].map((room) => ({ room, players: 0 }));
    try { rooms = (await (await fetch('/api/rooms', { credentials: 'same-origin' })).json()).rooms; } catch (_) { /* usa o padrão */ }
    const max = Math.max(1, ...rooms.map((r) => r.players));
    const box = $('#room-pick');
    centerMsg(null);
    box.innerHTML = `<h2>Escolha a sala</h2><p class="muted">Cada sala é uma cópia do mundo com seus próprios monstros, boss e PvP. O chat é de todos.</p>
      <div class="room-grid">${rooms.map((r) => `<button type="button" class="room-btn ${r.room === last ? 'last' : ''}" data-r="${r.room}">
        <b>Sala ${r.room}</b><small>${r.players} ${r.players === 1 ? 'jogador' : 'jogadores'}</small>
        <span class="room-bar"><i style="width:${Math.round(r.players / max * 100)}%"></i></span>${r.room === last ? '<em>última</em>' : ''}</button>`).join('')}</div>`;
    box.hidden = false;
    return new Promise((ok) => {
      $$('.room-btn', box).forEach((b) => {
        b.onclick = () => {
          S.room = Number(b.dataset.r);
          try { localStorage.setItem('mui_room', String(S.room)); } catch (_) { /* ok */ }
          box.hidden = true; centerMsg('Entrando no mundo…'); ok();
        };
      });
    });
  }

  // ================= início =================
  (async function init() {
    centerMsg('Entrando no mundo…');
    // já busca o herói (com o equipamento) para carregar as folhas dos itens antes de entrar: nada de herói "pelado" por um instante
    const meP = fetch('/api/me', { credentials: 'same-origin' }).then((r) => r.json()).catch(() => null);
    let myChar = null;
    try {
      const r = await fetch('/api/gamedata', { credentials: 'same-origin' });
      S.data = await r.json();
      await Sprites.ready;
      const me = await meP;
      myChar = me && me.characters ? me.characters.find((x) => String(x.id) === String(charId)) : null;
    } catch (_) { centerMsg('Não foi possível carregar o jogo. Verifique a internet.', true); return; }
    const pre = myChar ? Sprites.preloadEquip(myChar.class, myChar.eq, 5000) : Promise.resolve();
    if (GFX === '3d') { centerMsg('Carregando o gráfico 3D…'); await load3D(); if (is3d && myChar) await Promise.race([W3().preload([], [myChar.class]), new Promise((r) => setTimeout(r, 8000))]); centerMsg(null); }
    await pickRoom();
    await pre;
    connect();
    if (myChar) setTimeout(() => Sprites.preloadClass(myChar.class), 4000);
    // voltando do pagamento do Stripe
    // volta do Stripe (pagamento do mercado ou cadastro de vendedor)
    const mkQ = new URLSearchParams(location.search).get('mercado');
    if (mkQ) {
      history.replaceState(null, '', `/game.html?c=${encodeURIComponent(charId)}`);
      setTimeout(() => {
        if (mkQ === 'pago') { alertBanner('Pagamento recebido! O item chega na sua bolsa em instantes.'); feed('Pagamento recebido! O item chega na sua bolsa em instantes.', 'quest'); }
        else if (mkQ === 'cancelado') feed('Pagamento cancelado. Nada foi cobrado; o item volta para a venda.', 'warn');
        else if (mkQ === 'stripe') { MK.tab = 'sell'; MK.sellCur = 'brl'; MK.stripe = null; openPanel('market'); }
      }, 2500);
    }
    const vipQ = new URLSearchParams(location.search).get('vip');
    if (vipQ) {
      history.replaceState(null, '', `/game.html?c=${encodeURIComponent(charId)}`);
      setTimeout(() => {
        if (vipQ === 'ok') { alertBanner('Pagamento recebido! Seu VIP é ativado em instantes.'); feed('Pagamento recebido! Seu VIP é ativado em instantes.', 'quest'); }
        else if (vipQ === 'presente') { alertBanner('Pagamento recebido! O VIP de presente é entregue em instantes.'); feed('Pagamento recebido! O VIP de presente vai para a conta escolhida em instantes.', 'quest'); }
        else feed('Pagamento cancelado. Nada foi cobrado.', 'warn');
      }, 2500);
    }
  })();
})();
