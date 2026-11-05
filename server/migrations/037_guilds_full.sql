-- Sistema completo de guildas: descrição, fundo de Zen, pontos, patentes, contribuição, doações, missões e guerras.
ALTER TABLE guilds ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '';
ALTER TABLE guilds ADD COLUMN IF NOT EXISTS zen_fund BIGINT NOT NULL DEFAULT 0;
ALTER TABLE guilds ADD COLUMN IF NOT EXISTS points BIGINT NOT NULL DEFAULT 0;
ALTER TABLE guilds ADD COLUMN IF NOT EXISTS wins INT NOT NULL DEFAULT 0;
ALTER TABLE guilds ADD COLUMN IF NOT EXISTS losses INT NOT NULL DEFAULT 0;
ALTER TABLE guilds ADD COLUMN IF NOT EXISTS draws INT NOT NULL DEFAULT 0;
ALTER TABLE guilds ADD COLUMN IF NOT EXISTS subcap_invite BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE guild_members DROP CONSTRAINT IF EXISTS guild_members_role_check;
ALTER TABLE guild_members ADD CONSTRAINT guild_members_role_check CHECK (role IN ('leader','submaster','captain','subcaptain','member'));
ALTER TABLE guild_members ADD COLUMN IF NOT EXISTS contribution BIGINT NOT NULL DEFAULT 0;
ALTER TABLE guild_members ADD COLUMN IF NOT EXISTS zen_donated BIGINT NOT NULL DEFAULT 0;
ALTER TABLE guild_members ADD COLUMN IF NOT EXISTS missions JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS guild_donations (
  id BIGSERIAL PRIMARY KEY,
  guild_id BIGINT NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  character_id BIGINT REFERENCES characters(id) ON DELETE SET NULL,
  char_name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('zen','mission')),
  zen BIGINT NOT NULL DEFAULT 0,
  points INT NOT NULL DEFAULT 0,
  note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS guild_donations_guild ON guild_donations (guild_id, created_at DESC);

CREATE TABLE IF NOT EXISTS guild_wars (
  id BIGSERIAL PRIMARY KEY,
  a_id BIGINT NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  b_id BIGINT NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  a_name TEXT NOT NULL,
  b_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','ended','declined','cancelled')),
  a_kills INT NOT NULL DEFAULT 0,
  b_kills INT NOT NULL DEFAULT 0,
  winner_id BIGINT,
  declared_by TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  CHECK (a_id <> b_id)
);
CREATE INDEX IF NOT EXISTS guild_wars_a ON guild_wars (a_id, created_at DESC);
CREATE INDEX IF NOT EXISTS guild_wars_b ON guild_wars (b_id, created_at DESC);

INSERT INTO news (kind, title, body) VALUES
 ('update', 'Guildas completas', 'Novo sistema de guildas: crie a sua com o Mestre de Guildas em Devias, recrute tocando nos jogadores, organize patentes (Mestre, Submestre, Capitão, Subcapitão e Membro), doe Zen e cumpra missões para a guilda, declare guerra contra outras guildas e dispute o ranking. O nome da guilda aparece em azul acima da cabeça de todos os membros.');
