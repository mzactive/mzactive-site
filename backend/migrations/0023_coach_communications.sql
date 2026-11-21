-- Additive-only storage for human-approved coach communications and the
-- rule-based Momo follow-up queue. No existing table or column is changed.

CREATE TABLE IF NOT EXISTS coach_contact_records (
  id TEXT PRIMARY KEY,
  coach_profile_id TEXT NOT NULL REFERENCES provider_profiles(id) ON DELETE CASCADE,
  actor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK(channel IN ('email','whatsapp')),
  purpose TEXT NOT NULL,
  prepared_message TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('drafted','opened','confirmed_sent','completed','failed')),
  follow_up_status TEXT NOT NULL DEFAULT 'open' CHECK(follow_up_status IN ('open','completed','dismissed')),
  provider_message_id TEXT,
  error TEXT,
  followup_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS coach_contact_records_coach_created
  ON coach_contact_records(coach_profile_id, created_at DESC);

CREATE TABLE IF NOT EXISTS momo_coach_followups (
  id TEXT PRIMARY KEY,
  coach_profile_id TEXT NOT NULL UNIQUE REFERENCES provider_profiles(id) ON DELETE CASCADE,
  missing_fields_json TEXT NOT NULL,
  priority TEXT NOT NULL CHECK(priority IN ('normal','high','escalated')),
  message_en TEXT NOT NULL,
  message_ar TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('open','contacted','resolved','escalated','dismissed')),
  task_id TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_contacted_at TEXT,
  next_check_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS momo_coach_followups_status_next_check
  ON momo_coach_followups(status, next_check_at);
