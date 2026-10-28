-- Página /status: histórico de jogadores online e atividade diária
CREATE TABLE IF NOT EXISTS stats_samples (
  ts         TIMESTAMPTZ PRIMARY KEY DEFAULT now(),
  online     INTEGER NOT NULL DEFAULT 0,   -- contas conectadas (site + jogo)
  in_world   INTEGER NOT NULL DEFAULT 0,   -- heróis dentro do mundo
  visitors   INTEGER NOT NULL DEFAULT 0    -- abas abertas no site
);

CREATE TABLE IF NOT EXISTS activity_days (
  day        DATE    NOT NULL,
  account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  PRIMARY KEY (day, account_id)
);
CREATE INDEX IF NOT EXISTS activity_days_day ON activity_days (day);

-- histórico inicial: dia de criação e último login de cada conta
INSERT INTO activity_days (day, account_id)
  SELECT (created_at AT TIME ZONE 'America/Sao_Paulo')::date, id FROM accounts
ON CONFLICT DO NOTHING;
INSERT INTO activity_days (day, account_id)
  SELECT (last_login_at AT TIME ZONE 'America/Sao_Paulo')::date, id FROM accounts WHERE last_login_at IS NOT NULL
ON CONFLICT DO NOTHING;
