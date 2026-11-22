-- MZA AI Coach: additive tables only. Existing programs, bookings, accounts
-- and moderation records are untouched. All planning stays in the existing
-- athlete_programs_v2 calendar so no second calendar system is created.
CREATE TABLE IF NOT EXISTS ai_coach_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL CHECK(length(value) <= 40),
  updated_at TEXT NOT NULL,
  updated_by TEXT
);

INSERT OR IGNORE INTO ai_coach_settings(key, value, updated_at, updated_by)
VALUES ('athlete_coach_enabled', 'true', '2026-11-22T00:00:00.000Z', 'migration'),
       ('coach_planner_enabled', 'true', '2026-11-22T00:00:00.000Z', 'migration');

CREATE TABLE IF NOT EXISTS ai_training_drafts (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('athlete','coach')),
  purpose TEXT NOT NULL CHECK(purpose IN ('initial','adjustment','coach_draft')),
  week_start TEXT NOT NULL,
  days_json TEXT NOT NULL DEFAULT '[]',
  plan_json TEXT NOT NULL,
  source_draft_id TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','approved','rejected','superseded')),
  requires_coach_approval INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  approved_at TEXT,
  approved_program_id TEXT
);

CREATE INDEX IF NOT EXISTS ai_training_drafts_owner_idx ON ai_training_drafts(owner_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_training_drafts_actor_idx ON ai_training_drafts(actor_user_id, created_at DESC);

-- source=coach covers every existing program. AI-created programs are marked so
-- approval rules can distinguish self-approved plans from coach-managed plans.
ALTER TABLE athlete_programs_v2 ADD COLUMN source TEXT NOT NULL DEFAULT 'coach'
  CHECK(source IN ('coach','ai_self','ai_coach_draft'));
