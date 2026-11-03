-- Propriedades Excellent persistidas por item e requisito uniforme das asas.
ALTER TABLE items ADD COLUMN IF NOT EXISTS excellent_options JSONB NOT NULL DEFAULT '[]'::jsonb;
UPDATE items SET excellent_options = '[]'::jsonb WHERE excellent_options IS NULL;
UPDATE items SET excellent_options = '[]'::jsonb WHERE jsonb_typeof(excellent_options) <> 'array';
UPDATE items SET rarity = 'legendary' WHERE rarity = 'ancestral' AND (base LIKE 'wings_%' OR base LIKE 'cape_%');
UPDATE item_rules SET min_level = 120, min_evo = 0,
  classes = 'dark_knight,dark_wizard,fairy_elf,magic_gladiator,dark_lord,summoner'
WHERE base LIKE 'wings_%' OR base LIKE 'cape_%';
