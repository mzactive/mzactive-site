-- Widen the stored Owner AI Brain agent taxonomy. 0011 is already applied in
-- existing environments, so rebuild only this table and preserve every row.
PRAGMA foreign_keys = OFF;

CREATE TABLE owner_agent_tasks_new (
  id TEXT PRIMARY KEY,
  agent_type TEXT NOT NULL CHECK(agent_type IN ('operations','marketing','support','monitoring','analytics','growth','community')),
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

INSERT INTO owner_agent_tasks_new(
  id,agent_type,source,title,status,approval_status,input_json,output_json,error_message,created_at,started_at,completed_at
)
SELECT
  id,agent_type,source,title,status,approval_status,input_json,output_json,error_message,created_at,started_at,completed_at
FROM owner_agent_tasks;

DROP TABLE owner_agent_tasks;
ALTER TABLE owner_agent_tasks_new RENAME TO owner_agent_tasks;
CREATE INDEX IF NOT EXISTS owner_agent_tasks_created ON owner_agent_tasks(created_at DESC);

PRAGMA foreign_keys = ON;
