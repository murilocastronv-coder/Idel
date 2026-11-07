-- VIP Free de boas-vindas: toda conta nova ganha 3 dias com um pouco mais de EXP
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS vip0_until timestamptz;
