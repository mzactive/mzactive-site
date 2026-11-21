PRAGMA foreign_keys = ON;

-- Athlete CRM additions are additive and consent-safe. Athletes remain member
-- accounts (provider role without a public profile). Invitation tokens are
-- hashed before storage, no token or personal data is written to logs, and a
-- coach workspace still opens only after the athlete explicitly accepts.
ALTER TABLE member_sports_profiles ADD COLUMN preferred_language TEXT NOT NULL DEFAULT '';
ALTER TABLE member_sports_profiles ADD COLUMN availability_notes TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS athlete_crm_invitations (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('coach','profile')),
  athlete_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  coach_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  connection_id TEXT REFERENCES coach_connections(id) ON DELETE SET NULL,
  invited_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  token_hash TEXT NOT NULL UNIQUE,
  language TEXT NOT NULL CHECK (language IN ('en','ar')),
  status TEXT NOT NULL CHECK (status IN ('pending','accepted','declined','revoked','expired','email_failed')),
  email_status TEXT NOT NULL CHECK (email_status IN ('pending','sent','failed')) DEFAULT 'pending',
  reason_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  responded_at TEXT
);

CREATE INDEX IF NOT EXISTS athlete_crm_invitations_athlete
  ON athlete_crm_invitations(athlete_user_id, status, created_at);
CREATE INDEX IF NOT EXISTS athlete_crm_invitations_coach
  ON athlete_crm_invitations(coach_user_id, status, created_at);

-- A separate, append-only audit trail preserves who changed an athlete's
-- coaching state and why. Details are limited to identifiers and reason codes.
CREATE TABLE IF NOT EXISTS athlete_crm_events (
  id TEXT PRIMARY KEY,
  athlete_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK (action IN (
    'profile_invited','coach_invited','invitation_resent','profile_invite_accepted',
    'profile_invite_declined','coach_invite_accepted','coach_invite_declined',
    'coach_assigned','coach_revoked','coach_reassigned','recommendations_viewed'
  )),
  entity_type TEXT NOT NULL DEFAULT '',
  entity_id TEXT NOT NULL DEFAULT '',
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS athlete_crm_events_athlete
  ON athlete_crm_events(athlete_user_id, created_at DESC);
