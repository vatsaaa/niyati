-- ============================================================================
-- Migration: payment_verifications table
-- Stores UPI payment submissions for manual/automated verification.
-- Idempotent: CREATE TABLE IF NOT EXISTS, CREATE INDEX IF NOT EXISTS.
-- ============================================================================

CREATE TABLE IF NOT EXISTS payment_verifications (
  verification_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL,
  upi_id           VARCHAR(100) NOT NULL,
  transaction_id   VARCHAR(20) NOT NULL,
  amount           NUMERIC(10, 2) NOT NULL,
  currency         VARCHAR(5) NOT NULL DEFAULT 'INR',
  credits          INTEGER NOT NULL,
  status           VARCHAR(30) NOT NULL DEFAULT 'pending',
  verification_method VARCHAR(50),
  provider_response  JSONB,
  review_reason      VARCHAR(200),
  submitted_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  verified_at      TIMESTAMPTZ,

  CONSTRAINT fk_pv_user FOREIGN KEY (user_id)
    REFERENCES user_profiles(user_id) ON DELETE CASCADE
);

-- Unique constraint to prevent duplicate transaction submissions
CREATE UNIQUE INDEX IF NOT EXISTS idx_pv_transaction_id
  ON payment_verifications (transaction_id);

-- Lookup verifications by user + status
CREATE INDEX IF NOT EXISTS idx_pv_user_status
  ON payment_verifications (user_id, status);

-- Status values: pending, verified, failed, manual_review, amount_mismatch
