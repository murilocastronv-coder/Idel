-- Missões diárias, prêmio de login e conquistas (por personagem)
ALTER TABLE characters ADD COLUMN IF NOT EXISTS quests JSONB NOT NULL DEFAULT '{}'::jsonb;

INSERT INTO news (kind, title, body) VALUES
 ('update', 'Servidor Hard XP, 4 poderes e missões', 'Agora cada classe tem 4 poderes (níveis 1, 5, 15 e 30), há missões diárias, prêmio por dias seguidos de login e conquistas. O servidor é Hard XP: subir de nível é mais difícil e morrer custa 3% da EXP do nível.');
