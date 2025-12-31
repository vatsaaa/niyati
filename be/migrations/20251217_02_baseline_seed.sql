-- Baseline seed for fresh installs
-- Date: 2025-12-17
-- NOTE: Replace placeholder values with secure secrets before applying to production.

BEGIN;

-- Example seed user (replace password_hash with a real bcrypt hash or insert via app logic)
INSERT INTO users (email, password_hash, name, created_at, updated_at)
VALUES ('seed@example.com', 'REPLACE_WITH_BCRYPT_HASH', 'Seed User', now(), now())
ON CONFLICT DO NOTHING;

-- Example: create an index-related maintenance comment
-- (No additional seed data required by default)

COMMIT;

-- Reminder: For real deployments, prefer using application code to create user accounts
-- (so password hashing and secrets are handled in code rather than stored in SQL files).
