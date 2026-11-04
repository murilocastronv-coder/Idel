-- Joias: Free 0,5% · VIP Ouro 1,2% · VIP Diamante 1,9% (aplicado pelo servidor em drops.js; valor da tabela só para referência no painel).
UPDATE drop_rules SET chance = 0.5, qty_min = 1, qty_max = 1 WHERE item ~ '^jewel_of_[a-z_]+$';
UPDATE news SET body = 'As joias (Bless, Soul, Chaos, Creation e demais) agora caem com chance de 0,5% para contas Free, 1,2% para VIP Ouro e 1,9% para VIP Diamante, por joia e por monstro, em todos os mapas e chefes que já tinham joias na tabela.'
WHERE title = 'Novas chances de drop das joias';
