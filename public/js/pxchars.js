// Personagens em pixel art (folhas 60×60, 8 linhas = direções: S, SO, O, NO, N, NE, L, SE).
// Só muda a aparência no 2D: posição, física, colisão e combate continuam os do jogo.
(function () {
  'use strict';
  const CHARS = {
    // Fairy Elf → Fada (soco de 16 quadros: 2 socos; o quadro 0 é a pose parada)
    fairy_elf: { soco: { src: '/assets/px/fada_soco.png', n: 16, ms: 70, half: true } },
    // Dark Knight → Lutadora (soco de 8 quadros e golpe especial de 8 quadros nas habilidades)
    dark_knight: { soco: { src: '/assets/px/lutadora_soco.png', n: 8, ms: 60 }, especial: { src: '/assets/px/lutadora_especial.png', n: 8, ms: 70 } },
  };
  const FOOT_X = 30, FOOT_Y = 49, CHAR_H = 38; // ponto de apoio (pés) e altura útil do desenho
  const imgs = {};
  const load = (src) => { if (!imgs[src]) { const im = new Image(); im.src = src; imgs[src] = im; } return imgs[src]; };
  let on = true;
  try { on = localStorage.getItem('mui_px') !== '0'; } catch (_) { /* sem storage */ }
  // ângulo (y para baixo) → linha da folha
  const ROW_OF_SECTOR = [6, 7, 0, 1, 2, 3, 4, 5]; // L, SE, S, SO, O, NO, N, NE
  function dirRow(dx, dy) {
    const a = Math.atan2(dy, dx);
    const s = ((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8;
    return ROW_OF_SECTOR[s];
  }
  const PX = {
    has(cls) { return on && !!CHARS[cls]; },
    enabled() { return on; },
    set(v) { on = !!v; try { localStorage.setItem('mui_px', on ? '1' : '0'); } catch (_) { /* nada */ } },
    // golpe começou: guarda a direção do alvo e se é golpe especial
    attack(e, tx, ty, special) {
      if (!e) return;
      if (tx != null && e.rx != null) { const dx = tx - e.rx, dy = ty - e.ry; if (Math.hypot(dx, dy) > 1) e.pxRow = dirRow(dx, dy); }
      e.pxAtk = performance.now(); e.pxSpecial = !!special; e.pxHalf = !e.pxHalf;
    },
    // desenha; devolve false se não for um personagem pixel art (aí o jogo desenha como sempre)
    draw(ctx, e, cls, act, now, x, y, heightPx, dpr) {
      const C = on && CHARS[cls];
      if (!C) return false;
      const moving = (e.speed || 0) > 10 && !e.dyingAt;
      if (moving) e.pxRow = dirRow(e.vx || 0, e.vy || 0);
      if (e.pxRow == null) e.pxRow = 0;
      let A = C.soco, frame = 0, bob = 0;
      const atkAge = e.pxAtk ? now - e.pxAtk : 1e9;
      if (e.pxSpecial && C.especial && atkAge < C.especial.n * C.especial.ms) { A = C.especial; frame = Math.floor(atkAge / A.ms); }
      else if (atkAge < (C.soco.half ? C.soco.n / 2 : C.soco.n) * C.soco.ms) { frame = Math.floor(atkAge / C.soco.ms) + (C.soco.half && e.pxHalf ? C.soco.n / 2 : 0); }
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
  for (const c of Object.values(CHARS)) for (const a of Object.values(c)) load(a.src);
  window.PX = PX;
}());
