-- =============================================================================
-- DRO-200: sync remaining repo/prod drift left after the RLS and users-grant
-- hotfixes (20261018000002, 20261018000003). Forward-only, idempotent — every
-- statement is safe to run again. Do NOT apply to production without Jason's
-- explicit sign-off at apply time (board ruling, DRO-200).
--
-- NOT included here (by board decision, DRO-200 §7):
--   - site_settings admin write policies — SKIPPED. All admin writes go
--     through supabaseAdmin (service role), which bypasses RLS; adding
--     authenticated-facing write policies would only widen the attack surface.
--   - folders / item_folders / get_folders_with_counts — stays in DRO-119.
--   - Relocating the pg_net extension out of public — DEFERRED (would need
--     the pg_cron health-check job's net.http_post call site updated too);
--     noted as backlog.
--   - Repairing the misnamed `20240001000002` ledger row, and inserting the
--     missing `20260527000001` ledger row — both are writes to
--     supabase_migrations.schema_migrations, not schema changes. They run as
--     a separate post-verify runbook step, after this migration has actually
--     been applied (board decision 4/4b).
-- =============================================================================

-- =============================================================================
-- Step 1: public.set_updated_at() — idempotent re-confirmation of the function
-- already created in prod for the envelopes migration (20261018000001), now
-- with search_path pinned per board decision 6 (closes the Supabase linter's
-- function_search_path_mutable warning). No behavior change: the function
-- already fully qualifies every reference, so pinning search_path only
-- removes ambiguity.
-- Risk: NONE. Lock: none (function replace is catalog-only).
-- Rollback: CREATE OR REPLACE the function again without the SET clause.
-- =============================================================================
create or replace function public.set_updated_at()
returns trigger language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Same search_path hardening for enforce_category_cap() (DRO-200 §7-6).
create or replace function public.enforce_category_cap()
returns trigger language plpgsql
set search_path = public, pg_temp
as $$
begin
  if (select count(*) from public.categories where user_id = new.user_id) >= 15 then
    raise exception 'category cap of 15 reached for user %', new.user_id;
  end if;
  return new;
end;
$$;

-- =============================================================================
-- Step 2: drop the leftover, broken "invite_codes: claim unclaimed" policy
-- (DRO-200 §0.1a). RLS was already enabled on invite_codes by the 20261018000002
-- hotfix; this policy's WITH CHECK is a self-referential subquery bug (see plan
-- §0.1a) that is now live but still wrong. The real claim flow goes through
-- supabaseAdmin (service role, bypasses RLS), so the fix is to drop it rather
-- than repair it again.
-- Risk: NONE (removes a policy; service role is unaffected by RLS either way).
-- Lock: none. Rollback: re-create the same (broken) policy —
--   create policy "invite_codes: claim unclaimed" on public.invite_codes
--     for update using (used_by is null);
-- =============================================================================
drop policy if exists "invite_codes: claim unclaimed" on public.invite_codes;

-- =============================================================================
-- Step 3: R-010 — updated_at columns + auto-update triggers on users and items.
-- Risk: LOW. Data impact: backfill existing rows from created_at (board
-- decision 2 — "unmodified since creation" is the truthful value, vs. now()
-- which would falsely claim every row was just modified).
-- Lock/downtime: split into ADD COLUMN (nullable, no default — metadata-only,
-- instant) + UPDATE (normal row updates, trivial at users=6/items=47 rows) +
-- SET DEFAULT/SET NOT NULL, instead of a single ADD COLUMN ... NOT NULL
-- DEFAULT now(), which would force Postgres to rewrite the table under
-- ACCESS EXCLUSIVE because now() is STABLE, not a true constant. This split
-- avoids that rewrite lock entirely regardless of table size.
-- Rollback: drop trigger, then drop column.
-- =============================================================================
alter table public.users add column if not exists updated_at timestamptz;
update public.users set updated_at = created_at where updated_at is null;
alter table public.users alter column updated_at set default now();
alter table public.users alter column updated_at set not null;

alter table public.items add column if not exists updated_at timestamptz;
update public.items set updated_at = created_at where updated_at is null;
alter table public.items alter column updated_at set default now();
alter table public.items alter column updated_at set not null;

drop trigger if exists users_set_updated_at on public.users;
create trigger users_set_updated_at
  before update on public.users
  for each row execute function public.set_updated_at();

drop trigger if exists items_set_updated_at on public.items;
create trigger items_set_updated_at
  before update on public.items
  for each row execute function public.set_updated_at();

-- =============================================================================
-- Step 4: R-011, revised — case-insensitive uniqueness on block_list, under a
-- NEW name (idx_block_list_type_value_lower) to avoid the name collision with
-- s6_perf_indexes' plain idx_block_list_type_value (DRO-200 §5-1). Board
-- decision 3: include it anyway, even though block_list_type_value_unique
-- already prevents exact-match duplicates — this additionally catches
-- case-variant duplicates (e.g. "spam@x.com" vs "Spam@X.com"). Confirmed
-- (prod-results Q15a) zero case-variant duplicate groups exist today, so no
-- cleanup is needed before adding it.
-- Risk: LOW (confirmed no conflicting data). Lock: block_list has 1 row —
-- instant.
-- Rollback: drop index idx_block_list_type_value_lower;
-- =============================================================================
create unique index if not exists idx_block_list_type_value_lower
  on public.block_list(type, lower(value));

-- Board decision 3b: drop the confirmed-duplicate plain idx_block_list_type_value
-- (s6_perf_indexes.sql) — same (type, value) columns as block_list_type_value_unique,
-- pure write overhead with zero query benefit; the unique constraint's own index
-- already serves any lookup this one could.
-- Risk: NONE (dropping a redundant index; nothing can depend on it being
-- non-unique since block_list_type_value_unique already enforces uniqueness
-- on the same columns). Lock: instant at 1 row.
-- Rollback: create index if not exists idx_block_list_type_value
--   on public.block_list (type, value);
drop index if exists public.idx_block_list_type_value;

-- =============================================================================
-- Step 5: R-012 — usage_log month-format CHECK + composite index.
-- Risk: LOW — prod-results Q15c confirms 0 existing rows would violate the
-- CHECK. Lock: usage_log has 1 row — instant; NOT VALID/VALIDATE split kept
-- anyway as the standard safe pattern for adding a CHECK constraint.
-- Rollback: alter table public.usage_log drop constraint if exists
--   usage_log_month_format; drop index if exists idx_usage_log_user_month;
-- =============================================================================
create index if not exists idx_usage_log_user_month on public.usage_log(user_id, month);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'usage_log_month_format'
  ) then
    alter table public.usage_log
      add constraint usage_log_month_format
      check (month ~ '^\d{4}-(0[1-9]|1[0-2])$') not valid;
  end if;
end;
$$;

alter table public.usage_log validate constraint usage_log_month_format;

-- =============================================================================
-- Step 6: R-014, revised — partial active-items index under a new,
-- non-colliding name (idx_items_active). s6_perf_indexes.sql's attempt to
-- redefine idx_items_user_id_created_at as this same partial shape was
-- silently inert (name already claimed by initial_schema's full index) —
-- DRO-200 §5-2.
-- Risk: LOW. Lock: items has 47 rows — instant; CREATE INDEX CONCURRENTLY
-- not needed at this scale.
-- Rollback: drop index idx_items_active;
-- =============================================================================
create index if not exists idx_items_active
  on public.items(user_id, created_at desc)
  where deleted_at is null;

-- Board decision 8: drop the now-redundant non-partial idx_items_user_id_created_at
-- now that idx_items_active exists and every current query path already filters
-- deleted_at is null. 47 rows — a plain drop is fine (board-approved), run in
-- the same file as the index it's made redundant by.
-- Risk: LOW (dropping a superseded index; nothing relies on it being
-- non-partial). Lock: instant at 47 rows.
-- Rollback: create index if not exists idx_items_user_id_created_at
--   on public.items (user_id, created_at desc) where deleted_at is null;
--   (note: this recreates it with the partial shape the file intended, not
--   the original full index — the original full index's definition is lost
--   once dropped; see initial_schema.sql for the pre-partial definition if a
--   true revert to the original is ever needed.)
drop index if exists public.idx_items_user_id_created_at;
