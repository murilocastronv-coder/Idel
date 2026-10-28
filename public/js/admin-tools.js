// MU Idle Legends — ferramentas do Super ADM: Chaos Machine, tabela de drops, regras de reset e histórico.
// Montado dentro do painel de administração (game.js chama MUAdminTools.mount).
'use strict';
(function () {
  const $ = (q, el = document) => el.querySelector(q);
  const $$ = (q, el = document) => [...el.querySelectorAll(q)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = new Intl.NumberFormat('pt-BR');
  const dt = (d) => new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  const RAR = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'ancestral'];
  const RAR_PT = { common: 'Comum', uncommon: 'Incomum', rare: 'Raro', epic: 'Épico', legendary: 'Lendário', ancestral: 'Ancestral' };
  const FAIL_PT = { lose_all: 'Perde tudo (item principal, materiais e Zen)', keep_main: 'Item principal volta; perde materiais e Zen', keep_items: 'Só cobra o Zen; itens voltam' };
  const TIER_PT = { any: 'Qualquer', normal: 'Comum', elite: 'Elite', boss: 'Boss' };
  const SCOPE_PT = { all: 'Todos os mapas', map: 'Um mapa', monster: 'Um monstro' };
  const TARGET_PT = { all: 'Todos os materiais', jewel: 'Jewel of Chaos', wing: 'Materiais de asas', cape: 'Materiais de capas', boss: 'Recompensas de bosses' };
  const ROLE_PT = { player: 'Jogador', moderator: 'Moderador', admin: 'Administrador', superadmin: 'Super ADM' };
  let X = null; // contexto (api, classes, sendCmd)

  function msg(box, text, bad) { const m = $('.adt-msg', box); if (m) { m.textContent = text; m.className = 'adt-msg ' + (bad ? 'bad' : 'ok'); } }
  const sel = (name, opts, cur, attrs = '') => `<select ${attrs} data-f="${name}">${opts.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(cur) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  const num = (name, v, attrs = '') => `<input type="number" data-f="${name}" value="${esc(v)}" ${attrs}>`;

  // ---------------- Chaos Machine ----------------
  async function chaos(box) {
    box.innerHTML = '<p class="muted">Carregando…</p>';
    let V;
    try { V = await X.api('GET', '/api/admin/chaos'); } catch (e) { box.innerHTML = `<p class="bad">${esc(e.message)}</p>`; return; }
    const C = V.config, N = V.names, CL = X.classes;
    const recipe = (id) => {
      const r = C.recipes[id], al = V.allowed[id];
      return `<fieldset class="adt-card" data-recipe="${id}"><legend>${esc(r.name)}</legend>
        <label class="adt-check"><input type="checkbox" data-f="enabled" ${r.enabled ? 'checked' : ''}> Receita ativa</label>
        <div class="adm-row"><label>Zen ${num('zen', r.zen, 'min="0" step="1000"')}</label>
          <label>Se falhar ${sel('onFail', V.onFail.map((k) => [k, FAIL_PT[k]]), r.onFail)}</label></div>
        <div class="adm-row"><label>Chance base % ${num('rate.base', r.rate.base, 'min="0" max="100"')}</label>
          <label>+% por +1 ${num('rate.perPlus', r.rate.perPlus, 'min="0" max="50"')}</label>
          <label>+% por raridade ${num('rate.perRarity', r.rate.perRarity, 'min="0" max="50"')}</label>
          <label>Máximo % ${num('rate.max', r.rate.max, 'min="1" max="100"')}</label></div>
        <div class="adm-row"><label>Item principal: + mínimo ${num('main.minPlus', r.main.minPlus, 'min="0" max="15"')}</label>
          <label>raridade mínima ${sel('main.minRarity', RAR.map((k) => [k, RAR_PT[k]]), r.main.minRarity)}</label></div>
        <p class="adt-sub">Aceita como item principal</p>
        <div class="adt-checks">${al.main.map((b) => `<label class="adt-check"><input type="checkbox" data-list="main.bases" value="${b}" ${r.main.bases.includes(b) ? 'checked' : ''}> ${esc(N[b])}</label>`).join('')}</div>
        <p class="adt-sub">Resultados possíveis${r.mode === 'random' ? ` · sorteio: ${sel('pick', [['class', 'só os da classe de quem combina'], ['any', 'qualquer um (clássico)']], r.pick)}` : ' (evolução da asa/capa usada)'}</p>
        <div class="adt-checks">${al.results.map((b) => `<label class="adt-check"><input type="checkbox" data-list="results" value="${b}" ${r.results.includes(b) ? 'checked' : ''}> ${esc(N[b])}</label>`).join('')}</div>
        <p class="adt-sub">Classes que podem combinar (nenhuma marcada = todas)</p>
        <div class="adt-checks">${Object.entries(CL).map(([k, c]) => `<label class="adt-check"><input type="checkbox" data-list="classes" value="${k}" ${r.classes.includes(k) ? 'checked' : ''}> ${esc(c.name)}</label>`).join('')}</div>
        <p class="adt-sub">Materiais</p>
        <div class="adt-mats">${r.materials.map((m) => matRow(m, V.materials)).join('')}</div>
        <button class="btn small" type="button" data-add-mat>+ material</button>
      </fieldset>`;
    };
    const matRow = (m, list) => `<div class="adm-row adt-mat">${sel('item', list.map((x) => [x.id, x.name]), m.item)} × ${num('qty', m.qty, 'min="1" max="99"')} <button class="btn small" type="button" data-del-mat>remover</button></div>`;
    box.innerHTML = `<p class="adt-msg" role="status"></p>
      <label class="adt-check"><input type="checkbox" id="adt-npc" ${C.npcRequired ? 'checked' : ''}> Precisa estar no Chaos Goblin (Lorencia)</label>
      ${V.recipeIds.map(recipe).join('')}
      <fieldset class="adt-card"><legend>Asas e capas (atributos, nível e classes)</legend>
        <div class="adt-table-wrap"><table class="adt-table"><thead><tr><th>Item</th><th>Nível</th><th>Defesa</th><th>Dano %</th><th>Absorve %</th><th>Classes</th></tr></thead><tbody>
        ${V.items.map((it) => `<tr data-item="${it.id}"><td>${esc(it.name)}</td><td>${num('req', it.req, 'min="1"')}</td><td>${num('def', it.def, 'min="0"')}</td><td>${num('wdmg', it.wdmg, 'min="0"')}</td><td>${num('absorb', it.absorb, 'min="0" max="60"')}</td>
          <td class="adt-cls">${Object.entries(CL).map(([k, c]) => `<label title="${esc(c.name)}"><input type="checkbox" value="${k}" ${it.classes.includes(k) ? 'checked' : ''} ${it.cat === 'cape' && k !== 'dark_lord' ? 'disabled' : ''}>${esc(c.name.split(' ').map((w) => w[0]).join(''))}</label>`).join('')}</td></tr>`).join('')}
        </tbody></table></div>
      </fieldset>
      <button class="btn btn-gold" type="button" id="adt-chaos-save">Salvar Chaos Machine</button>
      <h4>Histórico de combinações</h4>
      <div class="adm-row"><input id="adt-chaos-name" placeholder="Filtrar por personagem" maxlength="16"><button class="btn small" type="button" id="adt-chaos-filter">Filtrar</button></div>
      <ul class="adm-list adt-log" id="adt-chaos-log">${histChaos(V.history, N)}</ul>`;
    const bindDel = () => $$('[data-del-mat]', box).forEach((b) => { b.onclick = () => b.closest('.adt-mat').remove(); });
    $$('[data-add-mat]', box).forEach((b) => { b.onclick = () => { b.previousElementSibling.insertAdjacentHTML('beforeend', matRow({ item: V.materials[0].id, qty: 1 }, V.materials)); bindDel(); }; });
    bindDel();
    $('#adt-chaos-filter').onclick = async () => {
      try { const r = await X.api('GET', '/api/admin/chaos?name=' + encodeURIComponent($('#adt-chaos-name').value.trim())); $('#adt-chaos-log').innerHTML = histChaos(r.history, N); } catch (e) { msg(box, e.message, true); }
    };
    $('#adt-chaos-save').onclick = async () => {
      const cfg = { npcRequired: $('#adt-npc').checked, recipes: {}, items: {} };
      for (const fs of $$('[data-recipe]', box)) {
        const r = { rate: {}, main: { bases: [] }, results: [], classes: [], materials: [] };
        for (const el of $$('[data-f]', fs)) {
          if (el.closest('.adt-mat')) continue;
          const path = el.dataset.f.split('.');
          const v = el.type === 'checkbox' ? el.checked : el.type === 'number' ? Number(el.value) : el.value;
          if (path.length === 2) r[path[0]][path[1]] = v; else r[path[0]] = v;
        }
        for (const el of $$('[data-list]', fs)) if (el.checked) { const path = el.dataset.list.split('.'); (path.length === 2 ? r[path[0]][path[1]] : r[path[0]]).push(el.value); }
        for (const row of $$('.adt-mat', fs)) r.materials.push({ item: $('[data-f=item]', row).value, qty: Number($('[data-f=qty]', row).value) });
        cfg.recipes[fs.dataset.recipe] = r;
      }
      for (const tr of $$('[data-item]', box)) {
        cfg.items[tr.dataset.item] = { req: Number($('[data-f=req]', tr).value), def: Number($('[data-f=def]', tr).value), wdmg: Number($('[data-f=wdmg]', tr).value),
          absorb: Number($('[data-f=absorb]', tr).value), classes: $$('.adt-cls input', tr).filter((i) => i.checked).map((i) => i.value) };
      }
      try { const r = await X.api('POST', '/api/admin/chaos', { config: cfg }); msg(box, r.message); } catch (e) { msg(box, e.message, true); box.scrollIntoView({ block: 'start' }); }
    };
  }
  function histChaos(rows, N) {
    if (!rows.length) return '<li class="muted">Nenhuma combinação ainda.</li>';
    return rows.map((h) => `<li>${dt(h.created_at)} · <b>${esc(h.char_name)}</b> · ${esc(h.recipe)} · ${esc(N[h.inputs.main.base] || h.inputs.main.base)}${h.inputs.main.plus ? ' +' + h.inputs.main.plus : ''} · ${h.chance}% ·
      ${h.success ? `<span class="ok">sucesso → ${esc(N[h.result_base] || h.result_base)}</span>` : `<span class="bad">falhou</span>${h.lost.length ? ' (perdeu ' + h.lost.map(esc).join(', ') + ')' : ''}`} · ${fmt.format(h.zen)} Zen</li>`).join('');
  }

  // ---------------- Drops ----------------
  async function drops(box) {
    box.innerHTML = '<p class="muted">Carregando…</p>';
    let V;
    try { V = await X.api('GET', '/api/admin/drops'); } catch (e) { box.innerHTML = `<p class="bad">${esc(e.message)}</p>`; return; }
    draw();
    function draw() {
      const C = V.config;
      const itemName = (k) => (V.items.find((i) => i.id === k) || { name: k }).name;
      const scopeOpts = (r) => r.scope === 'map' ? V.maps.map((m) => [m.id, m.name]) : r.scope === 'monster' ? V.monsters.map((m) => [m.id, `${m.name} (nv. ${m.level}, ${TIER_PT[m.tier]})`]) : [['', '—']];
      const items = [...V.items].sort((a, b) => (b.special - a.special) || a.name.localeCompare(b.name));
      const row = (r) => `<tr data-rule="${r.id || ''}" class="${r.enabled === false ? 'off' : ''}">
        <td>${sel('item', items.map((i) => [i.id, i.name]), r.item)}</td>
        <td>${sel('scope', V.scopes.map((k) => [k, SCOPE_PT[k]]), r.scope)}${sel('scopeId', scopeOpts(r), r.scopeId || '', r.scope === 'all' ? 'hidden' : '')}</td>
        <td>${sel('tier', V.tiers.map((k) => [k, TIER_PT[k]]), r.tier)}</td>
        <td>${num('chance', r.chance, 'step="0.001" min="0.001" max="100" class="w-s"')}</td>
        <td>${num('qtyMin', r.qtyMin, 'min="1" max="100" class="w-xs"')}–${num('qtyMax', r.qtyMax, 'min="1" max="100" class="w-xs"')}</td>
        <td>${num('monMin', r.monMin, 'min="0" class="w-xs"')}–${num('monMax', r.monMax, 'min="0" class="w-xs"')}</td>
        <td>${num('playerMin', r.playerMin, 'min="0" class="w-xs"')}</td>
        <td><input data-f="cats" value="${esc((r.cats || []).join(','))}" class="w-m" placeholder="jewel,wing,cape"></td>
        <td>${sel('delivery', [['bag', 'Bolsa'], ['ground', 'Chão']], r.delivery)}</td>
        <td><input type="checkbox" data-f="enabled" ${r.enabled !== false ? 'checked' : ''}></td>
        <td><input data-f="note" value="${esc(r.note || '')}" class="w-m"></td>
        <td class="nowrap"><button class="btn small btn-gold" type="button" data-save>${r.id ? 'Salvar' : 'Criar'}</button>${r.id ? ' <button class="btn small" type="button" data-del>×</button>' : ''}</td></tr>`;
      box.innerHTML = `<p class="adt-msg" role="status"></p>
        <fieldset class="adt-card"><legend>Configuração geral</legend>
          <div class="adm-row"><label>Tempo no chão (s) ${num('groundSecs', C.groundSecs, 'min="10" max="600"')}</label>
            <label>Distância para recolher ${num('pickupRange', C.pickupRange, 'min="10" max="120"')}</label>
            <label>Limite dos eventos (×) ${num('maxEventMult', C.maxEventMult, 'min="1" max="10" step="0.5"')}</label></div>
          <div class="adm-row"><label>Zen dos monstros ${sel('zenDelivery', [['direct', 'Direto no saldo'], ['ground', 'Aparece no chão']], C.zenDelivery)}</label>
            <label>Bolsa cheia ${sel('fullPolicy', [['ground', 'Fica no chão para o dono'], ['zen', 'Vende na hora (vira Zen)']], C.fullPolicy)}</label></div>
          <label class="adt-check"><input type="checkbox" data-f="showRates" ${C.showRates ? 'checked' : ''}> Mostrar as chances de drop para os jogadores (na Chaos Machine)</label>
          <button class="btn small btn-gold" type="button" id="adt-drop-cfg">Salvar configuração</button>
        </fieldset>
        <fieldset class="adt-card"><legend>Tabela de drop (${V.rules.length} regras)</legend>
          <p class="muted small">Chance em % por monstro derrotado. Categorias (jewel, wing, cape) ligam a regra aos eventos. Nível do monstro mín–máx; jogador mín.</p>
          <div class="adt-table-wrap"><table class="adt-table adt-rules"><thead><tr><th>Item</th><th>Onde</th><th>Tipo</th><th>Chance %</th><th>Qtd</th><th>Nv. monstro</th><th>Nv. jog.</th><th>Categorias</th><th>Entrega</th><th>Ativa</th><th>Nota</th><th></th></tr></thead>
          <tbody>${V.rules.map(row).join('')}${row({ item: 'jewel_of_chaos', scope: 'all', tier: 'normal', chance: 1, qtyMin: 1, qtyMax: 1, monMin: 0, monMax: 9999, playerMin: 0, cats: ['jewel'], delivery: 'bag', enabled: true })}</tbody></table></div>
        </fieldset>
        <fieldset class="adt-card"><legend>Eventos de drop</legend>
          <ul class="adm-list">${V.events.map((e) => `<li><b>${esc(e.name)}</b> · ${esc(TARGET_PT[e.target])} · chance ×${e.chanceMult} · quantidade ×${e.qtyMult} · até ${dt(e.ends)} <button class="btn small" type="button" data-stop="${e.id}">Encerrar</button></li>`).join('') || '<li class="muted">Nenhum evento ativo.</li>'}</ul>
          <div class="adm-row" id="adt-ev"><input data-f="name" placeholder="Nome do evento" maxlength="60">
            ${sel('target', V.targets.map((k) => [k, TARGET_PT[k]]), 'all')}
            <label>Chance × ${num('chanceMult', 2, 'min="1" step="0.5"')}</label><label>Quantidade × ${num('qtyMult', 1, 'min="1" step="0.5"')}</label>
            <label>Horas ${num('hours', 24, 'min="1"')}</label><button class="btn small btn-gold" type="button" id="adt-ev-go">Iniciar evento</button></div>
          <p class="muted small">Quando dois eventos valem para o mesmo item, vale o maior bônus (nunca somam).</p>
        </fieldset>
        <fieldset class="adt-card"><legend>Testar a tabela (simulação, nada é entregue)</legend>
          <div class="adm-row" id="adt-sim">${sel('monster', V.monsters.map((m) => [m.id, `${m.name} (nv. ${m.level}, ${TIER_PT[m.tier]})`]), 'skeleton')}
            <label>Abates ${num('n', 10000, 'min="1" max="200000"')}</label><label>Nível do jogador ${num('level', 50, 'min="1"')}</label>
            <label class="adt-check"><input type="checkbox" data-f="events"> com eventos</label><button class="btn small" type="button" id="adt-sim-go">Simular</button></div>
          <div id="adt-sim-out"></div>
        </fieldset>
        <h4>Histórico de drops de materiais</h4>
        <div class="adm-row"><input id="adt-drop-name" placeholder="Filtrar por personagem" maxlength="16"><button class="btn small" type="button" id="adt-drop-log">Ver</button></div>
        <ul class="adm-list adt-log" id="adt-drop-out"></ul>`;
      const fields = (el) => { const o = {}; for (const f of $$('[data-f]', el)) o[f.dataset.f] = f.type === 'checkbox' ? f.checked : f.value; return o; };
      const post = async (body) => { try { const r = await X.api('POST', '/api/admin/drops', body); if (r.rules) V = r; draw(); msg(box, r.message || 'Ok.'); return r; } catch (e) { msg(box, e.message, true); return null; } };
      $('#adt-drop-cfg').onclick = () => post({ op: 'config', config: fields($('fieldset', box)) });
      $$('[data-rule]', box).forEach((tr) => {
        $('[data-f=scope]', tr).onchange = (e) => {
          const r = { scope: e.target.value };
          const s2 = $('[data-f=scopeId]', tr);
          s2.innerHTML = scopeOpts(r).map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join('');
          s2.hidden = r.scope === 'all';
        };
        $('[data-save]', tr).onclick = () => {
          const f = fields(tr);
          post({ op: 'rule', rule: { ...f, id: tr.dataset.rule ? Number(tr.dataset.rule) : undefined, scopeId: f.scope === 'all' ? null : f.scopeId } });
        };
        const del = $('[data-del]', tr);
        if (del) del.onclick = () => { if (del.dataset.sure) post({ op: 'deleteRule', id: Number(tr.dataset.rule) }); else { del.dataset.sure = 1; del.textContent = 'Remover?'; } };
      });
      $$('[data-stop]', box).forEach((b) => { b.onclick = () => post({ op: 'stopEvent', id: Number(b.dataset.stop) }); });
      $('#adt-ev-go').onclick = () => post({ op: 'event', event: fields($('#adt-ev')) });
      $('#adt-sim-go').onclick = async () => {
        const f = fields($('#adt-sim'));
        const mon = V.monsters.find((m) => m.id === f.monster);
        try {
          const r = await X.api('POST', '/api/admin/drops', { op: 'simulate', monster: f.monster, map: mon && mon.maps[0] || '', n: Number(f.n), level: Number(f.level), events: f.events });
          const s = r.sim;
          $('#adt-sim-out').innerHTML = `<p>${esc(s.monster)} (${TIER_PT[s.tier]}, nv. ${s.level}) · ${fmt.format(s.kills)} abates · jogador nv. ${s.playerLevel}</p>
            <ul class="adm-list">${s.items.map((i) => `<li><b>${esc(i.name)}</b>: ${fmt.format(i.qty)} no total · 1 a cada ${fmt.format(i.everyKills)} abates</li>`).join('') || '<li class="muted">Nada caiu.</li>'}</ul>`;
        } catch (e) { msg(box, e.message, true); }
      };
      $('#adt-drop-log').onclick = async () => {
        try {
          const r = await X.api('GET', '/api/admin/drops/log?name=' + encodeURIComponent($('#adt-drop-name').value.trim()));
          const EV = { drop: 'obteve', ground: 'caiu no chão', pickup: 'recolheu', expired: 'sumiu do chão', ground_full: 'bolsa cheia → chão', sold_full: 'bolsa cheia → vendido' };
          $('#adt-drop-out').innerHTML = r.log.map((l) => `<li>${dt(l.created_at)} · <b>${esc(l.char_name || '?')}</b> ${esc(EV[l.event] || l.event)} ${fmt.format(l.qty)}× ${esc(itemName(l.item))}${l.source ? ' · ' + esc(l.source) : ''}${l.map ? ' · ' + esc(l.map) : ''}${l.room ? ' sala ' + l.room : ''}</li>`).join('') || '<li class="muted">Nada ainda.</li>';
        } catch (e) { msg(box, e.message, true); }
      };
    }
  }

  // ---------------- Comandos, regras e histórico ----------------
  async function rules(box) {
    box.innerHTML = '<p class="muted">Carregando…</p>';
    let V;
    try { V = await X.api('GET', '/api/admin/rules'); } catch (e) { box.innerHTML = `<p class="bad">${esc(e.message)}</p>`; return; }
    const R = V.rules;
    box.innerHTML = `<p class="adt-msg" role="status"></p>
      <fieldset class="adt-card"><legend>Executar comando</legend>
        <div class="adm-row"><input id="adt-cmd" placeholder="/admplayer Nome" maxlength="200" style="flex:1"><button class="btn small btn-gold" type="button" id="adt-cmd-go">Enviar</button></div>
        <p class="muted small">A resposta aparece no Chat (só para você). Operações que removem ou reduzem pedem confirmação. Motivo opcional: "/removegold Nome 100 -- motivo".</p>
        <details><summary>Lista de comandos</summary><ul class="adm-list">${V.help.filter((h) => !['confirm', 'cancel'].includes(h.cmd)).map((h) => `<li><code>${esc(h.usage)}</code> <small class="muted">(${esc(ROLE_PT[h.role])})</small><br><small>${esc(h.desc)}</small></li>`).join('')}</ul></details>
        <p class="muted small">Papéis: dê Moderador ou Administrador com <code>/setrole Nome moderator</code> ou <code>/setrole Nome admin</code>.</p>
      </fieldset>
      <fieldset class="adt-card" id="adt-rules"><legend>Reset, Master Reset e limites</legend>
        <div class="adm-row"><label>Reset: nível mínimo ${num('reset.minLevel', R.reset.minLevel, 'min="1"')}</label><label>pontos por reset ${num('reset.pointsPerReset', R.reset.pointsPerReset, 'min="0"')}</label>
          <label>máximo de resets ${num('reset.maxResets', R.reset.maxResets, 'min="1"')}</label><label class="adt-check"><input type="checkbox" data-f="reset.keepStats" ${R.reset.keepStats ? 'checked' : ''}> manter atributos</label></div>
        <div class="adm-row"><label>Master Reset: resets mínimos ${num('master.minResets', R.master.minResets, 'min="1"')}</label><label>nível mínimo ${num('master.minLevel', R.master.minLevel, 'min="1"')}</label>
          <label>pontos por MR ${num('master.pointsPerMaster', R.master.pointsPerMaster, 'min="0"')}</label></div>
        <div class="adm-row"><label>Confirmação expira (s) ${num('confirmSecs', R.confirmSecs, 'min="15" max="600"')}</label><label>Zen máximo ${num('maxZen', R.maxZen, 'min="1000"')}</label>
          <label>Pontos livres máx. ${num('maxFreePoints', R.maxFreePoints, 'min="1000"')}</label><label>Pontos por comando ${num('maxAddPoints', R.maxAddPoints, 'min="1"')}</label></div>
        <button class="btn small btn-gold" type="button" id="adt-rules-save">Salvar regras</button>
      </fieldset>
      <h4>Histórico administrativo</h4>
      <div class="adm-row"><input id="adt-log-name" placeholder="Filtrar por personagem ou ADM" maxlength="16"><button class="btn small" type="button" id="adt-log-go">Filtrar</button></div>
      <ul class="adm-list adt-log" id="adt-log">${histAdm(V.log)}</ul>`;
    $('#adt-cmd-go').onclick = () => { const v = $('#adt-cmd').value.trim(); if (!v.startsWith('/')) return msg(box, 'Comece com /', true); X.sendCmd(v); msg(box, 'Enviado. Veja a resposta no Chat.'); X.openChat(); };
    $('#adt-cmd').onkeydown = (e) => { if (e.key === 'Enter') $('#adt-cmd-go').click(); };
    $('#adt-rules-save').onclick = async () => {
      const o = { reset: {}, master: {} };
      for (const f of $$('[data-f]', $('#adt-rules'))) { const p = f.dataset.f.split('.'); const v = f.type === 'checkbox' ? f.checked : Number(f.value); if (p.length === 2) o[p[0]][p[1]] = v; else o[p[0]] = v; }
      try { const r = await X.api('POST', '/api/admin/rules', { rules: o }); msg(box, r.message); } catch (e) { msg(box, e.message, true); }
    };
    $('#adt-log-go').onclick = async () => {
      try { const r = await X.api('GET', '/api/admin/rules?name=' + encodeURIComponent($('#adt-log-name').value.trim())); $('#adt-log').innerHTML = histAdm(r.log); } catch (e) { msg(box, e.message, true); }
    };
  }
  function histAdm(rows) {
    if (!rows.length) return '<li class="muted">Nenhum registro.</li>';
    const RES = { ok: 'ok', error: 'erro', denied: 'negado', pending: 'aguardando confirmação', cancelled: 'cancelado', expired: 'expirou' };
    const val = (o) => o ? Object.entries(o).filter(([k]) => ['level', 'zen', 'free', 'resets', 'masterResets', 'exp', 'role'].includes(k)).map(([k, v]) => `${k} ${typeof v === 'number' ? fmt.format(v) : esc(v)}`).join(', ') : '';
    return rows.map((r) => `<li class="r-${esc(r.result)}">${dt(r.created_at)} · <b>${esc(r.admin_name || '?')}</b> · <code>/${esc(r.command)}</code>${r.target_name ? ' → ' + esc(r.target_name) : ''} · ${esc(RES[r.result] || r.result)}
      ${r.message ? `<br><small>${esc(r.message)}</small>` : ''}${r.before && r.after ? `<br><small class="muted">antes: ${val(r.before)} · depois: ${val(r.after)}</small>` : ''}${r.reason ? `<br><small>Motivo: ${esc(r.reason)}</small>` : ''}</li>`).join('');
  }

  function mount(el, ctx) {
    X = ctx;
    el.innerHTML = `
      <details class="adm-sec adt-sec" data-sec="chaos"><summary><h3>Chaos Machine (asas e capas)</h3></summary><div class="adt-body"></div></details>
      <details class="adm-sec adt-sec" data-sec="drops"><summary><h3>Drops de materiais e eventos</h3></summary><div class="adt-body"></div></details>
      <details class="adm-sec adt-sec" data-sec="rules"><summary><h3>Comandos, reset e histórico ADM</h3></summary><div class="adt-body"></div></details>`;
    const fn = { chaos, drops, rules };
    $$('.adt-sec', el).forEach((d) => { d.addEventListener('toggle', () => { if (d.open && !d.dataset.loaded) { d.dataset.loaded = 1; fn[d.dataset.sec]($('.adt-body', d)); } }); });
  }

  window.MUAdminTools = { mount };
})();
