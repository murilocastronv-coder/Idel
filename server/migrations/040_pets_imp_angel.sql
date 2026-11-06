-- Imp e Fadinha (Guardian Angel): só do chefe do Acheron (Senhor de Acheron, mapa dos níveis 600 a 800), 5% cada por morte.
INSERT INTO drop_rules (item, scope, scope_id, tier, chance, qty_min, qty_max, mon_min_level, mon_max_level, cats, note) VALUES
 ('pet_imp', 'monster', 'acheron_lord', 'boss', 5, 1, 1, 0, 9999, '', 'Imp · só do Senhor de Acheron'),
 ('pet_angel', 'monster', 'acheron_lord', 'boss', 5, 1, 1, 0, 9999, '', 'Fadinha (Guardian Angel) · só do Senhor de Acheron');
