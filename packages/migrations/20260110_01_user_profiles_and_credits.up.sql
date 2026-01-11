-- Migration: create separate user_profiles and user_credits tables
-- Idempotent creation suitable for CI and local runs

CREATE TABLE IF NOT EXISTS user_profiles (
  user_id UUID PRIMARY KEY,
  phone_number VARCHAR(20) UNIQUE NOT NULL,
  name VARCHAR(255),
  date_of_birth DATE,
  time_of_birth VARCHAR(32),
  place_of_birth VARCHAR(255),
  lat DOUBLE PRECISION,
  lon DOUBLE PRECISION,
  timezone VARCHAR(64),
  consent_given BOOLEAN DEFAULT FALSE,
  consent_date TIMESTAMP WITH TIME ZONE,
  last_login_location TEXT,
  last_login_lat DOUBLE PRECISION,
  last_login_lon DOUBLE PRECISION,
  is_adult BOOLEAN,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_credits (
  user_id UUID PRIMARY KEY,
  credits INTEGER DEFAULT 10 NOT NULL,
  credits_last_reset TIMESTAMP WITH TIME ZONE,
  total_paid_amount INTEGER DEFAULT 0 NOT NULL,
  is_paid BOOLEAN DEFAULT FALSE,
  last_payment_amount INTEGER DEFAULT 0,
  last_payment_verified BOOLEAN DEFAULT FALSE,
  upi_id VARCHAR(255),
  upi_txn_id VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Ensure an index on phone_number for fast lookup
CREATE INDEX IF NOT EXISTS idx_user_profiles_phone ON user_profiles (phone_number);
