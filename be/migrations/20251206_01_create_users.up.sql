-- Create users table migration (UP)
-- Run with: psql -d <dbname> -f 20251206_create_users.up.sql

-- Ensure pgcrypto is available for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255),
  password_hash TEXT,
  name VARCHAR(100),
  avatar_url VARCHAR(500),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  last_login TIMESTAMP WITH TIME ZONE
);

-- Add a unique index on email for quick lookups; allow NULLs (some oauth-only accounts may not have email)
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users ((lower(email))) WHERE email IS NOT NULL;

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
