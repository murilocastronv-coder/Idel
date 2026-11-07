-- Temporadas de 30 dias (só pontos e ranking sazonais; personagens, itens e níveis nunca são reiniciados)
CREATE TABLE IF NOT EXISTS season_points (
  season       INT    NOT NULL,
  character_id BIGINT NOT NULL,
  account_id   BIGINT,
  name         TEXT   NOT NULL,
  class        TEXT   NOT NULL,
  points       INT    NOT NULL DEFAULT 0,
  kills        INT    NOT NULL DEFAULT 0,
  bosses       INT    NOT NULL DEFAULT 0,
  wboss        INT    NOT NULL DEFAULT 0,
  events       INT    NOT NULL DEFAULT 0,
  missions     INT    NOT NULL DEFAULT 0,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (season, character_id)
);
CREATE INDEX IF NOT EXISTS season_points_rank ON season_points (season, points DESC);
CREATE TABLE IF NOT EXISTS season_results (
  season       INT PRIMARY KEY,
  finalized_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  top          JSONB NOT NULL DEFAULT '[]'::jsonb
);
-- Boss Mundial: um registro por aparição e sala (evita duplicar depois de reinício)
CREATE TABLE IF NOT EXISTS worldboss_log (
  id           BIGSERIAL PRIMARY KEY,
  slot_at      TIMESTAMPTZ NOT NULL,
  room         INT NOT NULL,
  map          TEXT NOT NULL,
  boss         TEXT NOT NULL,
  spawned_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  killed_at    TIMESTAMPTZ,
  mvp_name     TEXT,
  participants JSONB NOT NULL DEFAULT '[]'::jsonb,
  UNIQUE (slot_at, room)
);
