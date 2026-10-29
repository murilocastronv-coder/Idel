-- Aprimoramento de equipamentos: joias Bless/Soul/Creation, Ferreiro Mestre e histórico de tentativas
CREATE TABLE IF NOT EXISTS upgrade_log (
  id            BIGSERIAL PRIMARY KEY,
  character_id  BIGINT,
  char_name     TEXT,
  item_id       BIGINT,
  item_base     TEXT,
  kind          TEXT NOT NULL,      -- direct | smith
  from_plus     INT NOT NULL,
  to_plus       INT NOT NULL,
  success       BOOLEAN NOT NULL,
  chance        NUMERIC(6,2),
  materials     JSONB,
  zen           BIGINT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS upgrade_log_time ON upgrade_log (id DESC);

INSERT INTO drop_rules (item, scope, scope_id, tier, chance, qty_min, qty_max, mon_min_level, mon_max_level, cats, note) VALUES
 ('jewel_of_bless', 'all', NULL, 'normal', 0.4, 1, 1, 8, 9999, 'jewel', 'Jewel of Bless (comuns nível 8+)'),
 ('jewel_of_bless', 'all', NULL, 'elite', 2.5, 1, 1, 0, 9999, 'jewel', 'Jewel of Bless (elites)'),
 ('jewel_of_bless', 'all', NULL, 'boss', 20, 1, 2, 0, 9999, 'jewel', 'Jewel of Bless (chefes)'),
 ('jewel_of_soul', 'all', NULL, 'normal', 0.25, 1, 1, 25, 9999, 'jewel', 'Jewel of Soul (comuns nível 25+)'),
 ('jewel_of_soul', 'all', NULL, 'elite', 1.5, 1, 1, 0, 9999, 'jewel', 'Jewel of Soul (elites)'),
 ('jewel_of_soul', 'all', NULL, 'boss', 15, 1, 2, 0, 9999, 'jewel', 'Jewel of Soul (chefes)'),
 ('jewel_of_creation', 'all', NULL, 'normal', 0.08, 1, 1, 60, 9999, 'jewel', 'Jewel of Creation (comuns nível 60+)'),
 ('jewel_of_creation', 'all', NULL, 'elite', 0.8, 1, 1, 40, 9999, 'jewel', 'Jewel of Creation (elites nível 40+)'),
 ('jewel_of_creation', 'all', NULL, 'boss', 8, 1, 1, 0, 9999, 'jewel', 'Jewel of Creation (chefes)');

INSERT INTO news (kind, title, body) VALUES
 ('update', 'Aprimoramento até +15 e Ferreiro Mestre', 'Arraste uma Jewel of Bless (até +6) ou Jewel of Soul (até +9) em cima do equipamento na bolsa para aprimorar. Do +9 ao +15, fale com o Ferreiro Mestre em Lorencia. Na falha a joia é gasta, mas o item não perde nível nem quebra.');
