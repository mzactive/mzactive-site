ALTER TABLE provider_profiles ADD COLUMN qualifications TEXT NOT NULL DEFAULT '';
ALTER TABLE provider_profiles ADD COLUMN services_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE provider_profiles ADD COLUMN coaching_mode TEXT NOT NULL DEFAULT '' CHECK(coaching_mode IN ('','online','in-person','both'));
CREATE TABLE provider_gallery (
  provider_id TEXT NOT NULL REFERENCES provider_profiles(id) ON DELETE CASCADE,
  slot INTEGER NOT NULL CHECK(slot BETWEEN 1 AND 3),
  bytes BLOB NOT NULL,
  content_type TEXT NOT NULL,
  PRIMARY KEY(provider_id, slot)
);
ALTER TABLE provider_profiles ADD COLUMN verified INTEGER NOT NULL DEFAULT 0 CHECK(verified IN (0,1));
