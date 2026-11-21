PRAGMA foreign_keys = ON;

-- Read state for the management notification center is deliberately separate
-- from record status: marking an alert read never changes a booking, coach
-- application, message or moderation decision. Rows are keyed per manager and
-- per actionable record, so this adds no fan-out writes to user inboxes and
-- sends no notifications to real members.
CREATE TABLE IF NOT EXISTS management_notification_reads (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('bookings','coaches','messages','community','articles','ai')),
  entity_id TEXT NOT NULL,
  read_at TEXT NOT NULL,
  PRIMARY KEY (user_id, category, entity_id)
);

CREATE INDEX IF NOT EXISTS management_notification_reads_user
  ON management_notification_reads(user_id, category, read_at);
