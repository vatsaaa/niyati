-- Migration to add profile fields to users table
-- Run with: psql -d <dbname> -f 20251213_01_update_users_profile.up.sql

ALTER TABLE users 
ADD COLUMN IF NOT EXISTS phone_number VARCHAR(20),
ADD COLUMN IF NOT EXISTS date_of_birth DATE,
ADD COLUMN IF NOT EXISTS time_of_birth TIME,
ADD COLUMN IF NOT EXISTS place_of_birth VARCHAR(255),
ADD COLUMN IF NOT EXISTS lat FLOAT,
ADD COLUMN IF NOT EXISTS lon FLOAT,
ADD COLUMN IF NOT EXISTS timezone VARCHAR(50),
ADD COLUMN IF NOT EXISTS consent_given BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS consent_date TIMESTAMP WITH TIME ZONE;

-- Add Unique Constraint on phone_number
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone ON users (phone_number);
