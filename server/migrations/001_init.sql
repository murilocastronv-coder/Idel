-- MU Idle Legends - esquema inicial

CREATE TABLE IF NOT EXISTS accounts (
  id               BIGSERIAL PRIMARY KEY,
  username         TEXT NOT NULL,
  email            TEXT NOT NULL,
  password_hash    TEXT NOT NULL,
  recovery_hash    TEXT,
  is_admin         BOOLEAN NOT NULL DEFAULT FALSE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at    TIMESTAMPTZ,
  password_changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS accounts_username_lower ON accounts (lower(username));
CREATE UNIQUE INDEX IF NOT EXISTS accounts_email_lower ON accounts (lower(email));

CREATE TABLE IF NOT EXISTS sessions (
  token_hash   TEXT PRIMARY KEY,
  account_id   BIGINT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at   TIMESTAMPTZ NOT NULL,
  ip           TEXT,
  user_agent   TEXT
);
CREATE INDEX IF NOT EXISTS sessions_account ON sessions (account_id);
CREATE INDEX IF NOT EXISTS sessions_expires ON sessions (expires_at);

CREATE TABLE IF NOT EXISTS password_resets (
  token_hash   TEXT PRIMARY KEY,
  account_id   BIGINT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at   TIMESTAMPTZ NOT NULL,
  used_at      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS password_resets_account ON password_resets (account_id);

CREATE TABLE IF NOT EXISTS characters (
  id           BIGSERIAL PRIMARY KEY,
  account_id   BIGINT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  class        TEXT NOT NULL CHECK (class IN ('dark_knight','dark_wizard','fairy_elf','magic_gladiator','dark_lord','summoner')),
  appearance   JSONB NOT NULL DEFAULT '{}'::jsonb,
  level        INT NOT NULL DEFAULT 1,
  resets       INT NOT NULL DEFAULT 0,
  exp          BIGINT NOT NULL DEFAULT 0,
  zen          BIGINT NOT NULL DEFAULT 0,
  str          INT NOT NULL,
  agi          INT NOT NULL,
  vit          INT NOT NULL,
  ene          INT NOT NULL,
  cmd          INT NOT NULL DEFAULT 0,
  free_points  INT NOT NULL DEFAULT 0,
  map          TEXT NOT NULL DEFAULT 'lorencia',
  pos_x        INT NOT NULL DEFAULT 0,
  pos_y        INT NOT NULL DEFAULT 0,
  bosses_killed INT NOT NULL DEFAULT 0,
  combat_power INT NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS characters_name_lower ON characters (lower(name));
CREATE INDEX IF NOT EXISTS characters_account ON characters (account_id);
CREATE INDEX IF NOT EXISTS characters_ranking ON characters (resets DESC, level DESC, exp DESC);

CREATE TABLE IF NOT EXISTS news (
  id          BIGSERIAL PRIMARY KEY,
  kind        TEXT NOT NULL DEFAULT 'news' CHECK (kind IN ('news','event','update')),
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  published_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_log (
  id          BIGSERIAL PRIMARY KEY,
  account_id  BIGINT REFERENCES accounts(id) ON DELETE SET NULL,
  action      TEXT NOT NULL,
  ip          TEXT,
  meta        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_log_account ON audit_log (account_id, created_at DESC);

INSERT INTO news (kind, title, body, published_at) VALUES
 ('update', 'Servidor aberto: Temporada 1', 'Os portões de Lorencia estão abertos. Crie sua conta, escolha uma das seis classes e reserve o nome do seu herói antes de todos.', now() - interval '2 days'),
 ('event',  'Boss mundial: Rei Esqueleto', 'O Rei Esqueleto despertará nas catacumbas da Dungeon todos os dias às 20h (horário do servidor). Contribuição de dano define as recompensas.', now() - interval '1 day'),
 ('news',   'Evento de joias em breve', 'Durante o fim de semana, monstros de Devias e Noria terão chance aumentada de deixar joias de Bênção e Alma.', now());
