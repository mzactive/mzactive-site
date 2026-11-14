ALTER TABLE provider_profiles ADD COLUMN public_fields_json TEXT NOT NULL DEFAULT '["city","specialties","languages","bio","experience_years","indicative_rate_qar","profile_photo","social_links","program_durations"]';

CREATE TABLE IF NOT EXISTS athlete_programs (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES training_teams(id) ON DELETE CASCADE,
  coach_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  athlete_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  week_start TEXT NOT NULL,
  coach_note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  UNIQUE(team_id, athlete_user_id, week_start)
);

CREATE INDEX IF NOT EXISTS athlete_programs_coach_week_idx ON athlete_programs(coach_user_id, week_start);
CREATE INDEX IF NOT EXISTS athlete_programs_athlete_week_idx ON athlete_programs(athlete_user_id, week_start);

CREATE TABLE IF NOT EXISTS athlete_program_sessions (
  id TEXT PRIMARY KEY,
  program_id TEXT NOT NULL REFERENCES athlete_programs(id) ON DELETE CASCADE,
  session_code TEXT NOT NULL,
  day_key TEXT NOT NULL CHECK(day_key IN ('monday','tuesday','wednesday','thursday','friday','saturday','sunday')),
  session_type TEXT NOT NULL CHECK(session_type IN ('easy','intervals','long_run','tempo','strength','recovery','other')),
  details TEXT NOT NULL DEFAULT '',
  planned_km REAL CHECK(planned_km IS NULL OR (planned_km >= 0 AND planned_km <= 500)),
  sort_order INTEGER NOT NULL,
  UNIQUE(program_id, day_key),
  UNIQUE(program_id, session_code)
);

CREATE TABLE IF NOT EXISTS athlete_program_completions (
  session_id TEXT NOT NULL REFERENCES athlete_program_sessions(id) ON DELETE CASCADE,
  athlete_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  completed_at TEXT NOT NULL,
  actual_km REAL NOT NULL DEFAULT 0 CHECK(actual_km >= 0 AND actual_km <= 500),
  PRIMARY KEY(session_id, athlete_user_id)
);

CREATE INDEX IF NOT EXISTS athlete_program_completions_athlete_idx ON athlete_program_completions(athlete_user_id, completed_at);
