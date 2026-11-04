-- Chefes (Rei Esqueleto, Kundun, Balgass) voltam 1h30 depois de derrotados.
UPDATE news SET body = replace(body, 'Ele volta 10 minutos depois de derrotado', 'Ele volta 1 hora e 30 minutos depois de derrotado') WHERE body LIKE '%Ele volta 10 minutos depois de derrotado%';
INSERT INTO news (kind, title, body) VALUES
 ('update', 'Chefes voltam a cada 1h30', 'O Rei Esqueleto, o Kundun e o Balgass agora reaparecem 1 hora e 30 minutos depois de serem derrotados.');
