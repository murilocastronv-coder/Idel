'use strict';
// Afiliados: cada conta tem o próprio link (/?ref=usuario). Quem cria conta por ele conta para o dono do link.
// - Só vale convite de IP diferente do dono do link e de IP que ainda não trouxe ninguém para ele
//   (mesma casa / mesmo wi-fi com outro celular não conta).
// - Prêmio automático quando o convidado chega ao nível QUALIFY_LEVEL: uma peça aleatória de conjunto +8 com 5 opções Excellent,
//   entregue no personagem de maior nível do dono do link (se a bolsa estiver cheia, fica guardada e chega quando ele entrar).
const db = require('./db');
const G = require('./gamedata');
const EXCELLENT = require('./excellent');

const QUALIFY_LEVEL = 50;
const REWARD_PLUS = 8, REWARD_OPTIONS = 5, REWARD_RARITY = 'rare';
const CODE_RE = /^[A-Za-z0-9_]{3,16}$/;
let W = null;
function init(world) { W = world; }

// cadastro novo: registra de quem veio (validação de IP aqui; o prêmio só sai na qualificação)
async function onRegister(account, ip, code) {
  if (!code || !CODE_RE.test(String(code))) return null;
  const ref = (await db.query('SELECT id, username FROM accounts WHERE lower(username) = lower($1)', [code])).rows[0];
  if (!ref || String(ref.id) === String(account.id)) return null;
  let status = 'valid';
  if (ip) {
    // IPs do dono do link: sessões e cadastro (audit_log)
    const own = await db.query(`SELECT 1 FROM sessions WHERE account_id = $1 AND ip = $2
      UNION ALL SELECT 1 FROM audit_log WHERE account_id = $1 AND ip = $2 LIMIT 1`, [ref.id, ip]);
    if (own.rowCount) status = 'same_ip';
    else {
      const dup = await db.query("SELECT 1 FROM referrals WHERE referrer_id = $1 AND ip = $2 AND status = 'valid' LIMIT 1", [ref.id, ip]);
      if (dup.rowCount) status = 'duplicate_ip';
    }
  } else status = 'no_ip';
  await db.query(`INSERT INTO referrals (referrer_id, referred_id, ip, status) VALUES ($1, $2, $3, $4)
    ON CONFLICT (referred_id) DO NOTHING`, [ref.id, account.id, ip || null, status]);
  return { referrer: ref.username, status };
}

// peça aleatória de conjunto que o dono do link consegue usar (o melhor conjunto até o nível dele, ou o primeiro)
function rewardBase(level) {
  const pieces = Object.entries(G.ITEM_BASES).filter(([k, b]) => b.set && !b.special && !b.seasonal && !b.chaos && ['helm', 'armor', 'pants', 'gloves', 'boots'].includes(b.slot) && EXCELLENT.hasPool(k));
  const usable = pieces.filter(([, b]) => (b.req || 1) <= Math.max(1, level));
  // sorteia entre os dois melhores conjuntos que ele já pode usar (não manda peça de couro para quem é nível alto)
  const tops = [...new Set(usable.map(([, b]) => b.req || 1))].sort((a, b) => b - a).slice(0, 2);
  const list = usable.length ? usable.filter(([, b]) => tops.includes(b.req || 1)) : pieces.sort((a, b) => (a[1].req || 1) - (b[1].req || 1)).slice(0, 5);
  return list[Math.floor(Math.random() * list.length)][0];
}

// tenta entregar os prêmios guardados de uma conta (no personagem de maior nível; online ou offline)
async function deliverPending(accountId) {
  const pend = (await db.query("SELECT id FROM referrals WHERE referrer_id = $1 AND status = 'valid' AND qualified_at IS NOT NULL AND reward_at IS NULL ORDER BY id", [accountId])).rows;
  if (!pend.length) return 0;
  const ch = (await db.query('SELECT id, name, level FROM characters WHERE account_id = $1 ORDER BY level DESC, id LIMIT 1', [accountId])).rows[0];
  if (!ch) return 0;
  let n = 0;
  for (const r of pend) {
    const base = rewardBase(ch.level);
    const options = EXCELLENT.roll(base, REWARD_OPTIONS);
    const online = W && W.players.get(String(ch.id));
    let row = null;
    if (online) row = await W.giveItemRow(online, { base, rarity: REWARD_RARITY, plus: REWARD_PLUS, options }, { src: 'Prêmio de afiliado' });
    else {
      const used = (await db.query('SELECT count(*)::int AS n FROM items WHERE character_id = $1 AND NOT equipped AND vault_no IS NULL', [ch.id])).rows[0].n;
      if (used < G.INVENTORY_SIZE) {
        row = (await db.query(`INSERT INTO items (character_id, base, rarity, plus, excellent_options) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
          [ch.id, base, REWARD_RARITY, REWARD_PLUS, JSON.stringify(options)])).rows[0];
      }
    }
    if (!row) break;   // bolsa cheia: fica guardado para a próxima entrada
    await db.query('UPDATE referrals SET reward_at = now(), reward_item = $2, reward_char_id = $3 WHERE id = $1', [r.id, base, ch.id]);
    n++;
    if (online) online.send({ type: 'log', kind: 'quest', text: `🎁 Prêmio de afiliado: ${G.ITEM_BASES[base].name} +${REWARD_PLUS} com ${options.length} opções Excellent (um amigo seu chegou ao nível ${QUALIFY_LEVEL}).` });
  }
  return n;
}

// convidado subiu de nível: no nível de qualificação o convite vale prêmio para o dono do link
async function onLevel(p) {
  if (p.level < QUALIFY_LEVEL) return;
  const { rows } = await db.query(`UPDATE referrals SET qualified_at = now() WHERE referred_id = $1 AND qualified_at IS NULL
    RETURNING referrer_id, status`, [p.accountId]);
  for (const r of rows) if (r.status === 'valid') await deliverPending(r.referrer_id);
}

// painel do dono do link
async function dashboard(account, baseUrl) {
  const { rows } = await db.query(`SELECT r.status, r.created_at, r.qualified_at, r.reward_at, r.reward_item, a.username,
      (SELECT max(level) FROM characters c WHERE c.account_id = r.referred_id)::int AS level
    FROM referrals r JOIN accounts a ON a.id = r.referred_id WHERE r.referrer_id = $1 ORDER BY r.id DESC LIMIT 200`, [account.id]);
  const mask = (u) => (u.length <= 3 ? u[0] + '**' : u.slice(0, 2) + '*'.repeat(Math.max(2, u.length - 3)) + u.slice(-1));
  const count = (f) => rows.filter(f).length;
  return {
    link: `${baseUrl}/?ref=${encodeURIComponent(account.username)}`,
    qualifyLevel: QUALIFY_LEVEL, reward: { plus: REWARD_PLUS, options: REWARD_OPTIONS },
    total: rows.length, valid: count((r) => r.status === 'valid'), invalid: count((r) => r.status !== 'valid'),
    qualified: count((r) => r.status === 'valid' && r.qualified_at), rewards: count((r) => r.reward_at),
    pending: count((r) => r.status === 'valid' && r.qualified_at && !r.reward_at),
    list: rows.slice(0, 50).map((r) => ({ user: mask(r.username), at: r.created_at, level: r.level || 0, status: r.status,
      qualified: !!r.qualified_at, reward: r.reward_item ? (G.ITEM_BASES[r.reward_item] || {}).name || r.reward_item : null })),
  };
}

module.exports = { init, onRegister, onLevel, deliverPending, dashboard, CODE_RE, QUALIFY_LEVEL };
