ALTER TABLE provider_profiles ADD COLUMN whatsapp_number TEXT;
ALTER TABLE provider_profiles ADD COLUMN whatsapp_public INTEGER NOT NULL DEFAULT 0 CHECK (whatsapp_public IN (0, 1));
