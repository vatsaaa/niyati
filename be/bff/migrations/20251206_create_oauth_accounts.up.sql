-- Create oauth_accounts table migration (UP)
-- Run with: psql -d <dbname> -f 20251206_create_oauth_accounts.up.sql

-- Ensure pgcrypto is available for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

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

-- Unique index to prevent duplicate provider accounts
CREATE UNIQUE INDEX IF NOT EXISTS idx_oauth_provider_providerid ON oauth_accounts ((lower(provider)), provider_id);

-- Index to quickly find accounts for a user
CREATE INDEX IF NOT EXISTS idx_oauth_user_id ON oauth_accounts (user_id);
