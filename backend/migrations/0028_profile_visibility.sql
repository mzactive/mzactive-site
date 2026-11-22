-- Additive moderation state for public profile visibility. Existing accounts
-- stay public; hiding never deletes the account, revokes login or removes records.
ALTER TABLE users ADD COLUMN profile_visibility TEXT NOT NULL DEFAULT 'public' CHECK (profile_visibility IN ('public','hidden'));
ALTER TABLE users ADD COLUMN profile_hidden_at TEXT;
ALTER TABLE users ADD COLUMN profile_hidden_reason TEXT;
CREATE INDEX IF NOT EXISTS users_profile_visibility ON users(profile_visibility, account_status);
