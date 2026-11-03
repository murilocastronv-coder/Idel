-- Mercado com dinheiro real (Stripe Connect): vendedor conecta a conta Stripe e recebe na hora da venda; o jogo fica com 10%.
ALTER TABLE market_listings ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'zen';   -- zen | brl (preço em centavos)
ALTER TABLE market_listings ADD COLUMN IF NOT EXISTS seller_account BIGINT;
ALTER TABLE market_listings ADD COLUMN IF NOT EXISTS stripe_account TEXT;
ALTER TABLE market_listings ADD COLUMN IF NOT EXISTS reserved_char BIGINT;
ALTER TABLE market_listings ADD COLUMN IF NOT EXISTS reserved_until TIMESTAMPTZ;
ALTER TABLE market_listings ADD COLUMN IF NOT EXISTS checkout_id TEXT;
ALTER TABLE market_listings ADD COLUMN IF NOT EXISTS payment_ref TEXT;
CREATE INDEX IF NOT EXISTS market_reserved ON market_listings (reserved_until) WHERE status = 'reserved';
CREATE UNIQUE INDEX IF NOT EXISTS market_checkout ON market_listings (checkout_id) WHERE checkout_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS market_sellers (
  account_id        BIGINT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  stripe_account    TEXT NOT NULL UNIQUE,
  country           TEXT NOT NULL,
  charges_enabled   BOOLEAN NOT NULL DEFAULT FALSE,
  payouts_enabled   BOOLEAN NOT NULL DEFAULT FALSE,
  details_submitted BOOLEAN NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO news (kind, title, body) VALUES
 ('update', 'Mercado com dinheiro real', 'No Mercado, conecte sua conta Stripe para vender itens por reais: quando alguém compra, o valor cai direto na sua conta Stripe (o jogo fica com 10% de comissão). Quem compra paga com cartão e recebe o item na hora.');
