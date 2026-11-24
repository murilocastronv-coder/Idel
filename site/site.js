(function () {
  'use strict';
  var D = window.SITE_DATA || { heroes: [], maps: [], monsters: [], wings: [] };
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var fmt = function (n) { return Number(n).toLocaleString('pt-BR'); };

  // Menu do celular
  var toggle = document.querySelector('.menu-toggle'), menu = $('menu');
  toggle.addEventListener('click', function () { var o = menu.classList.toggle('open'); toggle.setAttribute('aria-expanded', o); });
  menu.addEventListener('click', function (e) { if (e.target.tagName === 'A') { menu.classList.remove('open'); toggle.setAttribute('aria-expanded', 'false'); } });

  // Números
  $('n-classes').textContent = D.heroes.length || 5;
  $('n-maps').textContent = D.maps.length || 20;
  $('n-monsters').textContent = D.monsters.length || 16;
  $('n-wings').textContent = D.wings.length || 30;

  // Fundo do topo: Lorencia (ou o primeiro mapa com imagem)
  var bg = D.maps.find(function (m) { return m.image; });
  if (bg) $('hero-bg').style.backgroundImage = 'url("' + bg.image + '")';
  $('hero-party').innerHTML = D.heroes.filter(function (h) { return h.image; }).map(function (h) {
    return '<img src="' + esc(h.image) + '" alt="' + esc(h.name) + '" width="96" height="96">';
  }).join('');

  // Classes
  $('classes-grid').innerHTML = D.heroes.map(function (h) {
    return '<article class="class">' + (h.image ? '<img src="' + esc(h.image) + '" alt="" loading="lazy">' : '') +
      '<h3>' + esc(h.name) + '</h3><p>' + esc(h.description) + '</p><div class="skills">' +
      h.skills.map(function (s, i) {
        return '<div class="skill" style="--c:' + esc(s.color) + '"><span>' + (i + 1) + ' · ' + esc(s.name) + '</span><small>' + s.cost + ' MP · ' + (s.cooldown / 1000) + 's</small></div>';
      }).join('') + '</div></article>';
  }).join('');

  // Mapas
  $('maps-grid').innerHTML = D.maps.map(function (m) {
    return '<article class="map">' + (m.image ? '<img src="' + esc(m.image) + '" alt="" loading="lazy">' : '') +
      (m.levels ? '<span class="lv">Nv. ' + m.levels[0] + (m.levels[1] !== m.levels[0] ? '–' + m.levels[1] : '') + '</span>' : '') +
      '<div class="info"><h3>' + esc(m.name) + '</h3><p>' + esc(m.theme) + (m.monsters ? ' · ' + m.monsters + ' tipos de monstro' : '') + '</p></div></article>';
  }).join('');

  // Monstros (bosses primeiro)
  var mons = D.monsters.slice().sort(function (a, b) { return (b.boss - a.boss) || (a.level - b.level); });
  $('monsters-grid').innerHTML = mons.map(function (m) {
    return '<article class="monster' + (m.boss ? ' boss' : '') + '">' + (m.image ? '<img src="' + esc(m.image) + '" alt="" loading="lazy">' : '') +
      (m.boss ? '<div><span class="tag">BOSS</span></div>' : '') +
      '<h3>' + esc(m.name) + '</h3><p>Nv. ' + m.level + ' · ' + esc(m.map) + '</p><p>' + fmt(m.hp) + ' vida' + (m.ranged ? ' · à distância' : '') + '</p></article>';
  }).join('');

  // Asas com filtro por família (batendo como no jogo)
  var families = ['Todas'].concat(D.wings.map(function (w) { return w.family; }).filter(function (f, i, a) { return a.indexOf(f) === i; }));
  var current = 'Todas';
  function drawWings() {
    $('wings-grid').innerHTML = D.wings.filter(function (w) { return current === 'Todas' || w.family === current; }).map(function (w, i) {
      var u = 'url(' + encodeURI(w.image) + ')', d = 'animation-delay:-' + (i % 5) * 0.3 + 's;';
      return '<article class="wing"><div class="pair"><div class="half l" style="background-image:' + u + ';' + d + '"></div><div class="half r" style="background-image:' + u + ';' + d + '"></div></div><h3>' + esc(w.family) + '</h3><p>Nível ' + w.level + '</p><p class="price' + (w.price ? '' : ' free') + '">' + (w.price ? fmt(w.price) + ' ouro' + (w.cents ? '<br><span class="real">ou R$ ' + (w.cents / 100).toFixed(2).replace('.', ',') + '</span>' : '') : 'GRÁTIS') + '</p></article>';
    }).join('');
  }
  $('wing-filters').innerHTML = families.map(function (f) { return '<button type="button" data-f="' + esc(f) + '"' + (f === current ? ' class="on"' : '') + '>' + esc(f) + '</button>'; }).join('');
  $('wing-filters').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    current = b.dataset.f;
    Array.prototype.forEach.call(this.children, function (c) { c.classList.toggle('on', c === b); });
    drawWings();
  });
  drawWings();

  // Loja Premium
  var P = D.premium || { vip: [], perks: {}, packs: [] };
  var brl = function (c) { return 'R$ ' + (c / 100).toFixed(2).replace('.', ','); };
  var vipCard = function (plan, name) {
    var plans = P.vip.filter(function (v) { return v.plan === plan; });
    return '<article class="prem vip ' + plan + '"><h3>★ ' + name + '</h3><ul>' + (P.perks[plan] || []).map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul><div class="prices">' +
      plans.map(function (v) { return '<span>' + v.days + ' dias · <b>' + brl(v.cents) + '</b></span>'; }).join('') + '</div></article>';
  };
  $('premium-grid').innerHTML = vipCard('ouro', 'VIP Ouro') + vipCard('diamante', 'VIP Diamante') +
    P.packs.filter(function (p) { return !p.hidden; }).map(function (p) { return '<article class="prem" style="border-color:' + esc(p.color) + '"><h3 style="color:' + esc(p.color) + '">' + esc(p.name) + '</h3><p>' + esc(p.rarity) + ' · ' + esc(p.desc) + '</p><div class="prices"><span><b>' + brl(p.cents) + '</b></span></div></article>'; }).join('') +
    '<article class="prem"><h3>🪽 Asas</h3><p>29 asas pagas: com ouro do jogo ou de R$ 4,90 a R$ 49,90. A Angelical Nv.1 é grátis.</p><div class="prices"><a href="#asas">Ver asas</a></div></article>';

  // Tabela do modo HARD (mesma fórmula do jogo)
  var need = function (n) { return Math.round(100 * n * (1 + 0.12 * n)); };
  var expAt = function (lv) {
    var near = D.monsters.filter(function (m) { return !m.boss; }).sort(function (a, b) { return Math.abs(a.level - lv) - Math.abs(b.level - lv); })[0];
    return near ? near.exp : 20;
  };
  $('hard-table').innerHTML = [1, 5, 10, 20, 30, 40, 50].map(function (n) {
    var e = expAt(n);
    return '<tr><td>' + n + ' → ' + (n + 1) + '</td><td class="num">' + fmt(need(n)) + '</td><td class="num">~' + fmt(Math.ceil(need(n) / Math.max(1, Math.round(e * 0.3)))) + '</td><td class="num">~' + fmt(Math.ceil(need(n) / Math.max(1, Math.round(e * 0.4)))) + '</td></tr>';
  }).join('');

  // Servidor ao vivo + ranking
  // Contas criadas e jogadores online, atualizando a cada 20 s
  function loadStats() {
    fetch('/api/stats', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (h) {
      var on = h.online || 0;
      $('live-dot').className = 'dot on'; $('pl-dot').className = 'dot on';
      $('live-text').textContent = 'Servidor online · ' + fmt(on) + (on === 1 ? ' jogando agora' : ' jogando agora');
      $('pl-online').textContent = fmt(on);
      $('pl-accounts').textContent = h.accounts == null ? '–' : fmt(h.accounts);
      $('pl-heroes').textContent = h.heroes == null ? '–' : fmt(h.heroes);
    }).catch(function () {
      $('live-dot').className = 'dot off'; $('pl-dot').className = 'dot off';
      $('live-text').textContent = 'Servidor indisponível no momento';
    });
  }
  loadStats();
  setInterval(function () { if (!document.hidden) loadStats(); }, 20000);

  fetch('/api/ranking').then(function (r) { return r.ok ? r.json() : Promise.reject(); }).then(function (d) {
    var rows = (d.ranking || []);
    $('ranking-body').innerHTML = rows.length ? rows.map(function (r, i) {
      return '<tr><td>' + (i + 1) + '</td><td>' + esc(r.username) + '</td><td>' + esc(r.hero || '—') + '</td><td class="num">' + fmt(r.level) + '</td></tr>';
    }).join('') : '<tr><td colspan="4">Ninguém no ranking ainda. Seja o primeiro!</td></tr>';
  }).catch(function () { $('ranking-body').innerHTML = '<tr><td colspan="4">Ranking indisponível no momento.</td></tr>'; });
})();
