-- Mercado com dinheiro real, parte 2: vendas em USD (pagas no Stripe do jogo), vendas por Pix com comissão acumulada,
-- cobrança da comissão por link ao chegar em R$ 5 e bloqueio de quem não paga.
ALTER TABLE market_listings ADD COLUMN IF NOT EXISTS pay_mode TEXT;   -- zen | connect | pix | platform
ALTER TABLE market_listings ADD COLUMN IF NOT EXISTS pix_key TEXT;
ALTER TABLE market_listings ADD COLUMN IF NOT EXISTS buyer_paid_at TIMESTAMPTZ;
UPDATE market_listings SET pay_mode = CASE WHEN currency = 'zen' THEN 'zen' ELSE 'connect' END WHERE pay_mode IS NULL;

CREATE TABLE IF NOT EXISTS market_wallets (
  account_id   BIGINT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  due_brl      BIGINT NOT NULL DEFAULT 0,      -- comissão que o vendedor deve ao jogo (centavos de real)
  usd_owed     BIGINT NOT NULL DEFAULT 0,      -- quanto o jogo deve ao vendedor por vendas em USD (centavos de dólar)
  pix_key      TEXT,
  payout_info  TEXT,                           -- como o vendedor quer receber os dólares (PayPal, Wise, Pix...)
  blocked      BOOLEAN NOT NULL DEFAULT FALSE,
  block_note   TEXT,
  due_since    TIMESTAMPTZ,
  pay_url      TEXT,
  pay_session  TEXT,
  pay_amount   BIGINT,
  pay_expires  TIMESTAMPTZ,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS market_ledger (
  id          BIGSERIAL PRIMARY KEY,
  account_id  BIGINT,
  kind        TEXT NOT NULL,     -- commission | commission_paid | commission_forgiven | usd_credit | usd_payout | block | unblock | force_deliver | release
  amount      BIGINT NOT NULL DEFAULT 0,
  currency    TEXT NOT NULL DEFAULT 'brl',
  listing_id  BIGINT,
  ref         TEXT,
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS market_ledger_acc ON market_ledger (account_id, id DESC);
CREATE UNIQUE INDEX IF NOT EXISTS market_ledger_ref ON market_ledger (kind, ref) WHERE ref IS NOT NULL;
