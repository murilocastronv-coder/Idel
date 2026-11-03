'use strict';
// RESET STATUS: devolve os pontos distribuídos em Força, Agilidade, Vitalidade e Energia (e Comando do Dark Lord)
// para os pontos livres. 1ª vez por personagem é grátis; depois consome 1 item Reset Status por uso.
// Tudo é feito no servidor, numa transação: a marca do grátis (ou o item) e os novos atributos são gravados juntos.
const db = require('./db');
const G = require('./gamedata');

const ITEM = 'reset_status';
const STATS = ['str', 'agi', 'vit', 'ene', 'cmd'];

function preview(p) {
  const base = G.CLASSES[p.cls].base;
  let back = 0;
  for (const k of STATS) {
    if (k === 'cmd' && p.cls !== 'dark_lord') continue;
    back += Math.max(0, (p.stats[k] || 0) - (base[k] || 0));
  }
  return back;
}
const itemCount = (p) => p.items.filter((i) => i.base === ITEM && !i.equipped).reduce((a, i) => a + (Number(i.qty) || 1), 0);

async function info(p) {
  const used = (await db.query('SELECT free_stat_reset_used FROM characters WHERE id = $1', [p.charId])).rows[0];
  p.send({ type: 'resetStatus', free: !(used && used.free_stat_reset_used), items: itemCount(p), points: preview(p) });
}

async function use(world, p) {
  const say = (t, ok) => p.send({ type: 'resetStatusResult', ok: !!ok, text: t });
  if (p.trade) return say('Termine a troca antes de resetar os atributos.');
  const back = preview(p);
  if (back <= 0) { say('Você não tem pontos distribuídos para resetar.'); return info(p); }
  const base = G.CLASSES[p.cls].base;
  const next = { ...p.stats };
  for (const k of STATS) { if (k === 'cmd' && p.cls !== 'dark_lord') continue; if ((next[k] || 0) > (base[k] || 0)) next[k] = base[k] || 0; }
  const free = p.free + back;
  const settings = { ...p.settings, autoStats: false }; // senão a distribuição automática gastaria os pontos na hora
  let kind = null, stack = null;
  try {
    await db.tx(async (q) => {
      const f = await q('UPDATE characters SET free_stat_reset_used = TRUE WHERE id = $1 AND NOT free_stat_reset_used RETURNING id', [p.charId]);
      if (f.rows[0]) kind = 'free';
      else {
        // consome exatamente 1 unidade, com trava na linha (dois pedidos ao mesmo tempo não usam o mesmo item)
        stack = p.items.filter((i) => i.base === ITEM && !i.equipped).sort((a, b) => (Number(a.qty) || 1) - (Number(b.qty) || 1))[0];
        if (!stack) throw new Error('sem-item');
        const cur = (await q('SELECT qty FROM items WHERE id = $1 AND character_id = $2 AND base = $3 AND vault_no IS NULL FOR UPDATE', [stack.id, p.charId, ITEM])).rows[0];
        if (!cur) throw new Error('sem-item');
        if (Number(cur.qty) > 1) await q('UPDATE items SET qty = qty - 1 WHERE id = $1 RETURNING id', [stack.id]);
        else await q('DELETE FROM items WHERE id = $1 RETURNING id', [stack.id]);
        stack.newQty = Number(cur.qty) - 1;
        kind = 'item';
      }
      await q('UPDATE characters SET str=$2, agi=$3, vit=$4, ene=$5, cmd=$6, free_points=$7, settings=$8 WHERE id=$1 RETURNING id',
        [p.charId, next.str, next.agi, next.vit, next.ene, next.cmd || 0, free, JSON.stringify(settings)]);
      await q('INSERT INTO stat_reset_log (character_id, kind, points) VALUES ($1, $2, $3) RETURNING id', [p.charId, kind, back]);
    });
  } catch (e) {
    if (e.message === 'sem-item') say('Seu reset grátis já foi usado. Cada reset adicional custa R$ 5,00 na Loja.');
    else { console.error('[reset status]', p.name, e.message); say('Não foi possível resetar agora (nada foi alterado). Tente de novo.'); }
    return info(p);
  }
  // só depois de gravado: atualiza a memória
  if (stack) { if (stack.newQty > 0) stack.qty = stack.newQty; else p.items = p.items.filter((i) => i !== stack); }
  p.stats = next; p.free = free; p.settings = settings;
  p.recalc(); p.dirty = true;
  p.send(p.charState());
  say(`${back.toLocaleString('pt-BR')} pontos devolvidos${kind === 'free' ? ' (reset grátis usado)' : ' (1 Reset Status consumido)'}. Distribua como quiser — a distribuição automática foi desligada.`, true);
  return info(p);
}

async function paid(world, charId) {
  return world.editChar(String(charId), async (p) => {
    const back = preview(p);
    if (back <= 0) throw new Error('Este personagem não tem pontos distribuídos para resetar.');
    const base = G.CLASSES[p.cls].base, next = { ...p.stats };
    for (const k of STATS) if ((k !== 'cmd' || p.cls === 'dark_lord') && (next[k] || 0) > (base[k] || 0)) next[k] = base[k] || 0;
    const free = p.free + back, settings = { ...p.settings, autoStats: false };
    await db.tx(async (q) => {
      const row = await q('SELECT free_stat_reset_used FROM characters WHERE id=$1 FOR UPDATE', [p.charId]);
      if (!row.rows[0]) throw new Error('Personagem não encontrado.');
      if (!row.rows[0].free_stat_reset_used) throw new Error('O primeiro reset é grátis; use-o no painel Herói antes de comprar outro.');
      await q('UPDATE characters SET str=$2, agi=$3, vit=$4, ene=$5, cmd=$6, free_points=$7, settings=$8 WHERE id=$1 RETURNING id',
        [p.charId, next.str, next.agi, next.vit, next.ene, next.cmd || 0, free, JSON.stringify(settings)]);
      await q('INSERT INTO stat_reset_log (character_id, kind, points) VALUES ($1, $2, $3) RETURNING id', [p.charId, 'paid', back]);
    });
    p.stats = next; p.free = free; p.settings = settings; p.recalc(); p.dirty = true;
    return { points: back };
  });
}
function act(world, p, msg) {
  if (msg.action === 'use') return use(world, p);
  return info(p);
}

module.exports = { act, paid, ITEM };
