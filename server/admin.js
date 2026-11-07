'use strict';
// Quem é administrador: usuário E e-mail da conta precisam bater (o botão escondido no jogo não é segurança).
// Variáveis opcionais no Render: ADMIN_USERS (padrão murilonv, separados por vírgula) e ADMIN_EMAIL.
const USERS = (process.env.ADMIN_USERS || process.env.ADMIN_USER || 'murilonv').split(',').map((u) => u.trim().toLowerCase()).filter(Boolean);
const EMAIL = (process.env.ADMIN_EMAIL || 'murilocastronv@gmail.com').trim().toLowerCase();

// contas só para jogar: nunca viram ADM, moderador ou GM, mesmo que alguma lista as inclua
const PLAY_ONLY = (process.env.PLAY_ONLY_USERS || 'sacola').split(',').map((u) => u.trim().toLowerCase()).filter(Boolean);
const isPlayOnly = (username) => PLAY_ONLY.includes(String(username || '').toLowerCase());

function isAdmin(acc) {
  if (!acc || isPlayOnly(acc.username)) return false;
  if (!USERS.includes(String(acc.username || '').toLowerCase())) return false;
  return EMAIL === '*' || String(acc.email || '').toLowerCase() === EMAIL;
}

module.exports = { isAdmin, isPlayOnly, USERS, EMAIL };
