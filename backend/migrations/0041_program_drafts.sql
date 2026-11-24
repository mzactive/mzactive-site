-- Server-side program drafts so in-progress multi-week plans survive tab/device changes.
CREATE TABLE IF NOT EXISTS program_drafts (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  payload_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
