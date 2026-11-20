-- Community, engagement and private coaching workspace records.
-- No payment, health, location-history or Garmin credential data is stored here.

CREATE TABLE IF NOT EXISTS provider_covers (
  provider_id TEXT PRIMARY KEY REFERENCES provider_profiles(id) ON DELETE CASCADE,
  bytes BLOB NOT NULL,
  content_type TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS provider_achievements (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL REFERENCES provider_profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '',
  awarded_year INTEGER,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','published','hidden')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS provider_achievements_provider_status ON provider_achievements(provider_id, status, awarded_year);

CREATE TABLE IF NOT EXISTS provider_profile_views (
  provider_id TEXT NOT NULL REFERENCES provider_profiles(id) ON DELETE CASCADE,
  viewer_key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(provider_id, viewer_key)
);

CREATE TABLE IF NOT EXISTS community_posts (
  id TEXT PRIMARY KEY,
  author_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('post','event','group_session','challenge')),
  body TEXT NOT NULL,
  sport TEXT NOT NULL DEFAULT '',
  language TEXT NOT NULL DEFAULT 'en' CHECK(language IN ('en','ar')),
  starts_at TEXT,
  location TEXT NOT NULL DEFAULT '',
  capacity INTEGER CHECK(capacity IS NULL OR (capacity BETWEEN 1 AND 10000)),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','published','hidden')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  published_at TEXT
);
CREATE INDEX IF NOT EXISTS community_posts_status_kind ON community_posts(status, kind, created_at DESC);
CREATE INDEX IF NOT EXISTS community_posts_author ON community_posts(author_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS community_post_photos (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  slot INTEGER NOT NULL CHECK(slot BETWEEN 1 AND 3),
  bytes BLOB NOT NULL,
  content_type TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(post_id, slot)
);

CREATE TABLE IF NOT EXISTS community_post_views (
  post_id TEXT NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  viewer_key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(post_id, viewer_key)
);

CREATE TABLE IF NOT EXISTS community_likes (
  post_id TEXT NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY(post_id, user_id)
);

CREATE TABLE IF NOT EXISTS community_comments (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'published' CHECK(status IN ('published','hidden')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS community_comments_post ON community_comments(post_id, created_at);

CREATE TABLE IF NOT EXISTS community_rsvps (
  post_id TEXT NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  response TEXT NOT NULL CHECK(response IN ('going','interested')),
  created_at TEXT NOT NULL,
  PRIMARY KEY(post_id, user_id)
);

CREATE TABLE IF NOT EXISTS user_follows (
  follower_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  coach_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY(follower_user_id, coach_user_id),
  CHECK(follower_user_id <> coach_user_id)
);
CREATE INDEX IF NOT EXISTS user_follows_coach ON user_follows(coach_user_id, created_at);

CREATE TABLE IF NOT EXISTS member_sports_profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  sports_json TEXT NOT NULL DEFAULT '[]',
  experience_level TEXT NOT NULL DEFAULT '',
  goals TEXT NOT NULL DEFAULT '',
  age_range TEXT NOT NULL DEFAULT '',
  gender TEXT NOT NULL DEFAULT '',
  garmin_public_url TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS coach_connections (
  id TEXT PRIMARY KEY,
  coach_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  athlete_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','declined')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(coach_user_id, athlete_user_id),
  CHECK(coach_user_id <> athlete_user_id)
);
CREATE INDEX IF NOT EXISTS coach_connections_athlete ON coach_connections(athlete_user_id, status, created_at);

CREATE TABLE IF NOT EXISTS coach_messages (
  id TEXT PRIMARY KEY,
  connection_id TEXT NOT NULL REFERENCES coach_connections(id) ON DELETE CASCADE,
  sender_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  read_at TEXT
);
CREATE INDEX IF NOT EXISTS coach_messages_connection ON coach_messages(connection_id, created_at);

CREATE TABLE IF NOT EXISTS training_feedback (
  id TEXT PRIMARY KEY,
  program_id TEXT NOT NULL REFERENCES athlete_programs_v2(id) ON DELETE CASCADE,
  coach_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  athlete_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating INTEGER CHECK(rating IS NULL OR (rating BETWEEN 1 AND 5)),
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS training_feedback_program ON training_feedback(program_id, created_at);

CREATE TABLE IF NOT EXISTS user_notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  entity_type TEXT NOT NULL DEFAULT '',
  entity_id TEXT NOT NULL DEFAULT '',
  read_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS user_notifications_user ON user_notifications(user_id, read_at, created_at DESC);
