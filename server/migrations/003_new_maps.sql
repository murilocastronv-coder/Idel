-- Mapas renomeados: Campos de Lorencia -> Noria, Bosque Encantado -> Devias
UPDATE characters SET map = 'noria' WHERE map = 'lorencia_fields';
UPDATE characters SET map = 'devias' WHERE map = 'noria_grove';
UPDATE characters SET last_farm_map = 'noria' WHERE last_farm_map = 'lorencia_fields';
UPDATE characters SET last_farm_map = 'devias' WHERE last_farm_map = 'noria_grove';
UPDATE characters SET map = 'lorencia' WHERE map NOT IN ('lorencia', 'noria', 'devias', 'dungeon');
UPDATE news SET body = 'Entre no mundo pelo painel da conta: Lorencia, Noria, Devias e a Dungeon já estão abertos, com combate automático, poções, itens e progresso offline de até 8 horas.'
WHERE title = 'O mundo está aberto';
