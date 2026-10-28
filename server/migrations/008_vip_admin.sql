-- VIP (dois planos, tempo separado por plano) e pagamentos (Stripe ou dados pelo administrador)
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS vip1_until TIMESTAMPTZ;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS vip2_until TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS payments (
  id           BIGSERIAL PRIMARY KEY,
  provider     TEXT NOT NULL,               -- 'stripe' ou 'admin'
  ref          TEXT UNIQUE,                 -- id da sessão do Stripe (evita entregar duas vezes)
  account_id   BIGINT REFERENCES accounts(id) ON DELETE SET NULL,
  plan         TEXT NOT NULL,
  days         INTEGER NOT NULL,
  amount_cents INTEGER NOT NULL DEFAULT 0,
  currency     TEXT NOT NULL DEFAULT 'brl',
  status       TEXT NOT NULL DEFAULT 'paid',
  note         TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payments_account ON payments (account_id);

CREATE TABLE IF NOT EXISTS game_settings (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO news (kind, title, body) VALUES
 ('update', 'VIP Ouro e VIP Diamante', 'Chegaram os planos VIP: mais EXP, mais Zen, mais drops, progresso offline maior e um selo no nome. Compre na Loja do jogo, por 15 ou 30 dias.');
