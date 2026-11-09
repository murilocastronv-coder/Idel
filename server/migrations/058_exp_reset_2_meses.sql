-- Reset a cada ~2 meses: multiplicador geral 0,407 (~1.440 h de AUTO até o nível 1000); vale também se a curva já foi salva pelo ADM
UPDATE game_settings SET value = jsonb_set(value, '{globalMult}', '0.407'::jsonb, true), updated_at = now() WHERE key = 'exp_hard';
