-- Eventos em arena: Chaos Castle e Devil Square (inscrições, partidas, abates entre jogadores e prêmios)
CREATE TABLE IF NOT EXISTS arena_matches (
  id           BIGSERIAL PRIMARY KEY,
  kind         TEXT NOT NULL,               -- castle | devil
  category     INT NOT NULL,
  slot_at      TIMESTAMPTZ,
  status       TEXT NOT NULL DEFAULT 'running',   -- running, done, cancelled
  started_at   TIMESTAMPTZ,
  ended_at     TIMESTAMPTZ,
  end_reason   TEXT,
  winner_id    BIGINT,
  winner_name  TEXT,
  players      INT NOT NULL DEFAULT 0,
  monsters     INT NOT NULL DEFAULT 0,
  data         JSONB
);
CREATE INDEX IF NOT EXISTS arena_matches_time ON arena_matches (id DESC);

CREATE TABLE IF NOT EXISTS arena_entries (
  id             BIGSERIAL PRIMARY KEY,
  kind           TEXT NOT NULL,
  category       INT NOT NULL,
  slot_at        TIMESTAMPTZ NOT NULL,
  match_id       BIGINT REFERENCES arena_matches(id) ON DELETE SET NULL,
  character_id   BIGINT REFERENCES characters(id) ON DELETE CASCADE,
  char_name      TEXT NOT NULL,
  account_id     BIGINT,
  status         TEXT NOT NULL,   -- registered, entered, eliminated, finished, winner, cancelled, no_show, refunded
  entry_item     TEXT,
  consumed       BOOLEAN NOT NULL DEFAULT FALSE,
  entered_at     TIMESTAMPTZ,
  eliminated_at  TIMESTAMPTZ,
  elim_reason    TEXT,
  score          INT NOT NULL DEFAULT 0,
  monster_kills  INT NOT NULL DEFAULT 0,
  pvp_kills      INT NOT NULL DEFAULT 0,
  place          INT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (kind, slot_at, character_id)
);
CREATE INDEX IF NOT EXISTS arena_entries_match ON arena_entries (match_id);
CREATE INDEX IF NOT EXISTS arena_entries_status ON arena_entries (status) WHERE status IN ('registered', 'entered');

CREATE TABLE IF NOT EXISTS arena_kills (
  id           BIGSERIAL PRIMARY KEY,
  match_id     BIGINT REFERENCES arena_matches(id) ON DELETE CASCADE,
  killer_id    BIGINT, killer_name TEXT,
  victim_id    BIGINT, victim_name TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- cada prêmio existe uma vez por entrada (vencedor, 2º, 3º, participação ou devolução) e é entregue uma vez
CREATE TABLE IF NOT EXISTS arena_rewards (
  id            BIGSERIAL PRIMARY KEY,
  entry_id      BIGINT REFERENCES arena_entries(id) ON DELETE CASCADE,
  character_id  BIGINT REFERENCES characters(id) ON DELETE CASCADE,
  tag           TEXT NOT NULL,
  payload       JSONB NOT NULL,
  label         TEXT,
  status        TEXT NOT NULL DEFAULT 'pending',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  delivered_at  TIMESTAMPTZ,
  UNIQUE (entry_id, tag)
);
CREATE INDEX IF NOT EXISTS arena_rewards_pending ON arena_rewards (character_id) WHERE status = 'pending';

INSERT INTO news (kind, title, body) VALUES
 ('update', 'Chaos Castle e Devil Square', 'Dois eventos novos em Lorencia. No Chaos Castle (Guarda do Castelo, entrada com Armor of Guardsman) todos lutam contra todos e contra os soldados do castelo enquanto a área segura diminui: vence o último de pé. No Devil Square (Charon, entrada com Devil''s Invitation) quem derrotar mais monstros leva o prêmio principal. Inscreva-se antes do horário e fique online.');
