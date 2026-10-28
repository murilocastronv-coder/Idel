-- Chaos Machine (asas e capa do Dark Lord), drops de materiais e comandos de administração.

-- materiais empilham numa linha só (Jewel of Chaos ×12)
ALTER TABLE items ADD COLUMN IF NOT EXISTS qty INT NOT NULL DEFAULT 1;
ALTER TABLE items ADD CONSTRAINT items_qty_positive CHECK (qty >= 1);

-- Master Reset e pontos permanentes (dados por /addpontos e pelos resets; preservados ao recalcular)
ALTER TABLE characters ADD COLUMN IF NOT EXISTS master_resets INT NOT NULL DEFAULT 0;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS bonus_points INT NOT NULL DEFAULT 0;

-- papéis: player, moderator, admin, superadmin (o dono do jogo é sempre superadmin)
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'player';
ALTER TABLE accounts ADD CONSTRAINT accounts_role_valid CHECK (role IN ('player','moderator','admin','superadmin'));
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS muted_until TIMESTAMPTZ;

-- histórico da Chaos Machine (todas as tentativas)
CREATE TABLE IF NOT EXISTS chaos_log (
  id            BIGSERIAL PRIMARY KEY,
  character_id  BIGINT REFERENCES characters(id) ON DELETE SET NULL,
  char_name     TEXT NOT NULL,
  recipe        TEXT NOT NULL,
  inputs        JSONB NOT NULL,
  zen           BIGINT NOT NULL DEFAULT 0,
  chance        INT NOT NULL,
  success       BOOLEAN NOT NULL,
  result_item   BIGINT,
  result_base   TEXT,
  lost          JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS chaos_log_time ON chaos_log (created_at DESC);
CREATE INDEX IF NOT EXISTS chaos_log_char ON chaos_log (character_id, created_at DESC);

-- tabela de drop configurável (chance em %)
CREATE TABLE IF NOT EXISTS drop_rules (
  id               SERIAL PRIMARY KEY,
  item             TEXT NOT NULL,
  scope            TEXT NOT NULL DEFAULT 'all' CHECK (scope IN ('all','map','monster')),
  scope_id         TEXT,
  tier             TEXT NOT NULL DEFAULT 'any' CHECK (tier IN ('any','normal','elite','boss')),
  chance           NUMERIC(9,5) NOT NULL CHECK (chance > 0 AND chance <= 100),
  qty_min          INT NOT NULL DEFAULT 1 CHECK (qty_min >= 1),
  qty_max          INT NOT NULL DEFAULT 1 CHECK (qty_max >= qty_min AND qty_max <= 100),
  mon_min_level    INT NOT NULL DEFAULT 0,
  mon_max_level    INT NOT NULL DEFAULT 9999,
  player_min_level INT NOT NULL DEFAULT 0,
  cats             TEXT NOT NULL DEFAULT '',
  delivery         TEXT NOT NULL DEFAULT 'bag' CHECK (delivery IN ('bag','ground')),
  enabled          BOOLEAN NOT NULL DEFAULT TRUE,
  note             TEXT,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO drop_rules (item, scope, scope_id, tier, chance, qty_min, qty_max, mon_min_level, cats, note) VALUES
 ('jewel_of_chaos', 'all', NULL, 'normal', 0.5, 1, 1, 4, 'jewel,wing,cape', 'Jewel of Chaos em monstros comuns (nível 4+)'),
 ('jewel_of_chaos', 'all', NULL, 'elite', 3, 1, 1, 0, 'jewel,wing,cape', 'Jewel of Chaos em elites'),
 ('jewel_of_chaos', 'all', NULL, 'boss', 40, 1, 2, 0, 'jewel,wing,cape', 'Jewel of Chaos em bosses'),
 ('loch_feather', 'all', NULL, 'normal', 0.05, 1, 1, 45, 'wing,cape', 'Pena rara em monstros fortes (nível 45+)'),
 ('loch_feather', 'all', NULL, 'elite', 0.8, 1, 1, 40, 'wing,cape', 'Pena em elites (nível 40+)'),
 ('loch_feather', 'monster', 'skeleton_king', 'boss', 8, 1, 1, 0, 'wing,cape', 'Rei Esqueleto'),
 ('loch_feather', 'monster', 'kundun', 'boss', 20, 1, 1, 0, 'wing,cape', 'Kundun'),
 ('loch_feather', 'monster', 'balgass', 'boss', 30, 1, 2, 0, 'wing,cape', 'Balgass'),
 ('chaos_dragon_axe', 'all', NULL, 'normal', 0.05, 1, 1, 25, 'wing,cape', 'Arma do Caos (comuns 25+)'),
 ('chaos_nature_bow', 'all', NULL, 'normal', 0.05, 1, 1, 25, 'wing,cape', 'Arma do Caos (comuns 25+)'),
 ('chaos_lightning_staff', 'all', NULL, 'normal', 0.05, 1, 1, 25, 'wing,cape', 'Arma do Caos (comuns 25+)'),
 ('chaos_dragon_axe', 'all', NULL, 'elite', 0.4, 1, 1, 25, 'wing,cape', 'Arma do Caos (elites 25+)'),
 ('chaos_nature_bow', 'all', NULL, 'elite', 0.4, 1, 1, 25, 'wing,cape', 'Arma do Caos (elites 25+)'),
 ('chaos_lightning_staff', 'all', NULL, 'elite', 0.4, 1, 1, 25, 'wing,cape', 'Arma do Caos (elites 25+)'),
 ('chaos_dragon_axe', 'all', NULL, 'boss', 4, 1, 1, 0, 'wing,cape', 'Arma do Caos (bosses)'),
 ('chaos_nature_bow', 'all', NULL, 'boss', 4, 1, 1, 0, 'wing,cape', 'Arma do Caos (bosses)'),
 ('chaos_lightning_staff', 'all', NULL, 'boss', 4, 1, 1, 0, 'wing,cape', 'Arma do Caos (bosses)');

-- eventos temporários de drop (o maior bônus que se aplica vale; nunca somam)
CREATE TABLE IF NOT EXISTS drop_events (
  id           SERIAL PRIMARY KEY,
  name         TEXT NOT NULL,
  target       TEXT NOT NULL DEFAULT 'all' CHECK (target IN ('all','jewel','wing','cape','boss')),
  chance_mult  NUMERIC(5,2) NOT NULL DEFAULT 1 CHECK (chance_mult >= 1 AND chance_mult <= 10),
  qty_mult     NUMERIC(5,2) NOT NULL DEFAULT 1 CHECK (qty_mult >= 1 AND qty_mult <= 5),
  starts_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  ends_at      TIMESTAMPTZ NOT NULL,
  enabled      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- histórico de materiais obtidos, deixados no chão e recolhidos
CREATE TABLE IF NOT EXISTS drop_log (
  id            BIGSERIAL PRIMARY KEY,
  character_id  BIGINT,
  char_name     TEXT,
  item          TEXT NOT NULL,
  qty           BIGINT NOT NULL DEFAULT 1,
  event         TEXT NOT NULL,
  source        TEXT,
  map           TEXT,
  room          INT,
  tier          TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS drop_log_time ON drop_log (created_at DESC);
CREATE INDEX IF NOT EXISTS drop_log_char ON drop_log (character_id, created_at DESC);

-- histórico administrativo (comandos, valores antes e depois)
CREATE TABLE IF NOT EXISTS admin_log (
  id            BIGSERIAL PRIMARY KEY,
  admin_account BIGINT,
  admin_name    TEXT,
  role          TEXT,
  command       TEXT NOT NULL,
  target_name   TEXT,
  target_char   BIGINT,
  params        JSONB NOT NULL DEFAULT '{}'::jsonb,
  before        JSONB,
  after         JSONB,
  result        TEXT NOT NULL,
  message       TEXT,
  reason        TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_log_time ON admin_log (created_at DESC);
CREATE INDEX IF NOT EXISTS admin_log_target ON admin_log (lower(target_name), created_at DESC);

INSERT INTO news (kind, title, body) VALUES
 ('update', 'Chaos Machine: asas e Capa do Dark Lord', 'O Chaos Goblin chegou a Lorencia. Junte Jewel of Chaos, armas do Caos e Loch''s Feather caçando monstros e bosses, crie sua asa de nível 1 e evolua para o nível 2. O Dark Lord fabrica a Cape of Lord e evolui para a Cape of Emperor.');
