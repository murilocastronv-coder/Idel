-- EXP +30%: 0,39% da barra por monstro do nível (antes 0,3%) e prêmios fixos 0,793 (antes 0,61)
UPDATE game_settings SET value = jsonb_set(jsonb_set(value, '{killPct}', '0.0039'::jsonb, true), '{globalMult}', '0.793'::jsonb, true), updated_at = now() WHERE key = 'exp_hard';
