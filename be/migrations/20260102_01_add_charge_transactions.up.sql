-- Add charge_transactions table to support idempotent billing

BEGIN;

CREATE TABLE IF NOT EXISTS charge_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id varchar(255) NOT NULL UNIQUE,
  phone_number varchar(50) NOT NULL,
  amount integer NOT NULL,
  status varchar(32) NOT NULL DEFAULT 'pending',
  credits_after integer,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_charge_transactions_phone ON charge_transactions(phone_number);

COMMIT;
