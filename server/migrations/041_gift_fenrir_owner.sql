-- Presente: 1 Fenrir Dourado +11 Semi Full para a conta do dono do jogo.
-- Entra como pedido já pago da loja; a entrega automática coloca na sacola do último personagem jogado
-- (se a sacola estiver cheia, espera e entrega quando houver espaço). Só roda uma vez (stripe_ref único).
DO $$
BEGIN
  IF to_regclass('premium_orders') IS NOT NULL THEN
    INSERT INTO premium_orders (stripe_ref, account_id, product_id, amount_cents, currency, status)
    SELECT 'gift-fenrir-gold-owner-1', id, 'fenrir-gold', 0, 'brl', 'pending'
      FROM accounts WHERE lower(email) = 'murilocastronv@gmail.com'
    ON CONFLICT (stripe_ref) DO NOTHING;
  END IF;
END $$;
