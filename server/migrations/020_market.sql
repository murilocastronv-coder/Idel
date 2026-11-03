-- Mercado entre jogadores (Zen): o item sai da bolsa e fica guardado no anúncio até ser vendido, cancelado ou expirar.
CREATE TABLE IF NOT EXISTS market_listings (
  id            BIGSERIAL PRIMARY KEY,
  seller_char   BIGINT NOT NULL,
  seller_name   TEXT NOT NULL,
  base          TEXT NOT NULL,
  rarity        TEXT NOT NULL DEFAULT 'common',
  plus          INT NOT NULL DEFAULT 0,
  qty           INT NOT NULL DEFAULT 1,
  excellent_options JSONB NOT NULL DEFAULT '[]'::jsonb,
  price         BIGINT NOT NULL CHECK (price > 0),
  fee           BIGINT NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'active',   -- active | sold | cancelled | expired
  buyer_char    BIGINT,
  buyer_name    TEXT,
  collected     BOOLEAN NOT NULL DEFAULT FALSE,   -- vendedor já recebeu o Zen (vendido) ou o item de volta (cancelado/expirado)
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at    TIMESTAMPTZ NOT NULL DEFAULT now() + interval '48 hours',
  closed_at     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS market_active ON market_listings (status, price) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS market_seller ON market_listings (seller_char, status);

INSERT INTO news (kind, title, body) VALUES
 ('update', 'Mercado entre jogadores', 'Abra o Mercado no menu: anuncie itens da sua bolsa pelo preço que quiser em Zen e compre de outros jogadores, mesmo com eles offline. A taxa do mercado é de 10% sobre cada venda; o Zen da venda e os itens não vendidos ficam esperando em "Minhas vendas" para você coletar.');
