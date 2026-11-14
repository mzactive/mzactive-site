ALTER TABLE provider_profiles
  ADD COLUMN program_durations_json TEXT NOT NULL DEFAULT '[1,2,3]';

ALTER TABLE booking_requests
  ADD COLUMN program_duration_months INTEGER CHECK (program_duration_months IN (1,2,3));
