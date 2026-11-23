-- Add Bodybuilding Coach as a provider category. Rebuild only the category
-- CHECK constraint; every existing row, id and relationship is preserved.
PRAGMA foreign_keys=OFF;
CREATE TABLE "provider_profiles_new" (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  provider_type TEXT NOT NULL CHECK (provider_type IN ('coach','pacer','nutritionist','physiotherapist','sports_massage_therapist','bodybuilding_coach')),
  display_name TEXT NOT NULL,
  country TEXT NOT NULL DEFAULT 'Qatar',
  city TEXT NOT NULL,
  specialties_json TEXT NOT NULL DEFAULT '[]',
  languages_json TEXT NOT NULL DEFAULT '[]',
  bio TEXT NOT NULL,
  experience_years INTEGER NOT NULL DEFAULT 0 CHECK (experience_years BETWEEN 0 AND 60),
  indicative_rate_qar INTEGER CHECK (indicative_rate_qar IS NULL OR indicative_rate_qar BETWEEN 0 AND 100000),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  review_note TEXT,
  updated_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  whatsapp_number TEXT,
  whatsapp_public INTEGER NOT NULL DEFAULT 0 CHECK (whatsapp_public IN (0,1)),
  social_links_json TEXT NOT NULL DEFAULT '[]',
  profile_photo_url TEXT,
  profile_photo_bytes BLOB,
  profile_photo_content_type TEXT,
  profile_photo_updated_at TEXT,
  public_fields_json TEXT NOT NULL DEFAULT '["city","specialties","languages","bio","experience_years","indicative_rate_qar","profile_photo","social_links","program_durations","whatsapp"]',
  program_durations_json TEXT NOT NULL DEFAULT '[1,2,3]',
  qualifications TEXT NOT NULL DEFAULT '',
  services_json TEXT NOT NULL DEFAULT '[]',
  coaching_mode TEXT NOT NULL DEFAULT '' CHECK (coaching_mode IN ('','online','in-person','both')),
  verified INTEGER NOT NULL DEFAULT 0 CHECK (verified IN (0,1)),
  certificate_name TEXT NOT NULL DEFAULT '',
  certificate_issuer TEXT NOT NULL DEFAULT '',
  certificate_number TEXT NOT NULL DEFAULT '',
  license_number TEXT NOT NULL DEFAULT '',
  license_issuer TEXT NOT NULL DEFAULT '',
  license_country TEXT NOT NULL DEFAULT '',
  license_expires_on TEXT,
  license_status TEXT NOT NULL DEFAULT 'not_submitted' CHECK (license_status IN ('not_submitted','pending','verified','rejected')),
  license_review_note TEXT NOT NULL DEFAULT ''
, submission_state TEXT NOT NULL DEFAULT 'submitted', submitted_at TEXT, cv_bytes BLOB, cv_content_type TEXT, cv_file_name TEXT, cv_byte_size INTEGER, cv_updated_at TEXT, pacer_details_json TEXT NOT NULL DEFAULT '{}');
INSERT INTO provider_profiles_new SELECT * FROM provider_profiles;
DROP TABLE provider_profiles;
ALTER TABLE provider_profiles_new RENAME TO provider_profiles;
CREATE INDEX providers_public_search ON provider_profiles(status, provider_type, city);
CREATE INDEX provider_profiles_submission ON provider_profiles(status, submission_state, created_at);
CREATE INDEX idx_provider_profiles_pacer_directory
  ON provider_profiles(status, provider_type);
PRAGMA foreign_keys=ON;
