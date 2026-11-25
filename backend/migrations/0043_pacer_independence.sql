CREATE TABLE IF NOT EXISTS pacer_profiles (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL DEFAULT 'Qatar',
  city TEXT NOT NULL DEFAULT '',
  languages_json TEXT NOT NULL DEFAULT '[]',
  bio TEXT NOT NULL DEFAULT '',
  experience TEXT NOT NULL DEFAULT '',
  achievements TEXT NOT NULL DEFAULT '',
  distances_json TEXT NOT NULL DEFAULT '[]',
  paces_json TEXT NOT NULL DEFAULT '{}',
  availability TEXT NOT NULL DEFAULT '',
  social_links_json TEXT NOT NULL DEFAULT '[]',
  photo_bytes BLOB,
  photo_content_type TEXT,
  photo_updated_at TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','suspended')),
  verified INTEGER NOT NULL DEFAULT 0 CHECK (verified IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pacer_profiles_directory ON pacer_profiles(status, verified, country, city);

INSERT OR IGNORE INTO pacer_profiles (
  id, user_id, display_name, email, phone, country, city, languages_json, bio,
  experience, achievements, distances_json, paces_json, availability, social_links_json,
  photo_bytes, photo_content_type, photo_updated_at, status, verified, created_at, updated_at
)
SELECT
  'pacer-' || p.id, p.user_id, p.display_name, u.email, COALESCE(p.whatsapp_number,''),
  p.country, p.city, COALESCE(p.languages_json,'[]'), COALESCE(p.bio,''), COALESCE(CAST(p.experience_years AS TEXT),''),
  '', COALESCE(json_extract(p.pacer_details_json,'$.distances'),'[]'),
  COALESCE(json_extract(p.pacer_details_json,'$.paces'),'{}'),
  COALESCE(json_extract(p.pacer_details_json,'$.availability'),''),
  COALESCE(p.social_links_json,'[]'), p.profile_photo_bytes, p.profile_photo_content_type,
  p.profile_photo_updated_at, p.status, CASE WHEN p.verified=1 THEN 1 ELSE 0 END, p.created_at, p.updated_at
FROM provider_profiles p JOIN users u ON u.id=p.user_id
WHERE p.provider_type='pacer';

CREATE TABLE IF NOT EXISTS pacer_requests (
  id TEXT PRIMARY KEY,
  pacer_id TEXT NOT NULL REFERENCES pacer_profiles(id) ON DELETE CASCADE,
  customer_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL,
  customer_email TEXT,
  customer_phone TEXT NOT NULL,
  location TEXT NOT NULL,
  event_name TEXT NOT NULL,
  date TEXT NOT NULL,
  distance TEXT NOT NULL,
  target_pace TEXT,
  target_time TEXT,
  message TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined','completed','cancelled')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pacer_requests_pacer ON pacer_requests(pacer_id, status, created_at);
