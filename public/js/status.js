// MU Idle Legends — página /status (jogadores online e crescimento)
'use strict';
(function () {
  const $ = (s) => document.querySelector(s);
  const T = (s) => (window.I18N ? I18N.t(s) : s);
  const LOC = window.I18N ? I18N.locale : 'pt-BR';
  const fmt = new Intl.NumberFormat(LOC);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const CLASS = { dark_knight: 'Dark Knight', dark_wizard: 'Dark Wizard', fairy_elf: 'Fairy Elf', magic_gladiator: 'Magic Gladiator', dark_lord: 'Dark Lord', summoner: 'Summoner' };
  const tip = $('#st-tip');
  let data = null;

  // ---------- utilidades ----------
  const day = (iso) => new Date(iso + 'T12:00:00');
  const dayLabel = (iso) => day(iso).toLocaleDateString(LOC, { day: '2-digit', month: '2-digit' });
  const dayLong = (iso) => day(iso).toLocaleDateString(LOC, { weekday: 'short', day: '2-digit', month: 'short' });
  const hourLabel = (h) => `${Number(h.slice(11, 13))}h`;
  const hourLong = (h) => `${day(h.slice(0, 10)).toLocaleDateString(LOC, { day: '2-digit', month: 'short' })} · ${h.slice(11, 13)}:00`;
  function niceMax(v) {
    if (v <= 4) return 4;
    const p = 10 ** Math.floor(Math.log10(v));
    for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
    return 10 * p;
  }
  function showTip(x, y, html) { tip.innerHTML = html; tip.hidden = false; tip.style.left = `${Math.max(70, Math.min(innerWidth - 70, x))}px`; tip.style.top = `${y}px`; }
  function hideTip() { tip.hidden = true; }
  function pct(a, b) {
    if (!b) return a ? { cls: 'up', txt: T('novo') } : { cls: 'flat', txt: '0%' };
    const p = Math.round((a - b) / b * 100);
    return { cls: p > 0 ? 'up' : p < 0 ? 'down' : 'flat', txt: `${p > 0 ? '▲ +' : p < 0 ? '▼ ' : ''}${p}%` };
  }

  // ---------- gráficos (SVG, uma série por gráfico) ----------
  function frame(el, n, maxV) {
    const W = Math.max(280, el.clientWidth), H = W < 520 ? 170 : 210;
    const pad = { l: 34, r: 12, t: 14, b: 24 };
    const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
    const top = niceMax(maxV);
    const ticks = [0, top / 2, top];
    const y = (v) => pad.t + ih - (v / top) * ih;
    let grid = '<g class="grid">', axis = '<g class="axis">';
    for (const t of ticks) { grid += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(t)}" y2="${y(t)}"/>`; axis += `<text x="${pad.l - 6}" y="${y(t) + 4}" text-anchor="end">${fmt.format(t)}</text>`; }
    return { W, H, pad, iw, ih, y, grid: grid + '</g>', axis };
  }
  function xLabels(f, labels, xOf, every) {
    let s = '';
    labels.forEach((l, i) => { if (l && (i % every === 0)) s += `<text x="${xOf(i)}" y="${f.H - 6}" text-anchor="middle">${esc(l)}</text>`; });
    return s;
  }
  function table(el, rows, head) {
    const d = document.createElement('details');
    d.innerHTML = `<summary>${T('Ver tabela')}</summary><table><thead><tr><th>${esc(head[0])}</th><th>${esc(head[1])}</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${esc(r[0])}</td><td>${fmt.format(r[1])}</td></tr>`).join('')}</tbody></table>`;
    el.appendChild(d);
  }

  function bars(el, items, opt) {
    el.innerHTML = '';
    if (!items.length) { el.innerHTML = `<p class="st-empty">${T('Ainda sem dados.')}</p>`; return; }
    const maxV = Math.max(1, ...items.map((d) => d.v));
    const f = frame(el, items.length, maxV);
    const slot = f.iw / items.length, bw = Math.max(2, Math.min(26, slot - 2));
    const xOf = (i) => f.pad.l + slot * i + slot / 2;
    let b = '';
    items.forEach((d, i) => {
      const h = Math.max(d.v ? 2 : 0, f.pad.t + f.ih - f.y(d.v));
      const x = xOf(i) - bw / 2, y0 = f.pad.t + f.ih;
      const r = Math.min(4, bw / 2, h);
      // topo arredondado (4px), base reta na linha zero
      b += h ? `<path class="bar" data-i="${i}" d="M${x},${y0} V${y0 - h + r} Q${x},${y0 - h} ${x + r},${y0 - h} H${x + bw - r} Q${x + bw},${y0 - h} ${x + bw},${y0 - h + r} V${y0} Z"/>` : '';
    });
    const every = Math.ceil(items.length / (f.W < 520 ? 5 : 8));
    el.insertAdjacentHTML('afterbegin', `<svg viewBox="0 0 ${f.W} ${f.H}" role="img" aria-label="${esc(opt.label)}">${f.grid}${b}${f.axis}${xLabels(f, items.map((d) => d.l), xOf, every)}</g>
      <rect class="hit" x="${f.pad.l}" y="0" width="${f.iw}" height="${f.H}" fill="transparent"/></svg>`);
    const svg = el.querySelector('svg');
    const move = (ev) => {
      const r = svg.getBoundingClientRect();
      const sx = (ev.clientX - r.left) * (f.W / r.width);
      const i = Math.max(0, Math.min(items.length - 1, Math.floor((sx - f.pad.l) / slot)));
      svg.querySelectorAll('.bar').forEach((p) => p.classList.toggle('dim', Number(p.dataset.i) !== i));
      showTip(r.left + xOf(i) * (r.width / f.W), r.top + f.y(items[i].v) * (r.height / f.H), `${esc(items[i].t)}<br><b>${fmt.format(items[i].v)}</b> ${esc(opt.unit)}`);
    };
    const leave = () => { svg.querySelectorAll('.bar').forEach((p) => p.classList.remove('dim')); hideTip(); };
    svg.addEventListener('pointermove', move); svg.addEventListener('pointerdown', move); svg.addEventListener('pointerleave', leave);
    table(el, items.map((d) => [d.t, d.v]), opt.head);
  }

  function line(el, items, opt) {
    el.innerHTML = '';
    if (items.length < 2) { el.innerHTML = `<p class="st-empty">${T('Ainda sem dados suficientes. O histórico é gravado a cada 5 minutos.')}</p>`; return; }
    const maxV = Math.max(1, ...items.map((d) => d.v));
    const f = frame(el, items.length, maxV);
    const xOf = (i) => f.pad.l + (f.iw * i) / (items.length - 1);
    const pts = items.map((d, i) => [xOf(i), f.y(d.v)]);
    const path = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
    const area = `${path} L${pts[pts.length - 1][0]},${f.pad.t + f.ih} L${pts[0][0]},${f.pad.t + f.ih} Z`;
    const last = pts[pts.length - 1];
    const every = Math.ceil(items.length / (f.W < 520 ? 5 : 8));
    el.insertAdjacentHTML('afterbegin', `<svg viewBox="0 0 ${f.W} ${f.H}" role="img" aria-label="${esc(opt.label)}">${f.grid}
      <path class="area" d="${area}"/><path class="line" d="${path}"/>
      <circle class="pt" cx="${last[0]}" cy="${last[1]}" r="4"/>
      <text class="end-label" x="${last[0] - 6}" y="${last[1] - 9}" text-anchor="end">${fmt.format(items[items.length - 1].v)}</text>
      <line class="cross" x1="0" x2="0" y1="${f.pad.t}" y2="${f.pad.t + f.ih}" visibility="hidden"/>
      <circle class="pt hover" r="4" visibility="hidden"/>
      ${f.axis}${xLabels(f, items.map((d) => d.l), xOf, every)}</g>
      <rect class="hit" x="${f.pad.l}" y="0" width="${f.iw}" height="${f.H}" fill="transparent"/></svg>`);
    const svg = el.querySelector('svg');
    const cross = svg.querySelector('.cross'), dot = svg.querySelector('.pt.hover');
    const move = (ev) => {
      const r = svg.getBoundingClientRect();
      const sx = (ev.clientX - r.left) * (f.W / r.width);
      const i = Math.max(0, Math.min(items.length - 1, Math.round(((sx - f.pad.l) / f.iw) * (items.length - 1))));
      const [px, py] = pts[i];
      cross.setAttribute('x1', px); cross.setAttribute('x2', px); cross.setAttribute('visibility', 'visible');
      dot.setAttribute('cx', px); dot.setAttribute('cy', py); dot.setAttribute('visibility', 'visible');
      showTip(r.left + px * (r.width / f.W), r.top + py * (r.height / f.H), `${esc(items[i].t)}<br><b>${fmt.format(items[i].v)}</b> ${esc(opt.unit)}`);
    };
    const leave = () => { cross.setAttribute('visibility', 'hidden'); dot.setAttribute('visibility', 'hidden'); hideTip(); };
    svg.addEventListener('pointermove', move); svg.addEventListener('pointerdown', move); svg.addEventListener('pointerleave', leave);
    table(el, items.map((d) => [d.t, d.v]), opt.head);
  }

  function hbars(el, items, empty) {
    if (!items.length) { el.innerHTML = `<li class="st-empty">${esc(empty)}</li>`; return; }
    const max = Math.max(1, ...items.map((d) => d.v));
    el.innerHTML = items.map((d) => `<li><span>${esc(d.l)}</span><b>${fmt.format(d.v)}</b><span class="track"><span class="fill" style="width:${(d.v / max) * 100}%"></span></span></li>`).join('');
  }

  // ---------- montar a página ----------
  function render() {
    if (!data) return;
    const L = data.live, S = data.totals;
    $('#t-online').textContent = fmt.format(L.online);
    $('#t-online-sub').textContent = `${fmt.format(L.inWorld)} ${T('no mundo')} · ${fmt.format(L.visitors)} ${T('no site')}`;
    $('#t-accounts').textContent = fmt.format(S.accounts);
    $('#t-accounts-sub').textContent = `+${fmt.format(S.accounts_today)} ${T('hoje')}`;
    $('#t-chars').textContent = fmt.format(S.characters);
    $('#t-chars-sub').textContent = S.accounts ? `${(S.characters / S.accounts).toFixed(1)} ${T('por conta')}` : '';
    $('#t-active').textContent = fmt.format(S.active_today);
    $('#t-active-sub').textContent = `${fmt.format(S.active_7d)} ${T('nos últimos 7 dias')}`;
    const peak = Math.max(S.peak_online, L.peakSinceBoot, L.online);
    $('#t-peak').textContent = fmt.format(peak);
    $('#t-peak-sub').textContent = `${fmt.format(Math.max(S.peak_24h, L.online))} ${T('nas últimas 24h')}`;

    const c1 = pct(S.accounts_7d, S.accounts_prev7d);
    $('#cmp-accounts').innerHTML = `${T('Novas contas em 7 dias')}<b>${fmt.format(S.accounts_7d)}<span class="delta ${c1.cls}">${c1.txt}</span></b><small>${T('vs. 7 dias anteriores')}: ${fmt.format(S.accounts_prev7d)}</small>`;
    const c2 = pct(S.active_7d, S.active_prev7d);
    $('#cmp-active').innerHTML = `${T('Jogadores ativos em 7 dias')}<b>${fmt.format(S.active_7d)}<span class="delta ${c2.cls}">${c2.txt}</span></b><small>${T('vs. 7 dias anteriores')}: ${fmt.format(S.active_prev7d)}</small>`;
    const before = S.accounts - S.accounts_30d;
    const c3 = pct(S.accounts, before);
    $('#cmp-month').innerHTML = `${T('Crescimento em 30 dias')}<b>+${fmt.format(S.accounts_30d)}<span class="delta ${c3.cls}">${c3.txt}</span></b><small>${T('ativos no mês')}: ${fmt.format(S.active_30d)}</small>`;

    const D = data.daily;
    line($('#c-total'), D.map((d) => ({ l: dayLabel(d.day), t: dayLong(d.day), v: d.total_accounts })), { label: T('Total de contas'), unit: T('contas'), head: [T('Dia'), T('Contas')] });
    bars($('#c-new'), D.map((d) => ({ l: dayLabel(d.day), t: dayLong(d.day), v: d.new_accounts })), { label: T('Novas contas por dia'), unit: T('novas contas'), head: [T('Dia'), T('Novas contas')] });
    bars($('#c-active'), D.map((d) => ({ l: dayLabel(d.day), t: dayLong(d.day), v: d.active })), { label: T('Jogadores ativos por dia'), unit: T('jogadores'), head: [T('Dia'), T('Ativos')] });
    line($('#c-online'), data.hourly.map((h) => ({ l: hourLabel(h.hour), t: hourLong(h.hour), v: h.online })), { label: T('Jogadores online'), unit: T('online'), head: [T('Hora'), T('Online')] });

    hbars($('#l-classes'), data.classes.map((c) => ({ l: CLASS[c.class] || c.class, v: c.n })), T('Nenhum herói ainda.'));
    hbars($('#l-levels'), data.levels.map((c) => ({ l: `${T('Nível')} ${c.band}`, v: c.n })), T('Nenhum herói ainda.'));
    hbars($('#l-maps'), data.maps.map((m) => ({ l: m.name, v: m.players })), T('Ninguém no mundo neste momento.'));

    const up = L.uptimeSec, uh = Math.floor(up / 3600), um = Math.floor(up / 60) % 60;
    const facts = [
      [T('Monstros derrotados'), fmt.format(S.monsters_killed)],
      [T('Bosses derrotados'), fmt.format(S.bosses_killed)],
      [T('Vitórias PvP'), fmt.format(S.pvp_kills)],
      [T('Duelos vencidos'), fmt.format(S.duels)],
      [T('Maior nível'), fmt.format(S.top_level)],
      [T('Ativos no mês'), fmt.format(S.active_30d)],
      [T('Servidor no ar há'), uh ? `${uh}h ${um}min` : `${um}min`],
      [T('Primeira conta'), S.first_account ? new Date(S.first_account).toLocaleDateString(LOC) : '–'],
    ];
    $('#facts').innerHTML = facts.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('');
  }

  async function load() {
    try {
      const r = await fetch('/api/status', { cache: 'no-store' });
      if (!r.ok) throw new Error(r.status);
      data = await r.json();
      render();
      $('#st-dot').classList.remove('off');
      $('#st-updated').textContent = `${T('Atualizado às')} ${new Date().toLocaleTimeString(LOC, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
    } catch (_) {
      $('#st-dot').classList.add('off');
      $('#st-updated').textContent = T('Sem conexão com o servidor. Tentando de novo…');
    }
  }
  let rt = null;
  addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(render, 150); });
  addEventListener('scroll', hideTip, { passive: true });
  load();
  setInterval(load, 30000);
})();
