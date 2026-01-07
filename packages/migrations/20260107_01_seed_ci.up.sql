BEGIN;

-- 20260107_01_seed_ci.up.sql
-- Idempotent CI/E2E seed data (created from original CI seed)
-- Inserts use ON CONFLICT DO NOTHING to avoid destructive UPDATE/ALTER operations

-- 1. "E2E Test User" (+1-9992223333)
-- Used by: e2e/tests/identify_chat.spec.js
INSERT INTO users (
    phone_number,
    name,
    credits,
    consent_given,
    date_of_birth,
    time_of_birth,
    place_of_birth
) 
VALUES (
    '+1-9992223333',
    'E2E Test User',
    10,
    true,
    '1990-01-01',
    '18:05:00',
    'Mumbai'
) 
ON CONFLICT (phone_number) DO NOTHING;


-- 2. "Returning 91 User" (+919999999999)
-- Used by: e2e/tests/returning_user.spec.js
INSERT INTO users (
    phone_number,
    name,
    credits,
    consent_given,
    date_of_birth,
    time_of_birth,
    place_of_birth
) 
VALUES (
    '+919999999999',
    'Returning 91 User',
    10,
    true,
    '1990-01-01',
    '12:00:00',
    'Delhi'
) 
ON CONFLICT (phone_number) DO NOTHING;


-- 3. "Low Credit User" (+919800000000)
-- Used by: tests/credits_threshold.spec.js
INSERT INTO users (
    phone_number,
    name,
    credits,
    consent_given
) 
VALUES (
    '+919800000000',
    'Low Credit User',
    0,
    true
) 
ON CONFLICT (phone_number) DO NOTHING;

COMMIT;
