// MU Idle Legends — página inicial do app (/app)
'use strict';
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const T = (s) => (window.I18N ? I18N.t(s) : s);
  const fmt = new Intl.NumberFormat(window.I18N ? I18N.locale : 'pt-BR');
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const CLASS = { dark_knight: 'Dark Knight', dark_wizard: 'Dark Wizard', fairy_elf: 'Fairy Elf', magic_gladiator: 'Magic Gladiator', dark_lord: 'Dark Lord', summoner: 'Summoner' };
  if (/MUIdleApp/.test(navigator.userAgent)) document.querySelectorAll('[data-hide-in-app]').forEach((e) => e.remove());
  let me = null;
  try { sessionStorage.setItem('mui_app', '1'); } catch (_) { /* ok */ }

  async function api(method, url, body) {
    const r = await fetch(url, {
      method, credentials: 'same-origin',
      headers: body ? { 'Content-Type': 'application/json', 'X-Requested-With': 'mui' } : { 'X-Requested-With': 'mui' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `${T('Erro')} ${r.status}`);
    return j;
  }
  let toastT = null;
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 3500); }

  // ---------- vídeo: garante que toque (alguns celulares pausam o autoplay) ----------
  const video = $('#a-video');
  const tryPlay = () => { const p = video.play(); if (p && p.catch) p.catch(() => {}); };
  tryPlay();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tryPlay(); });
  addEventListener('pointerdown', tryPlay, { once: true });

  // ---------- jogadores online ----------
  async function stats() {
    try { const s = await api('GET', '/api/stats'); $('#a-online').textContent = fmt.format(s.online); $('#a-dot').style.background = '#6aa84f'; }
    catch (_) { $('#a-dot').style.background = '#c8452c'; }
  }
  stats(); setInterval(stats, 20000);

  // ---------- conta ----------
  async function loadMe() {
    try { const r = await api('GET', '/api/me'); me = r.account ? r : null; } catch (_) { me = null; }
    render();
  }
  function render() {
    $('#a-guest').hidden = !!me;
    $('#a-user').hidden = !me;
    if (!me) return;
    $('#a-name').textContent = me.account.username;
    const list = $('#a-heroes');
    list.innerHTML = me.characters.slice(0, 4).map((c) => `<li><a href="/game.html?c=${encodeURIComponent(c.id)}">
      <b>${esc(c.name)}</b><small>${esc(CLASS[c.class] || c.class)} · ${esc(T('Nv.'))} ${c.level}</small><span>${esc(T('Entrar no mundo'))}</span></a></li>`).join('');
    const play = $('#a-play');
    if (me.characters.length) { play.href = `/game.html?c=${encodeURIComponent(me.characters[0].id)}`; play.textContent = `${T('Jogar com')} ${me.characters[0].name}`; }
    else { play.href = '/?herois'; play.textContent = T('Criar meu primeiro herói'); }
  }

  // ---------- janela de conta ----------
  const TITLES = { register: 'Criar conta', login: 'Entrar', forgot: 'Esqueci a senha', code: 'Recuperar acesso', saved: 'Guarde seu código de recuperação' };
  function open(view) {
    $('#sheet').hidden = false; $('#sheet-back').hidden = false;
    $$('#sheet .form').forEach((f) => f.classList.toggle('on', f.dataset.view === view));
    $('#sheet-title').textContent = T(TITLES[view]);
    $$('#sheet .form-msg').forEach((m) => { m.textContent = ''; m.classList.remove('ok'); });
    const first = $(`#sheet .form[data-view="${view}"] input`);
    if (first && matchMedia('(pointer: fine)').matches) setTimeout(() => first.focus(), 60);
  }
  function close() { $('#sheet').hidden = true; $('#sheet-back').hidden = true; }
  $$('[data-open]').forEach((b) => { b.onclick = () => open(b.dataset.open); });
  $('#sheet-back').onclick = close;
  $('#sheet [data-close]').onclick = close;
  addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });

  function bind(view, handler) {
    const f = $(`#sheet .form[data-view="${view}"]`);
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const msg = $('.form-msg', f); msg.textContent = ''; msg.classList.remove('ok');
      const btn = $('button[type="submit"]', f); btn.disabled = true;
      try { await handler(Object.fromEntries(new FormData(f)), msg, f); }
      catch (err) { msg.textContent = T(err.message); }
      finally { btn.disabled = false; }
    });
  }
  bind('register', async (d) => {
    if (d.password !== d.password2) throw new Error('As senhas não são iguais.');
    const r = await api('POST', '/api/register', { username: d.username.trim(), email: d.email.trim(), password: d.password });
    await loadMe();
    $('#a-code').textContent = r.recoveryCode || '';
    open('saved');
    toast(T('Conta criada! Agora crie seu primeiro herói.'));
  });
  bind('login', async (d) => {
    const r = await api('POST', '/api/login', { login: d.login.trim(), password: d.password, remember: !!d.remember });
    await loadMe(); close();
    toast(T('Bem-vindo de volta, {0}!').replace('{0}', r.username));
  });
  bind('forgot', async (d, msg) => {
    const r = await api('POST', '/api/forgot', { email: d.email.trim() });
    msg.classList.add('ok'); msg.textContent = T(r.message || 'Se existir uma conta com este e-mail, enviamos um link de redefinição válido por 1 hora.');
  });
  bind('code', async (d, msg, f) => {
    await api('POST', '/api/recover-code', { username: d.username.trim(), code: d.code, password: d.password });
    f.reset(); open('login');
    toast(T('Senha alterada. Entre com a nova senha.'));
  });
  $('#a-copy').onclick = async () => {
    try { await navigator.clipboard.writeText($('#a-code').textContent); toast(T('Código copiado.')); }
    catch (_) { toast(T('Selecione o código e copie manualmente.')); }
  };
  $('#a-logout').onclick = async () => { try { await api('POST', '/api/logout'); } catch (_) { /* ok */ } me = null; render(); toast(T('Você saiu da conta.')); };

  loadMe();
})();
