-- Materiais do Fenrir Vermelho: só no Acheron (mapa até o nível 800), comuns, elites e chefe, 0,50% cada por morte.
-- (No Blood Castle a chance de 0,55% é aplicada pelo próprio evento.)
INSERT INTO drop_rules (item, scope, scope_id, tier, chance, qty_min, qty_max, mon_min_level, mon_max_level, cats, note) VALUES
 ('splinter_of_armor', 'map', 'acheron', 'any', 0.5, 1, 1, 0, 9999, '', 'Splinter of Armor · Acheron (comuns e chefe) · Fenrir Vermelho'),
 ('bless_of_guardian', 'map', 'acheron', 'any', 0.5, 1, 1, 0, 9999, '', 'Bless of Guardian · Acheron (comuns e chefe) · Fenrir Vermelho'),
 ('claw_of_beast', 'map', 'acheron', 'any', 0.5, 1, 1, 0, 9999, '', 'Claw of Beast · Acheron (comuns e chefe) · Fenrir Vermelho');
INSERT INTO news (kind, title, body) VALUES
 ('update', 'Fenrir Vermelho', 'Nova montaria de mobilidade: o Fenrir Vermelho (+10% de velocidade de movimento). Junte Splinter of Armor, Bless of Guardian e Claw of Beast no Acheron ou no Blood Castle e fabrique em 3 etapas na Chaos Machine.');
