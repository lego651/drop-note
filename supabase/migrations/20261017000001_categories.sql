-- Tags A+ ticket 2/5 (DRO-103): categories schema.
--
-- Every item gets exactly ONE category (AI-assigned, user can move it). The existing
-- `tags`/`item_tags` tables are kept as-is and now serve as hidden search "keywords"
-- (see PR report for the rename-vs-keep trade-off) — nothing about their schema changes
-- here, so the existing 145 tags are untouched.
--
-- Guardrails enforced here vs. in application code:
--   - Case-insensitive unique name per user: DB unique index (cheap, always correct).
--   - At most one "Other" category per user: DB partial unique index on is_other.
--   - Cap of 15 categories per user: DB trigger, BEFORE INSERT only. Insert-only means
--     it can never block a DELETE, so it can't interfere with the account-deletion wipe.
--   - "Other" is undeletable: enforced in application code (lib/categories.ts), NOT a DB
--     trigger. A DB-level BEFORE DELETE trigger would also fire during full account
--     deletion (apps/web/app/api/account/delete/route.ts), which deletes every category
--     including Other for a departing user — exactly the case we must allow. RLS already
--     restricts category deletes to the owning user (or the admin service-role client used
--     deliberately for account wipes), so the guardrail only needs to live in the one code
--     path users can actually reach.

CREATE TABLE public.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  position int NOT NULL DEFAULT 0,
  hidden boolean NOT NULL DEFAULT false,
  is_default boolean NOT NULL DEFAULT false,
  is_other boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX categories_user_id_name_lower_idx ON public.categories(user_id, lower(name));
-- At most one "Other" (the AI fallback / undeletable category) per user.
CREATE UNIQUE INDEX categories_user_id_is_other_idx ON public.categories(user_id) WHERE is_other;
CREATE INDEX idx_categories_user_id ON public.categories(user_id);

CREATE OR REPLACE FUNCTION public.enforce_category_cap()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (SELECT COUNT(*) FROM public.categories WHERE user_id = NEW.user_id) >= 15 THEN
    RAISE EXCEPTION 'category cap of 15 reached for user %', NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER categories_cap_before_insert
  BEFORE INSERT ON public.categories
  FOR EACH ROW EXECUTE FUNCTION public.enforce_category_cap();

-- items: one category per item, plus the "sticky" lock set when a user manually moves
-- an item. ON DELETE RESTRICT on category_id is a safety net: the app must reassign an
-- item's category_id to a different (surviving) category before it deletes the old one
-- (see lib/categories.ts deleteCategory), so a RESTRICT violation here means that
-- reassignment step has a bug rather than silently orphaning the item.
ALTER TABLE public.items
  ADD COLUMN category_id uuid REFERENCES public.categories(id) ON DELETE RESTRICT,
  ADD COLUMN category_locked boolean NOT NULL DEFAULT false;

CREATE INDEX idx_items_category_id ON public.items(category_id);

-- RLS on the new table, mirroring the existing tags policies.
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "categories: select own"
  ON public.categories FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "categories: insert own"
  ON public.categories FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "categories: update own"
  ON public.categories FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "categories: delete own"
  ON public.categories FOR DELETE
  USING (auth.uid() = user_id);

-- Seed the 8 defaults for every existing user that doesn't already have them
-- (idempotent — re-running this migration, or running it after a partial seed, is safe).
INSERT INTO public.categories (user_id, name, position, is_default, is_other)
SELECT u.id, d.name, d.position, true, (d.name = 'Other')
FROM public.users u
CROSS JOIN (
  VALUES
    ('Food & Drink', 0),
    ('Health & Fitness', 1),
    ('Tech', 2),
    ('Entertainment', 3),
    ('Sports', 4),
    ('Home & DIY', 5),
    ('Learning & Work', 6),
    ('Other', 7)
) AS d(name, position)
WHERE NOT EXISTS (
  SELECT 1 FROM public.categories c
  WHERE c.user_id = u.id AND lower(c.name) = lower(d.name)
);

-- Seed the same 8 defaults for every new signup going forward.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.users (id, email, drop_token)
  VALUES (
    NEW.id,
    NEW.email,
    gen_random_uuid()
  );

  INSERT INTO public.categories (user_id, name, position, is_default, is_other)
  VALUES
    (NEW.id, 'Food & Drink', 0, true, false),
    (NEW.id, 'Health & Fitness', 1, true, false),
    (NEW.id, 'Tech', 2, true, false),
    (NEW.id, 'Entertainment', 3, true, false),
    (NEW.id, 'Sports', 4, true, false),
    (NEW.id, 'Home & DIY', 5, true, false),
    (NEW.id, 'Learning & Work', 6, true, false),
    (NEW.id, 'Other', 7, true, true);

  RETURN NEW;
END;
$$;

-- Search must also match on category name (keywords already match via tags below).
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
