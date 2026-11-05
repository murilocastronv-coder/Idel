-- Itens de drop/caixa no máximo +5: caixas Kundun salvas no painel ficam com + mínimo/máximo até 5.
UPDATE game_settings SET value = (
  SELECT jsonb_object_agg(box, (
    SELECT coalesce(jsonb_agg(CASE WHEN e ? 'plusMax' OR e ? 'plusMin'
      THEN e || jsonb_build_object('plusMin', LEAST(5, coalesce((e->>'plusMin')::int, 0)), 'plusMax', LEAST(5, coalesce((e->>'plusMax')::int, 0))) ELSE e END), '[]'::jsonb)
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(list) = 'array' THEN list ELSE '[]'::jsonb END) e))
  FROM jsonb_each(value) AS t(box, list))
WHERE key = 'kundun' AND jsonb_typeof(value) = 'object';
