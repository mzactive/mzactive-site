-- Long-program support: duration metadata, explicit session dates, editable programs.
-- Rebuilds the two program tables with additive columns and removes the coach/phone/week
-- uniqueness that prevented editable or longer programs. All rows are copied unchanged.
PRAGMA foreign_keys=OFF;
CREATE TABLE athlete_programs_v2_new (
  id TEXT PRIMARY KEY,
  coach_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  team_id TEXT REFERENCES training_teams(id) ON DELETE SET NULL,
  athlete_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  athlete_name TEXT NOT NULL,
  athlete_phone TEXT NOT NULL,
  athlete_type TEXT NOT NULL CHECK(athlete_type IN ('runner','triathlon','running','cycling','swimming','fitness','strength','bodybuilding','hyrox','crossfit','general','running_strength','swim_bike')),
  week_start TEXT NOT NULL,
  coach_note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL, source TEXT NOT NULL DEFAULT 'coach'
  CHECK(source IN ('coach','ai_self','ai_coach_draft')), sent_at TEXT,
  duration_value INTEGER NOT NULL DEFAULT 1,
  duration_unit TEXT NOT NULL DEFAULT 'weeks',
  start_date TEXT,
  end_date TEXT,
  updated_at TEXT
);
INSERT INTO athlete_programs_v2_new SELECT id,coach_user_id,team_id,athlete_user_id,athlete_name,athlete_phone,athlete_type,week_start,coach_note,created_at,source,sent_at,1,'weeks',week_start,NULL,NULL FROM athlete_programs_v2;
DROP TABLE athlete_programs_v2;
ALTER TABLE athlete_programs_v2_new RENAME TO athlete_programs_v2;
CREATE INDEX athlete_programs_v2_coach_idx ON athlete_programs_v2(coach_user_id, week_start);
CREATE INDEX athlete_programs_v2_athlete_idx ON athlete_programs_v2(athlete_user_id, week_start);
CREATE INDEX athlete_programs_v2_athlete_sent_idx ON athlete_programs_v2(athlete_user_id, sent_at);
CREATE TABLE athlete_program_sessions_v2_new (
  id TEXT PRIMARY KEY,
  program_id TEXT NOT NULL REFERENCES athlete_programs_v2(id) ON DELETE CASCADE,
  session_code TEXT NOT NULL,
  day_key TEXT NOT NULL CHECK(day_key IN ('monday','tuesday','wednesday','thursday','friday','saturday','sunday')),
  sport_type TEXT NOT NULL CHECK(sport_type IN ('run','bike','swim','strength','recovery','other')),
  details TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  session_date TEXT,
  UNIQUE(program_id, session_code)
);
INSERT INTO athlete_program_sessions_v2_new SELECT id,program_id,session_code,day_key,sport_type,details,sort_order,NULL FROM athlete_program_sessions_v2;
DROP TABLE athlete_program_sessions_v2;
ALTER TABLE athlete_program_sessions_v2_new RENAME TO athlete_program_sessions_v2;
CREATE INDEX athlete_program_sessions_v2_program_idx ON athlete_program_sessions_v2(program_id, sort_order);
CREATE INDEX athlete_program_sessions_v2_date_idx ON athlete_program_sessions_v2(session_date);
PRAGMA foreign_keys=ON;
