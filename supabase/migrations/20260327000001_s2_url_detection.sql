-- Add URL/video detection columns to items
ALTER TABLE items
  ADD COLUMN IF NOT EXISTS source_type text,
  ADD COLUMN IF NOT EXISTS source_url text,
  ADD COLUMN IF NOT EXISTS thumbnail_url text;

COMMENT ON COLUMN items.source_type IS 'Detected content type: email | youtube | url (null = legacy rows, treated as email)';
COMMENT ON COLUMN items.source_url IS 'The primary URL extracted from the email body, if applicable';
COMMENT ON COLUMN items.thumbnail_url IS 'Thumbnail image URL for video/link preview cards';
