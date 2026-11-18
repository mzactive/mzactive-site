CREATE TABLE IF NOT EXISTS owner_agent_tasks (
  id TEXT PRIMARY KEY,
  agent_type TEXT NOT NULL CHECK(agent_type IN ('operations','marketing','support','monitoring','analytics')),
  source TEXT NOT NULL DEFAULT 'manual' CHECK(source IN ('manual','scheduled')),
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','completed','failed','cancelled')),
  approval_status TEXT NOT NULL DEFAULT 'not_required' CHECK(approval_status IN ('not_required','pending','approved','rejected')),
  input_json TEXT NOT NULL,
  output_json TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS owner_agent_activity (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT,
  agent_type TEXT NOT NULL,
  action TEXT NOT NULL,
  status TEXT NOT NULL,
  details_json TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS owner_agent_tasks_created ON owner_agent_tasks(created_at DESC);
CREATE INDEX IF NOT EXISTS owner_agent_activity_created ON owner_agent_activity(created_at DESC);
