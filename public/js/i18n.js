// MU Idle Legends — idiomas (português / inglês)
// O jogo é escrito em português; em inglês, os textos são trocados pelo dicionário
// (window.I18N_EN). Frases com números/nomes usam padrões com {0}, {1}...
'use strict';
(function () {
  const store = (() => { try { return window.localStorage; } catch (_) { return null; } })();
  let saved = null;
  try { saved = store && store.getItem('mui_lang'); } catch (_) { /* sem armazenamento */ }
  const qs = new URLSearchParams(location.search).get('lang');
  const nav = (navigator.language || 'pt').toLowerCase();
  const lang = (qs === 'en' || qs === 'pt') ? qs : (saved === 'en' || saved === 'pt') ? saved : (nav.startsWith('pt') ? 'pt' : 'en');
  if (qs && qs !== saved) { try { store && store.setItem('mui_lang', qs); } catch (_) { /* ok */ } }

  const norm = (s) => s.replace(/\s+/g, ' ').trim();
  const exact = new Map();
  const patterns = [];
  const cache = new Map();

  function build(dict) {
    for (const [ptRaw, en] of Object.entries(dict)) {
      const pt = norm(ptRaw);
      if (!/\{(\d+|n)\}/.test(pt)) { exact.set(pt, en); continue; }
      // padrão: {0}, {1}, {n} viram grupos; a tradução usa {0}, {1}... na ordem em que aparecem no português
      const order = [];
      const re = pt.split(/(\{(?:\d+|n)\})/).map((part) => {
        const m = part.match(/^\{(\d+|n)\}$/);
        if (m) { order.push(m[1]); return '(.*?)'; }
        return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      }).join('');
      const literal = pt.replace(/\{(\d+|n)\}/g, '').length;
      patterns.push({ re: new RegExp(`^${re}$`), order, en, literal });
    }
    patterns.sort((a, b) => b.literal - a.literal);
  }

  function num(s) {
    // 1.000 → 1,000 em inglês
    return /^[+-]?\d{1,3}(\.\d{3})+$/.test(s) ? s.replace(/\./g, ',') : s;
  }

  function tr(core, depth) {
    if (exact.has(core)) return exact.get(core);
    if (depth > 6 || !/[A-Za-zÀ-ÿ]/.test(core)) return null;
    for (const p of patterns) {
      const m = core.match(p.re);
      if (!m) continue;
      const caps = m.slice(1).map((c) => {
        if (!c) return c;
        const n = num(c);
        if (n !== c) return n;
        const inner = tr(norm(c), depth + 1);
        return inner === null ? c : c.match(/^\s*/)[0] + inner + c.match(/\s*$/)[0];
      });
      // {n} na tradução = primeiro grupo; {0},{1}... = grupos pela ordem do português
      return p.en.replace(/\{(\d+|n)\}/g, (_, k) => {
        const i = p.order.indexOf(k);
        return i >= 0 ? (caps[i] ?? '') : '';
      });
    }
    return null;
  }

  function t(s) {
    if (lang === 'pt' || s === null || s === undefined) return s;
    const str = String(s);
    if (!str || !/[A-Za-zÀ-ÿ]/.test(str)) return str;
    if (cache.has(str)) return cache.get(str);
    const core = norm(str);
    const out0 = tr(core, 0);
    let out = str;
    if (out0 !== null) {
      const lead = str.match(/^\s*/)[0], trail = str.match(/\s*$/)[0];
      out = lead + out0 + trail;
    }
    if (cache.size > 6000) cache.clear();
    cache.set(str, out);
    return out;
  }

  // ---------- tradução automática da página ----------
  const done = new WeakMap(); // nó -> último texto traduzido que escrevemos
  const ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];
  function textNode(n) {
    const v = n.nodeValue;
    if (done.get(n) === v) return;
    const p = n.parentNode;
    if (p && (p.nodeName === 'SCRIPT' || p.nodeName === 'STYLE' || p.nodeName === 'TEXTAREA')) return;
    if (p && p.closest && p.closest('[data-no-i18n]')) return;
    const out = t(v);
    done.set(n, out);
    if (out !== v) n.nodeValue = out;
  }
  function elAttrs(el) {
    for (const a of ATTRS) {
      const v = el.getAttribute && el.getAttribute(a);
      if (v) { const o = t(v); if (o !== v) el.setAttribute(a, o); }
    }
    if (el.tagName === 'META' && el.getAttribute('name') === 'description') {
      const v = el.getAttribute('content'); const o = t(v); if (o !== v) el.setAttribute('content', o);
    }
  }
  function walk(root) {
    if (root.nodeType === 3) { textNode(root); return; }
    if (root.nodeType !== 1 && root.nodeType !== 9 && root.nodeType !== 11) return;
    if (root.nodeType === 1) { if (root.hasAttribute('data-no-i18n')) return; elAttrs(root); }
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    let n;
    while ((n = w.nextNode())) {
      if (n.nodeType === 3) textNode(n);
      else elAttrs(n);
    }
  }
  function start() {
    document.documentElement.lang = 'en';
    document.title = t(document.title);
    walk(document.body);
    walk(document.head);
    new MutationObserver((list) => {
      for (const m of list) {
        if (m.type === 'characterData') textNode(m.target);
        else if (m.type === 'attributes') elAttrs(m.target);
        else m.addedNodes.forEach(walk);
      }
    }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }

  // textos desenhados no canvas (nomes de monstros, avisos)
  function patchCanvas() {
    const P = CanvasRenderingContext2D.prototype;
    const fill = P.fillText, stroke = P.strokeText, measure = P.measureText;
    P.fillText = function (s, ...a) { return fill.call(this, t(s), ...a); };
    P.strokeText = function (s, ...a) { return stroke.call(this, t(s), ...a); };
    P.measureText = function (s) { return measure.call(this, t(s)); };
  }

  function setLang(l) {
    if (l !== 'pt' && l !== 'en') return;
    try { store && store.setItem('mui_lang', l); } catch (_) { /* ok */ }
    const u = new URL(location.href); u.searchParams.delete('lang');
    location.href = u.pathname + u.search + u.hash;
  }

  // botão PT/EN: qualquer elemento com [data-lang-switch]
  function wireSwitches() {
    document.querySelectorAll('[data-lang-switch]').forEach((b) => {
      b.setAttribute('data-no-i18n', '');
      b.innerHTML = `<span class="${lang === 'pt' ? 'on' : ''}">PT</span><span class="${lang === 'en' ? 'on' : ''}">EN</span>`;
      b.title = lang === 'pt' ? 'Mudar idioma para inglês' : 'Change language to Portuguese';
      b.onclick = () => setLang(lang === 'pt' ? 'en' : 'pt');
    });
  }

  window.I18N = { lang, t, setLang, locale: lang === 'en' ? 'en-US' : 'pt-BR' };
  if (lang === 'en') {
    build(window.I18N_EN || {});
    patchCanvas();
  }
  const ready = () => { wireSwitches(); if (lang === 'en') start(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready);
  else ready();
})();
