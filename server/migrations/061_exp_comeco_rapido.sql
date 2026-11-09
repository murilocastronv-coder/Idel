-- Servidor idle: XP base 0,5% por monstro do nível (antes 0,39%) e começo rápido (bônus que some até o nível ~150)
UPDATE game_settings SET value = jsonb_set(jsonb_set(jsonb_set(value, '{killPct}', '0.005'::jsonb, true), '{earlyBoost}', '24'::jsonb, true), '{earlyScale}', '30'::jsonb, true), updated_at = now() WHERE key = 'exp_hard';
