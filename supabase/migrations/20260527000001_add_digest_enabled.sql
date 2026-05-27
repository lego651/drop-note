ALTER TABLE users
  ADD COLUMN IF NOT EXISTS digest_enabled boolean NOT NULL DEFAULT true;
