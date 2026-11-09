-- 1 reset por mês: multiplicador geral 0,814 (~720 h de AUTO até o nível 1000); vale também se a curva já foi salva pelo ADM
UPDATE game_settings SET value = jsonb_set(value, '{globalMult}', '0.814'::jsonb, true), updated_at = now() WHERE key = 'exp_hard';
