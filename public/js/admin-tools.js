// MuonlineClaude — ferramentas do Super ADM: Chaos Machine, tabela de drops, regras de reset e histórico.
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
        <p class="adt-sub">${r.mode === 'pair' ? 'Convites que podem ser criados (desmarcado = nível desativado)' : r.mode === 'random' ? 'Resultados possíveis e peso de cada um no sorteio (a classe de quem combina não muda nada)' : 'Resultados possíveis (evolução da capa usada)'}</p>
        <div class="adt-checks">${al.results.map((b) => { const wt = r.weights ? (r.weights[b] ?? 1) : null; return `<label class="adt-check"><input type="checkbox" data-list="results" value="${b}" ${r.results.includes(b) ? 'checked' : ''}> ${esc(N[b])}${wt !== null ? ` · peso <input type="number" class="w-xs" data-w="${b}" min="0" max="1000" value="${wt}">` : ''}</label>`; }).join('')}</div>
        ${r.rarityRoll ? ['rarityRoll', 'plusRoll'].map((k) => { const rr = r[k]; const keys = k === 'rarityRoll' ? (id === 'wing1' || id === 'wing2' ? RAR.filter((x) => x !== 'ancestral') : RAR) : ['0', '1', '2', '3', '4', '5']; return `<div class="adm-row"><label class="adt-check"><input type="checkbox" data-roll-en="${k}" ${rr.enabled ? 'checked' : ''} ${id === 'wing1' && k === 'rarityRoll' ? 'disabled checked' : ''}> ${k === 'rarityRoll' ? 'Sortear raridade (pesos)' : 'Sortear + do item (pesos)'}</label>
          ${keys.map((x) => `<label>${k === 'rarityRoll' ? esc(RAR_PT[x]) : '+' + x} <input type="number" class="w-xs" data-roll="${k}" data-k="${x}" min="0" max="1000" value="${rr.weights[x] ?? 0}"></label>`).join('')}</div>`; }).join('') : ''}
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
        ${V.items.map((it) => `<tr data-item="${it.id}"><td>${esc(it.name)}${it.slot === 'wings' ? '<small> · todas as classes</small>' : ''}</td><td>${num('req', it.req, `min="1" ${it.slot === 'wings' ? 'disabled title="Requisito fixo: nível 120"' : ''}`)}</td><td>${num('def', it.def, 'min="0"')}</td><td>${num('wdmg', it.wdmg, 'min="0"')}</td><td>${num('absorb', it.absorb, 'min="0" max="60"')}</td>
          <td class="adt-cls">${Object.entries(CL).map(([k, c]) => `<label title="${esc(c.name)}"><input type="checkbox" value="${k}" ${it.classes.includes(k) ? 'checked' : ''} ${it.slot === 'wings' ? 'disabled' : ''} ${it.cat === 'cape' && k !== 'dark_lord' ? 'disabled' : ''}>${esc(c.name.split(' ').map((w) => w[0]).join(''))}</label>`).join('')}</td></tr>`).join('')}
        </tbody></table></div>
      </fieldset>
      <fieldset class="adt-card"><legend>Atributos das asas por raridade</legend><p class="muted small">Multiplicadores percentuais aplicados à defesa, dano extra e absorção. O requisito permanece fixo no nível 120.</p>
        <div class="adt-table-wrap"><table class="adt-table"><thead><tr><th>Raridade</th><th>Defesa %</th><th>Dano %</th><th>Absorção %</th></tr></thead><tbody>
        ${['common','uncommon','rare','epic','legendary'].map((rar) => `<tr data-rarstat="${rar}"><td>${esc(RAR_PT[rar])}</td><td>${num('def', C.rarityAttributes[rar].def, 'min="50" max="300"')}</td><td>${num('wdmg', C.rarityAttributes[rar].wdmg, 'min="50" max="300"')}</td><td>${num('absorb', C.rarityAttributes[rar].absorb, 'min="50" max="300"')}</td></tr>`).join('')}
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
      const cfg = { npcRequired: $('#adt-npc').checked, recipes: {}, items: {}, rarityAttributes: {} };
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
        const ws = $$('[data-w]', fs); if (ws.length) { r.weights = {}; for (const el of ws) r.weights[el.dataset.w] = Number(el.value); }
        for (const k of ['rarityRoll', 'plusRoll']) { const en = $(`[data-roll-en="${k}"]`, fs); if (!en) continue; r[k] = { enabled: en.checked, weights: {} }; for (const el of $$(`[data-roll="${k}"]`, fs)) r[k].weights[el.dataset.k] = Number(el.value); }
        cfg.recipes[fs.dataset.recipe] = r;
      }
      for (const tr of $$('[data-item]', box)) {
        cfg.items[tr.dataset.item] = { req: Number($('[data-f=req]', tr).value), def: Number($('[data-f=def]', tr).value), wdmg: Number($('[data-f=wdmg]', tr).value),
          absorb: Number($('[data-f=absorb]', tr).value), classes: $$('.adt-cls input', tr).filter((i) => i.checked).map((i) => i.value) };
      }
      for (const tr of $$('[data-rarstat]', box)) cfg.rarityAttributes[tr.dataset.rarstat] = Object.fromEntries(['def','wdmg','absorb'].map((k) => [k, Number($(`[data-f=${k}]`, tr).value)]));
      try { const r = await X.api('POST', '/api/admin/chaos', { config: cfg }); msg(box, r.message); } catch (e) { msg(box, e.message, true); box.scrollIntoView({ block: 'start' }); }
    };
  }

  async function excellent(box) {
    box.innerHTML = '<p class="muted">Carregando…</p>';
    let V;
    try { V = await X.api('GET', '/api/admin/excellent'); } catch (e) { box.innerHTML = `<p class="bad">${esc(e.message)}</p>`; return; }
    const C = V.config;
    box.innerHTML = `<p class="adt-msg" role="status"></p>
      <p class="adt-sub">Itens novos gerados em drops e recompensas recebem opções Excellent persistidas no item. Armas, escudos, luvas e peças defensivas usam listas compatíveis. As opções já existentes não são alteradas.</p>
      <label class="adt-check"><input type="checkbox" id="ex-enabled" ${C.enabled ? 'checked' : ''}> Ativar geração Excellent</label>
      <div class="adm-row"><label>Mínimo de opções ${num('minOptions', C.minOptions, 'id="ex-min" min="2" max="4"')}</label>
        <label>Máximo de opções ${num('maxOptions', C.maxOptions, 'id="ex-max" min="2" max="4"')}</label></div>
      <label class="adt-sub" for="ex-pools">Opções por categoria (JSON): cada registro usa id, weight, min e max. IDs aceitos: ${Object.keys(V.definitions).map(esc).join(', ')}</label>
      <textarea id="ex-pools" rows="20" spellcheck="false" style="width:100%;font:12px/1.45 monospace">${esc(JSON.stringify(C.pools, null, 2))}</textarea>
      <button class="btn btn-gold" type="button" id="ex-save">Salvar opções Excellent</button>`;
    $('#ex-save').onclick = async () => {
      try {
        const config = { enabled: $('#ex-enabled').checked, minOptions: Number($('#ex-min').value), maxOptions: Number($('#ex-max').value), pools: JSON.parse($('#ex-pools').value) };
        const r = await X.api('POST', '/api/admin/excellent', { config });
        msg(box, r.message);
        $('#ex-pools').value = JSON.stringify(r.config.pools, null, 2);
      } catch (e) { msg(box, e.message || 'JSON inválido.', true); }
    };
  }
  // ---------------- Boss Mundial ----------------
  async function worldboss(box) {
    box.innerHTML = '<p class="muted">Carregando…</p>';
    let V;
    try { V = await X.api('GET', '/api/admin/worldboss'); } catch (e) { box.innerHTML = `<p class="bad">${esc(e.message)}</p>`; return; }
    const draw = () => {
      const C = V.config;
      box.innerHTML = `<p class="adt-msg" role="status"></p>
        <p class="adt-sub">Nasce em 3 faixas de nível ao mesmo tempo (um boss por faixa, em todas as salas), girando de mapa a cada horário. Recompensa por contribuição (dano + apoio); quem ficou parado não recebe.</p>
        <p>Próximo: <b>${new Date(V.next).toLocaleString('pt-BR')}</b> em ${esc(V.nextMaps.join(', '))}</p>
        ${V.live.length ? `<table class="adm-table"><tr><th>Sala</th><th>Mapa</th><th>Boss</th><th>Vida</th></tr>${V.live.map((l) => `<tr><td>${l.room}</td><td>${esc(l.map)}</td><td>${esc(l.name)}</td><td>${Math.round(l.hp / l.maxHp * 100)}%</td></tr>`).join('')}</table>` : '<p class="muted">Nenhum Boss Mundial vivo agora.</p>'}
        <div class="adm-row" style="flex-wrap:wrap">
          <label><input type="checkbox" id="wb-on" ${C.enabled ? 'checked' : ''}> Ligado</label>
          <label style="min-width:260px">Horários (Brasília) <input id="wb-times" value="${esc(C.times.join(', '))}"></label>
          <label>Duração (min) <input type="number" id="wb-dur" value="${C.durationMin}" style="width:70px"></label>
          <label>Vida (×) <input type="number" id="wb-hp" value="${C.hpMult}" style="width:70px"></label>
          <label>Dano (×) <input type="number" step="0.1" id="wb-dmg" value="${C.dmgMult}" style="width:70px"></label>
          <label>Defesa (×) <input type="number" step="0.1" id="wb-def" value="${C.defMult}" style="width:70px"></label>
        </div>
        <button class="btn btn-gold" type="button" id="wb-save">Salvar</button> <button class="btn" type="button" id="wb-spawn">Fazer aparecer agora</button>`;
      $('#wb-save', box).onclick = async () => { try { V = await X.api('POST', '/api/admin/worldboss', { config: { enabled: $('#wb-on', box).checked, times: $('#wb-times', box).value, durationMin: $('#wb-dur', box).value, hpMult: $('#wb-hp', box).value, dmgMult: $('#wb-dmg', box).value, defMult: $('#wb-def', box).value } }); draw(); msg(box, 'Salvo.'); } catch (e) { msg(box, e.message, true); } };
      $('#wb-spawn', box).onclick = async () => { try { V = await X.api('POST', '/api/admin/worldboss', { action: 'spawn' }); draw(); msg(box, 'Boss Mundial apareceu.'); } catch (e) { msg(box, e.message, true); } };
    };
    draw();
  }
  // ---------------- Retenção: DAU/MAU, D1/D7/D30, sessões, eventos, guildas, VIP ----------------
  async function retention(box) {
    box.innerHTML = '<p class="muted">Calculando…</p>';
    let V;
    try { V = await X.api('GET', '/api/admin/retention'); } catch (e) { box.innerHTML = `<p class="bad">${esc(e.message)}</p>`; return; }
    const n = (x) => (x == null ? '—' : Number(x).toLocaleString('pt-BR'));
    const pc = (x) => (x == null ? '—' : `${String(x).replace('.', ',')}%`);
    const goalTag = (val, goal) => (val == null ? '<small class="muted">sem dados ainda</small>' : val >= goal ? `<small style="color:#8fdc6f">✓ meta ${goal}%</small>` : `<small style="color:#ff9c7a">meta ${goal}%</small>`);
    // barras simples em SVG (uma série), com rótulo do maior valor
    const bars = (rows, key, color, label) => {
      const max = Math.max(1, ...rows.map((r) => r[key])); const W = 300, H = 90, bw = W / rows.length;
      return `<figure style="margin:6px 0"><figcaption class="muted" style="font-size:12px">${esc(label)} · máx. ${n(max)}</figcaption>
        <svg viewBox="0 0 ${W} ${H + 14}" width="100%" role="img" aria-label="${esc(label)}">${rows.map((r, i) => { const h = Math.round((r[key] / max) * H); return `<rect x="${(i * bw + 1).toFixed(1)}" y="${H - h}" width="${(bw - 2).toFixed(1)}" height="${h}" rx="1.5" fill="${color}"><title>${esc(r.day)}: ${n(r[key])}</title></rect>`; }).join('')}
        <text x="0" y="${H + 12}" font-size="9" fill="currentColor" opacity=".6">${esc(rows[0].day)}</text><text x="${W}" y="${H + 12}" font-size="9" fill="currentColor" opacity=".6" text-anchor="end">${esc(rows[rows.length - 1].day)}</text></svg></figure>`;
    };
    const R = V.retention, G = V.goals;
    const card = (t, v, sub) => `<div class="adm-kpi" style="flex:1 1 130px;border:1px solid rgba(232,184,74,.35);padding:8px 10px;border-radius:6px"><small class="muted">${t}</small><br><b style="font-size:20px">${v}</b>${sub ? `<br>${sub}` : ''}</div>`;
    box.innerHTML = `
      <p class="adt-sub">Números reais do banco. "Ativo" = esteve dentro do mundo naquele dia. Retenção por coorte: das contas criadas num dia, quantas jogaram 1, 7 e 30 dias depois (só conta coortes que já chegaram nesse dia).</p>
      <div class="adm-row" style="flex-wrap:wrap;gap:8px">
        ${card('Online agora', n(V.online))}${card('Contas criadas', n(V.accounts.total), `<small class="muted">hoje ${n(V.accounts.today)} · 7 dias ${n(V.accounts.d7)} · 30 dias ${n(V.accounts.d30)}</small>`)}
        ${card('DAU (hoje)', n(V.active.dau))}${card('WAU (7 dias)', n(V.active.wau))}${card('MAU (30 dias)', n(V.active.mau), `<small class="muted">DAU/MAU ${pc(V.active.stickiness)}</small>`)}
      </div>
      <div class="adm-row" style="flex-wrap:wrap;gap:8px;margin-top:8px">
        ${card('Retenção D1', pc(R.d1.pct), `${goalTag(R.d1.pct, G.d1)} <small class="muted">· base ${n(R.d1.base)}</small>`)}
        ${card('Retenção D7', pc(R.d7.pct), `${goalTag(R.d7.pct, G.d7)} <small class="muted">· base ${n(R.d7.base)}</small>`)}
        ${card('Retenção D30', pc(R.d30.pct), `${goalTag(R.d30.pct, G.d30)} <small class="muted">· base ${n(R.d30.base)}</small>`)}
      </div>
      <div class="adm-row" style="flex-wrap:wrap;gap:8px;margin-top:8px">
        ${card('Sessão média (7 dias)', `${String(V.sessions.avgMin).replace('.', ',')} min`, `<small class="muted">mediana ${String(V.sessions.medianMin).replace('.', ',')} min · ${n(V.sessions.count)} sessões</small>`)}
        ${card('Voltaram (7 dias)', n(V.returned), '<small class="muted">ficaram 7+ dias fora e voltaram</small>')}
        ${card('Abandonaram', n(V.abandoned), '<small class="muted">jogaram há 8–37 dias e sumiram</small>')}
        ${card('Guildas ativas', `${n(V.guilds.active)} / ${n(V.guilds.total)}`, '<small class="muted">com membro ativo em 7 dias</small>')}
        ${card('VIP ativos', n(V.vip.paid), `<small class="muted">+ ${n(V.vip.free)} no VIP Free</small>`)}
        ${card('Conversão (pagantes)', pc(V.vip.conversion), `<small class="muted">${n(V.vip.payersAny)} contas já pagaram (VIP ${n(V.vip.payersVip)} · loja ${n(V.vip.payersShop)})</small>`)}
      </div>
      ${bars(V.daily, 'dau', '#e8b84a', 'Jogadores ativos por dia (30 dias)')}
      ${bars(V.daily, 'new', '#7ab8ff', 'Contas novas por dia')}
      ${bars(V.daily, 'events', '#8fdc6f', 'Heróis em eventos por dia')}
      <b>Eventos nos últimos 7 dias</b>
      <table class="adm-table"><tr><th>Evento</th><th>Entradas</th><th>Heróis</th></tr>${V.events.length ? V.events.map((e) => `<tr><td>${esc({ blood: 'Blood Castle', devil: 'Devil Square', castle: 'Chaos Castle', invasion: 'Invasão Dourada', worldboss: 'Boss Mundial', siege: 'Castle Siege' }[e.event] || e.event)}</td><td>${n(e.n)}</td><td>${n(e.players)}</td></tr>`).join('') : '<tr><td colspan="3" class="muted">Ainda sem participação registrada.</td></tr>'}</table>
      <b>Coortes recentes (contas criadas por dia)</b>
      <div style="overflow-x:auto"><table class="adm-table"><tr><th>Dia</th><th>Contas</th><th>D1</th><th>D7</th><th>D30</th></tr>
        ${V.cohorts.map((c) => `<tr><td>${esc(c.day)}</td><td>${n(c.size)}</td>${[1, 7, 30].map((d) => `<td>${c.age > d ? `${pc(Math.round((c['d' + d] / Math.max(1, c.size)) * 1000) / 10)} <small class="muted">(${c['d' + d]})</small>` : '<small class="muted">—</small>'}</td>`).join('')}</tr>`).join('')}</table></div>
      <b>Metas de teste (não são resultados garantidos)</b>
      <div class="adm-row" style="flex-wrap:wrap">${['d1', 'd7', 'd30'].map((k) => `<label>${k.toUpperCase()} (%) <input type="number" min="0" max="100" step="0.5" data-goal="${k}" value="${esc(G[k])}" style="width:80px"></label>`).join('')}
        <button class="btn small btn-gold" type="button" id="ret-save">Salvar metas</button> <button class="btn small" type="button" id="ret-reload">Atualizar</button></div>
      <p class="adt-msg" role="status"></p>`;
    $('#ret-save', box).onclick = async () => { const goals = {}; $$('[data-goal]', box).forEach((i) => { goals[i.dataset.goal] = Number(i.value); }); try { await X.api('POST', '/api/admin/retention/goals', { goals }); retention(box); } catch (e) { msg(box, e.message, true); } };
    $('#ret-reload', box).onclick = () => retention(box);
  }
  // ---------------- EXP Extreme Hard ----------------
  async function exphard(box) {
    box.innerHTML = '<p class="muted">Carregando…</p>';
    let V;
    try { V = await X.api('GET', '/api/admin/exphard'); } catch (e) { box.innerHTML = `<p class="bad">${esc(e.message)}</p>`; return; }
    const h = (x) => (x == null ? '—' : (Math.round(x * 10) / 10).toLocaleString('pt-BR'));
    const draw = () => {
      const C = V.config, P = V.projection, L = V.live;
      box.innerHTML = `<p class="adt-msg" role="status"></p>
        <p class="adt-sub">EXP por abate = barra do nível × % do plano (Free 0,5% · Ouro 0,7% · Diamante 0,8%) × vida do monstro × bônus do mapa × <b>multiplicador da curva</b> ÷ (1 + resets × dificuldade por reset). A curva liga as âncoras abaixo sem degraus. Por cima dela entra o corte progressivo: 0% no nível 1 subindo até o valor escolhido no nível 1000. Mudar aqui não altera nenhum personagem: vale para os próximos abates.</p>
        <b>Curva (nível → multiplicador do EXP por abate)</b>
        <div style="overflow-x:auto"><table class="adm-table"><tr><th>Nível</th><th>Multiplicador</th><th></th></tr>
        ${C.curve.map(([l, v], i) => `<tr><td><input type="number" min="1" max="1000" data-xl="${i}" value="${l}" style="width:80px" ${l === 1 || l === 1000 ? 'readonly' : ''}></td><td><input type="number" step="any" min="0.001" data-xv="${i}" value="${v}" style="width:100px"></td><td>${l === 1 || l === 1000 ? '' : `<button class="btn small" type="button" data-xdel="${i}">Remover</button>`}</td></tr>`).join('')}
        </table></div>
        <button class="btn small" type="button" id="xh-add">+ Âncora</button>
        <div class="adm-row" style="flex-wrap:wrap;margin-top:8px">
          <label>Dificuldade por reset <input type="number" step="0.01" min="0" max="1" id="xh-reset" value="${C.perReset}" style="width:80px"></label>
          <label>Multiplicador geral do EXP (0,5 = −50%) <input type="number" step="0.05" min="0.05" max="5" id="xh-global" value="${C.globalMult}" style="width:80px"></label>
          <label>Corte progressivo no nível 1000 (0,6 = −60%) <input type="number" step="0.05" min="0" max="0.95" id="xh-cut" value="${C.levelCut}" style="width:80px"></label>
          <label>Multiplicador do EXP offline <input type="number" step="0.05" min="0" max="2" id="xh-off" value="${C.offline}" style="width:80px"></label>
          ${[2, 3, 4, 5].map((n) => `<label>Party ${n} <input type="number" step="0.01" min="0" max="1" data-xp="${n}" value="${C.party[n]}" style="width:70px"></label>`).join('')}
        </div>
        <button class="btn btn-gold" type="button" id="xh-save">Salvar</button> <button class="btn small" type="button" id="xh-default">Voltar à curva calibrada</button> <button class="btn small" type="button" id="xh-reload">Atualizar números</button>
        <b style="display:block;margin-top:10px">Tempo estimado (Free solo, horas de jogo ativo, sem missões/eventos) × meta</b>
        <div style="overflow-x:auto"><table class="adm-table"><tr><th>Nível</th>${V.target.slice(1).map(([l]) => `<th>${l}</th>`).join('')}</tr>
          <tr><td>Estimado</td>${V.target.slice(1).map(([l]) => `<td>${h(P[l])} h</td>`).join('')}</tr>
          <tr><td>Meta</td>${V.target.slice(1).map(([, t]) => `<td>${t} h</td>`).join('')}</tr></table></div>
        <p class="muted small">Com 2 h por dia, ${h(P[1000])} h ≈ ${Math.round(P[1000] / 2)} dias; com 3 h por dia ≈ ${Math.round(P[1000] / 3)} dias.</p>
        <b style="display:block;margin-top:10px">Jogadores por faixa de nível</b>
        <div style="overflow-x:auto"><table class="adm-table"><tr><th>Faixa</th><th>Personagens</th><th>VIP Ouro</th><th>VIP Diamante</th><th>Nível médio</th><th>Maior</th><th>Parados 7+ dias</th></tr>
        ${V.bands.map((b) => `<tr><td>${esc(b.name)}</td><td>${b.chars}</td><td>${b.gold}</td><td>${b.diamond}</td><td>${b.avg_level}</td><td>${b.max_level}</td><td>${b.idle7} (${b.chars ? Math.round(b.idle7 / b.chars * 100) : 0}%)</td></tr>`).join('') || '<tr><td colspan="7" class="muted">Sem personagens.</td></tr>'}</table></div>
        <b style="display:block;margin-top:10px">Números reais desde ${new Date(L.since).toLocaleString('pt-BR')}</b>
        <div style="overflow-x:auto"><table class="adm-table"><tr><th>Plano</th><th>Jogadores</th><th>EXP</th><th>Horas ativas</th><th>EXP por hora</th><th>Níveis</th><th>Min por nível</th></tr>
        ${L.tiers.map((t) => `<tr><td>${esc(t.tier)}</td><td>${t.players}</td><td>${fmt.format(t.exp)}</td><td>${h(t.activeH)}</td><td>${fmt.format(t.expPerH)}</td><td>${t.levels}</td><td>${h(t.minPerLevel)}</td></tr>`).join('') || '<tr><td colspan="7" class="muted">Ainda sem dados.</td></tr>'}</table></div>
        <p class="muted small">Farm offline: ${fmt.format(L.offline.exp)} EXP em ${h(L.offline.hours)} h (${L.offline.reports} relatórios).</p>
        ${[['Mapas', L.maps], ['Monstros', L.monsters], ['Bosses', L.bosses], ['Eventos', L.events]].map(([t, list]) => `<details><summary>EXP por ${t.toLowerCase()} (${list.length})</summary><table class="adm-table"><tr><th>${t}</th><th>EXP</th><th>Vezes</th></tr>${list.map((x) => `<tr><td>${esc(x.name)}</td><td>${fmt.format(x.exp)}</td><td>${x.n}</td></tr>`).join('') || '<tr><td colspan="3" class="muted">Sem dados.</td></tr>'}</table></details>`).join('')}`;
      const collect = () => {
        const curve = $$('[data-xl]', box).map((i) => [Number(i.value), Number($(`[data-xv="${i.dataset.xl}"]`, box).value)]);
        const party = {}; $$('[data-xp]', box).forEach((i) => { party[i.dataset.xp] = Number(i.value); });
        return { curve, perReset: Number($('#xh-reset', box).value), levelCut: Number($('#xh-cut', box).value), globalMult: Number($('#xh-global', box).value), offline: Number($('#xh-off', box).value), party };
      };
      const send = async (config) => { try { V = await X.api('POST', '/api/admin/exphard', { config }); draw(); msg(box, V.message); } catch (e) { msg(box, e.message, true); } };
      $('#xh-save', box).onclick = () => send(collect());
      $('#xh-default', box).onclick = () => send(V.defaults);
      $('#xh-reload', box).onclick = () => exphard(box);
      $('#xh-add', box).onclick = () => { const c = collect(); c.curve.splice(c.curve.length - 1, 0, [500, 1]); V.config = { ...V.config, ...c, curve: c.curve.sort((a, b) => a[0] - b[0]) }; draw(); };
      $$('[data-xdel]', box).forEach((b) => { b.onclick = () => { const c = collect(); c.curve.splice(Number(b.dataset.xdel), 1); V.config = { ...V.config, ...c }; draw(); }; });
    };
    draw();
  }
  // ---------------- Agilidade: crítico, velocidade de ataque e defesa ----------------
  async function agility(box) {
    box.innerHTML = '<p class="muted">Carregando…</p>';
    let V;
    try { V = await X.api('GET', '/api/admin/agility'); } catch (e) { box.innerHTML = `<p class="bad">${esc(e.message)}</p>`; return; }
    const CLS = { dark_knight: 'BK', dark_wizard: 'DW', fairy_elf: 'Elfa', magic_gladiator: 'MG', dark_lord: 'DL', summoner: 'Summoner' };
    const F = [
      ['crit', 'base', 'Crítico base (%)'], ['crit', 'perPoint', 'Crítico por ponto até o joelho (%)'], ['crit', 'knee', 'Joelho do crítico (agilidade)'],
      ['crit', 'extra', 'Crítico extra depois do joelho (%)'], ['crit', 'curve', 'Suavidade do crítico (maior = cresce mais devagar)'], ['crit', 'cap', 'Crítico máximo de segurança (%)'],
      ['speed', 'baseMs', 'Intervalo de ataque base (ms)'], ['speed', 'perPoint', 'ms a menos por ponto até o joelho'], ['speed', 'knee', 'Joelho da velocidade (agilidade)'],
      ['speed', 'minMs', 'Intervalo mínimo técnico (ms)'], ['speed', 'curve', 'Suavidade da velocidade'],
      ['defense', 'divisor', 'Agilidade por 1 de defesa até o joelho'], ['defense', 'knee', 'Joelho da defesa (agilidade)'], ['defense', 'divisorAfter', 'Agilidade por 1 de defesa depois do joelho'],
    ];
    const draw = () => {
      const C = V.config;
      box.innerHTML = `<p class="adt-msg" role="status"></p>
        <p class="adt-sub">Agilidade total = pontos distribuídos + agilidade dos itens equipados. Até o joelho vale a fórmula antiga; depois dele o valor continua subindo, cada vez mais devagar, até o limite de segurança. Sem trava de 50%. Os valores entram no combate real (PvE e PvP) e na tela do Herói.</p>
        <div class="adm-row" style="flex-wrap:wrap">${F.map(([g, k, l]) => `<label style="min-width:220px">${esc(l)} <input type="number" step="any" data-ag="${g}.${k}" value="${esc(C[g][k])}"></label>`).join('')}</div>
        <b>Multiplicador da agilidade por classe (1 = padrão)</b>
        <table class="adm-table"><tr><th>Classe</th><th>Crítico</th><th>Velocidade</th><th>Defesa</th></tr>
        ${Object.entries(CLS).map(([c, n]) => `<tr><td>${n}</td>${['crit', 'speed', 'defense'].map((k) => `<td><input type="number" step="0.05" min="0.1" max="5" data-agc="${c}.${k}" value="${esc(C.classes[c][k])}" style="width:70px"></td>`).join('')}</tr>`).join('')}</table>
        <button class="btn btn-gold" type="button" id="ag-save">Salvar e aplicar</button> <button class="btn small" type="button" id="ag-reset">Voltar ao padrão</button>
        <b style="display:block;margin-top:10px">Conferência (sem itens): crítico · intervalo de ataque · defesa da agilidade</b>
        <div style="overflow-x:auto"><table class="adm-table"><tr><th>Agilidade</th>${Object.values(CLS).map((n) => `<th>${n}</th>`).join('')}</tr>
        ${V.preview.fairy_elf.map((row, i) => `<tr><td>${row.agi}</td>${Object.keys(CLS).map((c) => { const r = V.preview[c][i]; return `<td>${r.crit}% · ${r.atkMs}ms · ${r.def}</td>`; }).join('')}</tr>`).join('')}</table></div>`;
      const collect = () => {
        const o = { crit: {}, speed: {}, defense: {}, classes: {} };
        $$('[data-ag]', box).forEach((i) => { const [g, k] = i.dataset.ag.split('.'); o[g][k] = Number(i.value); });
        $$('[data-agc]', box).forEach((i) => { const [c, k] = i.dataset.agc.split('.'); (o.classes[c] = o.classes[c] || {})[k] = Number(i.value); });
        return o;
      };
      const send = async (config) => { try { V = await X.api('POST', '/api/admin/agility', { config }); draw(); msg(box, V.message); } catch (e) { msg(box, e.message, true); } };
      $('#ag-save', box).onclick = () => send(collect());
      $('#ag-reset', box).onclick = () => send(V.defaults);
    };
    draw();
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
        <span class="adt-p" data-k="item chaosweapon">${sel('rarity', RAR.map((k) => [k, RAR_PT[k]]), e.rarity || 'common')} +${num('plusMin', e.plusMin ?? 0, 'min="0" max="5"')} a +${num('plusMax', e.plusMax ?? 0, 'min="0" max="5"')}</span>
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
          <div class="adm-row">${sel('simBox', V.boxIds.map((b) => [b, V.boxNames[b]]), 'kundun_3', 'id="adt-sim-box"')}<label>aberturas ${num('n', 5000, 'id="adt-sim-n" min="1" max="100000"')}</label>
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
        <p class="muted">Baú compartilhado por conta: todos os personagens da conta usam o mesmo baú.</p>
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
      if (false && !confirm(o.shared ? 'Juntar os baús dos personagens de cada conta em um só? Os itens e o Zen vão para o baú da conta quando o jogador abrir o baú.' : 'Separar os baús por personagem? Cada item volta para o baú do personagem que o guardou.')) return;
      post({ op: 'config', config: o });
    };
    $('#adt-vgo').onclick = () => vault(box, $('#adt-vname').value.trim());
    $('#adt-vname').onkeydown = (e) => { if (e.key === 'Enter') $('#adt-vgo').click(); };
    const cg = $('#adt-vcapgo'); if (cg) cg.onclick = () => post({ op: 'capacity', owner: $('#adt-vowner').value, capacity: $('#adt-vcap').value === '' ? null : Number($('#adt-vcap').value) });
  }

  // ---------------- Eventos: Chaos Castle e Devil Square ----------------
  async function arena(box) {
    box.innerHTML = '<p class="muted">Carregando…</p>';
    let V;
    try { V = await X.api('GET', '/api/admin/arena'); } catch (e) { box.innerHTML = `<p class="bad">${esc(e.message)}</p>`; return; }
    const PH = { idle: 'aguardando', open: 'inscrições abertas', running: 'em andamento' };
    const hm = (ms) => new Date(ms).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    const card = (kind) => {
      const c = V.config[kind], st = V.state[kind];
      return `<fieldset class="adt-card" data-kind="${kind}"><legend>${esc(c.name)}</legend>
        <p><b>${PH[st.phase] || st.phase}</b> · próxima partida: ${hm(st.slot)} · inscritos: ${st.regs.length ? st.regs.map((r) => `${esc(r.name)} (cat. ${r.cat + 1})`).join(', ') : 'nenhum'}</p>
        ${st.matches.map((m) => `<p>⚔ ${esc(m.name)}: ${m.alive}/${m.total} vivos, ${m.monsters} monstros, termina ${hm(m.endsAt)}${m.ended ? ' (encerrando)' : ''}</p>`).join('')}
        <div class="adm-row"><label>Começar em ${num('openIn', 2, 'min="1" max="60" class="w-xs"')} min</label><button class="btn small" type="button" data-op="open">Abrir inscrições agora</button>
          <button class="btn small btn-danger" type="button" data-op="end" ${st.matches.length ? '' : 'disabled'}>Encerrar partida</button></div>
        <label class="adt-check"><input type="checkbox" data-f="enabled" ${c.enabled ? 'checked' : ''}> Evento ativo</label>
        <label>Horários (HH:MM, Brasília, separados por vírgula)<textarea data-f="times" rows="2" style="width:100%">${esc(c.times.join(', '))}</textarea></label>
        <div class="adm-row"><label>Inscrições abrem ${num('openMin', c.openMin, 'min="1" max="60"')} min antes</label><label>Duração ${num('durationMin', c.durationMin, 'min="2" max="60"')} min</label>
          <label>Participantes: mín. ${num('minPlayers', c.minPlayers, 'min="1" max="50"')}</label><label>máx. ${num('maxPlayers', c.maxPlayers, 'min="1" max="100"')}</label></div>
        ${kind === 'castle' ? `<div class="adm-row"><label>Vender Armor of Guardsman no NPC por ${num('buyZen', c.buyZen, 'min="0" step="1000" style="width:120px"')} Zen (0 = não vende)</label>
          <label class="adt-check"><input type="checkbox" data-f="disguise" ${c.disguise ? 'checked' : ''}> Disfarce de guerreiro</label></div>
          <div class="adm-row"><label>Monstros: base ${num('monsters.base', c.monsters.base, 'min="0" max="120"')}</label><label>por jogador ${num('monsters.perPlayer', c.monsters.perPlayer, 'min="-5" max="5"')}</label>
            <label>mínimo ${num('monsters.min', c.monsters.min, 'min="0" max="120"')}</label><label>força × ${num('monsters.mult', c.monsters.mult, 'min="0.2" max="10" step="0.1"')}</label></div>
          <div class="adm-row"><label class="adt-check"><input type="checkbox" data-f="shrink.enabled" ${c.shrink.enabled ? 'checked' : ''}> Área segura diminui</label>
            <label>de ${num('shrink.startPct', c.shrink.startPct, 'min="0" max="95"')}% até ${num('shrink.endPct', c.shrink.endPct, 'min="5" max="100"')}% do tempo</label>
            <label>tamanho final ${num('shrink.finalSize', c.shrink.finalSize, 'min="10" max="100"')}%</label><label>dano fora ${num('shrink.dmgPct', c.shrink.dmgPct, 'min="1" max="50"')}% da vida/s</label></div>`
    : `<div class="adm-row"><label>Monstros vivos ${num('monsters.maxAlive', c.monsters.maxAlive, 'min="3" max="60"')}</label><label>+ por jogador ${num('monsters.perPlayer', c.monsters.perPlayer, 'min="0" max="10"')}</label>
            <label>nova leva a cada ${num('monsters.everySec', c.monsters.everySec, 'min="1" max="60"')} s</label><label>força × ${num('monsters.mult', c.monsters.mult, 'min="0.2" max="10" step="0.1"')}</label></div>`}
        <div class="adm-row"><label>Pontos: monstro ${num('score.monster', c.score.monster, 'min="0" max="100"')}</label><label>jogador ${num('score.player', c.score.player, 'min="0" max="100"')}</label>
          <label>sobreviver ${num('score.survive', c.score.survive, 'min="0" max="500"')}</label><label>mínimo p/ prêmio ${num('score.minForReward', c.score.minForReward, 'min="0" max="1000"')}</label></div>
        <p class="adt-sub">Categorias</p>
        <div class="adt-table-wrap"><table class="adt-table"><thead><tr><th>#</th><th>Nome</th><th>Nível mín.</th><th>Nível máx.</th><th>Resets mín.</th></tr></thead><tbody>
          ${c.categories.map((x, i) => `<tr data-cat="${i}"><td>${i + 1}</td><td><input data-f="name" value="${esc(x.name)}" maxlength="40"></td><td>${num('minLevel', x.minLevel, 'min="1"')}</td><td>${num('maxLevel', x.maxLevel, 'min="1"')}</td><td>${num('minResets', x.minResets || 0, 'min="0"')}</td></tr>`).join('')}</tbody></table></div>
        <p class="adt-sub">Prêmios por categoria (JSON). Tipos: zen, exp, item (com "base"), gear (com "rarity": rare, epic…). Lugares: winner, second, third, participant.</p>
        <textarea data-f="rewards" rows="8" style="width:100%;font:12px monospace">${esc(JSON.stringify(c.rewards, null, 1))}</textarea>
        <details><summary class="muted small">Ids de itens</summary><p class="muted small">${V.items.filter((x) => /jewel|kundun|devil|guard|loch|feather|chaos_|cloak|archangel|blood/.test(x.id)).map((x) => `${esc(x.id)} (${esc(x.name)})`).join(' · ')}</p></details>
        <button class="btn btn-gold" type="button" data-op="save">Salvar ${esc(c.name)}</button>
      </fieldset>`;
    };
    box.innerHTML = `<p class="adt-msg" role="status"></p><p class="muted small">${V.pending} prêmio(s) aguardando entrega (jogador offline ou bolsa cheia).</p>
      ${V.kinds.map(card).join('')}
      <h4>Últimas partidas</h4>
      <div class="adt-table-wrap"><table class="adt-table"><thead><tr><th>#</th><th>Evento</th><th>Início</th><th>Jogadores</th><th>Vencedor</th><th>Fim</th></tr></thead><tbody>
      ${V.history.map((h) => `<tr><td>${h.id}</td><td>${h.kind === 'castle' ? 'Chaos Castle' : h.kind === 'blood' ? 'Blood Castle' : 'Devil Square'} ${h.category + 1}</td><td>${h.started_at ? dt(h.started_at) : '—'}</td><td>${h.players}</td><td>${esc(h.winner_name || '—')}</td>
        <td>${esc(h.status)}${h.end_reason ? ' · ' + esc(h.end_reason) : ''}${h.data && h.data.results ? `<br><small class="muted">${h.data.results.slice(0, 5).map((r) => `${r.place}º ${esc(r.name)} ${r.score}`).join(' · ')}</small>` : ''}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">Nenhuma ainda.</td></tr>'}</tbody></table></div>`;
    const post = async (body) => { try { const r = await X.api('POST', '/api/admin/arena', body); msg(box, r.message); setTimeout(() => arena(box), 900); } catch (e) { msg(box, e.message, true); box.scrollIntoView({ block: 'start' }); } };
    for (const fs of $$('[data-kind]', box)) {
      const kind = fs.dataset.kind;
      $$('[data-op]', fs).forEach((b) => { b.onclick = () => {
        if (b.dataset.op === 'open') return post({ op: 'open', kind, minutes: Number($('[data-f=openIn]', fs).value) });
        if (b.dataset.op === 'end') { if (confirm('Encerrar a partida agora? Ninguém recebe o prêmio de vencedor; participantes recebem o de participação.')) post({ op: 'end', kind }); return; }
        const c = { monsters: {}, shrink: {}, score: {}, categories: [] };
        for (const el of $$('[data-f]', fs)) {
          if (el.closest('[data-cat]') || el.dataset.f === 'openIn') continue;
          const path = el.dataset.f.split('.');
          let v = el.type === 'checkbox' ? el.checked : el.type === 'number' ? Number(el.value) : el.value;
          if (el.dataset.f === 'rewards') { try { v = JSON.parse(el.value); } catch (_) { return msg(box, 'Prêmios: JSON inválido.', true); } }
          if (path.length === 2) c[path[0]][path[1]] = v; else c[path[0]] = v;
        }
        for (const row of $$('[data-cat]', fs)) { const x = {}; for (const el of $$('[data-f]', row)) x[el.dataset.f] = el.type === 'number' ? Number(el.value) : el.value; c.categories.push(x); }
        post({ op: 'config', kind, config: c });
      }; });
    }
  }

  // ---------------- Aprimoramento +0 a +15 / Ferreiro Mestre ----------------
  async function upgrade(box) {
    box.innerHTML = '<p class="muted">Carregando…</p>';
    let V;
    try { V = await X.api('GET', '/api/admin/upgrade'); } catch (e) { box.innerHTML = `<p class="bad">${esc(e.message)}</p>`; return; }
    const draw = () => {
      const c = V.config;
      const FAILS = [['keep', 'mantém o nível (padrão)'], ['minus1', 'perde 1 nível'], ['reset', 'volta para +0']];
      const CATN = { weapon: 'Armas', shield: 'Escudos', armor: 'Armaduras (elmo, armadura, calças, luvas, botas)', wings: 'Asas e capas', accessory: 'Anéis e colares' };
      const st = {}; for (const r of V.stats) { const k = `${r.kind}:${r.from_plus}`; st[k] = r; }
      const rate = (k) => (st[k] ? ` <small class="muted">(${st[k].ok}/${st[k].n} em 7 dias)</small>` : '');
      box.innerHTML = `<p class="adt-msg" role="status"></p>
        <fieldset class="adt-card" id="up-direct"><legend>Joias direto no item (+0 a +9)</legend>
          <label class="adt-check"><input type="checkbox" data-f="directEnabled" ${c.directEnabled ? 'checked' : ''}> Ativo</label>
          <div class="adt-table-wrap"><table class="adt-table"><thead><tr><th>Nível</th><th>Joia</th><th>Chance %</th></tr></thead><tbody>
          ${c.direct.map((v, k) => `<tr><td>+${k} → +${k + 1}</td><td>${k < 6 ? 'Bless' : 'Soul'}</td><td>${num('d' + k, v, 'min="0" max="100" step="0.1"')}${rate('direct:' + k)}</td></tr>`).join('')}</tbody></table></div>
          <label>Se falhar ${sel('directFail', FAILS, c.directFail)}</label>
        </fieldset>
        <fieldset class="adt-card" id="up-smith"><legend>Ferreiro Mestre (+9 a +15)</legend>
          <label class="adt-check"><input type="checkbox" data-f="enabled" ${c.smith.enabled ? 'checked' : ''}> Ferreiro aberto</label>
          <div class="adm-row">${Object.keys(c.smith.maps).map((m) => `<label class="adt-check"><input type="checkbox" data-map="${m}" ${c.smith.maps[m] ? 'checked' : ''}> ${m[0].toUpperCase() + m.slice(1)}</label>`).join('')}</div>
          <label>Nível máximo ${num('maxLevel', c.maxLevel, 'min="9" max="15"')}</label>
          <div class="adt-table-wrap"><table class="adt-table"><thead><tr><th>Nível</th><th>Chance %</th><th>Bless</th><th>Soul</th><th>Chaos</th><th>Creation</th><th>Zen</th></tr></thead><tbody>
          ${c.smith.steps.map((s2, k) => `<tr data-step="${k}"><td>+${k + 9} → +${k + 10}</td><td>${num('chance', s2.chance, 'min="0" max="100" step="0.1"')}${rate('smith:' + (k + 9))}</td>
            ${['bless', 'soul', 'chaos', 'creation'].map((m) => `<td>${num(m, s2[m], 'min="0" max="99" class="w-xs"')}</td>`).join('')}<td>${num('zen', s2.zen, 'min="0" step="100000" style="width:120px"')}</td></tr>`).join('')}</tbody></table></div>
          <label>Se falhar ${sel('smithFail', FAILS, c.smith.fail)}</label>
        </fieldset>
        <fieldset class="adt-card" id="up-cats"><legend>Itens que podem ser aprimorados</legend>
          ${Object.entries(CATN).map(([k, n]) => `<label class="adt-check"><input type="checkbox" data-cat="${k}" ${c.cats[k] ? 'checked' : ''}> ${esc(n)}</label>`).join('')}
        </fieldset>
        <fieldset class="adt-card" id="up-bonus"><legend>Bônus de atributo por nível (% sobre o item base)</legend>
          <div class="adt-table-wrap"><table class="adt-table"><thead><tr><th></th>${Array.from({ length: 16 }, (_, k) => `<th>+${k}</th>`).join('')}</tr></thead><tbody>
          ${Object.entries(c.bonus).map(([k, arr]) => `<tr data-bonus="${k}"><td>${{ weapon: 'Armas', shield: 'Escudos', armor: 'Armaduras', accessory: 'Acessórios' }[k] || k}</td>${arr.map((v, j) => `<td>${num('b' + j, v, 'min="0" max="1000" class="w-xs"')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
          <p class="adt-sub">Asas e capas, por nível: até +9 / do +10 ao +15</p>
          <div class="adm-row" id="up-wings"><label>Defesa ${num('def', c.wings.def, 'min="0" max="50" class="w-xs"')} / ${num('defHigh', c.wings.defHigh, 'min="0" max="50" class="w-xs"')}</label>
            <label>Dano % ${num('wdmg', c.wings.wdmg, 'min="0" max="50" class="w-xs"')} / ${num('wdmgHigh', c.wings.wdmgHigh, 'min="0" max="50" class="w-xs"')}</label>
            <label>Absorção % ${num('absorb', c.wings.absorb, 'min="0" max="50" class="w-xs"')} / ${num('absorbHigh', c.wings.absorbHigh, 'min="0" max="50" class="w-xs"')}</label></div>
        </fieldset>
        <fieldset class="adt-card" id="up-msg"><legend>Mensagens ({item} = nome, {plus} = nível)</legend>
          ${Object.entries(c.messages).map(([k, v]) => `<label style="display:block">${{ success: 'Sucesso', fail: 'Falha (joia)', smithFail: 'Falha (Ferreiro)', limit: 'Limite do +9' }[k]}<input data-msg="${k}" value="${esc(v)}" style="width:100%"></label>`).join('')}
        </fieldset>
        <button class="btn btn-gold" type="button" id="up-save">Salvar aprimoramento</button>
        <h4>Últimas tentativas</h4>
        <ul class="adm-list adt-log">${V.history.map((h) => `<li>${dt(h.created_at)} · <b>${esc(h.char_name)}</b> · ${esc(h.item)} +${h.from_plus} → +${h.to_plus} · ${h.kind === 'smith' ? 'Ferreiro' : 'joia'} · ${h.success ? '<span class="req-ok">sucesso</span>' : '<span class="req-no">falha</span>'} (${Number(h.chance)}%)${Number(h.zen) ? ' · ' + fmt.format(h.zen) + ' Zen' : ''}</li>`).join('') || '<li class="muted">Nenhuma ainda.</li>'}</ul>`;
      $('#up-save').onclick = async () => {
        const o = { directEnabled: $('[data-f=directEnabled]', box).checked, direct: c.direct.map((_, k) => Number($(`#up-direct [data-f=d${k}]`).value)), directFail: $('[data-f=directFail]', box).value,
          maxLevel: Number($('[data-f=maxLevel]', box).value),
          smith: { enabled: $('#up-smith [data-f=enabled]').checked, maps: {}, fail: $('[data-f=smithFail]', box).value, steps: [] }, cats: {}, bonus: {}, wings: {}, messages: {} };
        for (const el of $$('[data-map]', box)) o.smith.maps[el.dataset.map] = el.checked;
        for (const tr of $$('[data-step]', box)) { const x = {}; for (const el of $$('[data-f]', tr)) x[el.dataset.f] = Number(el.value); o.smith.steps.push(x); }
        for (const el of $$('[data-cat]', box)) o.cats[el.dataset.cat] = el.checked;
        for (const tr of $$('[data-bonus]', box)) o.bonus[tr.dataset.bonus] = $$('[data-f]', tr).map((el) => Number(el.value));
        for (const el of $$('#up-wings [data-f]')) o.wings[el.dataset.f] = Number(el.value);
        for (const el of $$('[data-msg]', box)) o.messages[el.dataset.msg] = el.value;
        try { V = { ...V, ...(await X.api('POST', '/api/admin/upgrade', { config: o })) }; draw(); msg(box, 'Aprimoramento salvo.'); } catch (e) { msg(box, e.message, true); }
      };
    };
    draw();
  }

  // ---------------- Mercado com dinheiro real ----------------
  const money = (v, c) => (c === 'brl' ? 'R$ ' + (v / 100).toFixed(2).replace('.', ',') : c === 'usd' ? 'US$ ' + (v / 100).toFixed(2) : fmt.format(v) + ' Zen');
  async function market(box) {
    box.innerHTML = '<p class="muted">Carregando…</p>';
    let V;
    try { V = await X.api('GET', '/api/admin/market'); } catch (e) { box.innerHTML = `<p class="bad">${esc(e.message)}</p>`; return; }
    const draw = () => {
      const tot = (c) => V.totals.find((t) => t.currency === c) || { sold: 0, volume: 0, fees: 0 };
      const act = (c) => (V.active.find((t) => t.currency === c) || { n: 0 }).n;
      box.innerHTML = `<p class="adt-msg" role="status"></p>
        <p class="muted small">Stripe ${V.stripe ? 'ligado' : '<b class="bad">desligado (faltam as chaves)</b>'} · vendedores com Stripe conectado: ${V.sellers.ready}/${V.sellers.n} · comissão por Pix cobrada a partir de ${money(V.limit, 'brl')}, prazo de ${V.graceH} h antes do bloqueio.</p>
        <table class="adt-table"><thead><tr><th>Moeda</th><th>À venda</th><th>Vendidos</th><th>Volume</th><th>Comissão (10%)</th></tr></thead><tbody>
          ${['brl', 'usd', 'zen'].map((c) => { const t = tot(c); return `<tr><td>${c.toUpperCase()}</td><td>${act(c)}</td><td>${t.sold}</td><td>${money(Number(t.volume), c)}</td><td>${money(Number(t.fees), c)}</td></tr>`; }).join('')}
        </tbody></table>
        <h4>Carteiras: comissões a receber, dólares a pagar e bloqueios</h4>
        <div class="adm-row"><label>Conta <input type="text" id="adt-mk-user" placeholder="usuário"></label><button class="btn small" type="button" id="adt-mk-find">Abrir carteira</button></div>
        ${V.wallets.length ? `<table class="adt-table"><thead><tr><th>Conta</th><th>Deve de comissão</th><th>Dólar a pagar</th><th>Como receber</th><th>Situação</th><th></th></tr></thead><tbody>
          ${V.wallets.map((w) => `<tr data-acc="${w.account}"><td>${esc(w.username)}<br><small class="muted">${esc(w.email || '')}</small></td><td>${money(w.dueBrl, 'brl')}</td><td>${money(w.usdOwed, 'usd')}</td>
            <td><small>${esc(w.payoutInfo || '—')}${w.pixKey ? `<br>Pix: ${esc(w.pixKey)}` : ''}</small></td><td>${w.blocked ? '<b class="bad">Bloqueado</b>' : w.dueBrl >= V.limit ? `Prazo até ${dt(w.deadline)}` : 'Ok'}</td>
            <td class="adt-actions">${w.usdOwed > 0 ? '<button class="btn small" type="button" data-op="usdPaid">Paguei US$</button>' : ''}${w.dueBrl > 0 ? '<button class="btn small" type="button" data-op="forgive">Perdoar R$</button>' : ''}
              <button class="btn small" type="button" data-op="${w.blocked ? 'unblock' : 'block'}">${w.blocked ? 'Desbloquear' : 'Bloquear'}</button></td></tr>`).join('')}
        </tbody></table>` : '<p class="muted">Nenhuma carteira com saldo, dívida ou bloqueio.</p>'}
        <h4>⚠ Reclamações (proteção contra golpe)</h4>
        ${(V.disputes || []).length ? `<table class="adt-table"><thead><tr><th>#</th><th>Item / valor</th><th>Vendedor (chave Pix)</th><th>Comprador</th><th>Motivo</th><th>Comprovante</th><th></th></tr></thead><tbody>
          ${V.disputes.map((x) => `<tr data-dispute="${x.id}"><td>${x.id}<br><small class="muted">${dt(x.at)}</small></td><td>${esc(x.item)}<br>${money(x.price, 'brl')}</td><td>${esc(x.seller)}<br><small>${esc(x.pixKey || '')}</small></td><td>${esc(x.buyer || '?')}<br><small class="muted">pagou: ${x.paidAt ? dt(x.paidAt) : '—'}</small></td>
            <td><small>${esc(x.reason)}</small></td><td><small>${esc(x.proof || '—')}</small></td>
            <td class="adt-actions"><button class="btn small" type="button" data-op="disputeBuyer">Pagamento ok: entregar ao comprador</button><button class="btn small" type="button" data-op="disputeSeller">Não pagou: devolver ao vendedor</button></td></tr>`).join('')}
        </tbody></table><p class="muted">Confira o comprovante com o vendedor (ID da transação, horário, valor). Vendedor que perde 2 reclamações tem o Pix desativado.</p>` : '<p class="muted">Nenhuma reclamação aberta.</p>'}
        <h4>Compras por Pix esperando o vendedor</h4>
        ${V.pix.length ? `<table class="adt-table"><thead><tr><th>Item</th><th>Valor</th><th>Vendedor</th><th>Comprador</th><th>Comprador avisou que pagou</th><th></th></tr></thead><tbody>
          ${V.pix.map((x) => `<tr data-listing="${x.id}"><td>${esc(x.item)}</td><td>${money(x.price, 'brl')}</td><td>${esc(x.seller)}</td><td>${esc(x.buyer || '?')}</td><td>${x.paidAt ? dt(x.paidAt) : 'não'}</td>
            <td class="adt-actions"><button class="btn small" type="button" data-op="pixDeliver">Entregar item</button><button class="btn small" type="button" data-op="pixRelease">Cancelar reserva</button></td></tr>`).join('')}
        </tbody></table>` : '<p class="muted">Nenhuma compra por Pix aberta.</p>'}
        <h4>Últimas vendas</h4>
        ${V.sales.length ? `<table class="adt-table"><thead><tr><th>Quando</th><th>Item</th><th>Preço</th><th>Comissão</th><th>Forma</th><th>Vendedor → comprador</th></tr></thead><tbody>
          ${V.sales.map((x) => `<tr><td>${dt(x.at)}</td><td>${esc(x.item)}</td><td>${money(x.price, x.currency)}</td><td>${money(x.fee, x.currency)}</td><td>${{ zen: 'Zen', connect: 'Stripe do vendedor', pix: 'Pix', platform: 'Seu Stripe (US$)' }[x.mode] || x.mode}</td><td>${esc(x.seller)} → ${esc(x.buyer || '?')}</td></tr>`).join('')}
        </tbody></table>` : '<p class="muted">Nenhuma venda ainda.</p>'}`;
      const post = async (body) => { try { const r = await X.api('POST', '/api/admin/market', body); V = r; draw(); msg(box, r.message); } catch (e) { msg(box, e.message, true); } };
      $('#adt-mk-find').onclick = () => post({ op: 'findAccount', username: $('#adt-mk-user').value.trim() });
      $$('[data-op]', box).forEach((b) => {
        b.onclick = () => {
          const tr = b.closest('tr'), op = b.dataset.op;
          if (op === 'usdPaid' || op === 'forgive') {
            const v = prompt(op === 'usdPaid' ? 'Quanto você pagou em dólar? (ex.: 12.50)' : 'Quanto perdoar em reais? (ex.: 5,00)');
            if (!v) return;
            const cents = Math.round(Number(String(v).replace(',', '.')) * 100);
            if (!(cents > 0)) return msg(box, 'Valor inválido.', true);
            const note = op === 'usdPaid' ? prompt('Observação (como pagou, comprovante):') || '' : '';
            return post({ op, account: tr.dataset.acc, amount: cents, note });
          }
          if (op === 'block') { const note = prompt('Motivo do bloqueio:', 'comissão do mercado não paga'); if (note === null) return; return post({ op, account: tr.dataset.acc, note }); }
          if (op === 'unblock') return post({ op, account: tr.dataset.acc });
          if (op === 'disputeBuyer' || op === 'disputeSeller') {
            if (!confirm(op === 'disputeBuyer' ? 'O pagamento foi comprovado? O item vai para o comprador e conta como reclamação perdida para o vendedor.' : 'O pagamento NÃO foi comprovado? O item volta para a vitrine do vendedor.')) return;
            return post({ op, dispute: tr.dataset.dispute });
          }
          if (op === 'pixDeliver' && !confirm('Entregar o item ao comprador e lançar a comissão para o vendedor?')) return;
          return post({ op, listing: tr.dataset.listing });
        };
      });
    };
    draw();
  }

  function mount(el, ctx) {
    X = ctx;
    el.innerHTML = `
      <details class="adm-sec adt-sec" data-sec="market"><summary><h3>💰 Mercado com dinheiro real (R$ e US$)</h3></summary><div class="adt-body"></div></details>
      <details class="adm-sec adt-sec" data-sec="invasion"><summary><h3>♛ Invasão Dourada e Box Kundun</h3></summary><div class="adt-body"></div></details>
      <details class="adm-sec adt-sec" data-sec="equip"><summary><h3>Equipamentos por classe e evolução</h3></summary><div class="adt-body"></div></details>
      <details class="adm-sec adt-sec" data-sec="vault"><summary><h3>Baú Pessoal</h3></summary><div class="adt-body"></div></details>
      <details class="adm-sec adt-sec" data-sec="arena"><summary><h3>Eventos: Chaos Castle, Devil Square e Blood Castle</h3></summary><div class="adt-body"></div></details>
      <details class="adm-sec adt-sec" data-sec="upgrade"><summary><h3>Aprimoramento +0 a +15 e Ferreiro</h3></summary><div class="adt-body"></div></details>
      <details class="adm-sec adt-sec" data-sec="chaos"><summary><h3>Chaos Machine (asas e capas)</h3></summary><div class="adt-body"></div></details>
      <details class="adm-sec adt-sec" data-sec="worldboss"><summary><h3>Boss Mundial: horários e força</h3></summary><div class="adt-body"></div></details>
      <details class="adm-sec adt-sec" data-sec="retention"><summary><h3>Retenção: jogadores ativos, D1/D7/D30 e conversão</h3></summary><div class="adt-body"></div></details>
      <details class="adm-sec adt-sec" data-sec="exphard"><summary><h3>EXP Extreme Hard: curva até o nível 1000, party e números reais</h3></summary><div class="adt-body"></div></details>
      <details class="adm-sec adt-sec" data-sec="agility"><summary><h3>Agilidade: crítico, velocidade de ataque e defesa</h3></summary><div class="adt-body"></div></details>
      <details class="adm-sec adt-sec" data-sec="excellent"><summary><h3>Opções Excellent semi-full</h3></summary><div class="adt-body"></div></details>
      <details class="adm-sec adt-sec" data-sec="drops"><summary><h3>Drops de materiais e eventos</h3></summary><div class="adt-body"></div></details>
      <details class="adm-sec adt-sec" data-sec="rules"><summary><h3>Comandos, reset e histórico ADM</h3></summary><div class="adt-body"></div></details>`;
    const fn = { market, invasion, arena, upgrade, equip, vault, chaos, worldboss, retention, agility, exphard, excellent, drops, rules };
    $$('.adt-sec', el).forEach((d) => { d.addEventListener('toggle', () => { if (d.open && !d.dataset.loaded) { d.dataset.loaded = 1; fn[d.dataset.sec]($('.adt-body', d)); } }); });
  }

  window.MUAdminTools = { mount };
})();
