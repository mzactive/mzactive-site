-- Per-account notification preferences. Defaults preserve existing behavior.
CREATE TABLE IF NOT EXISTS user_notification_preferences (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  email_enabled INTEGER NOT NULL DEFAULT 1 CHECK (email_enabled IN (0,1)),
  dashboard_enabled INTEGER NOT NULL DEFAULT 1 CHECK (dashboard_enabled IN (0,1)),
  updated_at TEXT NOT NULL
);
