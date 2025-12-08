-- Drop users table migration (DOWN)
-- Run with: psql -d <dbname> -f 20251206_create_users.down.sql

-- Remove trigger
DROP TRIGGER IF EXISTS trg_users_updated_at ON users;

-- Remove trigger function
DROP FUNCTION IF EXISTS users_updated_at_trigger();

-- Drop index
DROP INDEX IF EXISTS idx_users_email;

-- Drop table
DROP TABLE IF EXISTS users;
