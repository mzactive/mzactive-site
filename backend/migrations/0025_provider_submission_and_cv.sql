-- Additive provider submission state and private Sports CV storage.
-- Existing profiles are treated as submitted so current approvals, uploads and
-- the admin review queue are unchanged. No existing column is rewritten.
ALTER TABLE provider_profiles ADD COLUMN submission_state TEXT NOT NULL DEFAULT 'submitted';
ALTER TABLE provider_profiles ADD COLUMN submitted_at TEXT;

ALTER TABLE provider_profiles ADD COLUMN cv_bytes BLOB;
ALTER TABLE provider_profiles ADD COLUMN cv_content_type TEXT;
ALTER TABLE provider_profiles ADD COLUMN cv_file_name TEXT;
ALTER TABLE provider_profiles ADD COLUMN cv_byte_size INTEGER;
ALTER TABLE provider_profiles ADD COLUMN cv_updated_at TEXT;

CREATE INDEX IF NOT EXISTS provider_profiles_submission ON provider_profiles(status, submission_state, created_at);
