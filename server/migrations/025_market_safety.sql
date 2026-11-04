-- Mercado: proteção contra golpe nas vendas por Pix.
-- Reclamações (comprador pagou e o vendedor não confirmou, ou o vendedor diz que não recebeu): o item fica preso até o ADM decidir.
CREATE TABLE IF NOT EXISTS market_disputes (
  id             BIGSERIAL PRIMARY KEY,
  listing_id     BIGINT NOT NULL REFERENCES market_listings(id) ON DELETE CASCADE,
  seller_account BIGINT NOT NULL,
  buyer_char     BIGINT,
  opened_by      TEXT NOT NULL,                 -- buyer | seller | auto
  reason         TEXT NOT NULL,
  proof          TEXT,                          -- comprovante do comprador (ID da transação Pix, horário, banco)
  seller_note    TEXT,
  status         TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'buyer', 'seller')),
  resolved_by    TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at    TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS market_disputes_open ON market_disputes (listing_id) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS market_disputes_seller ON market_disputes (seller_account, status);
ALTER TABLE market_wallets ADD COLUMN IF NOT EXISTS pix_banned BOOLEAN NOT NULL DEFAULT FALSE;
