-- Synthetic health checks for the /status page.
-- pg_cron calls POST /api/health/run every 5 minutes (via pg_net); the route runs the
-- checks and writes one row per component here. Retention: 90 days.
-- Depends on 20261016000001_request_logs.sql (pg_cron, request_logs).

create table if not exists public.health_checks (
  id          bigint generated always as identity primary key,
  checked_at  timestamptz not null default now(),
  run_id      uuid not null,
  component   text not null,
  status      text not null check (status in ('up', 'degraded', 'down')),
  latency_ms  integer,
  detail      text
);

create index if not exists health_checks_component_checked_at_idx
  on public.health_checks (component, checked_at desc);

alter table public.health_checks enable row level security;
revoke all on public.health_checks from anon, authenticated;

-- Server-only secrets that must not live in git or NEXT_PUBLIC env:
--   health_check_token   bearer token pg_cron sends to /api/health/run
--   status_password_hash scrypt hash of the /status access code
-- Values are inserted out-of-band (never in a migration file).
create table if not exists public.ops_secrets (
  key         text primary key,
  value       text not null,
  updated_at  timestamptz not null default now()
);

alter table public.ops_secrets enable row level security;
revoke all on public.ops_secrets from anon, authenticated;

-- Daily uptime rollup for the 90-day bars.
create or replace function public.health_daily(p_days integer default 90)
returns table (component text, day date, total bigint, up bigint, degraded bigint, down bigint)
language sql stable
set search_path = public
as $$
  select component,
         (checked_at at time zone 'utc')::date as day,
         count(*) as total,
         count(*) filter (where status = 'up') as up,
         count(*) filter (where status = 'degraded') as degraded,
         count(*) filter (where status = 'down') as down
  from public.health_checks
  where checked_at >= (now() at time zone 'utc')::date - (p_days - 1)
  group by 1, 2
$$;

-- Real-user traffic per route for the last N hours (from request_logs).
create or replace function public.request_log_summary(p_hours integer default 24)
returns table (route text, requests bigint, client_errors bigint, server_errors bigint, p95_ms integer)
language sql stable
set search_path = public
as $$
  select route,
         count(*) as requests,
         count(*) filter (where status between 400 and 499) as client_errors,
         count(*) filter (where status >= 500) as server_errors,
         (percentile_cont(0.95) within group (order by duration_ms))::integer as p95_ms
  from public.request_logs
  where kind = 'request' and created_at >= now() - make_interval(hours => p_hours)
  group by 1
$$;

revoke all on function public.health_daily(integer) from public, anon, authenticated;
revoke all on function public.request_log_summary(integer) from public, anon, authenticated;

create extension if not exists pg_net;

select cron.schedule(
  'health-check-5min',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://dropnote.me/api/health/run',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'authorization', 'Bearer ' || (select value from public.ops_secrets where key = 'health_check_token')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  )
  where exists (select 1 from public.ops_secrets where key = 'health_check_token')
  $$
);

select cron.schedule(
  'purge-health-checks',
  '45 3 * * *',
  $$delete from public.health_checks where checked_at < now() - interval '90 days'$$
);
