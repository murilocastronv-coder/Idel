-- Box Kundun +1 a +7 no lugar das caixas antigas: quem tinha caixa antiga recebe a equivalente nova
UPDATE items SET base = 'kundun_1' WHERE base = 'kundun_bronze';
UPDATE items SET base = 'kundun_2' WHERE base = 'kundun_prata';
UPDATE items SET base = 'kundun_3' WHERE base = 'kundun_ouro';
UPDATE items SET base = 'kundun_4' WHERE base = 'kundun_promo';
UPDATE market_listings SET base = CASE base WHEN 'kundun_bronze' THEN 'kundun_1' WHEN 'kundun_prata' THEN 'kundun_2' WHEN 'kundun_ouro' THEN 'kundun_3' ELSE 'kundun_4' END
 WHERE base IN ('kundun_bronze', 'kundun_prata', 'kundun_ouro', 'kundun_promo');
UPDATE drop_rules SET item = CASE item WHEN 'kundun_bronze' THEN 'kundun_1' WHEN 'kundun_prata' THEN 'kundun_2' WHEN 'kundun_ouro' THEN 'kundun_3' ELSE 'kundun_4' END
 WHERE item IN ('kundun_bronze', 'kundun_prata', 'kundun_ouro', 'kundun_promo');
-- configuração salva no painel com os nomes antigos não vale mais (as novas caixas usam os padrões)
UPDATE game_settings SET value = value - 'kundun_bronze' - 'kundun_prata' - 'kundun_ouro' - 'kundun_promo' WHERE key = 'kundun' AND jsonb_typeof(value) = 'object';
INSERT INTO news (kind, title, body) VALUES
 ('update', 'Box Kundun +1 a +7', 'As caixas Kundun ganharam arte nova e sete níveis. +1, +2 e +3 caem grátis na Invasão Dourada e nos eventos; +4 a +7 estão na loja de cash. As caixas antigas na sua bolsa viraram as novas equivalentes (Bronze → +1, Prata → +2, Ouro → +3, Promocional → +4).');
