-- A conta "sacola" (personagem SacoLa) volta a ser só de jogador: sem comandos GM, sem papel de moderação/ADM.
INSERT INTO game_settings (key, value) VALUES ('gm_chars', '{"names": []}'::jsonb)
ON CONFLICT (key) DO UPDATE SET value = '{"names": []}'::jsonb;
UPDATE accounts SET role = 'player' WHERE lower(username) = 'sacola' AND role <> 'player';
