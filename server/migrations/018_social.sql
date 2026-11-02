CREATE TABLE IF NOT EXISTS guilds (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  leader_character_id BIGINT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS guilds_name_lower ON guilds (lower(name));
CREATE TABLE IF NOT EXISTS guild_members (
  guild_id BIGINT NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  character_id BIGINT NOT NULL UNIQUE REFERENCES characters(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('leader','member')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (guild_id,character_id)
);
CREATE TABLE IF NOT EXISTS guild_invites (
  guild_id BIGINT NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  character_id BIGINT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  invited_by BIGINT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (guild_id,character_id)
);
CREATE INDEX IF NOT EXISTS guild_members_guild ON guild_members(guild_id);
