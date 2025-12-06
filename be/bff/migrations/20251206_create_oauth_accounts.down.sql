-- Drop oauth_accounts table migration (DOWN)
-- Run with: psql -d <dbname> -f 20251206_create_oauth_accounts.down.sql

-- Drop indexes and table
DROP INDEX IF EXISTS idx_oauth_provider_providerid;
DROP INDEX IF EXISTS idx_oauth_user_id;
DROP TABLE IF EXISTS oauth_accounts;
