-- ============================================================================
-- Migration: credit expiry column + topup package config
-- Adds credit_expires_at to user_credits for 6-month paid credit expiration.
-- Seeds default topup packages into app_config.
-- Idempotent: safe column add via DO block, INSERT ... ON CONFLICT DO NOTHING.
-- ============================================================================

-- Add credit_expires_at column if it does not already exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_credits' AND column_name = 'credit_expires_at'
  ) THEN
    EXECUTE 'ALTER TABLE user_credits ADD COLUMN credit_expires_at TIMESTAMPTZ';
  END IF;
END $$;

-- Index for efficient expired-credit queries (worker cron)
CREATE INDEX IF NOT EXISTS idx_uc_credit_expires
  ON user_credits (credit_expires_at)
  WHERE credit_expires_at IS NOT NULL;

-- Seed default topup package configuration
-- Format: "credits,amountINR"
INSERT INTO app_config (key, value) VALUES
  ('topup_package_small',  '10,100'),
  ('topup_package_medium', '25,250'),
  ('topup_package_large',  '50,500')
ON CONFLICT (key) DO NOTHING;
