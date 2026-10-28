-- Mundo jogável: estado de combate, poções, configurações idle e itens

ALTER TABLE characters ADD COLUMN IF NOT EXISTS hp INT NOT NULL DEFAULT 0;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS mp INT NOT NULL DEFAULT 0;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS pot_hp INT NOT NULL DEFAULT 0;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS pot_mp INT NOT NULL DEFAULT 0;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS settings JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS kills BIGINT NOT NULL DEFAULT 0;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS deaths INT NOT NULL DEFAULT 0;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS last_farm_map TEXT;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS auto_on BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS starter_given BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS items (
  id            BIGSERIAL PRIMARY KEY,
  character_id  BIGINT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  base          TEXT NOT NULL,
  rarity        TEXT NOT NULL DEFAULT 'common',
  plus          INT NOT NULL DEFAULT 0,
  equipped      BOOLEAN NOT NULL DEFAULT FALSE,
  locked        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS items_character ON items (character_id);

UPDATE news SET body = 'O Rei Esqueleto guarda o fundo da Dungeon (nível 25+). Ele volta 10 minutos depois de derrotado, e a contribuição de dano de cada herói define a parte de EXP, Zen e itens.'
WHERE title = 'Boss mundial: Rei Esqueleto';

INSERT INTO news (kind, title, body) VALUES
 ('update', 'O mundo está aberto', 'Entre no mundo pelo painel da conta: Lorencia, Campos de Lorencia, Bosque Encantado e a Dungeon já estão abertos, com combate automático, poções, itens e progresso offline de até 8 horas.');
