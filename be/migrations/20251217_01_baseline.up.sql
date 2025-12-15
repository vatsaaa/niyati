-- Baseline migration: create final schema for fresh installs
-- Date: 2025-12-17
-- This file creates the final `users`, `refresh_tokens`, `oauth_accounts`, and `password_resets` tables
-- as a single baseline to avoid incremental ALTER/INDEX warnings on fresh installs.

BEGIN;

-- Ensure pgcrypto is available for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Users table (final schema)
CREATE TABLE IF NOT EXISTS users (
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
  is_paid BOOLEAN DEFAULT FALSE,
  last_login TIMESTAMP WITH TIME ZONE,
  last_login_location VARCHAR(255),
  last_login_lat DOUBLE PRECISION,
  last_login_lon DOUBLE PRECISION,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Indexes for users
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users ((lower(email))) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone ON users (phone_number);
CREATE INDEX IF NOT EXISTS idx_users_is_paid ON users (is_paid);

-- Trigger to keep `updated_at` current on UPDATE
CREATE OR REPLACE FUNCTION users_updated_at_trigger()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
CREATE TRIGGER trg_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION users_updated_at_trigger();

-- Refresh tokens
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash ON refresh_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);

-- OAuth accounts
CREATE TABLE IF NOT EXISTS oauth_accounts (
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

CREATE UNIQUE INDEX IF NOT EXISTS idx_oauth_provider_providerid ON oauth_accounts ((lower(provider)), provider_id);
CREATE INDEX IF NOT EXISTS idx_oauth_user_id ON oauth_accounts (user_id);

-- Password resets
CREATE TABLE IF NOT EXISTS password_resets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  used boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_password_resets_token_hash ON password_resets(token_hash);
CREATE INDEX IF NOT EXISTS idx_password_resets_user_id ON password_resets(user_id);

COMMIT;

-- Notes:
-- This baseline replaces multiple incremental migrations by creating the final shape in one file.
-- Keep this file as the single migration for new installs. Existing production databases should be
-- migrated using the historical migrations or a controlled squashing procedure after backups.
