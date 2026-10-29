-- Classes com evolução, regras de equipamento por item e quests de evolução.

-- evolução da classe: 0 = classe inicial, 1 = 1ª evolução, 2 = 2ª evolução
ALTER TABLE characters ADD COLUMN IF NOT EXISTS evo INT NOT NULL DEFAULT 0;
-- missão de evolução em andamento: { id, step, startedAt }
ALTER TABLE characters ADD COLUMN IF NOT EXISTS class_quest JSONB;

-- em qual lugar do corpo o item está (anéis: ring ou ring2)
ALTER TABLE items ADD COLUMN IF NOT EXISTS eq_slot TEXT;

-- regras de equipamento editáveis por item (sem regra = padrão do catálogo)
CREATE TABLE IF NOT EXISTS item_rules (
  base        TEXT PRIMARY KEY,
  classes     TEXT NOT NULL,             -- classes separadas por vírgula
  min_evo     INT NOT NULL DEFAULT 0,
  min_level   INT,
  req_str     INT NOT NULL DEFAULT 0,
  req_agi     INT NOT NULL DEFAULT 0,
  req_ene     INT NOT NULL DEFAULT 0,
  req_vit     INT NOT NULL DEFAULT 0,
  req_cmd     INT NOT NULL DEFAULT 0,
  slot        TEXT,
  enabled     BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- tentativas de equipar recusadas pelo servidor (o botão do jogo não deixa: costuma ser requisição manipulada ou tela antiga)
CREATE TABLE IF NOT EXISTS equip_log (
  id            BIGSERIAL PRIMARY KEY,
  character_id  BIGINT,
  char_name     TEXT,
  item          TEXT,
  reason        TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS equip_log_time ON equip_log (created_at DESC);

-- histórico de evoluções de classe
CREATE TABLE IF NOT EXISTS class_evolutions (
  id            BIGSERIAL PRIMARY KEY,
  character_id  BIGINT REFERENCES characters(id) ON DELETE CASCADE,
  char_name     TEXT NOT NULL,
  class         TEXT NOT NULL,
  from_evo      INT NOT NULL,
  to_evo        INT NOT NULL,
  class_name    TEXT NOT NULL,
  quest         TEXT,
  items         JSONB NOT NULL DEFAULT '[]'::jsonb,
  zen           BIGINT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS class_evolutions_char ON class_evolutions (character_id);

-- itens de missão (só caem para quem está na etapa que precisa deles)
INSERT INTO drop_rules (item, scope, scope_id, tier, chance, qty_min, qty_max, mon_min_level, cats, note) VALUES
 ('scroll_of_emperor', 'map', 'lost_tower', 'any', 2, 1, 1, 0, '', 'Quest of the Hero (quem precisa)'),
 ('scroll_of_emperor', 'monster', 'skeleton_king', 'boss', 30, 1, 1, 0, '', 'Quest of the Hero (quem precisa)'),
 ('broken_sword', 'map', 'dungeon_3', 'any', 1.5, 1, 1, 0, '', 'Dark Knight (quem precisa)'),
 ('broken_sword', 'monster', 'magma_golem', 'elite', 10, 1, 1, 0, '', 'Dark Knight (quem precisa)'),
 ('soul_of_wizard', 'map', 'lost_tower', 'any', 1, 1, 1, 0, '', 'Dark Wizard (quem precisa)'),
 ('soul_of_wizard', 'monster', 'bone_mage', 'elite', 10, 1, 1, 0, '', 'Dark Wizard (quem precisa)'),
 ('tear_of_elf', 'map', 'atlans', 'any', 1.5, 1, 1, 0, '', 'Fairy Elf (quem precisa)'),
 ('tear_of_elf', 'monster', 'coral_golem', 'elite', 10, 1, 1, 0, '', 'Fairy Elf (quem precisa)'),
 ('orb_of_summoning', 'map', 'aida', 'any', 1.5, 1, 1, 0, '', 'Summoner (quem precisa)'),
 ('orb_of_summoning', 'monster', 'dark_treant', 'elite', 10, 1, 1, 0, '', 'Summoner (quem precisa)'),
 ('flame_of_dbk', 'map', 'kalima', 'any', 0.8, 1, 1, 0, '', 'Missão de Marlon (quem precisa)'),
 ('flame_of_dbk', 'map', 'crywolf', 'any', 0.8, 1, 1, 0, '', 'Missão de Marlon (quem precisa)'),
 ('horn_of_hell_maine', 'monster', 'kundun', 'boss', 40, 1, 1, 0, '', 'Missão de Marlon (quem precisa)'),
 ('horn_of_hell_maine', 'map', 'kalima', 'normal', 0.3, 1, 1, 0, '', 'Missão de Marlon (quem precisa)'),
 ('feather_of_phoenix', 'monster', 'balgass', 'boss', 40, 1, 1, 0, '', 'Missão de Marlon (quem precisa)'),
 ('feather_of_phoenix', 'map', 'crywolf', 'normal', 0.3, 1, 1, 0, '', 'Missão de Marlon (quem precisa)');

INSERT INTO news (kind, title, body) VALUES
 ('update', 'Evolução de classe, novos equipamentos e regras por classe', 'A Priestess Sevina (Devias) e Marlon (Lorencia) levam seu herói à próxima classe: Blade Knight, Soul Master, Muse Elf, Bloody Summoner, Duel Master, Lord Emperor e além, com poderes novos. Chegaram calças, escudos, colares e um segundo anel; cada equipamento agora mostra classe, nível e atributos necessários.');
