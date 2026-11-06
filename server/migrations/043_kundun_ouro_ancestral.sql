-- Box Kundun Ouro: novas taxas exclusivas (Ancestral 0,50% e Lendário 1,50%).
-- Descarta só a configuração salva da Ouro para valer o novo padrão; Bronze, Prata e Promo continuam como estão.
UPDATE game_settings SET value = value - 'kundun_ouro'
WHERE key = 'kundun' AND jsonb_typeof(value) = 'object';
