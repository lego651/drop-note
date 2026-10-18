-- =============================================================================
-- RLS hotfix: block_list, invite_codes, usage_log had RLS disabled with full
-- anon+authenticated table grants (DRO-200 §0.1) — anyone with the public
-- anon key could read/write the blocklist, invite codes, and usage log.
--
-- This file mirrors a change already applied directly to production on
-- 2026-10-18 (Jason-approved) and is a no-op if run again. No policies are
-- added: all application access to these three tables goes through
-- supabaseAdmin (service role), which bypasses RLS, so RLS-on/no-policy is
-- the correct end state (fail-closed for anon/authenticated).
-- =============================================================================

alter table public.block_list enable row level security;
alter table public.invite_codes enable row level security;
alter table public.usage_log enable row level security;
