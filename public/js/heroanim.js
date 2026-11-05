// Animação dos heróis Aether (folhas 80×80: 4 quadros parado + 6 andando, 8 direções).
// Golpe: preparação (recua e abaixa) → ataque (avança, inclina e estica) → volta, com rastro da arma.
// Asas: presas nos ombros, seguindo o corpo quadro a quadro (inclusive durante o golpe).
(function () {
  'use strict';
  const FW = 80, IDLE = 4, WALK = 6, FOOT_X = 40, FOOT_Y = 78, BODY = 74;
  const DIR_V = [[0, 1], [-0.7071, 0.7071], [-1, 0], [-0.7071, -0.7071], [0, -1], [0.7071, -0.7071], [1, 0], [0.7071, 0.7071]];
  // arma de cada classe: espada (arco cortante), cajado (explosão na ponta) ou arco (corda + flecha)
  const WEAPON = { dark_knight: 'sword', magic_gladiator: 'sword', dark_lord: 'staff', dark_wizard: 'staff', fairy_elf: 'bow' };
  const TRAIL = { dark_knight: '255,90,80', magic_gladiator: '205,140,255', dark_lord: '235,200,110', dark_wizard: '120,210,255', fairy_elf: '130,255,170' };
  const tops = new Map(); // imagem → [linha][coluna] = topo da cabeça (px da folha)

  function topsOf(im) {
    if (tops.has(im)) return tops.get(im);
    let t = null;
    try {
      const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight;
      const g = c.getContext('2d'); g.drawImage(im, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height).data, cols = Math.floor(c.width / FW);
      t = [];
      for (let r = 0; r < 8; r++) {
        t[r] = [];
        for (let k = 0; k < cols; k++) {
          let top = FOOT_Y - BODY;
          scan: for (let y = 0; y < FW; y++) for (let x = 16; x < 64; x++) if (d[((r * FW + y) * c.width + k * FW + x) * 4 + 3] > 40) { top = y; break scan; }
          t[r][k] = top;
        }
      }
    } catch (_) { t = null; }
    tops.set(im, t);
    return t;
  }

  const ease = (v) => v * v * (3 - 2 * v);
  // pose do golpe: deslocamento (px da folha), inclinação, escala e quadro usado
  function pose(age, dur, row, special) {
    const p = age / dur;
    if (!(p >= 0 && p < 1)) return null;
    const v = DIR_V[row], lat = v[0];
    const reach = special ? 9 : 6;
    let f, rot, sx, sy, col;
    if (p < 0.3) { const k = ease(p / 0.3); f = -2.5 * k; rot = -0.11 * lat * k; sx = 1 + 0.03 * k; sy = 1 - 0.05 * k; col = IDLE + 1; }
    else if (p < 0.5) { const k = ease((p - 0.3) / 0.2); f = -2.5 + (reach + 2.5) * k; rot = (-0.11 + 0.27 * k) * lat; sx = 1.03 - 0.07 * k; sy = 0.95 + 0.1 * k; col = IDLE + 3; }
    else { const k = ease((p - 0.5) / 0.5); f = reach * (1 - k); rot = 0.16 * lat * (1 - k); sx = 0.96 + 0.04 * k; sy = 1.05 - 0.05 * k; col = k < 0.5 ? IDLE + 3 : 0; }
    return { p, f, rot, sx, sy, col, strike: p >= 0.3 && p < 0.75 ? (p - 0.3) / 0.45 : -1 };
  }

  function drawWings(ctx, wi, row, top, sc, now, phase) {
    if (!wi || !wi.complete || !wi.naturalWidth) return;
    const v = DIR_V[row];
    const side = row === 2 || row === 6, diag = row % 2 === 1;
    const ws = sc * 0.82;
    const flap = 1 + Math.sin(now / 320 + (phase || 0)) * 0.05; // bate as asas sem se soltar das costas
    const w = 62 * ws * (side ? 0.6 : diag ? 0.82 : 1) * flap, h = 44 * ws;
    const shoulderY = (top - FOOT_Y + (BODY * 0.3)) * sc; // ombros: 30% abaixo do topo da cabeça
    const backX = -v[0] * (side ? 7 : diag ? 4 : 0) * sc; // nas costas: para trás de onde ele olha
    ctx.drawImage(wi, 1, 11, 62, 44, Math.round(backX - w / 2), Math.round(shoulderY - h * 0.52), Math.round(w), Math.round(h));
  }

  function drawTrail(ctx, cls, row, P, sc, now, special) {
    const t = P.strike; if (t < 0) return;
    const v = DIR_V[row], kind = WEAPON[cls] || 'sword', col = TRAIL[cls] || '255,255,255';
    const a = Math.sin(t * Math.PI);
    const hx = v[0] * 14 * sc, hy = (-BODY * 0.42 + v[1] * 8) * sc; // mão/arma à frente do peito
    ctx.save();
    if (kind === 'sword') {
      const ang = Math.atan2(v[1] * 0.55, v[0] || 0.0001);
      const r = (special ? 30 : 24) * sc;
      const a0 = ang - 1.5 + t * 0.4, a1 = a0 + 2.6 * Math.min(1, t * 1.8);
      ctx.translate(hx * 0.4, hy);
      ctx.scale(1, 0.62);
      for (let i = 0; i < 3; i++) {
        ctx.beginPath(); ctx.arc(0, 0, r - i * 3 * sc, a0, a1);
        ctx.strokeStyle = i ? `rgba(${col},${(i === 1 ? 0.85 : 0.45) * a})` : `rgba(255,255,255,${0.95 * a})`;
        ctx.lineWidth = (i ? 4 : 2.5) * sc; ctx.stroke();
      }
    } else if (kind === 'staff') {
      const R = (special ? 13 : 9) * sc * (0.5 + t);
      const g = ctx.createRadialGradient(hx, hy - 10 * sc, 0, hx, hy - 10 * sc, R);
      g.addColorStop(0, `rgba(255,255,255,${0.95 * a})`); g.addColorStop(0.4, `rgba(${col},${0.7 * a})`); g.addColorStop(1, `rgba(${col},0)`);
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(hx, hy - 10 * sc, R, 0, Math.PI * 2); ctx.fill();
      for (let i = 0; i < 6; i++) { const an = i / 6 * Math.PI * 2 + now / 120; ctx.fillStyle = `rgba(${col},${a})`; ctx.fillRect(Math.round(hx + Math.cos(an) * R * 1.1), Math.round(hy - 10 * sc + Math.sin(an) * R * 0.6), Math.max(1, sc * 1.5), Math.max(1, sc * 1.5)); }
    } else {
      // arco: corda puxada e a flecha saindo na direção do alvo
      const pull = t < 0.45 ? t / 0.45 : 1, fly = t < 0.45 ? 0 : (t - 0.45) / 0.55;
      const bx = hx, by = hy, px = -v[0] * 6 * sc * pull, py = -v[1] * 3 * sc * pull;
      ctx.strokeStyle = `rgba(${col},${0.9 * a})`; ctx.lineWidth = Math.max(1, sc);
      ctx.beginPath(); ctx.moveTo(bx - v[1] * 9 * sc, by + v[0] * 5 * sc); ctx.lineTo(bx + px, by + py); ctx.lineTo(bx + v[1] * 9 * sc, by - v[0] * 5 * sc); ctx.stroke();
      if (fly > 0) {
        const ax = bx + v[0] * 40 * sc * fly, ay = by + v[1] * 20 * sc * fly;
        ctx.strokeStyle = `rgba(255,255,255,${1 - fly})`; ctx.lineWidth = Math.max(1, 1.5 * sc);
        ctx.beginPath(); ctx.moveTo(ax - v[0] * 12 * sc, ay - v[1] * 6 * sc); ctx.lineTo(ax, ay); ctx.stroke();
        ctx.strokeStyle = `rgba(${col},${0.6 * (1 - fly)})`; ctx.lineWidth = 3 * sc;
        ctx.beginPath(); ctx.moveTo(ax - v[0] * 22 * sc, ay - v[1] * 11 * sc); ctx.lineTo(ax - v[0] * 8 * sc, ay - v[1] * 4 * sc); ctx.stroke();
      }
    }
    ctx.restore();
  }

  // o: { im, wings, cls, row, moving, run, phase, atkAge, special, x, y, sc, now, alpha }
  // devolve o topo da cabeça na tela (para barra de vida e nome)
  function draw(ctx, o) {
    const im = o.im;
    if (!im || !im.complete || !im.naturalWidth) return null;
    const row = o.row || 0, sc = o.sc, now = o.now;
    const dur = o.special ? 520 : 400;
    const P = pose(o.atkAge, dur, row, o.special);
    let col;
    if (P) col = P.col;
    else if (o.moving) col = IDLE + Math.floor((now + (o.phase || 0)) / (o.run ? 90 : 140)) % WALK;
    else col = Math.floor((now + (o.phase || 0)) / 220) % IDLE;
    const T = topsOf(im);
    const top = T && T[row] ? T[row][col] : FOOT_Y - BODY;
    const v = DIR_V[row];
    const back = row >= 3 && row <= 5;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    if (o.alpha != null) ctx.globalAlpha = o.alpha;
    // tudo no referencial dos pés: herói e asas se movem juntos
    ctx.translate(Math.round(o.x + (P ? v[0] * P.f * sc : 0)), Math.round(o.y + (P ? v[1] * P.f * sc * 0.5 : 0)));
    if (P) { ctx.rotate(P.rot); ctx.scale(P.sx, P.sy); }
    if (o.wings && !back) drawWings(ctx, o.wings, row, top, sc, now, o.phase);
    if (P && o.special && P.p < 0.6) ctx.filter = `brightness(${1.4 - P.p / 0.6 * 0.4})`;
    ctx.drawImage(im, col * FW, row * FW, FW, FW, Math.round(-FOOT_X * sc), Math.round(-FOOT_Y * sc), Math.round(FW * sc), Math.round(FW * sc));
    ctx.filter = 'none';
    if (o.wings && back) drawWings(ctx, o.wings, row, top, sc, now, o.phase);
    if (P) drawTrail(ctx, o.cls, row, P, sc, now, o.special);
    ctx.restore();
    return o.y + (top - FOOT_Y) * sc;
  }

  window.HeroAnim = { draw, FW, IDLE, WALK, BODY, FOOT_X, FOOT_Y, WEAPON };
}());
