-- Additive structured details for approved Champion Pacer profiles.
-- A single validated JSON column keeps Pacer-specific display data separate
-- from the shared professional fields without duplicating the provider model.
ALTER TABLE provider_profiles ADD COLUMN pacer_details_json TEXT NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_provider_profiles_pacer_directory
  ON provider_profiles(status, provider_type);
