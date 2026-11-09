-- Servidor IDLE: marca de conferência do wipe (server/wipe.js) e EXP +50% (0,3% da barra por monstro do nível)
ALTER TABLE characters ADD COLUMN IF NOT EXISTS wipe_gen SMALLINT NOT NULL DEFAULT 0;
UPDATE game_settings SET value = jsonb_set(jsonb_set(value, '{killPct}', '0.003'::jsonb, true), '{globalMult}', '0.61'::jsonb, true), updated_at = now() WHERE key = 'exp_hard';
INSERT INTO news (kind, title, body) VALUES ('update', 'Servidor IDLE novo: todos no nível 1',
  'O MuonlineClaude virou um jogo idle: cada um joga no seu mundo (os outros jogadores só aparecem no PvP, na party e nas arenas; dá para ver todos nas Opções). Todos os personagens voltaram ao nível 1 com 1.000 pontos. Contas, VIPs e itens comprados com dinheiro real (conjuntos da loja, Fenrir e Boxes) foram mantidos e estão na bolsa. O EXP ficou 50% mais fácil e o ranking recomeçou do zero, sem a aba de resets.');
