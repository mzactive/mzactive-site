-- Private shared coaching workspaces.
-- Activated only after a confirmed booking and mutual acceptance between an
-- approved coach and a member athlete. No payment, health-record or Garmin
-- credential data is stored here.
ALTER TABLE coach_connections ADD COLUMN booking_id TEXT;
ALTER TABLE coach_connections ADD COLUMN source TEXT NOT NULL DEFAULT 'request';
ALTER TABLE coach_connections ADD COLUMN athlete_accepted_at TEXT;
ALTER TABLE coach_connections ADD COLUMN workspace_status TEXT NOT NULL DEFAULT 'none' CHECK (workspace_status IN ('none','pending','active','closed'));
ALTER TABLE coach_connections ADD COLUMN workspace_created_at TEXT;
ALTER TABLE booking_requests ADD COLUMN customer_user_id TEXT;

CREATE INDEX IF NOT EXISTS coach_connections_booking ON coach_connections(booking_id);
CREATE INDEX IF NOT EXISTS coach_connections_workspace ON coach_connections(workspace_status, updated_at);
CREATE INDEX IF NOT EXISTS booking_requests_customer_user ON booking_requests(customer_user_id, created_at);

CREATE TABLE IF NOT EXISTS coach_workspace_attachments (
  id TEXT PRIMARY KEY,
  connection_id TEXT NOT NULL REFERENCES coach_connections(id) ON DELETE CASCADE,
  uploader_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  bytes BLOB NOT NULL,
  byte_size INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS coach_workspace_attachments_connection ON coach_workspace_attachments(connection_id, created_at);

CREATE TABLE IF NOT EXISTS coach_workspace_progress (
  id TEXT PRIMARY KEY,
  connection_id TEXT NOT NULL REFERENCES coach_connections(id) ON DELETE CASCADE,
  author_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  metric TEXT NOT NULL,
  value TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  recorded_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS coach_workspace_progress_connection ON coach_workspace_progress(connection_id, recorded_at);
