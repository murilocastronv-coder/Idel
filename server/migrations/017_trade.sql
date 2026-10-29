-- Troca entre jogadores: histórico de trocas concluídas e canceladas
CREATE TABLE IF NOT EXISTS trade_log (
  id          BIGSERIAL PRIMARY KEY,
  char_a      BIGINT, name_a TEXT,
  char_b      BIGINT, name_b TEXT,
  status      TEXT NOT NULL,         -- done | cancelled
  detail      JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS trade_log_time ON trade_log (id DESC);
CREATE INDEX IF NOT EXISTS trade_log_a ON trade_log (char_a);
CREATE INDEX IF NOT EXISTS trade_log_b ON trade_log (char_b);

INSERT INTO news (kind, title, body) VALUES
 ('update', 'Troca entre jogadores', 'Toque em outro jogador e escolha "Trocar itens". Cada um coloca até 12 itens e Zen, pode ver todos os detalhes e comparar com o que está usando, e a troca só acontece quando os dois confirmam.');
