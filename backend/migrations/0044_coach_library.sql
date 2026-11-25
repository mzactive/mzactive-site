-- Private reusable library. No existing account, program, or result is changed.
CREATE TABLE IF NOT EXISTS coach_library_items (
  coach_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('exercise','workout','program')),
  item_id TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision >= 1),
  updated_at TEXT NOT NULL,
  PRIMARY KEY(coach_user_id,kind,item_id)
);
