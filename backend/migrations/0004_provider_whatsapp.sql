ALTER TABLE provider_profiles ADD COLUMN whatsapp_number TEXT;
ALTER TABLE provider_profiles ADD COLUMN whatsapp_public INTEGER NOT NULL DEFAULT 0 CHECK (whatsapp_public IN (0, 1));
ALTER TABLE provider_profiles ADD COLUMN social_links_json TEXT NOT NULL DEFAULT '[]';
