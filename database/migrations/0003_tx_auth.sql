-- PIN attempt tracking + useful indexes for auth/fraud queries.
BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS failed_pin_attempts int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pin_locked_until timestamptz;

CREATE INDEX IF NOT EXISTS transactions_user_type_idx ON transactions(user_id, type, created_at DESC);
CREATE INDEX IF NOT EXISTS transactions_completed_idx ON transactions(user_id, status, created_at DESC);

COMMIT;
