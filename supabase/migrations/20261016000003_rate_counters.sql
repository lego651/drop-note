-- Short-lived counters for rate limits, quotas and send-once flags.
-- Replaces Upstash Redis (the Upstash database was deleted; Postgres is enough at our scale).
-- Server-only (service role): RLS on, no policies, revoked from anon/authenticated.

create table if not exists public.rate_counters (
  key         text primary key,
  count       integer not null,
  expires_at  timestamptz not null
);

create index if not exists rate_counters_expires_at_idx on public.rate_counters (expires_at);

alter table public.rate_counters enable row level security;
revoke all on public.rate_counters from anon, authenticated;

-- Atomically add p_by to a fixed-window counter and return the new total.
-- An expired counter restarts from zero with a fresh p_ttl_seconds window.
-- With p_limit set, an increment that would exceed it is refused: returns -1
-- and leaves the counter unchanged (the old Redis Lua check-and-increment).
create or replace function public.counter_incr(
  p_key text,
  p_ttl_seconds integer,
  p_by integer default 1,
  p_limit integer default null
)
returns integer
language plpgsql
volatile
set search_path = public
as $$
declare
  v_count integer;
begin
  -- The upsert takes the row lock, so concurrent callers serialize on the key.
  insert into public.rate_counters as c (key, count, expires_at)
  values (p_key, 0, now() + make_interval(secs => p_ttl_seconds))
  on conflict (key) do update set
    count      = case when c.expires_at <= now() then 0 else c.count end,
    expires_at = case when c.expires_at <= now() then excluded.expires_at else c.expires_at end
  returning count into v_count;

  if p_limit is not null and v_count + p_by > p_limit then
    return -1;
  end if;

  update public.rate_counters set count = count + p_by where key = p_key
  returning count into v_count;
  return v_count;
end
$$;

revoke all on function public.counter_incr(text, integer, integer, integer) from public, anon, authenticated;

-- Daily purge of expired counters (03:15 UTC).
select cron.schedule(
  'purge-rate-counters',
  '15 3 * * *',
  $$delete from public.rate_counters where expires_at < now() - interval '1 day'$$
);
