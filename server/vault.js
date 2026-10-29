'use strict';
// Baú Pessoal (estilo MU): itens e Zen guardados com segurança, acessados pelo NPC nas cidades.
//  • VaultManager: configuração, abrir/fechar, quem pode usar (NPC no mapa, vivo, fora de combate)
//  • VaultItemService: guardar, retirar, mover e organizar (o item continua com o mesmo id e propriedades)
//  • VaultGoldService: depositar e retirar Zen
//  • VaultDatabase: tudo em transação; o lugar do baú é único no banco (índice), nada duplica
//  • VaultSecurity: ações em fila por jogador, validação de dono/posição, anti-spam e log de tentativas
const db = require('./db');
const G = require('./gamedata');
const SET = require('./settings');

const DEFAULTS = {
  enabled: true,
  shared: false,                  // false = um baú por personagem; true = o mesmo baú para a conta
  cols: 8, rows: 15,              // 120 espaços
  maps: { lorencia: true, noria: false, devias: false },
  vaults: {
    1: { enabled: true, name: 'Baú 1', minLevel: 0, vip: false },
    2: { enabled: true, name: 'Baú 2', minLevel: 150, vip: false },
    3: { enabled: false, name: 'Baú 3 (premium)', minLevel: 0, vip: true },
  },
  maxVaultZen: 100000000000,      // 100 bilhões
  maxCharZen: 50000000000,        // limite do personagem para retirar
  allowQuestItems: false,         // itens de missão são do personagem
};
const NOS = [1, 2, 3];
const COMBAT_MS = 8000;

let H = null;
function cfg() { return SET.get('vault', DEFAULTS); }
async function init(helpers) { H = helpers; await SET.load('vault', DEFAULTS); }
const capOf = (c) => c.cols * c.rows;
const ownerOf = (p) => (cfg().shared ? 'a:' + p.accountId : 'c:' + p.charId);
const fmt = (n) => Math.round(n).toLocaleString('pt-BR');

// NPC do baú aparece neste mapa?
function npcVisible(mapId, n) { return n.kind !== 'vault' || (cfg().enabled && !!cfg().maps[mapId]); }
function atNpc(p) { return !!(p.map && cfg().maps[p.map.id] && (p.map.def.npcs || []).some((n) => n.kind === 'vault')); }
function inCombat(p) {
  const t = Math.max(p.hurtAt || 0, p.pvpHitAt || 0, p.pvpAtkAt || 0);
  return Date.now() - t < COMBAT_MS;
}

function category(base) {
  const b = G.ITEM_BASES[base] || {};
  if (b.slot === 'weapon' || b.slot === 'shield') return 'weapon';
  if (['helm', 'armor', 'pants', 'gloves', 'boots'].includes(b.slot)) return 'armor';
  if (b.slot === 'wings') return 'wings';
  if (b.slot === 'ring' || b.slot === 'necklace') return 'accessory';
  if (b.slot === 'material') return /^jewel_/.test(base) ? 'jewel' : 'material';
  return 'other';
}
const CAT_ORDER = ['weapon', 'armor', 'wings', 'accessory', 'jewel', 'material', 'other'];
const RAR_ORDER = ['ancestral', 'legendary', 'epic', 'rare', 'uncommon', 'common'];

// ---------- acesso ----------
function vaultAccess(p, no) {
  const c = cfg();
  const v = c.vaults[no];
  if (!v || !v.enabled) return 'Este baú não está disponível.';
  if (v.minLevel && p.level < v.minLevel && !(p.resets > 0)) return `${v.name} libera no nível ${v.minLevel}.`;
  if (v.vip && !p.vip()) return `${v.name} é exclusivo para VIP.`;
  return null;
}
function guard(p) {
  const c = cfg();
  if (!c.enabled) return 'O Baú Pessoal está fechado no momento.';
  if (p.dead) return 'Você está derrotado.';
  if (!atNpc(p)) return 'Vá até o Baú Pessoal na cidade para usar o baú.';
  if (inCombat(p)) return 'Você está em combate. Espere alguns segundos.';
  if (p.duel) return 'Termine o duelo antes de usar o baú.';
  return null;
}
// o item pode ir para o baú?
function storable(it) {
  const b = G.ITEM_BASES[it.base];
  if (!b) return 'Item desconhecido.';
  if (it.equipped) return 'Desequipe o item antes de guardar.';
  if (it.locked) return 'Este item está bloqueado e não pode ser guardado.';
  if (b.slot === 'quest' && !cfg().allowQuestItems) return 'Itens de missão ficam com o personagem.';
  if (b.bound) return 'Este item é vinculado ao personagem.';
  return null;
}

async function log(p, owner, no, action, o = {}) {
  try {
    await db.query(`INSERT INTO vault_log (account_id, character_id, char_name, owner, vault_no, action, item_id, item, qty, zen, detail)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
    [p ? p.accountId : null, p ? p.charId : null, p ? p.name : null, owner, no || null, action, o.itemId || null, o.item || null, o.qty || null, o.zen || null, o.detail ? String(o.detail).slice(0, 300) : null]);
  } catch (e) { console.error('[vault] log', e.message); }
}
const deny = (p, owner, no, text, detail) => { log(p, owner, no, 'denied', { detail: detail || text }); return text; };

// ---------- banco ----------
async function ensureRow(owner, accountId) {
  await db.query('INSERT INTO vaults (owner, account_id) VALUES ($1, $2) ON CONFLICT (owner) DO NOTHING RETURNING owner', [owner, accountId]);
  return (await db.query('SELECT zen, capacity FROM vaults WHERE owner = $1', [owner])).rows[0];
}
// quando o ADM troca entre baú individual e compartilhado, os itens e o Zen do outro formato vêm junto
async function adopt(p, owner) {
  const shared = owner.startsWith('a:');
  const others = shared
    ? (await db.query("SELECT 'c:' || id AS o FROM characters WHERE account_id = $1", [p.accountId])).rows.map((r) => r.o)
    : ['a:' + p.accountId];
  const strayItems = shared
    ? (await db.query("SELECT id, vault_no FROM items WHERE vault_owner = ANY(string_to_array($1, ',')) ORDER BY vault_at, id", [others.join(',')])).rows
    : (await db.query('SELECT id, vault_no FROM items WHERE vault_owner = $1 AND character_id = $2 ORDER BY vault_at, id', [others[0], p.charId])).rows;
  // Zen do outro formato: no compartilhado junta o de todos os personagens; no individual, o primeiro personagem que abrir recebe o da conta
  const strayZen = (await db.query("SELECT owner, zen FROM vaults WHERE owner = ANY(string_to_array($1, ',')) AND zen > 0", [others.join(',')])).rows;
  if (!strayItems.length && !strayZen.length) return;
  const cap = capOf(cfg());
  await db.tx(async (q) => {
    for (const it of strayItems) {
      const no = NOS.includes(it.vault_no) ? it.vault_no : 1;
      const used = new Set((await q('SELECT vault_pos FROM items WHERE vault_owner = $1 AND vault_no = $2', [owner, no])).rows.map((r) => r.vault_pos));
      let pos = 0; while (used.has(pos) && pos < cap * 4) pos++;
      // sem lugar: o item fica além da grade até ser organizado (nunca é apagado)
      await q('UPDATE items SET vault_owner = $2, vault_no = $3, vault_pos = $4 WHERE id = $1 RETURNING id', [it.id, owner, no, pos]);
    }
    for (const z of strayZen) {
      const t = await q('UPDATE vaults SET zen = 0, updated_at = now() WHERE owner = $1 AND zen = $2 RETURNING owner', [z.owner, z.zen]);
      if (!t.rows[0]) continue;
      const add = await q('UPDATE vaults SET zen = zen + $2, updated_at = now() WHERE owner = $1 RETURNING owner', [owner, z.zen]);
      if (!add.rows[0]) throw new Error('baú de destino não existe');
    }
  });
  log(p, owner, null, 'admin', { detail: `trouxe ${strayItems.length} item(ns) e ${strayZen.length} saldo(s) do formato anterior` });
}

async function load(p, no) {
  const owner = ownerOf(p);
  const row = await ensureRow(owner, p.accountId);
  const items = (await db.query('SELECT id, base, rarity, plus, qty, locked, vault_pos FROM items WHERE vault_owner = $1 AND vault_no = $2 ORDER BY vault_pos', [owner, no])).rows;
  return { owner, zen: Number(row.zen), capacity: row.capacity || capOf(cfg()), items };
}

function view(p, no, data, extra = {}) {
  const c = cfg();
  return {
    type: 'vault', no, owner: data.owner, shared: !!c.shared, cols: c.cols, rows: Math.ceil(data.capacity / c.cols), capacity: data.capacity,
    used: data.items.length, zen: data.zen, charZen: p.zen, maxVaultZen: c.maxVaultZen, maxCharZen: c.maxCharZen,
    vaults: NOS.filter((n) => c.vaults[n].enabled).map((n) => ({ no: n, name: c.vaults[n].name, locked: vaultAccess(p, n) })),
    items: data.items.map((r) => ({ ...H.publicItem(r), pos: r.vault_pos, cat: category(r.base) })),
    bagFree: G.INVENTORY_SIZE - H.bagUsed(p), atNpc: atNpc(p), ...extra,
  };
}

// ---------- ações (sempre dentro da fila do jogador: p.run) ----------
async function act(world, p, msg) {
  const r = await doAct(world, p, msg);
  if (r === SKIP) return;
  const no = NOS.includes(Number(msg.no)) ? Number(msg.no) : 1;
  p.send(p.charState());
  if (!guard(p) && !vaultAccess(p, no)) p.send(view(p, no, await load(p, no)));
}
const SKIP = Symbol('skip');
async function doAct(world, p, msg) {
  const a = String(msg.action || 'open');
  const no = NOS.includes(Number(msg.no)) ? Number(msg.no) : 1;
  const say = (ok, text) => p.send({ type: 'vaultResult', ok, text, action: a });
  const owner = ownerOf(p);
  // anti-spam: a mesma ação repetida (mesmo nonce) é ignorada
  if (msg.nonce) {
    p.vaultNonces = p.vaultNonces || [];
    if (p.vaultNonces.includes(String(msg.nonce))) return SKIP;
    p.vaultNonces.push(String(msg.nonce)); if (p.vaultNonces.length > 30) p.vaultNonces.shift();
  }
  const g = guard(p);
  if (g) { if (a !== 'open') deny(p, owner, no, g); return say(false, g); }
  const acc = vaultAccess(p, no);
  if (acc) return say(false, acc);
  try {
    if (a === 'open') {
      await ensureRow(owner, p.accountId);
      await adopt(p, owner);
    } else if (a === 'put') {
      const it = p.items.find((i) => String(i.id) === String(msg.id));
      if (!it) return say(false, deny(p, owner, no, 'Este item não está na sua bolsa.', 'put item fora da bolsa: ' + msg.id));
      const why = storable(it);
      if (why) return say(false, deny(p, owner, no, why, `${it.base}: ${why}`));
      const data = await load(p, no);
      if (data.items.length >= data.capacity) return say(false, 'O baú está cheio.');
      const used = new Set(data.items.map((r) => r.vault_pos));
      let pos = msg.pos === undefined || msg.pos === null ? -1 : Math.floor(Number(msg.pos));
      if (pos >= 0) {
        if (!(pos < data.capacity)) return say(false, deny(p, owner, no, 'Posição inválida.', 'pos ' + msg.pos));
        if (used.has(pos)) return say(false, 'Este espaço já está ocupado.');
      } else { pos = 0; while (used.has(pos)) pos++; }
      await db.tx(async (q) => {
        const u = await q(`UPDATE items SET vault_owner = $3, vault_no = $4, vault_pos = $5, vault_at = now()
          WHERE id = $1 AND character_id = $2 AND vault_no IS NULL AND equipped = FALSE AND locked = FALSE RETURNING id`, [it.id, p.charId, owner, no, pos]);
        if (!u.rows[0]) throw new Error('O item mudou. Tente de novo.');
        await q('UPDATE vaults SET updated_at = now() WHERE owner = $1 RETURNING owner', [owner]);
      });
      p.items = p.items.filter((i) => i !== it);
      log(p, owner, no, 'put', { itemId: it.id, item: it.base, qty: Number(it.qty) || 1, detail: `${it.rarity}${it.plus ? ' +' + it.plus : ''} → lugar ${pos + 1}` });
      say(true, `${G.ITEM_BASES[it.base].name} guardado no baú.`);
    } else if (a === 'take') {
      const data = await load(p, no);
      const r = data.items.find((x) => String(x.id) === String(msg.id));
      if (!r) return say(false, deny(p, owner, no, 'Este item não está neste baú.', 'take item fora do baú: ' + msg.id));
      if (H.bagUsed(p) >= G.INVENTORY_SIZE) return say(false, 'Sua bolsa está cheia. Libere um espaço para retirar.');
      if (G.ITEM_BASES[r.base] && G.ITEM_BASES[r.base].slot === 'quest' && !cfg().allowQuestItems && owner.startsWith('a:')) return say(false, 'Itens de missão ficam com o personagem.');
      const got = await db.tx(async (q) => {
        const u = await q(`UPDATE items SET character_id = $2, vault_owner = NULL, vault_no = NULL, vault_pos = NULL, vault_at = NULL, equipped = FALSE, eq_slot = NULL
          WHERE id = $1 AND vault_owner = $3 AND vault_no = $4 RETURNING id, base, rarity, plus, equipped, qty, eq_slot, locked`, [r.id, p.charId, owner, no]);
        if (!u.rows[0]) throw new Error('O item mudou. Tente de novo.');
        await q('UPDATE vaults SET updated_at = now() WHERE owner = $1 RETURNING owner', [owner]);
        return u.rows[0];
      });
      p.items.push(got);
      log(p, owner, no, 'take', { itemId: r.id, item: r.base, qty: Number(r.qty) || 1, detail: `${r.rarity}${r.plus ? ' +' + r.plus : ''}` });
      say(true, `${G.ITEM_BASES[r.base].name} voltou para a sua bolsa.`);
    } else if (a === 'move') {
      const data = await load(p, no);
      const r = data.items.find((x) => String(x.id) === String(msg.id));
      const pos = Math.floor(Number(msg.pos));
      if (!r) return say(false, 'Este item não está neste baú.');
      if (!(pos >= 0 && pos < data.capacity)) return say(false, 'Posição inválida.');
      const other = data.items.find((x) => x.vault_pos === pos);
      if (other === r) return undefined;
      await db.tx(async (q) => {
        // troca de lugar: tira o primeiro da grade, move o segundo, devolve o primeiro
        const a1 = await q('UPDATE items SET vault_pos = -1 - vault_pos WHERE id = $1 AND vault_owner = $2 AND vault_no = $3 AND vault_pos = $4 RETURNING id', [r.id, owner, no, r.vault_pos]);
        if (!a1.rows[0]) throw new Error('O baú mudou. Tente de novo.');
        if (other) {
          const a2 = await q('UPDATE items SET vault_pos = $5 WHERE id = $1 AND vault_owner = $2 AND vault_no = $3 AND vault_pos = $4 RETURNING id', [other.id, owner, no, pos, r.vault_pos]);
          if (!a2.rows[0]) throw new Error('O baú mudou. Tente de novo.');
        }
        await q('UPDATE items SET vault_pos = $4 WHERE id = $1 AND vault_owner = $2 AND vault_no = $3 RETURNING id', [r.id, owner, no, pos]);
      });
      log(p, owner, no, 'move', { itemId: r.id, item: r.base, detail: `${r.vault_pos + 1} → ${pos + 1}` });
      say(true, other ? 'Itens trocados de lugar.' : 'Item movido.');
    } else if (a === 'sort') {
      const data = await load(p, no);
      const sorted = [...data.items].sort((x, y) => CAT_ORDER.indexOf(category(x.base)) - CAT_ORDER.indexOf(category(y.base))
        || RAR_ORDER.indexOf(x.rarity) - RAR_ORDER.indexOf(y.rarity) || (y.plus || 0) - (x.plus || 0) || x.base.localeCompare(y.base) || Number(x.id) - Number(y.id));
      await db.tx(async (q) => {
        // primeiro tira todos da grade (posições negativas), depois coloca em ordem: o índice único nunca colide
        for (const r of sorted) {
          const u = await q('UPDATE items SET vault_pos = -1 - vault_pos WHERE id = $1 AND vault_owner = $2 AND vault_no = $3 AND vault_pos = $4 RETURNING id', [r.id, owner, no, r.vault_pos]);
          if (!u.rows[0]) throw new Error('O baú mudou. Tente de novo.');
        }
        for (let i = 0; i < sorted.length; i++) await q('UPDATE items SET vault_pos = $4 WHERE id = $1 AND vault_owner = $2 AND vault_no = $3 RETURNING id', [sorted[i].id, owner, no, i]);
      });
      log(p, owner, no, 'sort', { detail: `${sorted.length} itens` });
      say(true, 'Baú organizado.');
    } else if (a === 'zenIn' || a === 'zenOut') {
      const c = cfg();
      const row = await ensureRow(owner, p.accountId);
      const vz = Number(row.zen);
      const all = !!msg.all;
      let amt = all ? (a === 'zenIn' ? Math.floor(p.zen) : vz) : Number(msg.amount);
      if (!Number.isFinite(amt) || amt !== Math.floor(amt) || amt <= 0) return say(false, deny(p, owner, no, 'Digite uma quantidade válida de Zen.', `${a} valor inválido: ${String(msg.amount).slice(0, 30)}`));
      if (a === 'zenIn') {
        if (all) amt = Math.min(amt, c.maxVaultZen - vz);
        if (amt > p.zen) return say(false, deny(p, owner, no, 'Você não tem esse Zen.', `zenIn ${amt} > ${p.zen}`));
        if (amt <= 0 || vz + amt > c.maxVaultZen) return say(false, `O baú guarda no máximo ${fmt(c.maxVaultZen)} Zen.`);
        p.zen -= amt;
        try {
          await db.tx(async (q) => {
            const u = await q('UPDATE vaults SET zen = zen + $2, updated_at = now() WHERE owner = $1 AND zen + $2 <= $3 RETURNING zen', [owner, amt, c.maxVaultZen]);
            if (!u.rows[0]) throw new Error('O baú mudou. Tente de novo.');
            await q('UPDATE characters SET zen = $2 WHERE id = $1 RETURNING id', [p.charId, Math.round(p.zen)]);
          });
        } catch (e) { p.zen += amt; throw e; }
        log(p, owner, no, 'zen_in', { zen: amt });
        say(true, `Depositou ${fmt(amt)} Zen.`);
      } else {
        if (all) amt = Math.min(amt, c.maxCharZen - Math.floor(p.zen));
        if (amt > vz) return say(false, deny(p, owner, no, 'O baú não tem esse Zen.', `zenOut ${amt} > ${vz}`));
        if (amt <= 0 || p.zen + amt > c.maxCharZen) return say(false, `Seu personagem carrega no máximo ${fmt(c.maxCharZen)} Zen.`);
        p.zen += amt;
        try {
          await db.tx(async (q) => {
            const u = await q('UPDATE vaults SET zen = zen - $2, updated_at = now() WHERE owner = $1 AND zen >= $2 RETURNING zen', [owner, amt]);
            if (!u.rows[0]) throw new Error('O baú mudou. Tente de novo.');
            await q('UPDATE characters SET zen = $2 WHERE id = $1 RETURNING id', [p.charId, Math.round(p.zen)]);
          });
        } catch (e) { p.zen -= amt; throw e; }
        log(p, owner, no, 'zen_out', { zen: amt });
        say(true, `Retirou ${fmt(amt)} Zen.`);
      }
    } else if (a !== 'refresh') {
      return say(false, deny(p, owner, no, 'Ação inválida.', 'ação ' + a.slice(0, 20)));
    }
  } catch (e) {
    console.error('[vault]', p.name, a, e.message);
    say(false, /mudou/.test(e.message) ? e.message : 'Não foi possível concluir. Nada foi alterado.');
  }
  return undefined;
}

// ---------- administração ----------
function sanitize(i) {
  const c = cfg();
  const n = (v, a, b, label) => { const x = Math.round(Number(v)); if (!(x >= a && x <= b)) throw new Error(`${label}: use um número de ${a} a ${b}.`); return x; };
  const out = {
    enabled: i.enabled !== false, shared: !!i.shared,
    cols: n(i.cols ?? c.cols, 4, 12, 'Colunas'), rows: n(i.rows ?? c.rows, 1, 40, 'Linhas'),
    maps: {}, vaults: {},
    maxVaultZen: n(i.maxVaultZen ?? c.maxVaultZen, 1, 9e15, 'Zen máximo do baú'),
    maxCharZen: n(i.maxCharZen ?? c.maxCharZen, 1, 9e15, 'Zen máximo do personagem'),
    allowQuestItems: !!i.allowQuestItems,
  };
  for (const m of Object.keys(DEFAULTS.maps)) out.maps[m] = !!(i.maps || {})[m];
  if (!Object.values(out.maps).some(Boolean)) throw new Error('Deixe o baú em pelo menos uma cidade.');
  for (const k of NOS) {
    const v = (i.vaults || {})[k] || c.vaults[k];
    out.vaults[k] = { enabled: k === 1 ? true : !!v.enabled, name: String(v.name || DEFAULTS.vaults[k].name).trim().slice(0, 40) || DEFAULTS.vaults[k].name,
      minLevel: n(v.minLevel || 0, 0, G.LIMITS.maxLevel, `Baú ${k}: nível`), vip: !!v.vip };
  }
  return out;
}
async function saveConfig(i) {
  const old = cfg();
  const c = sanitize(i);
  // diminuir a grade não pode esconder itens: confere o baú mais cheio
  if (capOf(c) < capOf(old)) {
    const { rows } = await db.query('SELECT COALESCE(max(vault_pos), -1)::int AS m FROM items WHERE vault_no IS NOT NULL');
    if (rows[0].m >= capOf(c)) throw new Error(`Há itens até o lugar ${rows[0].m + 1}: a capacidade não pode ficar menor que isso.`);
  }
  await SET.save('vault', c);
  return c;
}
async function setCapacity(owner, cap) {
  if (!/^(c|a):\d+$/.test(owner)) throw new Error('Dono inválido.');
  const v = cap === null || cap === '' ? null : Math.round(Number(cap));
  if (v !== null && !(v >= 8 && v <= 480)) throw new Error('Capacidade de 8 a 480.');
  await db.query('INSERT INTO vaults (owner, capacity) VALUES ($1, $2) ON CONFLICT (owner) DO UPDATE SET capacity = $2, updated_at = now() RETURNING owner', [owner, v]);
}
async function adminView(name) {
  const out = { config: cfg(), maps: Object.keys(DEFAULTS.maps).map((id) => ({ id, name: G.WORLD[id].name })) };
  out.log = (await db.query('SELECT char_name, owner, vault_no, action, item, qty, zen, detail, created_at FROM vault_log ORDER BY id DESC LIMIT 60')).rows;
  out.stats = (await db.query(`SELECT (SELECT count(*) FROM items WHERE vault_no IS NOT NULL)::int AS items, (SELECT COALESCE(sum(zen), 0) FROM vaults)::bigint AS zen,
    (SELECT count(*) FROM vaults)::int AS vaults, (SELECT count(*) FROM vault_log WHERE action = 'denied' AND created_at > now() - interval '24 hours')::int AS denied`)).rows[0];
  if (name) {
    const ch = (await db.query('SELECT id, account_id, name FROM characters WHERE lower(name) = lower($1)', [String(name)])).rows[0];
    if (!ch) throw new Error('Personagem não encontrado.');
    const owners = [`c:${ch.id}`, `a:${ch.account_id}`];
    const vs = (await db.query("SELECT owner, zen, capacity FROM vaults WHERE owner = ANY(string_to_array($1, ','))", [owners.join(',')])).rows;
    const its = (await db.query("SELECT id, base, rarity, plus, qty, vault_owner, vault_no, vault_pos FROM items WHERE vault_owner = ANY(string_to_array($1, ',')) ORDER BY vault_owner, vault_no, vault_pos", [owners.join(',')])).rows;
    out.char = { name: ch.name, owners, vaults: vs, items: its.map((r) => ({ id: String(r.id), name: (G.ITEM_BASES[r.base] || {}).name || r.base, rarity: r.rarity, plus: r.plus, qty: r.qty, owner: r.vault_owner, no: r.vault_no, pos: r.vault_pos })),
      log: (await db.query('SELECT char_name, owner, vault_no, action, item, qty, zen, detail, created_at FROM vault_log WHERE character_id = $1 OR owner = ANY(string_to_array($2, \',\')) ORDER BY id DESC LIMIT 60', [ch.id, owners.join(',')])).rows };
  }
  return out;
}

module.exports = { init, cfg, act, npcVisible, atNpc, saveConfig, setCapacity, adminView, log, category, DEFAULTS };
