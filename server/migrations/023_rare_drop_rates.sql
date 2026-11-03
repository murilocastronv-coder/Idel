-- Joias (Bless, Soul, Chaos, Life, Creation) e materiais de entrada (Devil's Eye/Key de todos os níveis, Scroll of Archangel, Blood Bone):
-- chance fixa de 0,010% por item em todos os monstros (comuns, elites e chefes), 1 unidade por drop.
UPDATE drop_rules SET chance = 0.01, qty_min = 1, qty_max = 1
WHERE item IN ('jewel_of_bless', 'jewel_of_soul', 'jewel_of_chaos', 'jewel_of_life', 'jewel_of_creation', 'scroll_of_archangel', 'blood_bone')
   OR item ~ '^(devil_eye|devil_key|scroll_of_archangel|blood_bone)(_[0-9]+)?$';

INSERT INTO news (kind, title, body) VALUES
 ('update', 'Joias e materiais de entrada mais raros', 'As joias (Bless, Soul, Chaos e Creation) e os materiais de entrada do Devil Square agora caem com chance de 0,010% por item em todos os monstros, para valorizar a economia do servidor.');
