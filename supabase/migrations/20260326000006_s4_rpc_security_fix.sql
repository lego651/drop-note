-- Sprint 4: Replace SECURITY DEFINER RPCs with SECURITY INVOKER (T4-F05)
-- Also fixes: month format returns text YYYY-MM instead of timestamptz (T4-F10a)
-- Also fixes: search_items returns sender_email and error_message for ItemCard rendering (T4-F10b)
--
-- The old functions accepted a p_user_id uuid parameter under SECURITY DEFINER,
-- which allowed any caller with the anon key to pass an arbitrary user UUID and
-- read that user's data, bypassing RLS entirely.
--
-- The new functions use SECURITY INVOKER so they run as the authenticated caller,
-- letting RLS enforce row-level isolation. auth.uid() is used internally — no
-- caller-supplied user ID parameter is needed or accepted.

-- Drop old signatures first (CREATE OR REPLACE cannot change the parameter list)
DROP FUNCTION IF EXISTS search_items(text, uuid);
DROP FUNCTION IF EXISTS get_tags_with_counts(uuid);
DROP FUNCTION IF EXISTS get_month_counts(uuid);

-- T4-F05 + T4-F10b: search_items — SECURITY INVOKER, no p_user_id, adds sender_email + error_message
CREATE OR REPLACE FUNCTION search_items(query text)
RETURNS TABLE (
  id uuid,
  subject text,
  sender_email text,
  ai_summary text,
  status text,
  error_message text,
  pinned boolean,
  created_at timestamptz
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
    i.created_at
  FROM items i
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
    )
  ORDER BY i.created_at DESC
  LIMIT 50;
$$;

-- T4-F05: get_tags_with_counts — SECURITY INVOKER, no p_user_id
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
  SELECT t.id, t.name, COUNT(it.item_id)::int as item_count
  FROM tags t
  LEFT JOIN item_tags it ON it.tag_id = t.id
  LEFT JOIN items i ON i.id = it.item_id AND i.deleted_at IS NULL
  WHERE t.user_id = auth.uid()
  GROUP BY t.id, t.name
  ORDER BY item_count DESC;
$$;

-- T4-F05 + T4-F10a: get_month_counts — SECURITY INVOKER, no p_user_id, month is text (YYYY-MM)
CREATE OR REPLACE FUNCTION get_month_counts()
RETURNS TABLE (
  month text,
  item_count int
)
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') as month, COUNT(*)::int as item_count
  FROM public.items
  WHERE user_id = auth.uid() AND deleted_at IS NULL AND type = 'email_body'
  GROUP BY DATE_TRUNC('month', created_at)
  ORDER BY DATE_TRUNC('month', created_at) DESC;
$$;
