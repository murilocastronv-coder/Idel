-- Boss Mundial em 3 faixas de nível ao mesmo tempo: um registro por horário, sala e mapa
ALTER TABLE worldboss_log DROP CONSTRAINT IF EXISTS worldboss_log_slot_at_room_key;
CREATE UNIQUE INDEX IF NOT EXISTS worldboss_log_slot_room_map ON worldboss_log (slot_at, room, map);
