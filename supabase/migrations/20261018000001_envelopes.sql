-- Envelopes v1 slice 1 (DRO-193): a user picks 2-8 items + a free-text prompt
-- (optionally seeded by a "purpose" chip) and the AI composes them into a
-- checklist/list/table/notes document. See DRO-190/191/192 for the full spec.
--
-- HARD GATE: this migration must NOT be applied to production until Jason
-- (the board) approves it — see the PR description. It ships in this PR as a
-- file only.

create table public.envelopes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  intent_input jsonb not null,
  status text not null default 'generating'
    constraint envelopes_status_check check (status in ('generating', 'done', 'partial', 'failed')),
  body jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_envelopes_user_id on public.envelopes(user_id);

create trigger envelopes_set_updated_at
  before update on public.envelopes
  for each row execute function public.set_updated_at();

create table public.envelope_items (
  envelope_id uuid not null references public.envelopes(id) on delete cascade,
  item_id uuid not null references public.items(id) on delete cascade,
  primary key (envelope_id, item_id)
);

create index idx_envelope_items_item_id on public.envelope_items(item_id);

-- RLS: ownership follows categories' owner-only pattern, but unlike categories,
-- envelope generation is a logged-in user action that writes through the user's
-- own authenticated Supabase client (never supabaseAdmin) — see lib/envelopes.ts
-- and app/api/envelopes/generate/route.ts. So, unlike categories, `authenticated`
-- also needs insert/update policies, not just select.
alter table public.envelopes enable row level security;

create policy "envelopes: select own"
  on public.envelopes for select
  using (auth.uid() = user_id);

create policy "envelopes: insert own"
  on public.envelopes for insert
  with check (auth.uid() = user_id);

-- Update is restricted to the generate route writing status/body/error_message
-- back onto a row it just inserted in the same request; there's no user-facing
-- edit UI in this slice (DRO-195 is edit/regenerate).
create policy "envelopes: update own"
  on public.envelopes for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

alter table public.envelope_items enable row level security;

create policy "envelope_items: select own"
  on public.envelope_items for select
  using (
    exists (
      select 1 from public.envelopes e
      where e.id = envelope_items.envelope_id
        and e.user_id = auth.uid()
    )
  );

create policy "envelope_items: insert own"
  on public.envelope_items for insert
  with check (
    exists (
      select 1 from public.envelopes e
      where e.id = envelope_items.envelope_id
        and e.user_id = auth.uid()
    )
  );
