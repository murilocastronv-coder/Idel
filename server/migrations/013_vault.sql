-- Baú Pessoal: itens continuam na tabela items (mesmo id e propriedades) e ganham dono/posição de baú.
-- vault_owner: 'c:<personagem>' (baú individual, padrão) ou 'a:<conta>' (compartilhado na conta, se o ADM ligar)
ALTER TABLE items ADD COLUMN IF NOT EXISTS vault_owner TEXT;
ALTER TABLE items ADD COLUMN IF NOT EXISTS vault_no INT;
ALTER TABLE items ADD COLUMN IF NOT EXISTS vault_pos INT;
ALTER TABLE items ADD COLUMN IF NOT EXISTS vault_at TIMESTAMPTZ;
-- dois itens nunca ocupam o mesmo lugar do mesmo baú
CREATE UNIQUE INDEX IF NOT EXISTS items_vault_slot ON items (vault_owner, vault_no, vault_pos) WHERE vault_no IS NOT NULL;
CREATE INDEX IF NOT EXISTS items_bag ON items (character_id) WHERE vault_no IS NULL;

-- Zen guardado e capacidade (por dono do baú)
CREATE TABLE IF NOT EXISTS vaults (
  owner       TEXT PRIMARY KEY,
  account_id  BIGINT REFERENCES accounts(id) ON DELETE CASCADE,
  zen         BIGINT NOT NULL DEFAULT 0 CHECK (zen >= 0),
  capacity    INT,                 -- vazio = capacidade padrão do jogo
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- histórico de depósitos, retiradas, organização e tentativas recusadas
CREATE TABLE IF NOT EXISTS vault_log (
  id            BIGSERIAL PRIMARY KEY,
  account_id    BIGINT,
  character_id  BIGINT,
  char_name     TEXT,
  owner         TEXT,
  vault_no      INT,
  action        TEXT NOT NULL,     -- put, take, move, sort, zen_in, zen_out, denied, admin
  item_id       BIGINT,
  item          TEXT,
  qty           INT,
  zen           BIGINT,
  detail        TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS vault_log_char ON vault_log (character_id, created_at DESC);
CREATE INDEX IF NOT EXISTS vault_log_time ON vault_log (created_at DESC);

INSERT INTO news (kind, title, body) VALUES
 ('update', 'Baú Pessoal em Lorencia', 'Fale com o Baú Pessoal, no centro de Lorencia, para guardar itens e Zen com segurança: 120 espaços, depósito e retirada de Zen, filtros e organização automática. Tudo fica salvo mesmo depois de sair do jogo.');
