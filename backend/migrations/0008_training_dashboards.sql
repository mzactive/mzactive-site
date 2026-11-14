CREATE TABLE IF NOT EXISTS training_teams (
  id TEXT PRIMARY KEY,
  coach_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  join_code TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS training_teams_coach_idx ON training_teams(coach_user_id, created_at);

CREATE TABLE IF NOT EXISTS training_team_members (
  team_id TEXT NOT NULL REFERENCES training_teams(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  joined_at TEXT NOT NULL,
  PRIMARY KEY(team_id, user_id)
);

CREATE INDEX IF NOT EXISTS training_team_members_user_idx ON training_team_members(user_id, joined_at);

CREATE TABLE IF NOT EXISTS training_sessions (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES training_teams(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  starts_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK(status IN ('scheduled','completed','cancelled')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS training_sessions_team_start_idx ON training_sessions(team_id, starts_at);

CREATE TABLE IF NOT EXISTS training_messages (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES training_teams(id) ON DELETE CASCADE,
  coach_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS training_messages_team_date_idx ON training_messages(team_id, created_at);

CREATE TABLE IF NOT EXISTS training_completions (
  session_id TEXT NOT NULL REFERENCES training_sessions(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  completed_at TEXT NOT NULL,
  PRIMARY KEY(session_id, user_id)
);
