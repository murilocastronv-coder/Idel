-- RESET STATUS: cada personagem tem 1 reset de atributos gratuito; depois, cada reset consome 1 item Reset Status.
ALTER TABLE characters ADD COLUMN IF NOT EXISTS free_stat_reset_used BOOLEAN NOT NULL DEFAULT FALSE;
CREATE TABLE IF NOT EXISTS stat_reset_log (
  id           BIGSERIAL PRIMARY KEY,
  character_id BIGINT,
  kind         TEXT NOT NULL,          -- free | item
  points       INT NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO news (kind, title, body) VALUES
 ('update', 'Reset Status chegou', 'Abra a janela do Herói e use o botão RESET STATUS para devolver todos os pontos dos atributos e distribuir de novo. O primeiro reset de cada personagem é grátis; os próximos usam o item Reset Status, vendido na loja da Mercadora Pasi.');
