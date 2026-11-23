-- MZ AI Brain email notifications, configurable daily report, and privacy-safe audit.
CREATE TABLE IF NOT EXISTS ai_brain_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  notifications_enabled INTEGER NOT NULL DEFAULT 1,
  report_time TEXT NOT NULL DEFAULT '07:00',
  timezone TEXT NOT NULL DEFAULT 'Asia/Qatar',
  admin_email TEXT NOT NULL DEFAULT 'mzactive@yahoo.com',
  last_report_at TEXT,
  last_report_status TEXT NOT NULL DEFAULT 'never_run',
  updated_at TEXT NOT NULL
);
INSERT OR IGNORE INTO ai_brain_settings(id, updated_at) VALUES(1, datetime('now'));

CREATE TABLE IF NOT EXISTS ai_brain_outbox (
  id TEXT PRIMARY KEY,
  event_key TEXT NOT NULL UNIQUE,
  recipient TEXT NOT NULL,
  kind TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  provider_id TEXT,
  error TEXT,
  created_at TEXT NOT NULL,
  sent_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_ai_brain_outbox_status ON ai_brain_outbox(status, created_at);

CREATE TABLE IF NOT EXISTS ai_brain_reports (
  id TEXT PRIMARY KEY,
  report_date TEXT NOT NULL UNIQUE,
  report_time TEXT NOT NULL,
  summary TEXT NOT NULL,
  counts_json TEXT NOT NULL DEFAULT '{}',
  recommendations_json TEXT NOT NULL DEFAULT '[]',
  email_status TEXT NOT NULL DEFAULT 'pending',
  provider_id TEXT,
  error TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ai_brain_reports_created ON ai_brain_reports(created_at);

CREATE TABLE IF NOT EXISTS ai_brain_errors (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  message TEXT NOT NULL,
  context_json TEXT NOT NULL DEFAULT '{}',
  resolved INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ai_brain_errors_created ON ai_brain_errors(created_at, resolved);
