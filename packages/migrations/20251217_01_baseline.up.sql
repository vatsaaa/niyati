-- Baseline migration: create final schema for fresh installs
-- Date: 2025-12-17
-- This file creates the final `users`, `refresh_tokens`, `oauth_accounts`, and `password_resets` tables
-- as a single baseline to avoid incremental ALTER/INDEX warnings on fresh installs.

BEGIN;

-- WARNING: destructive migration
-- Drop existing objects and recreate them. THIS WILL REMOVE EXISTING DATA.
DROP TABLE IF EXISTS password_resets CASCADE;
DROP TABLE IF EXISTS oauth_accounts CASCADE;
DROP TABLE IF EXISTS refresh_tokens CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP EXTENSION IF EXISTS pgcrypto CASCADE;

-- Ensure pgcrypto is available for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255),
  password_hash TEXT,
  name VARCHAR(255),
  avatar_url VARCHAR(500),
  phone_number VARCHAR(20),
  date_of_birth DATE,
  time_of_birth TIME,
  place_of_birth VARCHAR(255),
  lat DOUBLE PRECISION,
  lon DOUBLE PRECISION,
  timezone VARCHAR(50),
  consent_given BOOLEAN DEFAULT FALSE,
  consent_date TIMESTAMP WITH TIME ZONE,
  -- Credits system (replaces is_paid boolean)
  credits INTEGER DEFAULT 10,                          -- Current credits balance
  credits_last_reset TIMESTAMP WITH TIME ZONE DEFAULT now(),  -- When monthly credits were last reset
  total_paid_amount INTEGER DEFAULT 0,                 -- Total amount paid in INR (for tracking)
  is_paid BOOLEAN DEFAULT FALSE,                       -- Has user made at least one verified payment
  last_payment_amount INTEGER DEFAULT 0,               -- Last payment amount (INR)
  last_payment_verified BOOLEAN DEFAULT FALSE,        -- Was last payment verified
  upi_id VARCHAR(255),                                 -- UPI ID used for payment
  upi_txn_id VARCHAR(255),                             -- UPI transaction identifier
  -- Location tracking
  last_login TIMESTAMP WITH TIME ZONE,
  last_login_location VARCHAR(255),
  last_login_lat DOUBLE PRECISION,
  last_login_lon DOUBLE PRECISION,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Indexes for users (recreated)
CREATE UNIQUE INDEX idx_users_email ON users ((lower(email))) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX idx_users_phone ON users (phone_number);
CREATE INDEX idx_users_credits ON users (credits);

-- Trigger to keep `updated_at` current on UPDATE
CREATE OR REPLACE FUNCTION users_updated_at_trigger()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION users_updated_at_trigger();

-- Refresh tokens
CREATE TABLE refresh_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);

CREATE UNIQUE INDEX idx_refresh_tokens_token_hash ON refresh_tokens(token_hash);
CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens(user_id);

CREATE TABLE oauth_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  provider VARCHAR(100) NOT NULL,
  provider_id VARCHAR(255) NOT NULL,
  scope TEXT,
  token_meta JSONB,
  refresh_token_hash TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  last_used_at TIMESTAMP WITH TIME ZONE
);

CREATE UNIQUE INDEX idx_oauth_provider_providerid ON oauth_accounts ((lower(provider)), provider_id);
CREATE INDEX idx_oauth_user_id ON oauth_accounts (user_id);

CREATE TABLE password_resets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  used boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Application configuration settings
CREATE TABLE IF NOT EXISTS app_config (
  key VARCHAR(255) PRIMARY KEY,
  value TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Default configuration values
INSERT INTO app_config (key, value) VALUES
  ('credits_monthly_free', '10'),
  ('credits_horoscope_cost', '2'),
  ('credits_premium_cost', '4'),
  ('credits_per_10_inr', '1'),
  ('credits_low_threshold', '4'),
  ('payment_amount_inr', '500')
ON CONFLICT (key) DO NOTHING;

CREATE UNIQUE INDEX IF NOT EXISTS idx_password_resets_token_hash ON password_resets(token_hash);
CREATE INDEX IF NOT EXISTS idx_password_resets_user_id ON password_resets(user_id);

COMMIT;

-- Notes:
-- This baseline replaces multiple incremental migrations by creating the final shape in one file.
-- Keep this file as the single migration for new installs. Existing production databases should be
-- migrated using the historical migrations or a controlled squashing procedure after backups.
