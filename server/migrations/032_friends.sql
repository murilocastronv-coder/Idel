-- Amizades entre personagens (uma linha para cada lado) e solicitações pendentes.
CREATE TABLE IF NOT EXISTS friends (
  character_id BIGINT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  friend_id    BIGINT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (character_id, friend_id),
  CHECK (character_id <> friend_id)
);
CREATE INDEX IF NOT EXISTS friends_friend ON friends (friend_id);
CREATE TABLE IF NOT EXISTS friend_requests (
  from_id    BIGINT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  to_id      BIGINT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (from_id, to_id),
  CHECK (from_id <> to_id)
);
CREATE INDEX IF NOT EXISTS friend_requests_to ON friend_requests (to_id);

INSERT INTO news (kind, title, body) VALUES
 ('update', 'Amigos e menu de jogador', 'Toque (ou clique) em outro jogador para abrir o menu: Adicionar amigo, Trocar itens, Convidar para a guilda e Convidar para a party. A nova janela Amigos mostra quem está online, o nível e a classe de cada amigo, e deixa mandar mensagem privada.');
