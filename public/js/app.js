// MU Idle Legends — página inicial: contas, estatísticas ao vivo, galerias
'use strict';
(function () {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const PA = window.PixelArt;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const state = { data: null, me: null, selectedClass: 'dark_knight', selectedItem: 0, rankBy: 'resets' };
  const fmt = new Intl.NumberFormat(window.I18N ? I18N.locale : 'pt-BR');

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // ---------------- API ----------------
  async function api(method, path, body) {
    const opts = { method, headers: { 'X-Requested-With': 'mui' }, credentials: 'same-origin' };
    if (body !== undefined) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
    let res;
    try { res = await fetch(path, opts); } catch (_) { throw new Error('Sem conexão com o servidor. Verifique sua internet.'); }
    let data = {};
    try { data = await res.json(); } catch (_) { /* resposta vazia */ }
    if (!res.ok) { const e = new Error(data.error || `Erro ${res.status}`); e.status = res.status; throw e; }
    return data;
  }

  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => { t.hidden = true; }, 4200);
  }

  // Envia formulário com estado de carregamento e mensagem de erro
  function bindForm(form, handler) {
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const msg = $('.form-msg', form);
      const btn = $('button[type="submit"]', form);
      msg.textContent = ''; msg.classList.remove('ok');
      btn.disabled = true;
      try {
        const out = await handler(Object.fromEntries(new FormData(form)), form);
        if (typeof out === 'string') { msg.textContent = out; msg.classList.add('ok'); }
      } catch (e) {
        msg.textContent = e.message;
      } finally {
        btn.disabled = false;
      }
    });
  }

  // ---------------- diálogos ----------------
  function openDialog(id) {
    const d = document.getElementById(id);
    if (!d.open) d.showModal();
    return d;
  }
  $$('dialog').forEach((d) => {
    d.addEventListener('click', (ev) => {
      if (ev.target.closest('[data-close]')) d.close();
      else if (ev.target === d) d.close(); // clique fora
    });
  });

  // ---------------- conta / sessão ----------------
  async function loadMe() {
    try { const me = await api('GET', '/api/me'); state.me = me.account ? me : null; } catch (e) { state.me = null; }
    renderAuthArea();
    if (state.me && $('#account-dialog').open) renderAccount();
  }

  function renderAuthArea() {
    const area = $('#auth-area');
    const ns = $('#nav-status'); if (ns) ns.hidden = !(state.me && state.me.account.statusAccess);
    if (state.me) {
      area.innerHTML = `<span class="who">${esc(state.me.account.username)}</span>
        <button class="btn small btn-gold" type="button" id="btn-account">Minha conta</button>
        <button class="btn small btn-ghost" type="button" id="btn-logout">Sair</button>`;
      $('#btn-account').onclick = openAccount;
      $('#btn-logout').onclick = logout;
    } else {
      area.innerHTML = `<button class="btn small btn-ghost" type="button" id="btn-login">Entrar</button>
        <button class="btn small btn-gold" type="button" id="btn-register">Criar conta</button>`;
      $('#btn-login').onclick = () => openAuth('login');
      $('#btn-register').onclick = () => openAuth('register');
    }
  }

  function openAuth(view, notice) {
    const d = openDialog('auth-dialog');
    const titles = { login: 'Entrar', register: 'Criar conta', forgot: 'Recuperar acesso' };
    $('#auth-title').textContent = titles[view];
    $$('[data-view]', d).forEach((b) => { const on = b.dataset.view === view; b.classList.toggle('is-on', on); b.setAttribute('aria-selected', on); });
    $$('[data-view-panel]', d).forEach((p) => { p.hidden = p.dataset.viewPanel !== view; });
    $$('.form-msg', d).forEach((m) => { m.textContent = ''; m.classList.remove('ok'); });
    if (notice) { const m = $(`[data-view-panel="${view}"] .form-msg`, d); if (m) { m.textContent = notice; m.classList.add('ok'); } }
    const first = $(`[data-view-panel="${view}"] input`, d);
    // foca só se a pessoa ainda não estiver digitando em outro campo
    if (first && !(document.activeElement && document.activeElement.matches('input') && d.contains(document.activeElement))) first.focus();
  }
  $$('#auth-dialog [data-view]').forEach((b) => { b.onclick = () => openAuth(b.dataset.view); });
  $$('#auth-dialog [data-forgot]').forEach((b) => {
    b.onclick = () => {
      $$('#auth-dialog [data-forgot]').forEach((x) => x.classList.toggle('is-on', x === b));
      $$('#auth-dialog [data-forgot-panel]').forEach((p) => { p.hidden = p.dataset.forgotPanel !== b.dataset.forgot; });
    };
  });

  function showRecoveryCode(code) {
    $('#recovery-code').textContent = code;
    openDialog('code-dialog');
  }
  $('#btn-copy-code').onclick = async () => {
    try { await navigator.clipboard.writeText($('#recovery-code').textContent); toast('Código copiado.'); }
    catch (_) { toast('Selecione o código e copie manualmente.'); }
  };

  bindForm($('#form-login'), async (f) => {
    if (!f.login || !f.password) throw new Error('Informe usuário/e-mail e senha.');
    await api('POST', '/api/login', { login: f.login, password: f.password, remember: !!f.remember });
    $('#auth-dialog').close();
    $('#form-login').reset();
    await loadMe(); reconnectWs();
    toast(`Bem-vindo de volta, ${state.me ? state.me.account.username : ''}!`);
  });

  bindForm($('#form-register'), async (f) => {
    if (!/^[A-Za-z0-9_]{4,16}$/.test(f.username)) throw new Error('Usuário deve ter 4 a 16 caracteres: letras, números ou _.');
    if (f.password !== f.password2) throw new Error('As senhas não são iguais.');
    const out = await api('POST', '/api/register', { username: f.username, email: f.email, password: f.password });
    $('#auth-dialog').close();
    $('#form-register').reset();
    await loadMe(); reconnectWs();
    showRecoveryCode(out.recoveryCode);
    $('#code-dialog').addEventListener('close', () => { openAccount(); toast('Conta criada! Agora crie seu primeiro herói.'); }, { once: true });
  });

  bindForm($('#form-forgot'), async (f) => {
    const out = await api('POST', '/api/forgot', { email: f.email });
    if (out.devResetLink) console.info('[dev] link de redefinição:', out.devResetLink);
    return out.message;
  });

  bindForm($('#form-recover-code'), async (f) => {
    const out = await api('POST', '/api/recover-code', { username: f.username, code: f.code, password: f.password });
    $('#auth-dialog').close();
    $('#form-recover-code').reset();
    showRecoveryCode(out.recoveryCode);
    $('#code-dialog').addEventListener('close', () => openAuth('login', 'Senha alterada. Entre com a nova senha.'), { once: true });
  });

  let resetToken = null;
  bindForm($('#form-reset'), async (f) => {
    if (f.password !== f.password2) throw new Error('As senhas não são iguais.');
    await api('POST', '/api/reset', { token: resetToken, password: f.password });
    resetToken = null;
    history.replaceState(null, '', location.pathname);
    $('#reset-dialog').close();
    $('#form-reset').reset();
    await loadMe(); reconnectWs();
    openAuth('login', 'Senha alterada. Entre com a nova senha.');
  });

  function checkResetLink() {
    const m = location.hash.match(/^#reset=([A-Za-z0-9_-]{20,100})$/);
    if (!m) return;
    resetToken = m[1];
    history.replaceState(null, '', location.pathname); // tira o token da barra de endereço
    openDialog('reset-dialog');
  }

  async function logout() {
    try { await api('POST', '/api/logout'); } catch (_) { /* ignora */ }
    state.me = null;
    renderAuthArea(); reconnectWs();
    if ($('#account-dialog').open) $('#account-dialog').close();
    toast('Você saiu da conta.');
  }

  // ---------------- painel da conta e heróis ----------------
  function charCanvas(c, scale) {
    return portrait(c.class, c.appearance, 64, 1);
  }

  function renderAccount() {
    const me = state.me;
    if (!me || !state.data) return;
    const created = new Date(me.account.createdAt).toLocaleDateString(window.I18N ? I18N.locale : 'pt-BR');
    $('#account-meta').textContent = `${me.account.username} · ${me.account.email} · conta criada em ${created}`;
    const list = $('#char-list');
    list.innerHTML = '';
    if (!me.characters.length) {
      list.innerHTML = '<li class="char-empty">Você ainda não tem heróis. Crie o primeiro abaixo.</li>';
      $('#create-char').open = true;
    }
    me.characters.forEach((c, idx) => {
      const li = document.createElement('li');
      li.className = 'char-card' + (idx === 0 && me.characters.length > 1 && c.last_seen_at && new Date(c.last_seen_at) - new Date(c.created_at) > 2000 ? ' last' : '');
      li.tabIndex = 0;
      li.onclick = (ev) => { if (ev.target.closest('a,button')) return; $$('#char-list .char-card').forEach((x) => x.classList.remove('sel')); li.classList.add('sel'); };
      li.ondblclick = () => { location.href = `/game.html?c=${encodeURIComponent(c.id)}`; };
      li.appendChild(charCanvas(c, 3));
      const info = document.createElement('div');
      const mapName = (state.data.maps.find((m) => m.id === c.map) || {}).name || c.map;
      info.innerHTML = `${li.classList.contains('last') ? '<em class="last-tag">Último jogado</em>' : ''}<b>${esc(c.name)}</b><span>${esc(state.data.classes[c.class].name)} · Nv. ${c.level}${c.resets ? ` · ${c.resets} resets` : ''}</span>
        <span>${esc(mapName)} · ${fmt.format(c.zen)} Zen</span>`;
      const play = document.createElement('a');
      play.className = 'btn small btn-gold'; play.textContent = 'Entrar no mundo';
      play.href = `/game.html?c=${encodeURIComponent(c.id)}`;
      const del = document.createElement('button');
      del.type = 'button'; del.className = 'btn small btn-ghost'; del.textContent = 'Excluir';
      del.onclick = () => openDelete(c);
      const acts = document.createElement('div'); acts.className = 'char-acts';
      acts.append(play, del);
      info.appendChild(acts);
      li.appendChild(info);
      list.appendChild(li);
    });
    const full = me.characters.length >= state.data.limits.maxCharactersPerAccount;
    $('#create-char').hidden = full;
    $('#world-note').textContent = full
      ? `Você atingiu o limite de ${state.data.limits.maxCharactersPerAccount} heróis por conta.`
      : (me.characters.length ? 'Escolha um herói e toque em “Entrar no mundo”, ou crie outro herói abaixo.' : 'Crie seu primeiro herói para entrar no mundo.');
  }

  async function openAccount() {
    if (!state.me) return openAuth('login', 'Entre na sua conta para jogar.');
    openDialog('account-dialog');
    renderAccount();
    loadMe();
  }

  // Criação de herói com prévia ao vivo
  const draft = { class: 'dark_knight', hair: 0, skin: 0 };
  function setupCreateForm() {
    const pick = $('#class-pick');
    pick.innerHTML = Object.entries(state.data.classes).map(([id, c], i) =>
      `<label><input type="radio" name="class" value="${id}" ${i === 0 ? 'checked' : ''}> ${esc(c.name)}</label>`).join('');
    pick.addEventListener('change', (e) => { draft.class = e.target.value; draft.hair = defaultHair(draft.class); syncSwatches(); drawPreview(); });
    const mk = (el, colors, key, label) => {
      el.innerHTML = colors.map((col, i) => `<button type="button" class="swatch" style="background:${col}" data-i="${i}" aria-label="${label} ${i + 1}" aria-pressed="false"></button>`).join('');
      el.addEventListener('click', (e) => {
        const b = e.target.closest('.swatch'); if (!b) return;
        draft[key] = Number(b.dataset.i); syncSwatches(); drawPreview();
      });
    };
    mk($('#hair-pick'), Sprites.HAIR, 'hair', 'Cor de cabelo');
    mk($('#skin-pick'), Sprites.SKIN, 'skin', 'Tom de pele');
    draft.hair = defaultHair(draft.class);
    syncSwatches();
  }
  function defaultHair(cls) { return Sprites.defaultHairIndex(cls); }
  function syncSwatches() {
    $$('#hair-pick .swatch').forEach((b) => b.setAttribute('aria-pressed', Number(b.dataset.i) === draft.hair));
    // classes de elmo/capuz não mostram o cabelo
    $('#hair-pick').closest('fieldset').hidden = !Sprites.hasHair(draft.class);
    $$('#skin-pick .swatch').forEach((b) => b.setAttribute('aria-pressed', Number(b.dataset.i) === draft.skin));
  }
  let previewFrame = 0;
  function drawPreview() {
    const cv = $('#char-preview'); const ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, cv.width, cv.height);
    const cls = state.data.classes[draft.class];
    void cls;
    Sprites.hero(ctx, draft.class, { hair: draft.hair, skin: draft.skin }, 'idle', performance.now(), cv.width / 2, cv.height - 4, 2, false);
  }

  bindForm($('#form-char'), async (f) => {
    if (!/^[A-Za-z0-9]{3,12}$/.test(f.name || '')) throw new Error('Nome do herói: 3 a 12 letras ou números, sem espaços.');
    const out = await api('POST', '/api/characters', { name: f.name, class: draft.class, appearance: { hair: draft.hair, skin: draft.skin } });
    $('#form-char').reset();
    $('#create-char').open = false;
    draft.class = 'dark_knight'; draft.hair = defaultHair('dark_knight'); draft.skin = 0; syncSwatches();
    await loadMe(); renderAccount();
    toast(`${out.character.name} foi criado e salvo!`);
  });

  let deleting = null;
  function openDelete(c) {
    deleting = c;
    $('#delete-name').textContent = c.name;
    $('#form-delete').reset();
    $('#form-delete .form-msg').textContent = '';
    openDialog('delete-dialog');
  }
  bindForm($('#form-delete'), async (f) => {
    await api('DELETE', `/api/characters/${deleting.id}`, { confirmName: f.confirmName });
    $('#delete-dialog').close();
    toast(`${deleting.name} foi excluído.`);
    await loadMe(); renderAccount();
  });

  bindForm($('#form-change-pw'), async (f) => {
    const out = await api('POST', '/api/change-password', { current: f.current, password: f.password });
    $('#form-change-pw').reset();
    return out.message;
  });
  bindForm($('#form-new-code'), async (f) => {
    const out = await api('POST', '/api/recovery-code', { password: f.password });
    $('#form-new-code').reset();
    showRecoveryCode(out.recoveryCode);
    return 'Novo código gerado.';
  });

  // ---------------- tempo real (WebSocket) ----------------
  let ws = null, wsRetry = 0, wsTimer = null;
  function setConn(status) {
    const dot = $('#conn-dot'), txt = $('#conn-text');
    dot.className = 'dot ' + (status === 'on' ? 'on' : status === 'off' ? 'off' : '');
    txt.textContent = status === 'on' ? 'Servidor online · contagem ao vivo'
      : status === 'off' ? 'Conexão perdida · tentando reconectar…' : 'Conectando ao servidor…';
  }
  function renderStats(s) {
    $('#stat-online').textContent = fmt.format(s.online);
    $('#stat-visitors').textContent = fmt.format(s.visitors);
    $('#stat-accounts').textContent = fmt.format(s.accounts);
    $('#stat-chars').textContent = fmt.format(s.characters);
  }
  function connectWs() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    try { ws = new WebSocket(`${proto}://${location.host}/ws`); } catch (_) { return scheduleWs(); }
    const sock = ws;
    sock.onopen = () => { wsRetry = 0; setConn('on'); };
    sock.onmessage = (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch (_) { return; }
      if (m.type === 'stats' || m.type === 'hello') renderStats(m);
    };
    sock.onclose = () => { if (sock !== ws) return; setConn('off'); scheduleWs(); };
  }
  function scheduleWs() {
    clearTimeout(wsTimer);
    const delay = Math.min(15000, 1000 * 2 ** wsRetry++);
    wsTimer = setTimeout(connectWs, delay);
  }
  function reconnectWs() {
    // reabre para o servidor reconhecer login/logout
    clearTimeout(wsTimer);
    const old = ws; ws = null;
    if (old) { old.onclose = null; old.close(); }
    connectWs();
  }
  window.addEventListener('online', () => { if (!ws || ws.readyState > 1) reconnectWs(); });
  // Se o WebSocket falhar, ainda mostra números via HTTP
  api('GET', '/api/stats').then(renderStats).catch(() => {});

  // ---------------- cena animada do topo ----------------
  const scene = { heroes: [], monsters: [], shots: [], floats: [], fx: [], nextAttack: 0 };
  const SCENE_FX = {
    dark_knight: { slash: 'crescent_energy', impact: 'impact_energy' },
    dark_wizard: { proj: 'proj_energy', impact: 'impact_energy' },
    fairy_elf: { proj: 'proj_arrow', impact: 'impact_arrow' },
    magic_gladiator: { slash: 'crescent_dark', impact: 'impact_dark' },
    dark_lord: { proj: 'proj_fire', impact: 'impact_fire' },
    summoner: { proj: 'proj_spirit', impact: 'impact_spirit' },
  };
  function setupScene() {
    const cv = $('#hero-scene');
    const ctx = cv.getContext('2d');
    const classIds = Object.keys(state.data.classes);
    // a paisagem fica num canvas menor (pixels grandes); heróis e monstros em escala 1 no canvas principal
    const land = document.createElement('canvas');
    let landK = 2;
    function layout() {
      const narrow = window.innerWidth < 700;
      const R = narrow ? 1 : 0.5;          // pixels do canvas por pixel CSS
      landK = narrow ? 3 : 2;              // ampliação da paisagem
      cv.width = Math.ceil(cv.clientWidth * R);
      cv.height = Math.ceil(cv.clientHeight * R);
      land.width = Math.ceil(cv.width / landK); land.height = Math.ceil(cv.height / landK);
      const W = cv.width, H = cv.height;
      scene.horizon = narrow ? 0.36 : 0.6;
      const ground = Math.floor(H * scene.horizon);
      const startX = narrow ? W * 0.1 : W * 0.46;
      const gap = narrow ? W * 0.16 : Math.max(48, W * 0.085);
      scene.heroes = classIds.map((id, i) => ({
        id, x: Math.round(startX + (i % 3) * gap + (i >= 3 ? gap * 0.5 : 0)),
        y: Math.round(ground + (i >= 3 ? 30 : 8)), atk: -1e9, phase: i * 170,
      }));
      const mx = narrow ? W * 0.8 : W * 0.84;
      scene.monsters = [['slime', -8, 16], ['skeleton', 16, 4], ['goblin', 4, 34]].map(([kind, dx, dy]) => ({
        kind, x: Math.round(mx + dx), y: Math.round(ground + dy), hp: 100, max: 100, hurt: 0, dead: 0, dieAt: 0,
      }));
      scene.shots = []; scene.floats = []; scene.fx = [];
    }
    layout();
    let resizeT; window.addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(layout, 150); });
    const H_OF = { slime: 26, skeleton: 52, goblin: 46 };

    function step(t) {
      const W = cv.width, H = cv.height;
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, W, H);
      const lx = land.getContext('2d');
      PA.drawLandscape(lx, 'town', 'lorencia-hero', land.width, land.height, reduceMotion ? 0 : t, scene.horizon);
      ctx.drawImage(land, 0, 0, land.width * landK, land.height * landK);
      if (!reduceMotion && t > scene.nextAttack) {
        scene.nextAttack = t + 480;
        const alive = scene.monsters.filter((m) => !m.dead);
        if (alive.length) {
          const h = scene.heroes[Math.floor(Math.random() * scene.heroes.length)];
          const target = alive[Math.floor(Math.random() * alive.length)];
          h.atk = t;
          const fx = SCENE_FX[h.id];
          const tc = [target.x, target.y - H_OF[target.kind] / 2];
          if (fx.proj) scene.shots.push({ sprite: fx.proj, impact: fx.impact, x: h.x + 10, y: h.y - 28, tx: tc[0], ty: tc[1], target, born: t, dur: 340 });
          else scene.shots.push({ sprite: null, slash: fx.slash, impact: fx.impact, x: tc[0], y: tc[1], tx: tc[0], ty: tc[1], target, born: t, dur: 120 });
        }
      }
      const items = [];
      scene.heroes.forEach((h) => items.push(['h', h]));
      scene.monsters.forEach((m) => items.push(['m', m]));
      items.sort((a, b) => a[1].y - b[1].y);
      for (const [k, e] of items) {
        ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(e.x, e.y, k === 'h' ? 10 : 9, 3, 0, 0, Math.PI * 2); ctx.fill();
        if (k === 'h') {
          const attacking = t - e.atk < 340;
          Sprites.hero(ctx, e.id, undefined, attacking ? 'attack' : 'idle', attacking ? t - e.atk : t + e.phase, e.x, e.y, 1, false, { once: attacking });
        } else {
          if (e.dead) {
            if (t > e.dead) { e.dead = 0; e.hp = e.max; e.dieAt = 0; }
            else if (t - e.dieAt < 700) Sprites.monster(ctx, e.kind, 'death', t - e.dieAt, e.x, e.y, 1, true, { once: true });
            continue;
          }
          Sprites.monster(ctx, e.kind, 'idle', t, e.x, e.y, 1, true, { white: t < e.hurt });
          const top = e.y - H_OF[e.kind] - 6;
          ctx.fillStyle = '#0b1020'; ctx.fillRect(e.x - 10, top, 20, 4);
          ctx.fillStyle = e.hp > 40 ? '#6aa84f' : '#c8452c'; ctx.fillRect(e.x - 9, top + 1, Math.max(0, Math.round(18 * e.hp / e.max)), 2);
        }
      }
      scene.shots = scene.shots.filter((s) => {
        const p = Math.min(1, (t - s.born) / s.dur);
        if (s.sprite) {
          const x = s.x + (s.tx - s.x) * p, y = s.y + (s.ty - s.y) * p - Math.sin(p * Math.PI) * 8;
          Sprites.drawEffect(ctx, s.sprite, Math.floor((t - s.born) / 60) % 4, x, y, 1, Math.atan2(s.ty - s.y, s.tx - s.x));
        }
        if (p >= 1) {
          const dmg = 12 + Math.floor(Math.random() * 30);
          const crit = Math.random() < 0.15;
          s.target.hp -= crit ? dmg * 2 : dmg; s.target.hurt = t + 110;
          if (s.slash) scene.fx.push({ sprite: s.slash, x: s.tx, y: s.ty, born: t, dur: 240, frames: 4, flip: true });
          scene.fx.push({ sprite: s.impact, x: s.tx, y: s.ty, born: t, dur: 260, frames: 4 });
          scene.floats.push({ x: s.tx, y: s.ty - 10, text: String(crit ? dmg * 2 : dmg), crit, born: t });
          if (s.target.hp <= 0 && !s.target.dead) { s.target.dead = t + 1500; s.target.dieAt = t; scene.floats.push({ x: s.tx, y: s.ty - 22, text: '+EXP', crit: false, exp: true, born: t }); }
          return false;
        }
        return true;
      });
      scene.fx = scene.fx.filter((f) => {
        const p = (t - f.born) / f.dur; if (p >= 1) return false;
        Sprites.drawEffect(ctx, f.sprite, p * f.frames, f.x, f.y, 1, f.flip ? Math.PI : 0);
        return true;
      });
      ctx.font = '600 10px "Pixelify Sans", monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      scene.floats = scene.floats.filter((f) => {
        const age = t - f.born; if (age > 800) return false;
        const yy = Math.round(f.y - age / 40);
        ctx.fillStyle = '#0b1020'; ctx.fillText(f.text, f.x + 1, yy + 1);
        ctx.fillStyle = f.exp ? '#9affd0' : f.crit ? '#ffb02e' : '#ffffff'; ctx.fillText(f.text, f.x, yy);
        return true;
      });
      if (!reduceMotion) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  // retrato recortado (pés em baixo, sem a área vazia do quadro)
  function portrait(cls, ap, size, scale, action = 'idle', t = 0) {
    const cv = document.createElement('canvas'); cv.width = size; cv.height = size;
    Sprites.hero(cv.getContext('2d'), cls, ap, action, t, size / 2, size - 2 * scale, scale, false);
    return cv;
  }

  // ---------------- galeria de classes ----------------
  function setupClasses() {
    const tabs = $('#class-tabs');
    Object.entries(state.data.classes).forEach(([id, c]) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'class-tab'; b.setAttribute('role', 'tab'); b.dataset.id = id;
      b.appendChild(portrait(id, undefined, 64, 1)); b.append(c.name);
      b.onclick = () => selectClass(id);
      tabs.appendChild(b);
    });
    tabs.addEventListener('keydown', (e) => {
      if (!['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
      const ids = Object.keys(state.data.classes);
      const i = ids.indexOf(state.selectedClass) + (e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : -1);
      const next = ids[(i + ids.length) % ids.length];
      selectClass(next); $(`.class-tab[data-id="${next}"]`).focus(); e.preventDefault();
    });
    selectClass(state.selectedClass);
  }
  function selectClass(id) {
    state.selectedClass = id;
    const c = state.data.classes[id];
    $$('.class-tab').forEach((b) => { const on = b.dataset.id === id; b.setAttribute('aria-selected', on); b.tabIndex = on ? 0 : -1; });
    const labels = { str: 'Força', agi: 'Agilidade', vit: 'Vitalidade', ene: 'Energia', cmd: 'Comando' };
    const stats = Object.entries(c.base).filter(([k, v]) => k !== 'cmd' || v > 0)
      .map(([k, v]) => `<li><span>${labels[k]}</span><span class="bar"><span style="width:${Math.round(v / 30 * 100)}%"></span></span><span>${v}</span></li>`).join('');
    $('#class-detail').innerHTML = `<canvas width="192" height="192" id="class-big" aria-label="${esc(c.name)} em pixel art"></canvas>
      <div><h3 style="margin-top:0">${esc(c.name)}</h3><p class="role">${esc(c.role)}</p><p>${esc(c.desc)}</p>
      <ul class="stats" aria-label="Atributos iniciais">${stats}</ul>
      <h4>Algumas habilidades</h4><ul class="skills">${c.skills.map((s) => `<li>${esc(s)}</li>`).join('')}</ul></div>`;
    bigStart = performance.now();
    drawBigClass();
  }
  let bigStart = 0;
  function drawBigClass() {
    const cv = $('#class-big'); if (!cv) return;
    const ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, cv.width, cv.height);
    // ciclo: parado 2,4s → andando 1,6s → atacando 0,8s
    const t = (performance.now() - bigStart) % 4800;
    const [act, at] = t < 2400 ? ['idle', t] : t < 4000 ? ['walk', t - 2400] : ['attack', (t - 4000) * 0.45];
    Sprites.hero(ctx, state.selectedClass, undefined, act, at, 80, 182, 2, false, { once: act === 'attack' });
  }

  // ---------------- mapas ----------------
  function setupMaps() {
    const grid = $('#map-grid');
    grid.innerHTML = '';
    state.data.maps.forEach((m) => {
      const li = document.createElement('li');
      li.className = 'map-card'; li.dataset.level = m.level;
      const img = document.createElement('img');
      img.src = `/assets/maps/${m.id}.jpg`; img.alt = ''; img.loading = 'lazy'; img.decoding = 'async';
      li.appendChild(img);
      const tag = [m.playable ? '<span class="tag-open">Aberto agora</span>' : '', m.pvp ? '<span class="tag-pvp">PvP</span>' : m.safe ? '<span class="tag-safe">Zona segura</span>' : ''].filter(Boolean).join(' · ');
      li.insertAdjacentHTML('beforeend', `<div class="info"><h3>${esc(m.name)}</h3>
        <p><span>${esc(m.type)}</span><span class="lvl">Nv. ${m.level}+</span></p>${tag ? `<p>${tag}</p>` : ''}</div>`);
      grid.appendChild(li);
    });
    $$('.map-filter .chip').forEach((chip) => {
      chip.onclick = () => {
        $$('.map-filter .chip').forEach((c) => c.classList.toggle('is-on', c === chip));
        const r = chip.dataset.range;
        $$('#map-grid .map-card').forEach((li) => {
          if (r === 'all') { li.hidden = false; return; }
          const [a, b] = r.split('-').map(Number); const lv = Number(li.dataset.level);
          li.hidden = lv < a || lv > b;
        });
      };
    });
  }

  // ---------------- inventário ----------------
  function setupItems() {
    const rar = Object.fromEntries(state.data.rarities.map((r) => [r.id, r]));
    const grid = $('#inv-grid');
    state.data.items.forEach((it, i) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'slot'; b.setAttribute('role', 'option');
      b.setAttribute('aria-label', `${it.name}, ${rar[it.rarity].name}`);
      b.style.setProperty('--r', rar[it.rarity].color);
      if (['epic', 'legendary', 'ancestral'].includes(it.rarity)) b.classList.add('glow');
      const cv = document.createElement('canvas'); cv.width = 16 * 3; cv.height = 16 * 3;
      PA.drawIcon(cv.getContext('2d'), it.icon, 3, 3, 3, rar[it.rarity].color);
      b.appendChild(cv);
      b.onclick = () => selectItem(i);
      b.onmouseenter = () => selectItem(i);
      grid.appendChild(b);
    });
    $('#rarity-legend').innerHTML = state.data.rarities.map((r) => `<li><i style="background:${r.color}"></i>${esc(r.name)}</li>`).join('');
    selectItem(state.data.items.findIndex((it) => it.rarity === 'legendary'));
  }
  function selectItem(i) {
    const it = state.data.items[i];
    const r = state.data.rarities.find((x) => x.id === it.rarity);
    $$('#inv-grid .slot').forEach((s, k) => s.setAttribute('aria-selected', k === i));
    $('#item-tip').innerHTML = `<h3 style="color:${r.color}">${esc(it.name)}</h3><p class="rar" style="color:${r.color}">${esc(r.name)}</p>
      <dl><dt>Tipo</dt><dd>${esc(it.slot)}</dd><dt>Efeito</dt><dd>${esc(it.stat)}</dd>
      <dt>Melhoria</dt><dd>+0 de +15 · use joias para fortalecer</dd></dl>`;
  }

  // ---------------- notícias e ranking ----------------
  async function loadNews() {
    const ul = $('#news-list');
    try {
      const { news } = await api('GET', '/api/news');
      const kinds = { news: 'Notícia', event: 'Evento', update: 'Atualização' };
      ul.innerHTML = news.length ? news.map((n) => `<li class="${esc(n.kind)}"><time datetime="${esc(n.published_at)}">${kinds[n.kind] || ''} · ${new Date(n.published_at).toLocaleDateString(window.I18N ? I18N.locale : 'pt-BR', { day: '2-digit', month: 'long' })}</time>
        <h3>${esc(n.title)}</h3><p>${esc(n.body)}</p></li>`).join('') : '<li class="muted">Nenhuma notícia por enquanto.</li>';
    } catch (e) { ul.innerHTML = `<li class="muted">Não foi possível carregar as notícias. ${esc(e.message)}</li>`; }
  }
  async function loadRanking(by = state.rankBy) {
    state.rankBy = by;
    $$('#ranking .tab').forEach((t) => { const on = t.dataset.by === by; t.classList.toggle('is-on', on); t.setAttribute('aria-selected', on); });
    const tb = $('#rank-body');
    try {
      const { ranking } = await api('GET', `/api/ranking?by=${by}`);
      const lastCol = $('#rank-last'); if (lastCol) lastCol.textContent = { pvp: 'PvP', bosses: 'Bosses', power: 'Poder' }[by] || 'Resets';
      tb.innerHTML = ranking.length ? ranking.map((r, i) => `<tr><td>${i + 1}</td><td>${esc(r.name)}</td>
        <td>${esc((state.data && state.data.classes[r.class] || {}).name || r.class)}</td><td>${r.level}</td><td>${by === 'pvp' ? `${r.pvp_kills} · ${r.duel_wins} duelos` : by === 'bosses' ? r.bosses_killed : by === 'power' ? r.combat_power : r.resets}</td></tr>`).join('')
        : '<tr><td colspan="5" class="empty">Nenhum herói ainda. Crie o seu e seja o primeiro do ranking.</td></tr>';
    } catch (e) { tb.innerHTML = `<tr><td colspan="5" class="empty">${esc(e.message)}</td></tr>`; }
  }
  $$('#ranking .tab').forEach((t) => { t.onclick = () => loadRanking(t.dataset.by); });

  // ---------------- botões do topo ----------------
  $('#btn-play').onclick = () => {
    if (!state.me) return openAuth('login', 'Entre na sua conta para jogar. Ainda não tem? Use “Criar conta”.');
    // sempre abre a seleção de heróis (dá para escolher ou criar outro)
    openAccount();
  };
  $('#btn-hero-register').onclick = () => (state.me ? openAccount() : openAuth('register'));
  $('#btn-hero-ranking').onclick = () => $('#ranking').scrollIntoView();

  function brandIcon() {
    const cv = $('#brand-icon');
    Sprites.hero(cv.getContext('2d'), 'dark_knight', undefined, 'idle', 0, 16, 54, 1, false);
  }

  // Animações leves (prévia e classe em destaque)
  if (!reduceMotion) {
    setInterval(() => {
      previewFrame++;
      if (state.data) {
        drawBigClass();
        if ($('#account-dialog').open && $('#create-char').open) drawPreview();
      }
    }, 100);
  }

  // ---------------- início ----------------
  (async function init() {
    renderAuthArea();
    connectWs();
    try {
      state.data = await api('GET', '/api/gamedata');
    } catch (e) {
      toast('Não foi possível carregar os dados do jogo. Recarregue a página.');
      return;
    }
    await Sprites.ready;
    brandIcon(); setupScene(); setupClasses(); setupMaps(); setupItems(); setupCreateForm(); drawPreview();
    loadNews(); loadRanking();
    await loadMe();
    // voltando do jogo pelo botão "Trocar herói": abre a seleção
    if (/[?&]herois\b/.test(location.search)) {
      history.replaceState(null, '', '/');
      if (state.me) openAccount();
    }
    checkResetLink();
    window.addEventListener('hashchange', checkResetLink);
  })();
})();
