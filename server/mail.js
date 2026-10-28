'use strict';
// Envio de e-mail via API HTTP da Resend (https://resend.com) — sem dependências.
// Sem RESEND_API_KEY, o link é registrado no log do servidor (útil em desenvolvimento).

async function sendMail({ to, subject, html, text }) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM || 'MU Idle Legends <onboarding@resend.dev>';
  if (!key) {
    console.log(`[mail] (RESEND_API_KEY ausente) E-mail para ${to}: ${subject}\n${text}`);
    return { delivered: false };
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [to], subject, html, text }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error(`[mail] falha ao enviar (${res.status}): ${body.slice(0, 300)}`);
    return { delivered: false };
  }
  return { delivered: true };
}

function resetEmail(username, link) {
  const text = `Olá ${username},\n\nRecebemos um pedido para redefinir a senha da sua conta no MU Idle Legends.\nAbra o link abaixo em até 1 hora:\n\n${link}\n\nSe não foi você, ignore este e-mail. Sua senha continua a mesma.`;
  const html = `<div style="font-family:Arial,sans-serif;background:#120d0a;color:#f1e3c4;padding:24px">
  <h2 style="color:#f2b33d;margin:0 0 12px">MU Idle Legends</h2>
  <p>Olá <b>${username}</b>,</p>
  <p>Recebemos um pedido para redefinir a senha da sua conta. O link vale por 1 hora.</p>
  <p><a href="${link}" style="display:inline-block;background:#f2b33d;color:#1a0f05;padding:10px 18px;text-decoration:none;font-weight:bold">Redefinir senha</a></p>
  <p style="color:#a89677;font-size:13px">Se não foi você, ignore este e-mail. Sua senha continua a mesma.</p></div>`;
  return { subject: 'Redefinição de senha — MU Idle Legends', text, html };
}

module.exports = { sendMail, resetEmail };
