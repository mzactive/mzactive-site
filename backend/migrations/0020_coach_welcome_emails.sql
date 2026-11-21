PRAGMA foreign_keys = ON;

-- One welcome email per successful administrator approval event. The unique
-- approval_event_id makes double clicks, retries and replays harmless.
CREATE TABLE IF NOT EXISTS coach_welcome_emails (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES provider_profiles(id) ON DELETE CASCADE,
  approval_event_id TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  first_name TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'en',
  status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('pending','sent','failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  provider_id TEXT,
  error TEXT,
  created_at TEXT NOT NULL,
  next_attempt_at TEXT,
  sent_at TEXT
);

CREATE INDEX IF NOT EXISTS coach_welcome_emails_retry
  ON coach_welcome_emails(status, next_attempt_at);

CREATE INDEX IF NOT EXISTS coach_welcome_emails_profile
  ON coach_welcome_emails(profile_id, created_at DESC);
