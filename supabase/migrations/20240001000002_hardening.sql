-- =============================================================================
-- R-001: Enable RLS on block_list, invite_codes, usage_log + add policies
-- =============================================================================

ALTER TABLE public.block_list ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invite_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_log ENABLE ROW LEVEL SECURITY;

-- block_list: admins only (all operations)
CREATE POLICY "block_list: admin select"
  ON public.block_list FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true));

CREATE POLICY "block_list: admin insert"
  ON public.block_list FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true));

CREATE POLICY "block_list: admin update"
  ON public.block_list FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true));

CREATE POLICY "block_list: admin delete"
  ON public.block_list FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true));

-- invite_codes: users see codes they created or claimed; only admins can insert/delete;
-- any user may claim an unclaimed code (set used_by)
CREATE POLICY "invite_codes: select own"
  ON public.invite_codes FOR SELECT
  USING (created_by = auth.uid() OR used_by = auth.uid());

CREATE POLICY "invite_codes: admin insert"
  ON public.invite_codes FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true));

CREATE POLICY "invite_codes: claim unclaimed"
  ON public.invite_codes FOR UPDATE
  USING (used_by IS NULL);

CREATE POLICY "invite_codes: admin delete"
  ON public.invite_codes FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true));

-- usage_log: users can read their own rows; service_role handles all writes
CREATE POLICY "usage_log: select own"
  ON public.usage_log FOR SELECT
  USING (user_id = auth.uid());

-- =============================================================================
-- R-002: Add admin write policies to site_settings
-- =============================================================================

CREATE POLICY "site_settings: admin insert"
  ON public.site_settings FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true));

CREATE POLICY "site_settings: admin update"
  ON public.site_settings FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true));

CREATE POLICY "site_settings: admin delete"
  ON public.site_settings FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true));

-- =============================================================================
-- R-010: Add updated_at columns and auto-update triggers to users and items
-- =============================================================================

ALTER TABLE public.users ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.items ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER users_set_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER items_set_updated_at
  BEFORE UPDATE ON public.items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =============================================================================
-- R-011: Unique constraint on block_list(type, value) — case-insensitive value
-- =============================================================================

CREATE UNIQUE INDEX idx_block_list_type_value ON public.block_list(type, lower(value));

-- =============================================================================
-- R-012: Composite index on usage_log + CHECK constraint for month format
-- =============================================================================

CREATE INDEX idx_usage_log_user_month ON public.usage_log(user_id, month);

ALTER TABLE public.usage_log
  ADD CONSTRAINT usage_log_month_format
  CHECK (month ~ '^\d{4}-(0[1-9]|1[0-2])$');

-- =============================================================================
-- R-014: Partial index on items for active (non-deleted) rows
-- =============================================================================

CREATE INDEX idx_items_active
  ON public.items(user_id, created_at DESC)
  WHERE deleted_at IS NULL;
