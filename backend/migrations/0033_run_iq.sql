-- MZA Run IQ: private assessments, starter plans, workout logs and coach consent.
CREATE TABLE IF NOT EXISTS run_iq_assessments (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  assessment_json TEXT NOT NULL,
  preview_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS run_iq_plans (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  assessment_id TEXT NOT NULL REFERENCES run_iq_assessments(user_id) ON DELETE CASCADE,
  program_id TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS run_iq_workout_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL UNIQUE,
  effort TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  pace TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_run_iq_logs_user ON run_iq_workout_logs(user_id, created_at);

CREATE TABLE IF NOT EXISTS run_iq_shares (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  coach_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('active', 'revoked')),
  created_at TEXT NOT NULL,
  revoked_at TEXT,
  UNIQUE(user_id, coach_user_id)
);
CREATE INDEX IF NOT EXISTS idx_run_iq_shares_user ON run_iq_shares(user_id, status);
