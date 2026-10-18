-- Add archived_at column to items table for soft-archive feature
ALTER TABLE items ADD COLUMN IF NOT EXISTS archived_at timestamptz DEFAULT NULL;

-- Index for efficient archive queries (sparse index — only non-null rows)
CREATE INDEX IF NOT EXISTS items_archived_at_idx ON items (user_id, archived_at) WHERE archived_at IS NOT NULL;
