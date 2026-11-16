-- Run against mzactive-marketplace D1 after staging review.
CREATE TABLE IF NOT EXISTS community_members (
 id TEXT PRIMARY KEY,
 email TEXT NOT NULL UNIQUE COLLATE NOCASE,
 display_name TEXT NOT NULL,
 locale TEXT NOT NULL CHECK(locale IN ('ar','en')),
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','active')),
 verified_at TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 marketing_opt_in INTEGER NOT NULL DEFAULT 0 CHECK(marketing_opt_in IN (0,1)),
 age_range TEXT,
 gender TEXT,
 city TEXT,
 sports TEXT,
 experience TEXT
);
CREATE TABLE IF NOT EXISTS community_email_outbox (
 id TEXT PRIMARY KEY,
 member_id TEXT NOT NULL REFERENCES community_members(id),
 template TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sent','failed')),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 sent_at TEXT,
 UNIQUE(member_id,template)
);
CREATE INDEX IF NOT EXISTS idx_community_email_outbox_status ON community_email_outbox(status);
