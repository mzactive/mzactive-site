CREATE TABLE IF NOT EXISTS community_event_subscribers (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  language TEXT NOT NULL CHECK(language IN ('en','ar')),
  confirm_hash TEXT UNIQUE,
  confirm_expires_at TEXT,
  confirmed_at TEXT
);

CREATE TABLE IF NOT EXISTS community_event_announcements (
  event_key TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  location TEXT NOT NULL,
  community_id TEXT,
  announced_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS community_event_deliveries (
  event_key TEXT NOT NULL REFERENCES community_event_announcements(event_key) ON DELETE CASCADE,
  subscriber_id TEXT NOT NULL REFERENCES community_event_subscribers(id) ON DELETE CASCADE,
  state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','sent','failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT NOT NULL,
  first_attempt_at TEXT,
  PRIMARY KEY (event_key, subscriber_id)
);

CREATE INDEX IF NOT EXISTS community_event_delivery_pending ON community_event_deliveries(state,next_attempt_at);
