-- Bônus de pontos virou 1.000: cada personagem existente é ajustado uma única vez ao entrar no jogo (server/world.js pointsFix).
-- 0 = ainda não ajustado · 1 = ajustado (ou criado já com 1.000 pontos)
ALTER TABLE characters ADD COLUMN IF NOT EXISTS points_fix SMALLINT NOT NULL DEFAULT 0;
