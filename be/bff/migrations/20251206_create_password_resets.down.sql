-- Drop password_resets table (DOWN)
-- Run with: psql -d <dbname> -f 20251206_create_password_resets.down.sql

DROP INDEX IF EXISTS idx_password_resets_token_hash;
DROP INDEX IF EXISTS idx_password_resets_user_id;
DROP TABLE IF EXISTS password_resets;
