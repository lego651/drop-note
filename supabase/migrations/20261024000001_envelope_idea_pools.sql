-- Envelopes v1 slice 3 (DRO-302): daily personalized idea pool for the Mood
-- Sheet (slice 2, DRO-301) — replaces the 4 static mood chips with ~12 ideas
-- generated once a day (lazily, on sheet open, when the stored pool is
-- missing or stale) from the user's own category/tag counts plus recent
-- item subjects. Additive only; no changes to any existing table.
--
-- Board-approved migration (DRO-299 "Option 1 — Mood Sheet" spec, 2026-10-24:
-- "this is an additive migration, so the coordinator approves it on Jason's
-- behalf") — ships here as a file only. The CTO does not apply it; the board
-- applies it to production via the Supabase MCP apply_migration tool.
--
-- References public.users(id), not auth.users(id): the ticket's draft SQL
-- used auth.users, but every other per-user table in this repo (envelopes,
-- categories, tags) references public.users(id) — see
-- 20261018000001_envelopes.sql's own comment on why `authenticated` needs
-- insert/update policies here too, not just select, since generation runs
-- through the user's own authenticated Supabase client, never supabaseAdmin.

create table public.envelope_idea_pools (
  user_id uuid primary key references public.users(id) on delete cascade,
  ideas jsonb not null,
  generated_at timestamptz not null default now()
);

alter table public.envelope_idea_pools enable row level security;

create policy "envelope_idea_pools: select own"
  on public.envelope_idea_pools for select
  using (auth.uid() = user_id);

create policy "envelope_idea_pools: insert own"
  on public.envelope_idea_pools for insert
  with check (auth.uid() = user_id);

create policy "envelope_idea_pools: update own"
  on public.envelope_idea_pools for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
