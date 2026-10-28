-- Invasão Dourada: histórico das invasões, monstros dourados derrotados, recompensas e caixas abertas.
CREATE TABLE IF NOT EXISTS invasions (
  id          BIGSERIAL PRIMARY KEY,
  started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  ends_at     TIMESTAMPTZ NOT NULL,
  ended_at    TIMESTAMPTZ,
  trigger     TEXT NOT NULL DEFAULT 'timer',      -- timer | admin | resume
  spawned     INT NOT NULL DEFAULT 0,
  killed      INT NOT NULL DEFAULT 0,
  end_reason  TEXT
);
CREATE INDEX IF NOT EXISTS invasions_time ON invasions (started_at DESC);

CREATE TABLE IF NOT EXISTS invasion_kills (
  id           BIGSERIAL PRIMARY KEY,
  invasion_id  BIGINT REFERENCES invasions(id) ON DELETE SET NULL,
  monster      TEXT NOT NULL,
  monster_name TEXT NOT NULL,
  tier         TEXT NOT NULL,
  map          TEXT NOT NULL,
  room         INT NOT NULL,
  killer_name  TEXT,
  rewards      JSONB NOT NULL DEFAULT '[]'::jsonb,   -- [{char, name, box, share}]
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS invasion_kills_time ON invasion_kills (created_at DESC);

CREATE TABLE IF NOT EXISTS box_opens (
  id            BIGSERIAL PRIMARY KEY,
  character_id  BIGINT REFERENCES characters(id) ON DELETE SET NULL,
  char_name     TEXT NOT NULL,
  box           TEXT NOT NULL,
  reward        JSONB NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS box_opens_time ON box_opens (created_at DESC);

INSERT INTO news (kind, title, body) VALUES
 ('event', 'Invasão Dourada a cada 40 minutos', 'Monstros dourados invadem os mapas de caça a cada 40 minutos: são versões mais fortes dos monstros de cada lugar. Derrote-os para ganhar Box Kundun Bronze, Prata ou Ouro e abra na sua bolsa.');
