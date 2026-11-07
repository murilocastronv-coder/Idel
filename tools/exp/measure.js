'use strict';
// Mede no servidor local quantos monstros por minuto o AUTO mata e quanto EXP rende, para comparar com a simulação.
// Uso: node tools/exp/measure.js <charId> <login> <senha> <segundos> (o personagem já deve estar no mapa com AUTO ligado)
const { chromium } = require('playwright');
(async () => {
  const [charId, login, pass, secs] = process.argv.slice(2);
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 900, height: 640 } })).newPage();
  let last = null, on = false, kills = 0, exp = 0;
  p.on('websocket', (ws) => ws.on('framereceived', (f) => {
    const t = String(f.payload);
    if (t.includes('"type":"char"')) { try { last = JSON.parse(t); } catch (_) { /* parcial */ } }
    if (on && t.includes('"type":"reward"')) { try { const r = JSON.parse(t); if (r.mon) { kills++; exp += r.exp || 0; } } catch (_) { /* nada */ } }
  }));
  await p.goto('http://localhost:3077/');
  await p.evaluate(async ([l, s]) => { await fetch('/api/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-requested-with': 'mui' }, body: JSON.stringify({ login: l, username: l, password: s }) }); }, [login, pass]);
  await p.goto(`http://localhost:3077/game.html?c=${charId}&gfx=2d`);
  await p.waitForTimeout(2500);
  try { await p.getByText('Room 1', { exact: true }).click({ timeout: 3000 }); } catch (_) { /* sem salas */ }
  await p.waitForTimeout(15000);
  on = true;
  const t0 = Date.now();
  await p.waitForTimeout(Number(secs) * 1000);
  on = false;
  console.log(JSON.stringify({ kills, exp, secs: (Date.now() - t0) / 1000, level: last && last.level, dmg: last && last.dmg, atkMs: last && last.atkMs }));
  await b.close();
})();
