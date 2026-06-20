-- Folders: user-created multi-membership collections (Jason 2026-06-19)
-- Mirrors tags/item_tags. An item can belong to many folders.

CREATE TABLE public.folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  position int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX folders_user_id_name_lower_idx ON public.folders(user_id, lower(name));
CREATE INDEX folders_user_id_position_idx ON public.folders(user_id, position, created_at);

CREATE TABLE public.item_folders (
  item_id uuid NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  folder_id uuid NOT NULL REFERENCES public.folders(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (item_id, folder_id)
);
CREATE INDEX item_folders_folder_id_idx ON public.item_folders(folder_id);

-- RLS
ALTER TABLE public.folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.item_folders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "folders: select own" ON public.folders FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "folders: insert own" ON public.folders FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "folders: update own" ON public.folders FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "folders: delete own" ON public.folders FOR DELETE USING (auth.uid() = user_id);

-- item_folders: caller must own BOTH the item and the folder
CREATE POLICY "item_folders: select own" ON public.item_folders FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.items i WHERE i.id = item_folders.item_id AND i.user_id = auth.uid()));

CREATE POLICY "item_folders: insert own" ON public.item_folders FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.items i WHERE i.id = item_folders.item_id AND i.user_id = auth.uid())
    AND EXISTS (SELECT 1 FROM public.folders f WHERE f.id = item_folders.folder_id AND f.user_id = auth.uid())
  );

CREATE POLICY "item_folders: delete own" ON public.item_folders FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.items i WHERE i.id = item_folders.item_id AND i.user_id = auth.uid()));

-- RPC: folders with item counts. SECURITY INVOKER (RLS-enforced, no user param).
-- Unlike get_tags_with_counts, NO `HAVING COUNT > 0` — empty folders must show as drop targets.
CREATE OR REPLACE FUNCTION get_folders_with_counts()
RETURNS TABLE (
  id uuid,
  name text,
  position int,
  item_count int
)
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT f.id, f.name, f.position,
         COUNT(if2.item_id) FILTER (WHERE i.id IS NOT NULL)::int AS item_count
  FROM folders f
  LEFT JOIN item_folders if2 ON if2.folder_id = f.id
  LEFT JOIN items i ON i.id = if2.item_id AND i.deleted_at IS NULL AND i.archived_at IS NULL
  WHERE f.user_id = auth.uid()
  GROUP BY f.id, f.name, f.position, f.created_at
  ORDER BY f.position ASC, f.created_at ASC;
$$;
