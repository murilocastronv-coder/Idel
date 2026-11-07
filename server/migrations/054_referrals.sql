-- Afiliados: quem criou conta pelo link de quem (um registro por conta convidada)
CREATE TABLE IF NOT EXISTS referrals (
  id             BIGSERIAL PRIMARY KEY,
  referrer_id    BIGINT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  referred_id    BIGINT NOT NULL UNIQUE REFERENCES accounts(id) ON DELETE CASCADE,
  ip             TEXT,
  status         TEXT NOT NULL DEFAULT 'valid',   -- valid | same_ip | duplicate_ip | no_ip
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  qualified_at   TIMESTAMPTZ,                    -- convidado chegou ao nível de qualificação
  reward_at      TIMESTAMPTZ,                    -- prêmio entregue ao dono do link
  reward_item    TEXT,
  reward_char_id BIGINT
);
CREATE INDEX IF NOT EXISTS referrals_referrer ON referrals (referrer_id);
CREATE INDEX IF NOT EXISTS referrals_ip ON referrals (referrer_id, ip);
