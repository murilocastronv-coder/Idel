// Personagens em pixel art (folhas 60×60, 8 linhas = direções: S, SO, O, NO, N, NE, L, SE).
// Só muda a aparência no 2D: posição, física, colisão e combate continuam os do jogo.
(function () {
  'use strict';
  const PXSET = {
    // Fairy Elf → Fada (soco de 16 quadros: 2 socos; o quadro 0 é a pose parada)
    fairy_elf: { soco: { src: '/assets/px/fada_soco.png', n: 16, ms: 70, half: true } },
    // Dark Knight → Lutadora (soco de 8 quadros e golpe especial de 8 quadros nas habilidades)
    // golpes normais alternam o soco e as duas metades do combo de 16 quadros
    dark_knight: { run: { src: '/assets/px/lutadora_corre.png', n: 8 }, soco: { src: '/assets/px/lutadora_soco.png', n: 8, ms: 60 }, combo: { src: '/assets/px/lutadora_combo.png', n: 16, ms: 55, half: true }, especial: { src: '/assets/px/lutadora_especial.png', n: 8, ms: 70 } },
  };
  // Heróis do Aether Reborn (Test1): folhas 80×80, 10 colunas = 4 quadros parado (respirando) + 6 andando
  const AE = (cls) => ({ hero: { src: `/assets/px/heroi_${cls}.png`, idle: 4, walk: 6, fw: 80, foot: [40, 78], h: 74 } });
  const AETHER = { dark_knight: AE('dark_knight'), dark_wizard: AE('dark_wizard'), fairy_elf: AE('fairy_elf'), magic_gladiator: AE('magic_gladiator'), dark_lord: AE('dark_lord') };
  const WINGS = '/assets/px/asas_douradas.png';
  const FOOT_X = 30, FOOT_Y = 49, CHAR_H = 38; // ponto de apoio (pés) e altura útil do desenho
  const imgs = {};
  const load = (src) => { if (!imgs[src]) { const im = new Image(); im.src = src; imgs[src] = im; } return imgs[src]; };
  // modo visual: 'aether' (heróis novos), '1' (Fada e Lutadora) ou '0' (clássico)
  let mode = 'aether';
  try { const v = localStorage.getItem('mui_px'); if (v === '0' || v === '1' || v === 'aether') mode = v; } catch (_) { /* sem storage */ }
  let on = mode !== '0';
  const setOf = () => (mode === 'aether' ? AETHER : mode === '1' ? PXSET : {});
  // ângulo (y para baixo) → linha da folha
  const ROW_OF_SECTOR = [6, 7, 0, 1, 2, 3, 4, 5]; // L, SE, S, SO, O, NO, N, NE
  function dirRow(dx, dy) {
    const a = Math.atan2(dy, dx);
    const s = ((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8;
    return ROW_OF_SECTOR[s];
  }
  const PX = {
    has(cls) { return !!setOf()[cls]; },
    enabled() { return on; },
    mode() { return mode; },
    set(v) { mode = v === true ? '1' : v === false ? '0' : String(v); if (!['0', '1', 'aether'].includes(mode)) mode = 'aether'; on = mode !== '0'; try { localStorage.setItem('mui_px', mode); } catch (_) { /* nada */ } },
    // Asas Angelicais Douradas (item): atrás do herói, ou na frente quando ele está de costas
    wings(ctx, e, x, y, heightPx, front) {
      const im = load(WINGS);
      if (!im.complete || !im.naturalWidth) return;
      const row = e.pxRow == null ? 0 : e.pxRow;
      const back = row >= 3 && row <= 5; // NO, N, NE: vemos as costas, asas na frente
      if (!!front !== back) return;
      const side = row === 2 || row === 6;
      const k = heightPx / 56;
      const w = 64 * k * (side ? 0.55 : 1), h = 64 * k;
      const flap = Math.sin(performance.now() / 260 + (e.phase || 0)) * 2 * k;
      ctx.save(); ctx.imageSmoothingEnabled = false;
      if (e.dyingAt) ctx.globalAlpha = 0.4;
      ctx.drawImage(im, Math.round(x - w / 2), Math.round(y - heightPx * 0.95 - h * 0.35 + flap), Math.round(w), Math.round(h));
      ctx.restore();
    },
    // golpe começou: guarda a direção do alvo e se é golpe especial
    attack(e, tx, ty, special) {
      if (!e) return;
      if (tx != null && e.rx != null) { const dx = tx - e.rx, dy = ty - e.ry; if (Math.hypot(dx, dy) > 1) e.pxRow = dirRow(dx, dy); }
      e.pxAtk = performance.now(); e.pxSpecial = !!special; e.pxHalf = !e.pxHalf; e.pxN = (e.pxN || 0) + 1;
    },
    // desenha; devolve false se não for um personagem pixel art (aí o jogo desenha como sempre)
    draw(ctx, e, cls, act, now, x, y, heightPx, dpr) {
      const C = setOf()[cls];
      if (!C) return false;
      if (C.hero) return drawHero(ctx, e, C.hero, now, x, y, heightPx);
      const moving = (e.speed || 0) > 10 && !e.dyingAt;
      if (moving) e.pxRow = dirRow(e.vx || 0, e.vy || 0);
      if (e.pxRow == null) e.pxRow = 0;
      let A = C.soco, frame = 0, bob = 0;
      const atkAge = e.pxAtk ? now - e.pxAtk : 1e9;
      if (e.pxSpecial && C.especial && atkAge < C.especial.n * C.especial.ms) { A = C.especial; frame = Math.floor(atkAge / A.ms); }
      else if (C.combo && (e.pxN || 0) % 3 !== 0 && atkAge < (C.combo.n / 2) * C.combo.ms) { A = C.combo; frame = Math.floor(atkAge / A.ms) + (e.pxN % 3 === 2 ? A.n / 2 : 0); }
      else if (atkAge < (C.soco.half ? C.soco.n / 2 : C.soco.n) * C.soco.ms) { frame = Math.floor(atkAge / C.soco.ms) + (C.soco.half && e.pxHalf ? C.soco.n / 2 : 0); }
      else if (moving && C.run) { A = C.run; frame = Math.floor((now + (e.phase || 0)) / ((e.speed || 0) > 65 ? 77 : 133)) % C.run.n; } // corrida (andar = mais devagar)
      else if (moving) { const run = (e.speed || 0) > 65; bob = Math.abs(Math.sin((now + (e.phase || 0)) / (run ? 77 : 133) * Math.PI / 2)) * 1.6; }
      else bob = (Math.sin((now + (e.phase || 0)) / 700) + 1) * 0.5; // parada: flutua 1 px bem devagar
      const im = load(A.src);
      if (!im.complete || !im.naturalWidth) { e.pxTop = null; return true; }
      const k = Math.max(1, Math.round(heightPx / CHAR_H)); // escala inteira = pixels nítidos
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      if (e.dyingAt) { const d = Math.min(1, (now - e.dyingAt) / 600); ctx.globalAlpha = 1 - d * 0.75; }
      const dx = Math.round(x - FOOT_X * k), dy = Math.round(y - FOOT_Y * k - bob * k);
      ctx.drawImage(im, frame * 60, e.pxRow * 60, 60, 60, dx, dy, 60 * k, 60 * k);
      e.pxTop = dy + 10 * k; // topo da cabeça (para a barra de vida e o nome)
      ctx.restore();
      return true;
    },
  };
  // herói Aether: andando = 6 quadros; parado = respiração de 4 quadros; golpe = avanço curto na direção do alvo
  function drawHero(ctx, e, A, now, x, y, heightPx) {
    const moving = (e.speed || 0) > 10 && !e.dyingAt;
    if (moving) e.pxRow = dirRow(e.vx || 0, e.vy || 0);
    if (e.pxRow == null) e.pxRow = 0;
    const run = (e.speed || 0) > 65;
    let col, lunge = 0;
    const atkAge = e.pxAtk ? now - e.pxAtk : 1e9;
    if (moving) col = A.idle + Math.floor((now + (e.phase || 0)) / (run ? 90 : 140)) % A.walk;
    else col = Math.floor((now + (e.phase || 0)) / 220) % A.idle;
    if (atkAge < 260) lunge = Math.sin(atkAge / 260 * Math.PI) * (e.pxSpecial ? 5 : 3);
    const im = load(A.src);
    if (!im.complete || !im.naturalWidth) { e.pxTop = null; return true; }
    const k = heightPx * 1.15 / A.h;
    const DIRV = [[0, 1], [-0.7, 0.7], [-1, 0], [-0.7, -0.7], [0, -1], [0.7, -0.7], [1, 0], [0.7, 0.7]][e.pxRow];
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    if (e.dyingAt) { const d = Math.min(1, (now - e.dyingAt) / 600); ctx.globalAlpha = 1 - d * 0.75; }
    if (e.pxSpecial && atkAge < 400) ctx.filter = `brightness(${1.35 - atkAge / 400 * 0.35})`;
    const dx = Math.round(x - A.foot[0] * k + DIRV[0] * lunge * k), dy = Math.round(y - A.foot[1] * k + DIRV[1] * lunge * k * 0.5);
    ctx.drawImage(im, col * A.fw, e.pxRow * A.fw, A.fw, A.fw, dx, dy, Math.round(A.fw * k), Math.round(A.fw * k));
    e.pxTop = dy + (A.foot[1] - A.h) * k;
    ctx.restore();
    return true;
  }
  for (const set of [PXSET, AETHER]) for (const c of Object.values(set)) for (const a of Object.values(c)) load(a.src);
  load(WINGS);
  window.PX = PX;
}());
