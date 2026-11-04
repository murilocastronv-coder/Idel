-- Joias: chance fixa pelo plano da conta (Free 1,2% · VIP Ouro 2,4% · VIP Diamante 3,2%), aplicada pelo servidor em drops.js.
-- O valor da tabela fica em 1,2 só para referência no painel; quantidade continua 1 por drop.
UPDATE drop_rules SET chance = 1.2, qty_min = 1, qty_max = 1 WHERE item ~ '^jewel_of_[a-z_]+$';

INSERT INTO news (kind, title, body) VALUES
 ('update', 'Novas chances de drop das joias', 'As joias (Bless, Soul, Chaos, Creation e demais) agora caem com chance de 1,2% para contas Free, 2,4% para VIP Ouro e 3,2% para VIP Diamante, por joia e por monstro, em todos os mapas e chefes que já tinham joias na tabela.');
