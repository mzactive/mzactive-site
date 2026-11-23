-- Privacy-safe first-party Run IQ launch funnel and anonymous feedback.
CREATE TABLE IF NOT EXISTS run_iq_events (
  id TEXT PRIMARY KEY,
  event_key TEXT NOT NULL UNIQUE,
  event_name TEXT NOT NULL CHECK (event_name IN (
    'page_view', 'assessment_started', 'assessment_completed', 'results_viewed',
    'save_plan_clicked', 'registration_completed', 'plan_saved', 'coach_profile_clicked'
  )),
  visitor_key TEXT NOT NULL,
  user_id TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_run_iq_events_name_time ON run_iq_events(event_name, created_at);

CREATE TABLE IF NOT EXISTS run_iq_feedback (
  id TEXT PRIMARY KEY,
  visitor_key TEXT NOT NULL,
  user_id TEXT,
  rating TEXT NOT NULL CHECK (rating IN ('yes', 'somewhat', 'not_yet')),
  comment TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_run_iq_feedback_time ON run_iq_feedback(created_at);
