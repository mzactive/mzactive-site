PRAGMA foreign_keys = ON;

-- Email-based password recovery. Only hashes of single-use links are stored;
-- the raw token is shown once in the emailed link and never written to D1.
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL,
  email_provider_id TEXT
);
CREATE INDEX IF NOT EXISTS password_reset_token_user ON password_reset_tokens(user_id, expires_at);
CREATE INDEX IF NOT EXISTS password_reset_token_expiry ON password_reset_tokens(expires_at);

-- Privacy-safe audit trail for privileged authentication events. No token,
-- password, secret or raw IP address is stored here.
CREATE TABLE IF NOT EXISTS auth_events (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK (kind IN ('reset_requested','reset_completed','admin_emergency_reset','password_changed')),
  detail TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS auth_events_created ON auth_events(created_at DESC);
