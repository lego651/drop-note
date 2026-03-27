-- S6 performance indexes
-- All use CREATE INDEX CONCURRENTLY IF NOT EXISTS — non-blocking, zero downtime

-- Most common query: dashboard items load (user_id + created_at DESC, non-deleted only)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_items_user_id_created_at
  ON public.items (user_id, created_at DESC)
  WHERE deleted_at IS NULL;

-- Tag filter join
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_item_tags_tag_id
  ON public.item_tags (tag_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_item_tags_item_id
  ON public.item_tags (item_id);

-- Ingest block list check (hot path — runs on every inbound email)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_block_list_type_value
  ON public.block_list (type, value);
