-- Additive member photo storage. Athlete/member profile photos stay private
-- and are served only to the authenticated account owner. Existing member
-- sports profiles, programs, bookings and account records are untouched.
ALTER TABLE member_sports_profiles ADD COLUMN photo_bytes BLOB;
ALTER TABLE member_sports_profiles ADD COLUMN photo_content_type TEXT;
ALTER TABLE member_sports_profiles ADD COLUMN photo_updated_at TEXT;
ALTER TABLE member_sports_profiles ADD COLUMN share_with_coaches INTEGER NOT NULL DEFAULT 0;
