-- Hide tags that have no active (non-deleted) items from the sidebar
CREATE OR REPLACE FUNCTION get_tags_with_counts()
RETURNS TABLE (
  id uuid,
  name text,
  item_count int
)
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT t.id, t.name, COUNT(it.item_id)::int AS item_count
  FROM tags t
  LEFT JOIN item_tags it ON it.tag_id = t.id
  LEFT JOIN items i ON i.id = it.item_id AND i.deleted_at IS NULL
  WHERE t.user_id = auth.uid()
  GROUP BY t.id, t.name
  HAVING COUNT(it.item_id) > 0
  ORDER BY item_count DESC, t.name;
$$;
