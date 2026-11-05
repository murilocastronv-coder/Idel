-- Novas tabelas das caixas Kundun Bronze, Prata e Ouro: descarta a configuração antiga salva dessas três caixas
-- (a Promo continua como estava), para valerem os novos padrões do servidor.
UPDATE game_settings SET value = value - 'kundun_bronze' - 'kundun_prata' - 'kundun_ouro'
WHERE key = 'kundun' AND jsonb_typeof(value) = 'object';
