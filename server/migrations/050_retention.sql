-- Retenção e progressão: sessões de jogo, participação em eventos e progresso semanal/retorno.
CREATE TABLE IF NOT EXISTS play_sessions (
  id           BIGSERIAL PRIMARY KEY,
  account_id   BIGINT NOT NULL,
  character_id BIGINT NOT NULL,
  started_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS play_sessions_started ON play_sessions (started_at);
CREATE INDEX IF NOT EXISTS play_sessions_account ON play_sessions (account_id, started_at DESC);

-- participação em eventos (Blood Castle, Devil Square, Chaos Castle, Invasão Dourada, Boss Mundial, Castle Siege…)
CREATE TABLE IF NOT EXISTS event_log (
  id           BIGSERIAL PRIMARY KEY,
  event        TEXT NOT NULL,
  account_id   BIGINT,
  character_id BIGINT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS event_log_created ON event_log (created_at);
CREATE INDEX IF NOT EXISTS event_log_char ON event_log (character_id, created_at DESC);

-- histórico: entradas de arena que já aconteceram
INSERT INTO event_log (event, account_id, character_id, created_at)
  SELECT kind, account_id, character_id, COALESCE(entered_at, created_at) FROM arena_entries
  WHERE status IN ('entered','eliminated','finished','winner')
  AND NOT EXISTS (SELECT 1 FROM event_log LIMIT 1);
