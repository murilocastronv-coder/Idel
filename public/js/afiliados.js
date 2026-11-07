// Painel do afiliado: link próprio, quantas pessoas entraram por ele e os prêmios
'use strict';
(function () {
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const T = (s) => (window.I18N && I18N.t ? I18N.t(s) : s);
  const STATUS = { valid: ['Válido', 'ref-ok'], same_ip: ['Mesmo IP que o seu', 'ref-bad'], duplicate_ip: ['IP repetido', 'ref-bad'], no_ip: ['Sem IP', 'ref-bad'] };
  async function load() {
    let r;
    try {
      const res = await fetch('/api/referral', { headers: { 'x-requested-with': 'mui' }, credentials: 'same-origin' });
      if (res.status === 401) { $('#ref-login').hidden = false; return; }
      r = await res.json();
      if (!r.ok) throw new Error(r.error || 'erro');
    } catch (e) { $('#ref-login').hidden = false; return; }
    $('#ref-box').hidden = false;
    $('#ref-url').value = r.link;
    $('#ref-lv').textContent = r.qualifyLevel; $('#ref-plus').textContent = r.reward.plus; $('#ref-ops').textContent = r.reward.options;
    $('#r-total').textContent = r.total; $('#r-valid').textContent = r.valid; $('#r-qual').textContent = r.qualified;
    $('#r-rew').textContent = r.rewards + (r.pending ? ` (+${r.pending} ${T('guardados')})` : ''); $('#r-invalid').textContent = r.invalid;
    if (r.list.length) {
      $('#r-list').innerHTML = r.list.map((x) => {
        const [st, cls] = STATUS[x.status] || [x.status, ''];
        const sit = x.status !== 'valid' ? `<span class="${cls}">${esc(T(st))}</span>` : x.qualified ? `<span class="ref-ok">${esc(T('Chegou ao nível do prêmio'))}</span>` : `<span class="ref-wait">${esc(T('Subindo de nível'))}</span>`;
        return `<tr><td>${esc(x.user)}</td><td>${new Date(x.at).toLocaleDateString(window.I18N ? I18N.locale : 'pt-BR')}</td><td>${x.level}</td><td>${sit}</td><td>${x.reward ? esc(x.reward) + ' +8' : '—'}</td></tr>`;
      }).join('');
    }
    const msg = (t) => { $('#ref-msg').textContent = t; };
    $('#ref-copy').onclick = async () => {
      try { await navigator.clipboard.writeText(r.link); msg(T('Link copiado!')); } catch (_) { $('#ref-url').select(); document.execCommand('copy'); msg(T('Link copiado!')); }
    };
    if (navigator.share) {
      $('#ref-share').hidden = false;
      $('#ref-share').onclick = () => navigator.share({ title: 'MuonlineClaude', text: T('Vem jogar MuonlineClaude comigo!'), url: r.link }).catch(() => {});
    }
  }
  load();
})();
