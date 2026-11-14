CREATE TABLE IF NOT EXISTS coach_blog_posts (
  id TEXT PRIMARY KEY,
  coach_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider_id TEXT NOT NULL REFERENCES provider_profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  body TEXT NOT NULL,
  language TEXT NOT NULL CHECK(language IN ('en','ar')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','published','draft')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  published_at TEXT
);
CREATE INDEX IF NOT EXISTS coach_blog_status_date ON coach_blog_posts(status, created_at DESC);
CREATE INDEX IF NOT EXISTS coach_blog_author_date ON coach_blog_posts(coach_user_id, created_at DESC);
