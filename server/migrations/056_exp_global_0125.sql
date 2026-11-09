-- EXP pela metade de novo: multiplicador geral 0,125 (vale também se a curva já foi salva pelo ADM)
UPDATE game_settings SET value = jsonb_set(value, '{globalMult}', '0.125'::jsonb, true), updated_at = now() WHERE key = 'exp_hard';
