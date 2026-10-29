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
  const TARGET_PT = { all: 'Todos os materiais', jewel: 'Jewel of Chaos', wing: 'Materiais de asas', cape: 'Materiais de capas', boss: 'Recompensas de bosses', devil: "Devil's Eye/Key", castle: 'Armor of Guardsman' };
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
        ${r.mode === 'pair' ? `<div class="adm-row"><label>Chance convites +1 a +4 (%) ${num('rate.base', r.rate.base, 'min="0" max="100"')}</label>
          <label>Chance convites +5 a +7 (%) ${num('rate.high', r.rate.high, 'min="0" max="100"')}</label></div>
          <p class="muted small">Devil's Eye +N e Devil's Key +N do mesmo nível entram sempre; abaixo, os materiais extras (Jewel of Chaos).</p>`
    : `<div class="adm-row"><label>Chance base % ${num('rate.base', r.rate.base, 'min="0" max="100"')}</label>
          <label>+% por +1 ${num('rate.perPlus', r.rate.perPlus, 'min="0" max="50"')}</label>
          <label>+% por raridade ${num('rate.perRarity', r.rate.perRarity, 'min="0" max="50"')}</label>
          <label>Máximo % ${num('rate.max', r.rate.max, 'min="1" max="100"')}</label></div>
        <div class="adm-row"><label>Item principal: + mínimo ${num('main.minPlus', r.main.minPlus, 'min="0" max="15"')}</label>
          <label>raridade mínima ${sel('main.minRarity', RAR.map((k) => [k, RAR_PT[k]]), r.main.minRarity)}</label></div>`}
        <p class="adt-sub">${r.mode === 'pair' ? "Devil's Eye aceitos" : 'Aceita como item principal'}</p>
        <div class="adt-checks">${al.main.map((b) => `<label class="adt-check"><input type="checkbox" data-list="main.bases" value="${b}" ${r.main.bases.includes(b) ? 'checked' : ''}> ${esc(N[b])}</label>`).join('')}</div>
        <p class="adt-sub">${r.mode === 'pair' ? 'Convites que podem ser criados (desmarcado = nível desativado)' : `Resultados possíveis${r.mode === 'random' ? ` · sorteio: ${sel('pick', [['class', 'só os da classe de quem combina'], ['any', 'qualquer um (clássico)']], r.pick)}` : ' (evolução da asa/capa usada)'}`}</p>
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

  // ---------------- Invasão Dourada ----------------
  const MODE_PT = { contribution: 'Compartilhada por contribuição (1 caixa, sorteada pelo dano)', individual: 'Individual (cada participante ganha a sua)', lasthit: 'Último golpe' };
  const TIER_NAME = { bronze: 'Bronze', prata: 'Prata', ouro: 'Ouro' };
  const KIND_NAME = { zen: 'Zen', pot: 'Poções', item: 'Equipamento', material: 'Material', chaosweapon: 'Arma do Caos', wing1: 'Asa nível 1', wing2: 'Asa nível 2', cape: 'Capa do Dark Lord' };
  const MSG_NAME = { start: 'Início', spawn: 'Aparição ({monstro}, {mapa})', kill: 'Derrota ({jogador}, {monstro}, {caixa})', end: 'Fim ({minutos})' };
  async function invasion(box) {
    box.innerHTML = '<p class="muted">Carregando…</p>';
    let V;
    try { V = await X.api('GET', '/api/admin/invasion'); } catch (e) { box.innerHTML = `<p class="bad">${esc(e.message)}</p>`; return; }
    draw();
    function draw() {
      const C = V.config;
      const entry = (e) => `<div class="adm-row adt-entry">${sel('kind', V.kinds.map((k) => [k, KIND_NAME[k]]), e.kind)}
        <label>peso ${num('w', e.w, 'min="0.001" step="0.1"')}</label>
        <span class="adt-p" data-k="zen pot material">mín ${num('min', e.min ?? 1, 'min="1"')} máx ${num('max', e.max ?? 1, 'min="1"')}</span>
        <span class="adt-p" data-k="pot">${sel('pot', [['hp', 'vida'], ['mp', 'mana']], e.pot || 'hp')}</span>
        <span class="adt-p" data-k="material">${sel('item', V.materials.map((m) => [m.id, m.name]), e.item || V.materials[0].id)}</span>
        <span class="adt-p" data-k="item chaosweapon">${sel('rarity', RAR.map((k) => [k, RAR_PT[k]]), e.rarity || 'common')} +${num('plusMin', e.plusMin ?? 0, 'min="0" max="15"')} a +${num('plusMax', e.plusMax ?? 0, 'min="0" max="15"')}</span>
        <button class="btn small" type="button" data-del-entry>×</button></div>`;
      box.innerHTML = `<p class="adt-msg" role="status"></p>
        <fieldset class="adt-card"><legend>Agora</legend>
          <p>${V.statusText.map(esc).join('<br>')}</p>
          <div class="adm-row"><button class="btn small btn-gold" type="button" data-op="start">Iniciar agora</button><button class="btn small" type="button" data-op="stop">Encerrar</button>
            <button class="btn small" type="button" data-op="remove">Remover monstros dourados</button>
            <label>Próxima em ${num('next', 40, 'min="1" max="1440" id="adt-inv-next"')} min</label><button class="btn small" type="button" data-op="next">Definir</button></div>
          <div class="adm-row">${sel('spawnMap', V.maps.map((m) => [m.id, m.name]), V.maps[0].id, 'id="adt-inv-map"')}<label>qtd ${num('n', 3, 'min="1" max="30" id="adt-inv-n"')}</label>
            <label>sala ${sel('room', [['0', 'todas'], ['1', '1'], ['2', '2'], ['3', '3'], ['4', '4']], '0', 'id="adt-inv-room"')}</label><button class="btn small" type="button" data-op="spawn">Criar monstros dourados</button></div>
        </fieldset>
        <fieldset class="adt-card" id="adt-inv-cfg"><legend>Configuração</legend>
          <label class="adt-check"><input type="checkbox" data-f="enabled" ${C.enabled ? 'checked' : ''}> Temporizador automático ligado</label>
          <div class="adm-row"><label>A cada (min) ${num('intervalMin', C.intervalMin, 'min="5"')}</label><label>Dura (min) ${num('durationMin', C.durationMin, 'min="1"')}</label>
            <label>Participação mínima (% do dano) ${num('minShare', C.minShare, 'min="0" max="100"')}</label></div>
          <div class="adm-row"><label>Recompensa ${sel('rewardMode', V.modes.map((k) => [k, MODE_PT[k]]), C.rewardMode)}</label></div>
          <div class="adm-row"><label>Nível do monstro para Prata ${num('thresholds.prata', C.thresholds.prata, 'min="1"')}</label><label>para Ouro ${num('thresholds.ouro', C.thresholds.ouro, 'min="1"')}</label>
            <small class="muted">elites sobem uma categoria</small></div>
          <div class="adt-table-wrap"><table class="adt-table"><thead><tr><th>Categoria</th><th>Vida ×</th><th>Dano ×</th><th>Defesa ×</th><th>EXP ×</th><th>Zen ×</th><th>Tamanho</th><th>Caixa</th><th>Anunciar</th></tr></thead><tbody>
            ${V.tiers.map((t) => `<tr data-tier="${t}"><td>${TIER_NAME[t]}</td>${['hp', 'dmg', 'def', 'exp', 'zen', 'scale'].map((k) => `<td>${num(k, C.tiers[t][k], 'step="0.05" min="1"')}</td>`).join('')}
              <td>${sel('box', V.boxIds.map((b) => [b, V.boxNames[b]]), C.tiers[t].box)}</td><td><input type="checkbox" data-ann ${C.announceKills.includes(t) ? 'checked' : ''}></td></tr>`).join('')}
          </tbody></table></div>
          <div class="adm-row"><label>Padrão por mapa: quantidade ${num('mapDefaults.count', C.mapDefaults.count, 'min="0"')}</label><label>vivos ao mesmo tempo ${num('mapDefaults.maxAlive', C.mapDefaults.maxAlive, 'min="1"')}</label>
            <label>segundos entre nascimentos ${num('mapDefaults.intervalSec', C.mapDefaults.intervalSec, 'min="1"')}</label></div>
          <p class="adt-sub">Mapas (quantidade por sala, em cada invasão)</p>
          <div class="adt-table-wrap"><table class="adt-table"><thead><tr><th>Mapa</th><th>Ativo</th><th>Qtd</th><th>Vivos</th><th>Seg.</th><th>Nível rec.</th><th>Monstros (categoria)</th></tr></thead><tbody>
            ${V.maps.map((m) => `<tr data-map="${m.id}"><td>${esc(m.name)}</td><td><input type="checkbox" data-f="enabled" ${m.cfg.enabled ? 'checked' : ''}></td>
              <td>${num('count', m.cfg.count, 'min="0" class="w-xs"')}</td><td>${num('maxAlive', m.cfg.maxAlive, 'min="1" class="w-xs"')}</td><td>${num('intervalSec', m.cfg.intervalSec, 'min="1" class="w-xs"')}</td><td>${num('recLevel', m.cfg.recLevel, 'min="1" class="w-xs"')}</td>
              <td>${m.monsters.map((mo) => `<label class="adt-mon">${esc(mo.name)} ${sel('mon', [['auto', `auto (${TIER_NAME[mo.auto]})`], ['bronze', 'Bronze'], ['prata', 'Prata'], ['ouro', 'Ouro'], ['off', 'desligado']], m.cfg.monsters[mo.type] || 'auto', `data-type="${mo.type}"`)}</label>`).join('')}</td></tr>`).join('')}
          </tbody></table></div>
          <p class="adt-sub">Mensagens (português e inglês)</p>
          ${Object.keys(C.messages).map((k) => `<div class="adt-msgrow" data-msg="${k}"><b>${esc(MSG_NAME[k] || k)}</b><input data-l="pt" value="${esc(C.messages[k].pt)}" maxlength="240"><input data-l="en" value="${esc(C.messages[k].en)}" maxlength="240"></div>`).join('')}
          <button class="btn btn-gold" type="button" id="adt-inv-save">Salvar Invasão Dourada</button>
        </fieldset>
        <fieldset class="adt-card" id="adt-boxes"><legend>Box Kundun (prêmios e pesos)</legend>
          <p class="muted small">A chance de cada prêmio é o peso dele ÷ soma dos pesos da caixa. Lendários e ancestrais precisam ser mais raros que comuns, incomuns e raros. Equipamentos saem perto do nível de quem abre.</p>
          ${V.boxIds.map((b) => `<div class="adt-box" data-box="${b}"><h4>${esc(V.boxNames[b])}</h4><div class="adt-entries">${V.boxes[b].map(entry).join('')}</div><button class="btn small" type="button" data-add-entry>+ prêmio</button></div>`).join('')}
          <button class="btn btn-gold" type="button" id="adt-box-save">Salvar caixas</button>
          <div class="adm-row">${sel('simBox', V.boxIds.map((b) => [b, V.boxNames[b]]), 'kundun_ouro', 'id="adt-sim-box"')}<label>aberturas ${num('n', 5000, 'id="adt-sim-n" min="1" max="100000"')}</label>
            <label>nível ${num('lv', 100, 'id="adt-sim-lv" min="1"')}</label><button class="btn small" type="button" id="adt-box-sim">Simular</button></div>
          <div id="adt-box-out"></div>
        </fieldset>
        <h4>Últimas invasões</h4>
        <ul class="adm-list adt-log">${V.history.invasions.map((h) => `<li>#${h.id} · ${dt(h.started_at)} · ${esc(h.trigger)} · ${h.ended_at ? `terminou ${dt(h.ended_at)} (${esc(h.end_reason || '')})` : 'em andamento'} · ${h.spawned} criados · ${h.killed} derrotados</li>`).join('') || '<li class="muted">Nenhuma ainda.</li>'}</ul>
        <h4>Monstros dourados derrotados</h4>
        <ul class="adm-list adt-log">${V.history.kills.map((k) => `<li>${dt(k.created_at)} · ${esc(k.monster_name)} (${TIER_NAME[k.tier] || k.tier}) · ${esc(k.map)} sala ${k.room} · ${k.rewards.map((r) => `${esc(r.name)} → ${esc(V.boxNames[r.box] || r.box)}${r.share ? ` (${r.share}%)` : ''}`).join(', ')}</li>`).join('') || '<li class="muted">Nenhum ainda.</li>'}</ul>
        <h4>Caixas abertas</h4>
        <ul class="adm-list adt-log">${V.opens.map((o) => `<li>${dt(o.created_at)} · <b>${esc(o.char_name)}</b> · ${esc(V.boxNames[o.box] || o.box)} → ${esc(o.reward.text || '')}</li>`).join('') || '<li class="muted">Nenhuma ainda.</li>'}</ul>`;
      const showParams = (row) => { const k = $('[data-f=kind]', row).value; $$('.adt-p', row).forEach((sp) => { sp.hidden = !sp.dataset.k.split(' ').includes(k); }); };
      const bindEntries = () => {
        $$('.adt-entry', box).forEach((row) => { showParams(row); $('[data-f=kind]', row).onchange = () => showParams(row); $('[data-del-entry]', row).onclick = () => row.remove(); });
      };
      bindEntries();
      $$('[data-add-entry]', box).forEach((b) => { b.onclick = () => { b.previousElementSibling.insertAdjacentHTML('beforeend', entry({ kind: 'zen', w: 1, min: 1000, max: 5000 })); bindEntries(); }; });
      const post = async (body) => { try { const r = await X.api('POST', '/api/admin/invasion', body); if (r.config) { V = r; draw(); } msg(box, r.message || 'Ok.'); return r; } catch (e) { msg(box, e.message, true); box.scrollIntoView({ block: 'start' }); return null; } };
      $$('[data-op]', box).forEach((b) => {
        b.onclick = () => {
          const op = b.dataset.op;
          if (op === 'next') return post({ op, minutes: Number($('#adt-inv-next').value) });
          if (op === 'spawn') return post({ op, map: $('#adt-inv-map').value, n: Number($('#adt-inv-n').value), room: Number($('#adt-inv-room').value) });
          return post({ op });
        };
      });
      $('#adt-inv-save').onclick = () => {
        const f = $('#adt-inv-cfg');
        const c = { thresholds: {}, tiers: {}, mapDefaults: {}, maps: {}, messages: {}, announceKills: [] };
        for (const el of $$(':scope > [data-f], :scope > .adm-row [data-f], :scope > label [data-f]', f)) {
          const p2 = el.dataset.f.split('.'); const v = el.type === 'checkbox' ? el.checked : el.type === 'number' ? Number(el.value) : el.value;
          if (p2.length === 2) c[p2[0]][p2[1]] = v; else c[p2[0]] = v;
        }
        for (const tr of $$('[data-tier]', f)) {
          const t = tr.dataset.tier; c.tiers[t] = {};
          for (const el of $$('[data-f]', tr)) c.tiers[t][el.dataset.f] = el.dataset.f === 'box' ? el.value : Number(el.value);
          if ($('[data-ann]', tr).checked) c.announceKills.push(t);
        }
        for (const tr of $$('[data-map]', f)) {
          const m = { monsters: {} };
          for (const el of $$('[data-f]', tr)) { if (el.dataset.f === 'mon') m.monsters[el.dataset.type] = el.value; else m[el.dataset.f] = el.type === 'checkbox' ? el.checked : Number(el.value); }
          c.maps[tr.dataset.map] = m;
        }
        for (const row of $$('[data-msg]', f)) c.messages[row.dataset.msg] = { pt: $('[data-l=pt]', row).value, en: $('[data-l=en]', row).value };
        post({ op: 'config', config: c });
      };
      $('#adt-box-save').onclick = () => {
        const b2 = {};
        for (const bx of $$('[data-box]', box)) {
          b2[bx.dataset.box] = $$('.adt-entry', bx).map((row) => {
            const o = {}; for (const el of $$('[data-f]', row)) { if (el.closest('.adt-p') && el.closest('.adt-p').hidden) continue; o[el.dataset.f] = el.type === 'number' ? Number(el.value) : el.value; }
            return o;
          });
        }
        post({ op: 'boxes', boxes: b2 });
      };
      $('#adt-box-sim').onclick = async () => {
        try {
          const r = await X.api('POST', '/api/admin/invasion', { op: 'simulate', box: $('#adt-sim-box').value, n: Number($('#adt-sim-n').value), level: Number($('#adt-sim-lv').value) });
          const s2 = r.sim;
          $('#adt-box-out').innerHTML = `<p>${esc(s2.box)} · ${fmt.format(s2.opens)} aberturas (nível ${s2.level}) · Zen médio ${fmt.format(s2.zenAvg)}</p><ul class="adm-list">${s2.results.map((x) => `<li>${esc(x.name)}: ${x.pct}%</li>`).join('')}</ul>`;
        } catch (e) { msg(box, e.message, true); }
      };
    }
  }

  // ---------------- Equipamentos por classe e evolução ----------------
  async function equip(box) {
    box.innerHTML = '<p class="muted">Carregando…</p>';
    let V;
    try { V = await X.api('GET', '/api/admin/equip'); } catch (e) { box.innerHTML = `<p class="bad">${esc(e.message)}</p>`; return; }
    let filter = '';
    draw();
    function draw() {
      const C = V.classes2;
      const short = (n) => n.split(' ').map((w) => w[0]).join('');
      const rows = V.items.filter((it) => !filter || it.name.toLowerCase().includes(filter) || it.id.includes(filter) || it.slot === filter);
      const row = (it) => { const r = it.rule; return `<tr data-base="${it.id}" class="${it.custom ? 'custom' : ''}"><td>${esc(it.name)}<br><small class="muted">${esc(it.id)}</small></td>
        <td class="adt-cls">${V.classes.map((c) => `<label title="${esc(c.name)}"><input type="checkbox" value="${c.id}" ${r.classes.includes(c.id) ? 'checked' : ''}>${esc(short(c.name))}</label>`).join('')}</td>
        <td>${sel('minEvo', [[0, 'base'], [1, '1ª'], [2, '2ª']], r.minEvo)}</td><td>${num('level', r.level, 'class="w-xs" min="1"')}</td>
        ${['str', 'agi', 'ene', 'vit', 'cmd'].map((k) => `<td>${num(k, r[k], 'class="w-xs" min="0"')}</td>`).join('')}
        <td>${sel('slot', V.slots.map((sl) => [sl, V.slotNames[sl]]), r.slot)}</td><td><input type="checkbox" data-f="enabled" ${r.enabled ? 'checked' : ''}></td>
        <td class="nowrap"><button class="btn small btn-gold" type="button" data-save>Salvar</button>${it.custom ? ' <button class="btn small" type="button" data-reset>Padrão</button>' : ''}</td></tr>`; };
      box.innerHTML = `<p class="adt-msg" role="status"></p>
        <fieldset class="adt-card"><legend>Evolução de classe</legend>
          <p class="adt-sub">Criar personagem: nível que um herói da conta precisa ter (0 = livre)</p>
          <div class="adm-row" id="adt-cre">${V.classes.map((c) => `<label>${esc(c.name)} ${num(c.id, C.creation[c.id] || 0, 'min="0"')}</label>`).join('')}</div>
          ${Object.entries(C.quests).map(([id, q]) => `<div class="adt-q" data-q="${id}"><h4>${esc(q.name)} <small class="muted">(${q.npc === 'sevina' ? 'Priestess Sevina' : 'Marlon'})</small></h4>
            <label class="adt-check"><input type="checkbox" data-f="enabled" ${q.enabled ? 'checked' : ''}> ativa</label>
            <div class="adm-row"><label>Nível ${num('level', q.level, 'min="1"')}</label><label>Zen ${num('zen', q.zen, 'min="0" step="1000"')}</label></div>
            <div class="adt-steps">${q.steps.map((st) => `<div class="adm-row adt-step">${sel('item', [['@class', 'Item da classe (Broken Sword, Soul of Wizard…)'], ...V.questItems.map((x) => [x.id, x.name])], st.item)} × ${num('qty', st.qty, 'min="1" max="10"')} <button class="btn small" type="button" data-del-step>×</button></div>`).join('')}</div>
            <button class="btn small" type="button" data-add-step>+ etapa</button></div>`).join('')}
          <button class="btn btn-gold" type="button" id="adt-cls-save">Salvar evolução</button>
          <h4>Últimas evoluções</h4>
          <ul class="adm-list adt-log">${V.evolutionsLog.map((e) => `<li>${dt(e.created_at)} · <b>${esc(e.char_name)}</b> → ${esc(e.class_name)} (${esc(e.quest || '')}${e.zen ? ', ' + fmt.format(e.zen) + ' Zen' : ''})</li>`).join('') || '<li class="muted">Nenhuma ainda.</li>'}</ul>
        </fieldset>
        <fieldset class="adt-card"><legend>Regras dos equipamentos (${V.items.length} itens)</legend>
          <p class="muted small">Classes que podem usar, evolução mínima, nível, atributos (Força, Agilidade, Energia, Vitalidade, Comando), lugar no corpo e se o item está ativo. Linhas com fundo diferente têm regra própria; "Padrão" volta ao catálogo.</p>
          <div class="adm-row"><input id="adt-eq-filter" placeholder="Filtrar (nome, id ou lugar: helm, weapon, ring…)" value="${esc(filter)}"><button class="btn small" type="button" id="adt-eq-go">Filtrar</button></div>
          <div class="adt-table-wrap adt-eq-wrap"><table class="adt-table adt-rules"><thead><tr><th>Item</th><th>Classes</th><th>Evol.</th><th>Nível</th><th>For</th><th>Agi</th><th>Ene</th><th>Vit</th><th>Cmd</th><th>Lugar</th><th>Ativo</th><th></th></tr></thead>
            <tbody>${rows.map(row).join('')}</tbody></table></div>
        </fieldset>
        <fieldset class="adt-card"><legend>Testar item com uma classe</legend>
          <div class="adm-row" id="adt-eq-test">${sel('base', V.items.map((it) => [it.id, it.name]), V.items[0].id)}${sel('cls', V.classes.map((c) => [c.id, c.name]), 'dark_knight')}
            ${sel('evo', [[0, 'base'], [1, '1ª evolução'], [2, '2ª evolução']], 0)}<label>nível ${num('level', 50, 'min="1"')}</label>
            ${['str', 'agi', 'ene', 'vit', 'cmd'].map((k) => `<label>${k} ${num(k, 100, 'min="0" class="w-xs"')}</label>`).join('')}<button class="btn small" type="button" id="adt-eq-testgo">Testar</button></div>
          <p id="adt-eq-out"></p>
        </fieldset>
        <fieldset class="adt-card"><legend>Importar regras em lote (JSON)</legend>
          <textarea id="adt-eq-json" rows="5" style="width:100%" placeholder='[{"base":"abyss_sword","classes":["dark_knight"],"minEvo":1,"level":120,"str":300}]'></textarea>
          <button class="btn small btn-gold" type="button" id="adt-eq-import">Importar</button>
        </fieldset>
        <h4>Tentativas recusadas pelo servidor</h4>
        <ul class="adm-list adt-log">${V.denials.map((d) => `<li>${dt(d.created_at)} · <b>${esc(d.char_name || '?')}</b> · ${esc(d.item || '')} · ${esc(d.reason)}</li>`).join('') || '<li class="muted">Nenhuma.</li>'}</ul>`;
      const post = async (body) => { try { const r = await X.api('POST', '/api/admin/equip', body); if (r.items) { V = r; draw(); } msg(box, r.message || 'Ok.'); return r; } catch (e) { msg(box, e.message, true); box.scrollIntoView({ block: 'start' }); return null; } };
      $('#adt-eq-go').onclick = () => { filter = $('#adt-eq-filter').value.trim().toLowerCase(); draw(); };
      $('#adt-eq-filter').onkeydown = (e) => { if (e.key === 'Enter') $('#adt-eq-go').click(); };
      $$('[data-base]', box).forEach((tr) => {
        $('[data-save]', tr).onclick = () => {
          const r = { classes: $$('.adt-cls input', tr).filter((i) => i.checked).map((i) => i.value) };
          for (const el of $$('[data-f]', tr)) r[el.dataset.f] = el.type === 'checkbox' ? el.checked : el.dataset.f === 'slot' ? el.value : Number(el.value);
          post({ op: 'save', base: tr.dataset.base, rule: r });
        };
        const rs = $('[data-reset]', tr); if (rs) rs.onclick = () => post({ op: 'reset', base: tr.dataset.base });
      });
      $('#adt-eq-testgo').onclick = async () => {
        const f = {}; for (const el of $$('[data-f]', $('#adt-eq-test'))) f[el.dataset.f] = el.value;
        try {
          const r = await X.api('POST', '/api/admin/equip', { op: 'test', base: f.base, cls: f.cls, evo: Number(f.evo), level: Number(f.level), stats: { str: +f.str, agi: +f.agi, ene: +f.ene, vit: +f.vit, cmd: +f.cmd } });
          $('#adt-eq-out').innerHTML = `<span class="${r.test.ok ? 'req-ok' : 'req-no'}">${esc(r.test.reason)}</span>`;
        } catch (e) { msg(box, e.message, true); }
      };
      $('#adt-eq-import').onclick = () => { let list; try { list = JSON.parse($('#adt-eq-json').value); } catch (_) { return msg(box, 'JSON inválido.', true); } post({ op: 'import', rules: list }); };
      const bindSteps = () => $$('[data-del-step]', box).forEach((b) => { b.onclick = () => b.closest('.adt-step').remove(); });
      bindSteps();
      $$('[data-add-step]', box).forEach((b) => { b.onclick = () => { b.previousElementSibling.insertAdjacentHTML('beforeend', `<div class="adm-row adt-step">${sel('item', [['@class', 'Item da classe'], ...V.questItems.map((x) => [x.id, x.name])], V.questItems[0].id)} × ${num('qty', 1, 'min="1" max="10"')} <button class="btn small" type="button" data-del-step>×</button></div>`); bindSteps(); }; });
      $('#adt-cls-save').onclick = () => {
        const c = { creation: {}, quests: {} };
        for (const el of $$('[data-f]', $('#adt-cre'))) c.creation[el.dataset.f] = Number(el.value);
        for (const q of $$('[data-q]', box)) {
          const o = { steps: [] };
          for (const el of $$(':scope > [data-f], :scope > label [data-f], :scope > .adm-row [data-f]', q)) o[el.dataset.f] = el.type === 'checkbox' ? el.checked : Number(el.value);
          for (const st of $$('.adt-step', q)) o.steps.push({ item: $('[data-f=item]', st).value, qty: Number($('[data-f=qty]', st).value) });
          c.quests[q.dataset.q] = o;
        }
        post({ op: 'classes', config: c });
      };
    }
  }

  // ---------------- Baú Pessoal ----------------
  async function vault(box, name = '') {
    box.innerHTML = '<p class="muted">Carregando…</p>';
    let V;
    try { V = await X.api('GET', '/api/admin/vault' + (name ? '?name=' + encodeURIComponent(name) : '')); } catch (e) { box.innerHTML = `<p class="bad">${esc(e.message)}</p><button class="btn small" type="button" id="adt-v-back">Voltar</button>`; $('#adt-v-back').onclick = () => vault(box); return; }
    const c = V.config, st = V.stats;
    const act = { put: 'guardou', take: 'retirou', move: 'moveu', sort: 'organizou', zen_in: 'depositou Zen', zen_out: 'retirou Zen', denied: 'RECUSADO', admin: 'ADM' };
    const logList = (L) => L.map((l) => `<li>${dt(l.created_at)} · <b>${esc(l.char_name || '?')}</b> ${act[l.action] || esc(l.action)}${l.item ? ' ' + esc(l.item) + (l.qty > 1 ? ' ×' + l.qty : '') : ''}${l.zen ? ' ' + fmt.format(l.zen) : ''}${l.vault_no ? ' · baú ' + l.vault_no : ''}${l.detail ? ' · <span class="muted">' + esc(l.detail) + '</span>' : ''}</li>`).join('') || '<li class="muted">Nada ainda.</li>';
    box.innerHTML = `<p class="adt-msg" role="status"></p>
      <p class="muted small">${fmt.format(st.items)} itens guardados · ${fmt.format(Number(st.zen))} Zen em ${st.vaults} baús · ${st.denied} tentativas recusadas nas últimas 24 h</p>
      <fieldset class="adt-card" id="adt-vcfg"><legend>Configuração</legend>
        <label class="adt-check"><input type="checkbox" data-f="enabled" ${c.enabled ? 'checked' : ''}> Baú aberto</label>
        <label class="adt-check"><input type="checkbox" data-f="shared" ${c.shared ? 'checked' : ''}> Compartilhado entre os personagens da conta (desligado = um baú por personagem)</label>
        <label class="adt-check"><input type="checkbox" data-f="allowQuestItems" ${c.allowQuestItems ? 'checked' : ''}> Permitir guardar itens de missão</label>
        <div class="adm-row"><label>Colunas ${num('cols', c.cols, 'min="4" max="12"')}</label><label>Linhas ${num('rows', c.rows, 'min="1" max="40"')}</label>
          <label>Zen máx. no baú ${num('maxVaultZen', c.maxVaultZen, 'min="1" style="width:150px"')}</label><label>Zen máx. do personagem ${num('maxCharZen', c.maxCharZen, 'min="1" style="width:150px"')}</label></div>
        <p class="adt-sub">NPC nas cidades</p>
        <div class="adm-row" id="adt-vmaps">${V.maps.map((m) => `<label class="adt-check"><input type="checkbox" value="${m.id}" ${c.maps[m.id] ? 'checked' : ''}> ${esc(m.name)}</label>`).join('')}</div>
        <p class="adt-sub">Baús</p>
        ${[1, 2, 3].map((k) => { const v = c.vaults[k]; return `<div class="adm-row" data-vno="${k}"><label class="adt-check"><input type="checkbox" data-f="enabled" ${v.enabled ? 'checked' : ''} ${k === 1 ? 'disabled' : ''}> ativo</label>
          <label>Nome <input data-f="name" value="${esc(v.name)}" maxlength="40"></label><label>Nível ${num('minLevel', v.minLevel, 'min="0"')}</label>
          <label class="adt-check"><input type="checkbox" data-f="vip" ${v.vip ? 'checked' : ''}> só VIP</label></div>`; }).join('')}
        <button class="btn btn-gold" type="button" id="adt-vsave">Salvar Baú Pessoal</button>
      </fieldset>
      <fieldset class="adt-card"><legend>Ver o baú de um personagem</legend>
        <div class="adm-row"><input id="adt-vname" placeholder="Nome do personagem" value="${esc(name)}"><button class="btn small" type="button" id="adt-vgo">Ver</button></div>
        ${V.char ? `<p><b>${esc(V.char.name)}</b> · ${V.char.vaults.map((v) => `${esc(v.owner)}: ${fmt.format(Number(v.zen))} Zen${v.capacity ? ', capacidade ' + v.capacity : ''}`).join(' · ') || 'sem baú ainda'}</p>
          <div class="adm-row"><select id="adt-vowner">${V.char.owners.map((o) => `<option>${esc(o)}</option>`).join('')}</select><label>Capacidade ${num('cap', '', 'id="adt-vcap" min="8" max="480" placeholder="padrão"')}</label><button class="btn small" type="button" id="adt-vcapgo">Definir</button></div>
          <div class="adt-table-wrap"><table class="adt-table"><thead><tr><th>Baú</th><th>Lugar</th><th>Item</th><th>Qtd.</th><th>Dono</th></tr></thead><tbody>
          ${V.char.items.map((i) => `<tr><td>${i.no}</td><td>${i.pos + 1}</td><td>${esc(i.name)}${i.plus ? ' +' + i.plus : ''} <small class="muted">${esc(i.rarity)} #${i.id}</small></td><td>${i.qty}</td><td>${esc(i.owner)}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">Vazio.</td></tr>'}</tbody></table></div>
          <h4>Histórico deste personagem</h4><ul class="adm-list adt-log">${logList(V.char.log)}</ul>` : ''}
      </fieldset>
      <h4>Últimas operações</h4><ul class="adm-list adt-log">${logList(V.log)}</ul>`;
    const post = async (body) => { try { const r = await X.api('POST', '/api/admin/vault', { ...body, name }); msg(box, r.message); setTimeout(() => vault(box, name), 900); } catch (e) { msg(box, e.message, true); } };
    $('#adt-vsave').onclick = () => {
      const f = $('#adt-vcfg'); const o = { maps: {}, vaults: {} };
      for (const el of $$(':scope > label [data-f], :scope > .adm-row:not([data-vno]) [data-f]', f)) o[el.dataset.f] = el.type === 'checkbox' ? el.checked : Number(el.value);
      for (const el of $$('#adt-vmaps input', f)) o.maps[el.value] = el.checked;
      for (const row of $$('[data-vno]', f)) { const v = {}; for (const el of $$('[data-f]', row)) v[el.dataset.f] = el.type === 'checkbox' ? el.checked : el.dataset.f === 'name' ? el.value : Number(el.value); o.vaults[row.dataset.vno] = v; }
      if (o.shared !== c.shared && !confirm(o.shared ? 'Juntar os baús dos personagens de cada conta em um só? Os itens e o Zen vão para o baú da conta quando o jogador abrir o baú.' : 'Separar os baús por personagem? Cada item volta para o baú do personagem que o guardou.')) return;
      post({ op: 'config', config: o });
    };
    $('#adt-vgo').onclick = () => vault(box, $('#adt-vname').value.trim());
    $('#adt-vname').onkeydown = (e) => { if (e.key === 'Enter') $('#adt-vgo').click(); };
    const cg = $('#adt-vcapgo'); if (cg) cg.onclick = () => post({ op: 'capacity', owner: $('#adt-vowner').value, capacity: $('#adt-vcap').value === '' ? null : Number($('#adt-vcap').value) });
  }

  function mount(el, ctx) {
    X = ctx;
    el.innerHTML = `
      <details class="adm-sec adt-sec" data-sec="invasion"><summary><h3>♛ Invasão Dourada e Box Kundun</h3></summary><div class="adt-body"></div></details>
      <details class="adm-sec adt-sec" data-sec="equip"><summary><h3>Equipamentos por classe e evolução</h3></summary><div class="adt-body"></div></details>
      <details class="adm-sec adt-sec" data-sec="vault"><summary><h3>Baú Pessoal</h3></summary><div class="adt-body"></div></details>
      <details class="adm-sec adt-sec" data-sec="chaos"><summary><h3>Chaos Machine (asas e capas)</h3></summary><div class="adt-body"></div></details>
      <details class="adm-sec adt-sec" data-sec="drops"><summary><h3>Drops de materiais e eventos</h3></summary><div class="adt-body"></div></details>
      <details class="adm-sec adt-sec" data-sec="rules"><summary><h3>Comandos, reset e histórico ADM</h3></summary><div class="adt-body"></div></details>`;
    const fn = { invasion, equip, vault, chaos, drops, rules };
    $$('.adt-sec', el).forEach((d) => { d.addEventListener('toggle', () => { if (d.open && !d.dataset.loaded) { d.dataset.loaded = 1; fn[d.dataset.sec]($('.adt-body', d)); } }); });
  }

  window.MUAdminTools = { mount };
})();
