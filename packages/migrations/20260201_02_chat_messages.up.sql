-- ============================================================================
-- Migration: chat_messages table
-- Persists chat history for session restoration and audit.
-- Idempotent: CREATE TABLE IF NOT EXISTS, CREATE INDEX IF NOT EXISTS.
-- ============================================================================

CREATE TABLE IF NOT EXISTS chat_messages (
  message_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL,
  role         VARCHAR(10) NOT NULL CHECK (role IN ('user', 'assistant')),
  content      TEXT NOT NULL,
  query_type   VARCHAR(50),
  credit_cost  INTEGER DEFAULT 0,
  metadata     JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT fk_cm_user FOREIGN KEY (user_id)
    REFERENCES user_profiles(user_id) ON DELETE CASCADE
);

-- Fast lookup of user's chat history ordered by time (most recent first)
CREATE INDEX IF NOT EXISTS idx_cm_user_created
  ON chat_messages (user_id, created_at DESC);
