-- Backfill existing `users` data into `user_profiles` and `user_credits`
-- Idempotent: uses ON CONFLICT DO NOTHING to avoid duplicates

-- Copy profile fields from legacy `users` table into `user_profiles`
INSERT INTO user_profiles (user_id, phone_number, name, date_of_birth, time_of_birth, place_of_birth, lat, lon, timezone, consent_given, consent_date, last_login_location, last_login_lat, last_login_lon, is_adult, created_at, updated_at)
SELECT
  id,
  phone_number,
  name,
  date_of_birth,
  time_of_birth,
  place_of_birth,
  lat,
  lon,
  timezone,
  consent_given,
  consent_date,
  last_login_location,
  last_login_lat,
  last_login_lon,
  is_adult,
  created_at,
  updated_at
FROM users
ON CONFLICT (user_id) DO NOTHING;

-- Copy billing/credits fields into user_credits
INSERT INTO user_credits (user_id, credits, credits_last_reset, total_paid_amount, is_paid, last_payment_amount, last_payment_verified, upi_id, upi_txn_id, created_at, updated_at)
SELECT
  id,
  COALESCE(credits, 10),
  credits_last_reset,
  COALESCE(total_paid_amount, 0),
  COALESCE(is_paid, false),
  COALESCE(last_payment_amount, 0),
  COALESCE(last_payment_verified, false),
  upi_id,
  upi_txn_id,
  created_at,
  updated_at
FROM users
ON CONFLICT (user_id) DO NOTHING;
