-- Reversible trash support. Soft-delete only; no account data is erased.
ALTER TABLE users ADD COLUMN deleted_by TEXT;
ALTER TABLE users ADD COLUMN previous_account_status TEXT;
ALTER TABLE users ADD COLUMN previous_profile_visibility TEXT;
