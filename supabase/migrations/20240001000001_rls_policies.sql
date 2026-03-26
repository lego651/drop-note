-- Enable RLS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.item_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;

-- users policies
CREATE POLICY "users: select own row"
  ON public.users FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "users: update own row"
  ON public.users FOR UPDATE
  USING (auth.uid() = id);

-- items policies
CREATE POLICY "items: select own"
  ON public.items FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "items: insert own"
  ON public.items FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "items: update own"
  ON public.items FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "items: delete own"
  ON public.items FOR DELETE
  USING (auth.uid() = user_id);

-- tags policies
CREATE POLICY "tags: select own"
  ON public.tags FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "tags: insert own"
  ON public.tags FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "tags: update own"
  ON public.tags FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "tags: delete own"
  ON public.tags FOR DELETE
  USING (auth.uid() = user_id);

-- item_tags policies (join check via items.user_id)
CREATE POLICY "item_tags: select own"
  ON public.item_tags FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.items
      WHERE items.id = item_tags.item_id
        AND items.user_id = auth.uid()
    )
  );

CREATE POLICY "item_tags: insert own"
  ON public.item_tags FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.items
      WHERE items.id = item_tags.item_id
        AND items.user_id = auth.uid()
    )
  );

CREATE POLICY "item_tags: delete own"
  ON public.item_tags FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.items
      WHERE items.id = item_tags.item_id
        AND items.user_id = auth.uid()
    )
  );

-- site_settings: read-only for all authenticated users
CREATE POLICY "site_settings: read authenticated"
  ON public.site_settings FOR SELECT
  USING (auth.uid() IS NOT NULL);
