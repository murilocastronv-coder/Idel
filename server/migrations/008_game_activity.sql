-- Atividade real do jogo: apenas contas que efetivamente entraram no mundo.
-- A chave composta garante uma única contagem por conta em cada dia.
CREATE TABLE IF NOT EXISTS game_activity_days (
  day        DATE    NOT NULL,
  account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  PRIMARY KEY (day, account_id)
);
CREATE INDEX IF NOT EXISTS game_activity_days_day ON game_activity_days (day);

-- A série de "online" do /status passa a representar personagens dentro do mundo.
UPDATE stats_samples SET online = in_world WHERE online <> in_world;
