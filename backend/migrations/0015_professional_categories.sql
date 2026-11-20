-- Professional provider categories and category-aware booking requests.
-- Rebuild the two tables whose SQLite CHECK constraints cannot be widened in place;
-- all existing rows, references and IDs are preserved. No payment credentials,
-- health records or third-party API secrets are stored here.
PRAGMA foreign_keys = OFF;
PRAGMA defer_foreign_keys = ON;

CREATE TABLE provider_profiles_new (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  provider_type TEXT NOT NULL CHECK (provider_type IN ('coach','pacer','nutritionist','physiotherapist','sports_massage_therapist')),
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
);

INSERT INTO provider_profiles_new(
  id,user_id,provider_type,display_name,country,city,specialties_json,languages_json,bio,experience_years,
  indicative_rate_qar,status,review_note,updated_at,created_at,whatsapp_number,whatsapp_public,social_links_json,
  profile_photo_url,profile_photo_bytes,profile_photo_content_type,profile_photo_updated_at,public_fields_json,
  program_durations_json,qualifications,services_json,coaching_mode,verified
)
SELECT
  id,user_id,provider_type,display_name,country,city,specialties_json,languages_json,bio,experience_years,
  indicative_rate_qar,status,review_note,updated_at,created_at,whatsapp_number,whatsapp_public,social_links_json,
  profile_photo_url,profile_photo_bytes,profile_photo_content_type,profile_photo_updated_at,public_fields_json,
  program_durations_json,qualifications,services_json,coaching_mode,verified
FROM provider_profiles;

DROP TABLE provider_profiles;
ALTER TABLE provider_profiles_new RENAME TO provider_profiles;
CREATE INDEX IF NOT EXISTS providers_public_search ON provider_profiles(status, provider_type, city);

CREATE TABLE booking_requests_new (
  id TEXT PRIMARY KEY,
  provider_id TEXT REFERENCES provider_profiles(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL,
  customer_email TEXT,
  customer_phone TEXT NOT NULL,
  city TEXT NOT NULL,
  preferred_date TEXT,
  goal_summary TEXT NOT NULL,
  consent_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received','reviewing','accepted','declined','cancelled')),
  created_at TEXT NOT NULL,
  payment_status TEXT NOT NULL DEFAULT 'pending_payment' CHECK (payment_status IN ('pending_payment','confirmed','cancelled')),
  session_type TEXT NOT NULL CHECK (session_type IN ('race','training','consultation','assessment','therapy','massage','nutrition')),
  service_name TEXT NOT NULL DEFAULT '',
  distance TEXT,
  target_pace TEXT,
  program_duration_months INTEGER CHECK (program_duration_months IN (1,2,3))
);

INSERT INTO booking_requests_new(
  id,provider_id,customer_name,customer_email,customer_phone,city,preferred_date,goal_summary,consent_at,status,
  created_at,payment_status,session_type,distance,target_pace,program_duration_months
)
SELECT
  id,provider_id,customer_name,customer_email,customer_phone,city,preferred_date,goal_summary,consent_at,status,
  created_at,payment_status,session_type,distance,target_pace,program_duration_months
FROM booking_requests;

DROP TABLE booking_requests;
ALTER TABLE booking_requests_new RENAME TO booking_requests;
CREATE INDEX IF NOT EXISTS booking_review_queue ON booking_requests(status, created_at);

PRAGMA defer_foreign_keys = OFF;
PRAGMA foreign_keys = ON;
