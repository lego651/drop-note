-- DRO-105 fix round 1 (B1): search_items() never returned category data, so items
-- found via /api/items/search rendered without a category badge/picker. Add the
-- joined category fields (flattened, since RETURNS TABLE can't nest a composite
-- without extra client-side plumbing) so the route can rebuild the same
-- `category: { id, name, position, is_other } | null` shape the main items query uses.

DROP FUNCTION IF EXISTS search_items(text);

CREATE OR REPLACE FUNCTION search_items(query text)
RETURNS TABLE (
  id uuid,
  subject text,
  sender_email text,
  ai_summary text,
  status text,
  error_message text,
  pinned boolean,
  created_at timestamptz,
  category_id uuid,
  category_locked boolean,
  category_name text,
  category_position integer,
  category_is_other boolean
)
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT DISTINCT
    i.id,
    i.subject,
    i.sender_email,
    i.ai_summary,
    i.status::text,
    i.error_message,
    i.pinned,
    i.created_at,
    i.category_id,
    i.category_locked,
    c.name,
    c.position,
    c.is_other
  FROM items i
  LEFT JOIN categories c ON c.id = i.category_id
  WHERE i.user_id = auth.uid()
    AND i.deleted_at IS NULL
    AND i.type = 'email_body'
    AND (
      i.search_vector @@ websearch_to_tsquery('english', query)
      OR EXISTS (
        SELECT 1 FROM item_tags it
        JOIN tags t ON t.id = it.tag_id
        WHERE it.item_id = i.id
          AND LOWER(t.name) LIKE LOWER('%' || query || '%')
      )
      OR LOWER(c.name) LIKE LOWER('%' || query || '%')
    )
  ORDER BY i.created_at DESC
  LIMIT 50;
$$;
