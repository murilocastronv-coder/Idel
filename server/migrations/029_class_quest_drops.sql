-- Itens de evolução de classe: drop distribuído pela faixa de nível de cada missão (os mesmos itens, nomes e IDs já cadastrados).
-- Quest of the Hero (nível 150): Aida, Kalima e Crywolf (monstros nível 110+). Missões de Marlon (nível 200/250): Kalima e Crywolf (130+/150+).
-- Comuns com chance baixa, elites/especiais melhor, chefes (Kundun, Balgass) bem melhor. Continua caindo só para quem está na etapa que precisa do item.
-- As regras antigas (mapas de nível 45 a 72, abaixo do nível das missões) ficam desativadas.
UPDATE drop_rules SET enabled = FALSE, note = note || ' — substituída pela 029'
WHERE item IN ('scroll_of_emperor','broken_sword','soul_of_wizard','tear_of_elf','orb_of_summoning','flame_of_dbk','horn_of_hell_maine','feather_of_phoenix')
  AND note LIKE '%(quem precisa)%';

INSERT INTO drop_rules (item, scope, scope_id, tier, chance, qty_min, qty_max, mon_min_level, mon_max_level, cats, note) VALUES
 -- Quest of the Hero (Priestess Sevina, nível 150)
 ('scroll_of_emperor',  'all', NULL, 'normal', 0.8, 1, 1, 110, 9999, '', 'Evolução: Scroll of the Emperor (comuns nível 110+)'),
 ('scroll_of_emperor',  'all', NULL, 'elite',  5,   1, 1, 110, 9999, '', 'Evolução: Scroll of the Emperor (elites nível 110+)'),
 ('scroll_of_emperor',  'all', NULL, 'boss',   35,  1, 1, 100, 9999, '', 'Evolução: Scroll of the Emperor (chefes)'),
 ('broken_sword',       'all', NULL, 'normal', 0.6, 1, 1, 110, 9999, '', 'Evolução Dark Knight: Broken Sword (comuns nível 110+)'),
 ('broken_sword',       'all', NULL, 'elite',  4,   1, 1, 110, 9999, '', 'Evolução Dark Knight: Broken Sword (elites nível 110+)'),
 ('broken_sword',       'all', NULL, 'boss',   30,  1, 1, 100, 9999, '', 'Evolução Dark Knight: Broken Sword (chefes)'),
 ('soul_of_wizard',     'all', NULL, 'normal', 0.6, 1, 1, 110, 9999, '', 'Evolução Dark Wizard: Soul of Wizard (comuns nível 110+)'),
 ('soul_of_wizard',     'all', NULL, 'elite',  4,   1, 1, 110, 9999, '', 'Evolução Dark Wizard: Soul of Wizard (elites nível 110+)'),
 ('soul_of_wizard',     'all', NULL, 'boss',   30,  1, 1, 100, 9999, '', 'Evolução Dark Wizard: Soul of Wizard (chefes)'),
 ('tear_of_elf',        'all', NULL, 'normal', 0.6, 1, 1, 110, 9999, '', 'Evolução Fairy Elf: Tear of Elf (comuns nível 110+)'),
 ('tear_of_elf',        'all', NULL, 'elite',  4,   1, 1, 110, 9999, '', 'Evolução Fairy Elf: Tear of Elf (elites nível 110+)'),
 ('tear_of_elf',        'all', NULL, 'boss',   30,  1, 1, 100, 9999, '', 'Evolução Fairy Elf: Tear of Elf (chefes)'),
 ('orb_of_summoning',   'all', NULL, 'normal', 0.6, 1, 1, 110, 9999, '', 'Evolução Summoner: Orb of Summoning (comuns nível 110+)'),
 ('orb_of_summoning',   'all', NULL, 'elite',  4,   1, 1, 110, 9999, '', 'Evolução Summoner: Orb of Summoning (elites nível 110+)'),
 ('orb_of_summoning',   'all', NULL, 'boss',   30,  1, 1, 100, 9999, '', 'Evolução Summoner: Orb of Summoning (chefes)'),
 -- Missões de Marlon (Magic Gladiator/Dark Lord nível 200, Quest of the Emperor nível 250)
 ('flame_of_dbk',       'all', NULL, 'normal', 0.5, 1, 1, 130, 9999, '', 'Evolução: Flame of Death Beam Knight (comuns nível 130+)'),
 ('flame_of_dbk',       'all', NULL, 'elite',  4,   1, 1, 130, 9999, '', 'Evolução: Flame of Death Beam Knight (elites nível 130+)'),
 ('flame_of_dbk',       'all', NULL, 'boss',   30,  1, 1, 150, 9999, '', 'Evolução: Flame of Death Beam Knight (chefes Kundun/Balgass)'),
 ('horn_of_hell_maine', 'all', NULL, 'normal', 0.4, 1, 1, 130, 9999, '', 'Evolução: Horn of Hell Maine (comuns nível 130+)'),
 ('horn_of_hell_maine', 'all', NULL, 'elite',  3,   1, 1, 130, 9999, '', 'Evolução: Horn of Hell Maine (elites nível 130+)'),
 ('horn_of_hell_maine', 'monster', 'kundun', 'boss', 40, 1, 1, 0, 9999, '', 'Evolução: Horn of Hell Maine (Kundun)'),
 ('horn_of_hell_maine', 'monster', 'balgass', 'boss', 20, 1, 1, 0, 9999, '', 'Evolução: Horn of Hell Maine (Balgass)'),
 ('feather_of_phoenix', 'all', NULL, 'normal', 0.4, 1, 1, 150, 9999, '', 'Evolução: Feather of Phoenix of Darkness (comuns nível 150+)'),
 ('feather_of_phoenix', 'all', NULL, 'elite',  3,   1, 1, 150, 9999, '', 'Evolução: Feather of Phoenix of Darkness (elites nível 150+)'),
 ('feather_of_phoenix', 'monster', 'balgass', 'boss', 40, 1, 1, 0, 9999, '', 'Evolução: Feather of Phoenix of Darkness (Balgass)'),
 ('feather_of_phoenix', 'monster', 'kundun', 'boss', 20, 1, 1, 0, 9999, '', 'Evolução: Feather of Phoenix of Darkness (Kundun)');
