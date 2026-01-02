BEGIN;

-- 1. "E2E Test User" (+1-9992223333)
-- Used by: tests/identify_chat.spec.js
-- Scenario: Verifies returning user identification, profile hydration, and credit deduction.
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
ON CONFLICT (phone_number) DO UPDATE SET 
    credits = 10,
    name = EXCLUDED.name,
    consent_given = EXCLUDED.consent_given,
    date_of_birth = EXCLUDED.date_of_birth,
    time_of_birth = EXCLUDED.time_of_birth,
    place_of_birth = EXCLUDED.place_of_birth;



-- 2. "Returning 91 User" (+919999999999)
-- Used by: tests/returning_user.spec.js
-- Scenario: Verifies correct logic for +91 numbers and login flow skipping profile entry.
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
ON CONFLICT (phone_number) DO UPDATE SET 
    credits = 10,
    name = EXCLUDED.name,
    consent_given = EXCLUDED.consent_given,
    date_of_birth = EXCLUDED.date_of_birth,
    time_of_birth = EXCLUDED.time_of_birth,
    place_of_birth = EXCLUDED.place_of_birth;



-- 3. "Low Credit User" (+919800000000)
-- Used by: tests/credits_threshold.spec.js (Recommended future test)
-- Scenario: Ensures low-credit warning/QR code logic triggers correctly.
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
ON CONFLICT (phone_number) DO UPDATE SET credits = 0;

COMMIT;
