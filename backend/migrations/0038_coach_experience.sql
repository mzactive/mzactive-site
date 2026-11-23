-- Coach dashboard core: actionable notifications and confirmed program delivery.
ALTER TABLE user_notifications ADD COLUMN href TEXT;
ALTER TABLE athlete_programs_v2 ADD COLUMN sent_at TEXT;

CREATE TABLE IF NOT EXISTS coach_notification_outbox (
  id TEXT PRIMARY KEY,
  event_key TEXT NOT NULL UNIQUE,
  recipient TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  provider_id TEXT,
  error TEXT,
  created_at TEXT NOT NULL,
  sent_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_coach_notification_outbox_status ON coach_notification_outbox(status, created_at);
