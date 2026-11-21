-- Additive account lifecycle state and privileged account-management audit.
-- Every existing account defaults to active. No row is rewritten or removed.
ALTER TABLE users ADD COLUMN account_status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE users ADD COLUMN status_reason TEXT;
ALTER TABLE users ADD COLUMN deleted_at TEXT;
ALTER TABLE users ADD COLUMN anonymized_at TEXT;

CREATE TABLE IF NOT EXISTS account_events (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT NOT NULL REFERENCES users(id),
  subject_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  detail TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS account_events_subject ON account_events(subject_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS account_events_created ON account_events(created_at DESC);
