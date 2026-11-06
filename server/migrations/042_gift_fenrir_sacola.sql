-- O Fenrir Dourado +11 Semi Full de presente vai para o personagem "SacoLA" (no lugar do pedido 041).
-- Só troca se o personagem existir; se o presente anterior ainda não foi entregue, ele é cancelado para não duplicar.
DO $$
DECLARE ch RECORD;
BEGIN
  IF to_regclass('premium_orders') IS NULL THEN RETURN; END IF;
  SELECT id, account_id INTO ch FROM characters WHERE lower(name) = 'sacola' ORDER BY id LIMIT 1;
  IF ch.id IS NULL THEN RETURN; END IF;
  DELETE FROM premium_orders WHERE stripe_ref = 'gift-fenrir-gold-owner-1' AND status = 'pending';
  INSERT INTO premium_orders (stripe_ref, account_id, product_id, amount_cents, currency, status, character_id)
  VALUES ('gift-fenrir-gold-sacola-1', ch.account_id, 'fenrir-gold', 0, 'brl', 'pending', ch.id)
  ON CONFLICT (stripe_ref) DO NOTHING;
END $$;
