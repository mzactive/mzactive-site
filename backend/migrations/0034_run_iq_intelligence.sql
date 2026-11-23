-- Extend Run IQ with advice history and private race results. Additive only.
CREATE TABLE IF NOT EXISTS run_iq_advice_history (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  fingerprint TEXT NOT NULL,
  advice_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_run_iq_advice_user ON run_iq_advice_history(user_id, created_at);

CREATE TABLE IF NOT EXISTS run_iq_race_results (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  distance_km REAL NOT NULL,
  time_seconds INTEGER NOT NULL,
  pace_label TEXT NOT NULL,
  target_pace_label TEXT NOT NULL DEFAULT '',
  effort TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  result_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_run_iq_results_user ON run_iq_race_results(user_id, created_at);
