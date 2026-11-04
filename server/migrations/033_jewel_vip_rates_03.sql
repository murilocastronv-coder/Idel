-- Joias: Free 0,3% · VIP Ouro 0,8% · VIP Diamante 1,3% (aplicado pelo servidor em drops.js; valor da tabela só para referência no painel).
UPDATE drop_rules SET chance = 0.3, qty_min = 1, qty_max = 1 WHERE item ~ '^jewel_of_[a-z_]+$';
UPDATE news SET body = 'As joias (Bless, Soul, Chaos, Creation e demais) caem com chance de 0,3% para contas Free, 0,8% para VIP Ouro e 1,3% para VIP Diamante, por joia e por monstro, em todos os mapas e chefes que têm joias na tabela.'
WHERE title = 'Novas chances de drop das joias';
