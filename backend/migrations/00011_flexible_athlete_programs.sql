CREATE TABLE IF NOT EXISTS athlete_programs_v2 (
  id TEXT PRIMARY KEY,
  coach_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  team_id TEXT REFERENCES training_teams(id) ON DELETE SET NULL,
  athlete_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  athlete_name TEXT NOT NULL,
  athlete_phone TEXT NOT NULL,
  athlete_type TEXT NOT NULL CHECK(athlete_type IN ('runner','triathlon')),
  week_start TEXT NOT NULL,
  coach_note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  UNIQUE(coach_user_id, athlete_phone, week_start)
);

CREATE INDEX IF NOT EXISTS athlete_programs_v2_coach_idx ON athlete_programs_v2(coach_user_id, week_start);
CREATE INDEX IF NOT EXISTS athlete_programs_v2_athlete_idx ON athlete_programs_v2(athlete_user_id, week_start);

CREATE TABLE IF NOT EXISTS athlete_program_sessions_v2 (
  id TEXT PRIMARY KEY,
  program_id TEXT NOT NULL REFERENCES athlete_programs_v2(id) ON DELETE CASCADE,
  session_code TEXT NOT NULL,
  day_key TEXT NOT NULL CHECK(day_key IN ('monday','tuesday','wednesday','thursday','friday','saturday','sunday')),
  sport_type TEXT NOT NULL CHECK(sport_type IN ('run','bike','swim','strength','recovery','other')),
  details TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  UNIQUE(program_id, session_code)
);

CREATE INDEX IF NOT EXISTS athlete_program_sessions_v2_program_idx ON athlete_program_sessions_v2(program_id, sort_order);

CREATE TABLE IF NOT EXISTS athlete_program_completions_v2 (
  session_id TEXT NOT NULL REFERENCES athlete_program_sessions_v2(id) ON DELETE CASCADE,
  athlete_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  completed_at TEXT NOT NULL,
  actual_km REAL NOT NULL DEFAULT 0 CHECK(actual_km >= 0 AND actual_km <= 500),
  duration_minutes INTEGER NOT NULL DEFAULT 0 CHECK(duration_minutes >= 0 AND duration_minutes <= 720),
  PRIMARY KEY(session_id, athlete_user_id)
);

CREATE INDEX IF NOT EXISTS athlete_program_completions_v2_athlete_idx ON athlete_program_completions_v2(athlete_user_id, completed_at);

INSERT OR IGNORE INTO athlete_programs_v2(id,coach_user_id,team_id,athlete_user_id,athlete_name,athlete_phone,athlete_type,week_start,coach_note,created_at)
SELECT p.id,p.coach_user_id,p.team_id,p.athlete_user_id,COALESCE(m.display_name,'Athlete'),'legacy:'||p.athlete_user_id,'runner',p.week_start,p.coach_note,p.created_at
FROM athlete_programs p
LEFT JOIN training_team_members m ON m.team_id=p.team_id AND m.user_id=p.athlete_user_id;

INSERT OR IGNORE INTO athlete_program_sessions_v2(id,program_id,session_code,day_key,sport_type,details,sort_order)
SELECT s.id,s.program_id,s.session_code,s.day_key,
  CASE WHEN s.session_type='strength' THEN 'strength' WHEN s.session_type='recovery' THEN 'recovery' ELSE 'run' END,
  s.details,s.sort_order
FROM athlete_program_sessions s;

INSERT OR IGNORE INTO athlete_program_completions_v2(session_id,athlete_user_id,completed_at,actual_km,duration_minutes)
SELECT c.session_id,c.athlete_user_id,c.completed_at,c.actual_km,c.duration_minutes
FROM athlete_program_completions c;