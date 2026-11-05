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
  const lerp = (a, b, k) => a + (b - a) * k;
  // duração do golpe por arma (ms): o de poder é mais longo
  const DUR = { sword: [420, 560], staff: [520, 660], bow: [560, 680] };
  // interpola entre quadros-chave [p, f(avanço), lift(sobe), rot, sx, sy, col]
  function keyed(K, p) {
    let a = K[0], b = K[K.length - 1];
    for (let i = 0; i < K.length - 1; i++) if (p >= K[i][0] && p <= K[i + 1][0]) { a = K[i]; b = K[i + 1]; break; }
    const k = ease(b[0] === a[0] ? 1 : (p - a[0]) / (b[0] - a[0]));
    return { f: lerp(a[1], b[1], k), lift: lerp(a[2], b[2], k), rot: lerp(a[3], b[3], k), sx: lerp(a[4], b[4], k), sy: lerp(a[5], b[5], k), col: k < 0.5 ? a[6] : b[6] };
  }
  const W = IDLE; // primeiro quadro de caminhada (passo)
  const KEYS = {
    // espada: ergue a lâmina inclinando para trás → passo à frente com corte diagonal → volta
    sword: [[0, 0, 0, 0, 1, 1, 0], [0.28, -3, 1, -0.22, 0.97, 1.04, W + 1], [0.44, 8, 0, 0.3, 1.07, 0.95, W + 3], [0.6, 7, 0, 0.24, 1.04, 0.97, W + 3], [1, 0, 0, 0, 1, 1, 0]],
    // cajado: levanta o cajado e o corpo sobe → aponta para frente descendo → volta
    staff: [[0, 0, 0, 0, 1, 1, 0], [0.38, -1.5, 4, -0.08, 0.96, 1.08, 0], [0.52, 5, 0, 0.14, 1.06, 0.94, W + 3], [0.7, 4, 0, 0.1, 1.03, 0.97, W + 3], [1, 0, 0, 0, 1, 1, 0]],
    // arco: firma os pés e puxa a corda devagar → solta com o tranco para trás → volta
    bow: [[0, 0, 0, 0, 1, 1, 0], [0.5, -1.5, 0, -0.07, 1.02, 0.99, 0], [0.56, -1.5, 0, -0.07, 1.02, 0.99, 0], [0.64, -4, 0, -0.14, 0.97, 1.02, 0], [1, 0, 0, 0, 1, 1, 0]],
  };
  function pose(kind, age, row, special) {
    const dur = DUR[kind][special ? 1 : 0];
    const p = age / dur;
    if (!(p >= 0 && p < 1)) return null;
    const v = DIR_V[row];
    // de frente/de costas não há lado para inclinar: usa uma leve torção fixa para o golpe aparecer
    const lat = Math.abs(v[0]) > 0.1 ? v[0] : (row === 0 ? 0.6 : -0.6);
    const q = keyed(KEYS[kind], p);
    const amp = special ? 1.35 : 1;
    return { kind, p, dur, f: q.f * amp, lift: q.lift * amp, rot: q.rot * lat * amp, sx: q.sx, sy: q.sy, col: q.col };
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

  // círculo mágico do cajado: no chão, sob os pés, antes do herói
  function drawGround(ctx, cls, P, sc, now, special) {
    const col = TRAIL[cls] || '255,255,255', p = P.p;
    if (p <= 0.08) return;
    const a = Math.min(1, (p - 0.08) / 0.2) * (p > 0.8 ? (1 - p) / 0.2 : 1), R = (special ? 26 : 20) * sc;
    ctx.strokeStyle = `rgba(${col},${0.8 * a})`; ctx.lineWidth = 1.5 * sc;
    ctx.beginPath(); ctx.ellipse(0, 0, R, R * 0.38, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(0, 0, R * 0.7, R * 0.27, 0, 0, Math.PI * 2); ctx.stroke();
    for (let i = 0; i < 8; i++) { const an = i / 8 * Math.PI * 2 + now / 400; ctx.fillStyle = `rgba(${col},${a})`; ctx.fillRect(Math.round(Math.cos(an) * R * 0.85), Math.round(Math.sin(an) * R * 0.32), Math.ceil(sc * 1.6), Math.ceil(sc * 1.6)); }
  }

  // efeitos da arma, desenhados no referencial dos pés (já inclinado junto com o corpo)
  function drawWeapon(ctx, cls, row, P, sc, now, special, top) {
    const v = DIR_V[row], col = TRAIL[cls] || '255,255,255', p = P.p;
    const fx = Math.abs(v[0]) > 0.1 ? Math.sign(v[0]) : (row === 0 ? 1 : -1); // lado do golpe na tela
    const chest = (top - FOOT_Y + BODY * 0.42) * sc;
    ctx.save();
    if (P.kind === 'sword') {
      // lâmina varrendo do alto atrás até embaixo à frente, com rastro em leque
      const t = (p - 0.26) / 0.34;
      if (t > 0 && t < 1.25) {
        const pivX = fx * 4 * sc, pivY = chest;
        const len = (special ? 34 : 28) * sc;
        const ang = (k) => fx > 0 ? lerp(-2.4, 0.9, k) : lerp(-0.74, -4.04, k);
        const tk = Math.min(1, t);
        const fade = t > 1 ? 1 - (t - 1) / 0.25 : 1;
        // rastro (vários fantasmas da lâmina)
        for (let i = 7; i >= 1; i--) {
          const k = Math.max(0, tk - i * 0.06); const a = ang(k);
          ctx.strokeStyle = `rgba(${col},${0.12 * (8 - i) / 7 * fade * 1.6})`; ctx.lineWidth = 5 * sc;
          ctx.beginPath(); ctx.moveTo(pivX + Math.cos(a) * len * 0.35, pivY + Math.sin(a) * len * 0.35 * 0.7); ctx.lineTo(pivX + Math.cos(a) * len, pivY + Math.sin(a) * len * 0.7); ctx.stroke();
        }
        // arco brilhante do corte
        ctx.beginPath();
        const steps = 14;
        for (let i = 0; i <= steps; i++) { const a = ang(tk * i / steps); const x = pivX + Math.cos(a) * len * 1.02, y = pivY + Math.sin(a) * len * 0.72; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
        ctx.strokeStyle = `rgba(255,255,255,${0.95 * fade})`; ctx.lineWidth = 2.2 * sc; ctx.stroke();
        ctx.strokeStyle = `rgba(${col},${0.7 * fade})`; ctx.lineWidth = 5 * sc; ctx.globalAlpha = 0.6; ctx.stroke(); ctx.globalAlpha = 1;
        // a lâmina
        const a = ang(tk);
        ctx.strokeStyle = `rgba(235,245,255,${fade})`; ctx.lineWidth = 2.5 * sc;
        ctx.beginPath(); ctx.moveTo(pivX + Math.cos(a) * len * 0.3, pivY + Math.sin(a) * len * 0.3 * 0.7); ctx.lineTo(pivX + Math.cos(a) * len, pivY + Math.sin(a) * len * 0.7); ctx.stroke();
        if (t > 0.55 && t < 1) { // faíscas no fim do corte
          for (let i = 0; i < 5; i++) { const an = a + (i - 2) * 0.25; ctx.fillStyle = `rgba(255,240,200,${1 - t})`; ctx.fillRect(Math.round(pivX + Math.cos(an) * len * (1.1 + t * 0.3)), Math.round(pivY + Math.sin(an) * len * 0.7 * (1.1 + t * 0.3)), Math.ceil(sc * 1.5), Math.ceil(sc * 1.5)); }
        }
      }
    } else if (P.kind === 'staff') {
      // ponta do cajado acima da cabeça acumulando energia, depois o disparo à frente e o círculo mágico no chão
      const tipUp = { x: fx * 10 * sc, y: (top - FOOT_Y - 4) * sc };
      const tipFw = { x: v[0] * 22 * sc + fx * 4 * sc, y: chest + v[1] * 8 * sc };
      const charge = Math.min(1, p / 0.4), shot = p > 0.45 ? Math.min(1, (p - 0.45) / 0.4) : 0;
      const at = shot ? { x: lerp(tipUp.x, tipFw.x, Math.min(1, shot * 3)), y: lerp(tipUp.y, tipFw.y, Math.min(1, shot * 3)) } : tipUp;
      const R = (special ? 10 : 7) * sc * (0.4 + charge * 0.8) * (shot ? 1 + shot * 0.8 : 1);
      const al = shot ? 1 - shot : 1;
      const g = ctx.createRadialGradient(at.x, at.y, 0, at.x, at.y, R);
      g.addColorStop(0, `rgba(255,255,255,${0.95 * al})`); g.addColorStop(0.45, `rgba(${col},${0.75 * al})`); g.addColorStop(1, `rgba(${col},0)`);
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(at.x, at.y, R, 0, Math.PI * 2); ctx.fill();
      if (!shot) for (let i = 0; i < 6; i++) { // faíscas sendo sugadas para a ponta
        const an = i / 6 * Math.PI * 2 + now / 90, r = R * (2.2 - charge * 1.2);
        ctx.fillStyle = `rgba(${col},${charge})`; ctx.fillRect(Math.round(at.x + Math.cos(an) * r), Math.round(at.y + Math.sin(an) * r * 0.8), Math.ceil(sc * 1.4), Math.ceil(sc * 1.4));
      }
      if (shot > 0 && shot < 1) { // onda do disparo
        ctx.strokeStyle = `rgba(${col},${1 - shot})`; ctx.lineWidth = 2 * sc;
        ctx.beginPath(); ctx.ellipse(tipFw.x + v[0] * 10 * sc * shot, tipFw.y + v[1] * 5 * sc * shot, 6 * sc + shot * 16 * sc, (6 * sc + shot * 16 * sc) * 0.6, 0, 0, Math.PI * 2); ctx.stroke();
      }
    } else {
      // arco: arco aparece na mão, a corda é puxada com a flecha encaixada, solta, a corda vibra e a flecha voa
      const hx = v[0] * 12 * sc, hy = chest + v[1] * 5 * sc;
      const nx = -v[1], ny = v[0]; // perpendicular (eixo do arco)
      const half = 11 * sc;
      const pull = p < 0.5 ? ease(p / 0.5) : p < 0.56 ? 1 : 0;
      const vib = p >= 0.56 && p < 0.8 ? Math.sin((p - 0.56) * 120) * (1 - (p - 0.56) / 0.24) * 2.5 * sc : 0;
      const vis = p < 0.85 ? 1 : (1 - p) / 0.15;
      // madeira do arco
      ctx.strokeStyle = `rgba(160,110,60,${vis})`; ctx.lineWidth = 2 * sc;
      ctx.beginPath(); ctx.moveTo(hx + nx * half, hy + ny * half * 0.8);
      ctx.quadraticCurveTo(hx + v[0] * 7 * sc, hy + v[1] * 4 * sc, hx - nx * half, hy - ny * half * 0.8); ctx.stroke();
      // corda (puxada para trás)
      const sx = hx - v[0] * 13 * sc * pull + nx * vib, sy = hy - v[1] * 6 * sc * pull + ny * vib;
      ctx.strokeStyle = `rgba(240,240,220,${0.9 * vis})`; ctx.lineWidth = Math.max(1, 0.8 * sc);
      ctx.beginPath(); ctx.moveTo(hx + nx * half, hy + ny * half * 0.8); ctx.lineTo(sx, sy); ctx.lineTo(hx - nx * half, hy - ny * half * 0.8); ctx.stroke();
      if (p < 0.56 && p > 0.05) { // flecha encaixada, com brilho crescendo
        ctx.strokeStyle = 'rgba(230,220,190,1)'; ctx.lineWidth = 1.4 * sc;
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(hx + v[0] * 10 * sc, hy + v[1] * 5 * sc); ctx.stroke();
        ctx.fillStyle = `rgba(${col},${pull})`; ctx.beginPath(); ctx.arc(hx + v[0] * 10 * sc, hy + v[1] * 5 * sc, (2 + pull * (special ? 4 : 2.5)) * sc, 0, Math.PI * 2); ctx.fill();
      }
      if (p >= 0.56) { // flecha voando com rastro
        const fly = Math.min(1, (p - 0.56) / 0.3), d = (special ? 90 : 70) * sc * fly;
        const ax = hx + v[0] * (10 * sc + d), ay = hy + v[1] * (5 * sc + d * 0.5);
        const a = 1 - Math.max(0, fly - 0.7) / 0.3;
        ctx.strokeStyle = `rgba(${col},${0.55 * a})`; ctx.lineWidth = 4 * sc;
        ctx.beginPath(); ctx.moveTo(ax - v[0] * 26 * sc, ay - v[1] * 13 * sc); ctx.lineTo(ax, ay); ctx.stroke();
        ctx.strokeStyle = `rgba(255,255,255,${a})`; ctx.lineWidth = 1.5 * sc;
        ctx.beginPath(); ctx.moveTo(ax - v[0] * 12 * sc, ay - v[1] * 6 * sc); ctx.lineTo(ax, ay); ctx.stroke();
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
    const P = pose(WEAPON[o.cls] || 'sword', o.atkAge, row, o.special);
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
    if (P && P.kind === 'staff') { ctx.save(); ctx.translate(Math.round(o.x), Math.round(o.y)); drawGround(ctx, o.cls, P, sc, now, o.special); ctx.restore(); }
    // tudo no referencial dos pés: herói e asas se movem juntos
    ctx.translate(Math.round(o.x + (P ? v[0] * P.f * sc : 0)), Math.round(o.y + (P ? v[1] * P.f * sc * 0.5 - P.lift * sc : 0)));
    if (P) { ctx.rotate(P.rot); ctx.scale(P.sx, P.sy); }
    if (o.wings && !back) drawWings(ctx, o.wings, row, top, sc, now, o.phase);
    if (P && o.special && P.p < 0.6) ctx.filter = `brightness(${1.35 - P.p / 0.6 * 0.35})`;
    // o círculo mágico do cajado fica no chão, atrás do herói
    ctx.drawImage(im, col * FW, row * FW, FW, FW, Math.round(-FOOT_X * sc), Math.round(-FOOT_Y * sc), Math.round(FW * sc), Math.round(FW * sc));
    ctx.filter = 'none';
    if (o.wings && back) drawWings(ctx, o.wings, row, top, sc, now, o.phase);
    if (P) drawWeapon(ctx, o.cls, row, P, sc, now, o.special, top);
    ctx.restore();
    return o.y + (top - FOOT_Y) * sc;
  }

  window.HeroAnim = { draw, FW, IDLE, WALK, BODY, FOOT_X, FOOT_Y, WEAPON };
}());
