-- Sprint 4: Full-text search (S405)
-- Add generated tsvector column for FTS on subject, ai_summary, notes

ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS search_vector tsvector
    GENERATED ALWAYS AS (
      to_tsvector('english',
        COALESCE(subject, '') || ' ' ||
        COALESCE(ai_summary, '') || ' ' ||
        COALESCE(notes, '')
      )
    ) STORED;

CREATE INDEX IF NOT EXISTS items_search_vector_gin
  ON public.items USING GIN (search_vector);

-- RPC function for combined FTS + tag name search (S405)
CREATE OR REPLACE FUNCTION search_items(query text, p_user_id uuid)
RETURNS TABLE (
  id uuid,
  subject text,
  ai_summary text,
  status text,
  pinned boolean,
  created_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT
    i.id,
    i.subject,
    i.ai_summary,
    i.status::text,
    i.pinned,
    i.created_at
  FROM items i
  LEFT JOIN item_tags it ON it.item_id = i.id
  LEFT JOIN tags t ON t.id = it.tag_id AND t.user_id = i.user_id
  WHERE i.user_id = p_user_id
    AND i.deleted_at IS NULL
    AND i.type = 'email_body'
    AND (
      i.search_vector @@ websearch_to_tsquery('english', query)
      OR LOWER(t.name) LIKE LOWER('%' || query || '%')
    )
  ORDER BY i.created_at DESC
  LIMIT 50;
$$;

-- RPC function for tag counts (S403)
CREATE OR REPLACE FUNCTION get_tags_with_counts(p_user_id uuid)
RETURNS TABLE (
  id uuid,
  name text,
  item_count int
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.id, t.name, COUNT(it.item_id)::int as item_count
  FROM tags t
  LEFT JOIN item_tags it ON it.tag_id = t.id
  LEFT JOIN items i ON i.id = it.item_id AND i.deleted_at IS NULL
  WHERE t.user_id = p_user_id
  GROUP BY t.id, t.name
  ORDER BY item_count DESC;
$$;

-- RPC function for month counts (S404)
CREATE OR REPLACE FUNCTION get_month_counts(p_user_id uuid)
RETURNS TABLE (
  month timestamptz,
  item_count int
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DATE_TRUNC('month', created_at) as month, COUNT(*)::int as item_count
  FROM public.items
  WHERE user_id = p_user_id AND deleted_at IS NULL AND type = 'email_body'
  GROUP BY month
  ORDER BY month DESC;
$$;
