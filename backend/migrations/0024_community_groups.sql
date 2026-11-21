-- Additive community groups, membership, chat, reports and event recurrence.
-- Existing community posts keep working; new columns are nullable/defaulted.

CREATE TABLE IF NOT EXISTS communities (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  name_key TEXT NOT NULL UNIQUE,
  sport TEXT NOT NULL,
  description TEXT NOT NULL,
  location TEXT NOT NULL DEFAULT '',
  visibility TEXT NOT NULL DEFAULT 'public' CHECK(visibility IN ('public','private')),
  rules TEXT NOT NULL DEFAULT '',
  cover_bytes BLOB,
  cover_content_type TEXT,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','suspended','removed')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS communities_discovery ON communities(status, visibility, sport, name);
CREATE INDEX IF NOT EXISTS communities_owner ON communities(owner_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS community_group_members (
  community_id TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('owner','moderator','member')),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','pending')),
  joined_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(community_id, user_id)
);
CREATE INDEX IF NOT EXISTS community_group_members_user ON community_group_members(user_id, status, joined_at DESC);
CREATE INDEX IF NOT EXISTS community_group_members_pending ON community_group_members(community_id, status, joined_at);

ALTER TABLE community_posts ADD COLUMN community_id TEXT;
ALTER TABLE community_posts ADD COLUMN visibility TEXT NOT NULL DEFAULT 'public' CHECK(visibility IN ('public','private'));
ALTER TABLE community_posts ADD COLUMN title TEXT NOT NULL DEFAULT '';
ALTER TABLE community_posts ADD COLUMN series_id TEXT;
ALTER TABLE community_posts ADD COLUMN recurrence TEXT NOT NULL DEFAULT 'none' CHECK(recurrence IN ('none','weekly'));
ALTER TABLE community_posts ADD COLUMN starts_at_local TEXT;
ALTER TABLE community_posts ADD COLUMN timezone TEXT NOT NULL DEFAULT 'Asia/Qatar';
ALTER TABLE community_posts ADD COLUMN organizer_profile_id TEXT;
ALTER TABLE community_posts ADD COLUMN online_details TEXT NOT NULL DEFAULT '';
ALTER TABLE community_posts ADD COLUMN cancelled_at TEXT;
ALTER TABLE community_posts ADD COLUMN edited_at TEXT;
CREATE INDEX IF NOT EXISTS community_posts_community ON community_posts(community_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS community_posts_upcoming ON community_posts(kind, status, starts_at);
CREATE UNIQUE INDEX IF NOT EXISTS community_posts_series_start
  ON community_posts(series_id, starts_at) WHERE series_id IS NOT NULL AND starts_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS community_messages (
  id TEXT PRIMARY KEY,
  community_id TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  sender_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL DEFAULT '',
  photo_bytes BLOB,
  photo_content_type TEXT,
  status TEXT NOT NULL DEFAULT 'published' CHECK(status IN ('published','hidden')),
  created_at TEXT NOT NULL,
  edited_at TEXT
);
CREATE INDEX IF NOT EXISTS community_messages_timeline ON community_messages(community_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS community_message_reads (
  community_id TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_read_at TEXT,
  muted INTEGER NOT NULL DEFAULT 0,
  activity_enabled INTEGER NOT NULL DEFAULT 1,
  event_reminders INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(community_id, user_id)
);

CREATE TABLE IF NOT EXISTS community_reports (
  id TEXT PRIMARY KEY,
  community_id TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  reporter_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK(entity_type IN ('community','post','comment','message')),
  entity_id TEXT NOT NULL,
  reason TEXT NOT NULL CHECK(reason IN ('spam','harassment','unsafe','misinformation','other')),
  details TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','reviewed','dismissed','actioned')),
  created_at TEXT NOT NULL,
  reviewed_by TEXT,
  reviewed_at TEXT
);
CREATE INDEX IF NOT EXISTS community_reports_status ON community_reports(status, created_at DESC);
CREATE INDEX IF NOT EXISTS community_reports_community ON community_reports(community_id, created_at DESC);

CREATE TABLE IF NOT EXISTS community_audit (
  id TEXT PRIMARY KEY,
  community_id TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  actor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL DEFAULT '',
  entity_id TEXT NOT NULL DEFAULT '',
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS community_audit_timeline ON community_audit(community_id, created_at DESC);
