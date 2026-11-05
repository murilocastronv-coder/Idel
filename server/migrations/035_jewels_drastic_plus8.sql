-- Joias: Free 0,05% · VIP Ouro 0,12% · VIP Diamante 0,2% (aplicado em drops.js; valor da tabela só para referência no painel).
UPDATE drop_rules SET chance = 0.05, qty_min = 1, qty_max = 1 WHERE item ~ '^jewel_of_[a-z_]+$';
UPDATE news SET body = 'As joias (Bless, Soul, Chaos, Creation e demais) caem com chance de 0,05% para contas Free, 0,12% para VIP Ouro e 0,2% para VIP Diamante, por joia e por monstro, em todos os mapas e chefes que têm joias na tabela.'
WHERE title = 'Novas chances de drop das joias';
-- Caixas Kundun salvas no painel: + máximo e mínimo limitados a +8 (nenhum item de drop/caixa passa de +8).
UPDATE game_settings SET value = (
  SELECT jsonb_object_agg(box, (
    SELECT coalesce(jsonb_agg(CASE WHEN e ? 'plusMax' OR e ? 'plusMin'
      THEN e || jsonb_build_object('plusMin', LEAST(8, coalesce((e->>'plusMin')::int, 0)), 'plusMax', LEAST(8, coalesce((e->>'plusMax')::int, 0))) ELSE e END), '[]'::jsonb)
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(list) = 'array' THEN list ELSE '[]'::jsonb END) e))
  FROM jsonb_each(value) AS t(box, list))
WHERE key = 'kundun' AND jsonb_typeof(value) = 'object';
