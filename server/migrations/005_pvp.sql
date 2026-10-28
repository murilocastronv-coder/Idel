-- PvP: zona Vulcanus, duelos e PK
ALTER TABLE characters ADD COLUMN IF NOT EXISTS pvp_kills INT NOT NULL DEFAULT 0;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS pvp_deaths INT NOT NULL DEFAULT 0;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS duel_wins INT NOT NULL DEFAULT 0;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS duel_losses INT NOT NULL DEFAULT 0;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS pk_count INT NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS characters_pvp ON characters (pvp_kills DESC, duel_wins DESC);

INSERT INTO news (kind, title, body) VALUES
 ('event', 'PvP liberado: Vulcanus e duelos', 'Vulcanus (nível 10+) agora é zona PvP aberta: qualquer herói pode atacar outro. Fora dela, toque em um jogador e desafie para um duelo de 3 minutos. Quem derrota alguém 20 níveis mais fraco vira PK por 10 minutos e perde o triplo de EXP se morrer.');
