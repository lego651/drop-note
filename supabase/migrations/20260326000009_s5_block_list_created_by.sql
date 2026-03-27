-- S5-R003: Add created_by to block_list
-- NULL = auto-blocked by ingest system; non-null = added by an admin
ALTER TABLE public.block_list
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
