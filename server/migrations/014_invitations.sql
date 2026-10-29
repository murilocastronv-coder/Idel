-- Convites de eventos: Armor of Guardsman (Chaos Castle) e Devil's Eye / Key +1..+7 (Devil Square).
-- Cada nível do Eye tem a mesma faixa de monstros que a Key do mesmo nível (para formar pares).
ALTER TABLE drop_events DROP CONSTRAINT IF EXISTS drop_events_target_check;
ALTER TABLE drop_events ADD CONSTRAINT drop_events_target_check CHECK (target IN ('all','jewel','wing','cape','boss','devil','castle'));

INSERT INTO drop_rules (item, scope, scope_id, tier, chance, qty_min, qty_max, mon_min_level, mon_max_level, cats, note) VALUES
 ('devil_eye_1', 'all', NULL, 'normal', 0.5, 1, 1, 1, 20, 'devil', 'Devil''s Eye +1 (comuns, monstros nível 1–20)'),
 ('devil_eye_1', 'all', NULL, 'elite', 2, 1, 1, 1, 20, 'devil', 'Devil''s Eye +1 (elites, monstros nível 1–20)'),
 ('devil_eye_1', 'all', NULL, 'boss', 3, 1, 1, 1, 20, 'devil', 'Devil''s Eye +1 (chefes, monstros nível 1–20)'),
 ('devil_key_1', 'all', NULL, 'normal', 0.5, 1, 1, 1, 20, 'devil', 'Devil''s Key +1 (comuns, monstros nível 1–20)'),
 ('devil_key_1', 'all', NULL, 'elite', 2, 1, 1, 1, 20, 'devil', 'Devil''s Key +1 (elites, monstros nível 1–20)'),
 ('devil_key_1', 'all', NULL, 'boss', 3, 1, 1, 1, 20, 'devil', 'Devil''s Key +1 (chefes, monstros nível 1–20)'),
 ('devil_eye_2', 'all', NULL, 'normal', 0.5, 1, 1, 15, 40, 'devil', 'Devil''s Eye +2 (comuns, monstros nível 15–40)'),
 ('devil_eye_2', 'all', NULL, 'elite', 2, 1, 1, 15, 40, 'devil', 'Devil''s Eye +2 (elites, monstros nível 15–40)'),
 ('devil_eye_2', 'all', NULL, 'boss', 3, 1, 1, 15, 40, 'devil', 'Devil''s Eye +2 (chefes, monstros nível 15–40)'),
 ('devil_key_2', 'all', NULL, 'normal', 0.5, 1, 1, 15, 40, 'devil', 'Devil''s Key +2 (comuns, monstros nível 15–40)'),
 ('devil_key_2', 'all', NULL, 'elite', 2, 1, 1, 15, 40, 'devil', 'Devil''s Key +2 (elites, monstros nível 15–40)'),
 ('devil_key_2', 'all', NULL, 'boss', 3, 1, 1, 15, 40, 'devil', 'Devil''s Key +2 (chefes, monstros nível 15–40)'),
 ('devil_eye_3', 'all', NULL, 'normal', 0.8, 1, 1, 35, 60, 'devil', 'Devil''s Eye +3 (comuns, monstros nível 35–60)'),
 ('devil_eye_3', 'all', NULL, 'elite', 2, 1, 1, 35, 60, 'devil', 'Devil''s Eye +3 (elites, monstros nível 35–60)'),
 ('devil_eye_3', 'all', NULL, 'boss', 3, 1, 1, 35, 60, 'devil', 'Devil''s Eye +3 (chefes, monstros nível 35–60)'),
 ('devil_key_3', 'all', NULL, 'normal', 0.8, 1, 1, 35, 60, 'devil', 'Devil''s Key +3 (comuns, monstros nível 35–60)'),
 ('devil_key_3', 'all', NULL, 'elite', 2, 1, 1, 35, 60, 'devil', 'Devil''s Key +3 (elites, monstros nível 35–60)'),
 ('devil_key_3', 'all', NULL, 'boss', 3, 1, 1, 35, 60, 'devil', 'Devil''s Key +3 (chefes, monstros nível 35–60)'),
 ('devil_eye_4', 'all', NULL, 'normal', 0.8, 1, 1, 55, 85, 'devil', 'Devil''s Eye +4 (comuns, monstros nível 55–85)'),
 ('devil_eye_4', 'all', NULL, 'elite', 2, 1, 1, 55, 85, 'devil', 'Devil''s Eye +4 (elites, monstros nível 55–85)'),
 ('devil_eye_4', 'all', NULL, 'boss', 3, 1, 1, 55, 85, 'devil', 'Devil''s Eye +4 (chefes, monstros nível 55–85)'),
 ('devil_key_4', 'all', NULL, 'normal', 0.8, 1, 1, 55, 85, 'devil', 'Devil''s Key +4 (comuns, monstros nível 55–85)'),
 ('devil_key_4', 'all', NULL, 'elite', 2, 1, 1, 55, 85, 'devil', 'Devil''s Key +4 (elites, monstros nível 55–85)'),
 ('devil_key_4', 'all', NULL, 'boss', 3, 1, 1, 55, 85, 'devil', 'Devil''s Key +4 (chefes, monstros nível 55–85)'),
 ('devil_eye_5', 'all', NULL, 'normal', 1.2, 1, 1, 80, 110, 'devil', 'Devil''s Eye +5 (comuns, monstros nível 80–110)'),
 ('devil_eye_5', 'all', NULL, 'elite', 2, 1, 1, 80, 110, 'devil', 'Devil''s Eye +5 (elites, monstros nível 80–110)'),
 ('devil_eye_5', 'all', NULL, 'boss', 3, 1, 1, 80, 110, 'devil', 'Devil''s Eye +5 (chefes, monstros nível 80–110)'),
 ('devil_key_5', 'all', NULL, 'normal', 1.2, 1, 1, 80, 110, 'devil', 'Devil''s Key +5 (comuns, monstros nível 80–110)'),
 ('devil_key_5', 'all', NULL, 'elite', 2, 1, 1, 80, 110, 'devil', 'Devil''s Key +5 (elites, monstros nível 80–110)'),
 ('devil_key_5', 'all', NULL, 'boss', 3, 1, 1, 80, 110, 'devil', 'Devil''s Key +5 (chefes, monstros nível 80–110)'),
 ('devil_eye_6', 'all', NULL, 'normal', 1.2, 1, 1, 105, 140, 'devil', 'Devil''s Eye +6 (comuns, monstros nível 105–140)'),
 ('devil_eye_6', 'all', NULL, 'elite', 2, 1, 1, 105, 140, 'devil', 'Devil''s Eye +6 (elites, monstros nível 105–140)'),
 ('devil_eye_6', 'all', NULL, 'boss', 3, 1, 1, 105, 140, 'devil', 'Devil''s Eye +6 (chefes, monstros nível 105–140)'),
 ('devil_key_6', 'all', NULL, 'normal', 1.2, 1, 1, 105, 140, 'devil', 'Devil''s Key +6 (comuns, monstros nível 105–140)'),
 ('devil_key_6', 'all', NULL, 'elite', 2, 1, 1, 105, 140, 'devil', 'Devil''s Key +6 (elites, monstros nível 105–140)'),
 ('devil_key_6', 'all', NULL, 'boss', 3, 1, 1, 105, 140, 'devil', 'Devil''s Key +6 (chefes, monstros nível 105–140)'),
 ('devil_eye_7', 'all', NULL, 'normal', 1.2, 1, 1, 130, 9999, 'devil', 'Devil''s Eye +7 (comuns, monstros nível 130–+)'),
 ('devil_eye_7', 'all', NULL, 'elite', 2, 1, 1, 130, 9999, 'devil', 'Devil''s Eye +7 (elites, monstros nível 130–+)'),
 ('devil_eye_7', 'all', NULL, 'boss', 3, 1, 1, 130, 9999, 'devil', 'Devil''s Eye +7 (chefes, monstros nível 130–+)'),
 ('devil_key_7', 'all', NULL, 'normal', 1.2, 1, 1, 130, 9999, 'devil', 'Devil''s Key +7 (comuns, monstros nível 130–+)'),
 ('devil_key_7', 'all', NULL, 'elite', 2, 1, 1, 130, 9999, 'devil', 'Devil''s Key +7 (elites, monstros nível 130–+)'),
 ('devil_key_7', 'all', NULL, 'boss', 3, 1, 1, 130, 9999, 'devil', 'Devil''s Key +7 (chefes, monstros nível 130–+)'),
 ('armor_of_guardsman', 'all', NULL, 'normal', 0.3, 1, 1, 15, 9999, 'castle', 'Armor of Guardsman (comuns, nível 15+)'),
 ('armor_of_guardsman', 'all', NULL, 'elite', 1.5, 1, 1, 15, 9999, 'castle', 'Armor of Guardsman (elites, nível 15+)'),
 ('armor_of_guardsman', 'all', NULL, 'boss', 3, 1, 1, 15, 9999, 'castle', 'Armor of Guardsman (chefes, nível 15+)');

INSERT INTO news (kind, title, body) VALUES
 ('update', 'Convites do Devil Square e Armor of Guardsman', 'Monstros agora deixam Devil''s Eye e Devil''s Key (+1 a +7, conforme a força do monstro) e a Armor of Guardsman, entrada do Chaos Castle. Junte Eye e Key do mesmo nível com uma Jewel of Chaos na Chaos Machine para criar o Devil''s Invitation.');
