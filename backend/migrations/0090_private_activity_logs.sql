-- Separate private activity records from public moderated community posts.
CREATE TABLE IF NOT EXISTS athlete_activity_logs (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  shared_connection_id TEXT REFERENCES coach_connections(id) ON DELETE SET NULL,
  sport TEXT NOT NULL,
  activity_date TEXT NOT NULL,
  distance_km REAL,
  duration_minutes REAL NOT NULL CHECK(duration_minutes > 0 AND duration_minutes <= 1440),
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK(distance_km IS NULL OR (distance_km > 0 AND distance_km <= 1000))
);
CREATE INDEX IF NOT EXISTS athlete_activity_logs_owner_idx ON athlete_activity_logs(owner_user_id, activity_date DESC);
CREATE INDEX IF NOT EXISTS athlete_activity_logs_shared_idx ON athlete_activity_logs(shared_connection_id);
