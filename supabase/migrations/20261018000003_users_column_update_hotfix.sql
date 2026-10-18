-- =============================================================================
-- Privilege-escalation hotfix: `authenticated` held table-wide UPDATE on
-- public.users (DRO-200 §0.2). The only UPDATE policy restricts rows to
-- auth.uid() = id but does not restrict which columns can be set, so any
-- authenticated user could PATCH their own row's is_admin, tier, or
-- stripe_customer_id.
--
-- This file mirrors a change already applied directly to production on
-- 2026-10-18 (Jason-approved) and is a no-op if run again: `authenticated`
-- can now only update digest_enabled and welcome_email_sent on public.users;
-- `anon` has no UPDATE on public.users at all.
-- =============================================================================

revoke update on public.users from anon, authenticated;
grant update (digest_enabled, welcome_email_sent) on public.users to authenticated;

