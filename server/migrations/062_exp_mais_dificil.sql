-- Servidor idle mais difícil: 0,42% da barra por monstro do nível (antes 0,5%) e bônus de começo ×13 no nível 1 (antes ×25)
UPDATE game_settings SET value = jsonb_set(jsonb_set(value, '{killPct}', '0.0042'::jsonb, true), '{earlyBoost}', '12'::jsonb, true), updated_at = now() WHERE key = 'exp_hard';
