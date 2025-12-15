-- Drop refresh_tokens table (DOWN)
-- Run with: psql -d <dbname> -f 20251206_create_refresh_tokens.down.sql

DROP INDEX IF EXISTS idx_refresh_tokens_token_hash;
DROP INDEX IF EXISTS idx_refresh_tokens_user_id;
DROP TABLE IF EXISTS refresh_tokens;
