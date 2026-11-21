-- Additive super-admin marker. Existing administrators keep full access;
-- accounts promoted later are limited administrators until explicitly elevated.
ALTER TABLE users ADD COLUMN is_super_admin INTEGER NOT NULL DEFAULT 0;
UPDATE users SET is_super_admin = 1 WHERE role = 'admin';

-- Member accounts keep their own contact fields so administrator edits are
-- persisted without creating a professional profile or granting coach access.
ALTER TABLE member_sports_profiles ADD COLUMN whatsapp_number TEXT;
ALTER TABLE member_sports_profiles ADD COLUMN country TEXT NOT NULL DEFAULT 'Qatar';
