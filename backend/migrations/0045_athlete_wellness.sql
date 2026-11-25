CREATE TABLE IF NOT EXISTS athlete_wellness_entries (
 athlete_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 entry_id TEXT NOT NULL,
 entry_date TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('meal','checkin')),
 payload_json TEXT NOT NULL,
 created_at TEXT NOT NULL,
 PRIMARY KEY(athlete_user_id,entry_id)
);
CREATE INDEX IF NOT EXISTS athlete_wellness_by_date ON athlete_wellness_entries(athlete_user_id,entry_date);
