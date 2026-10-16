-- Request + event logs, keyed by correlation id (x-correlation-id header).
-- Written only by the server (service role). No RLS policies = no access for anon/authenticated.
-- Retention: 14 days, purged daily by pg_cron.

create table if not exists public.request_logs (
  id             bigint generated always as identity primary key,
  created_at     timestamptz not null default now(),
  correlation_id text,
  kind           text not null check (kind in ('request', 'event')),
  level          text not null check (level in ('info', 'warn', 'error')),
  event          text not null,
  route          text,
  method         text,
  status         integer,
  duration_ms    integer,
  user_id        uuid,
  message        text,
  meta           jsonb not null default '{}'::jsonb
);

create index if not exists request_logs_correlation_id_idx on public.request_logs (correlation_id);
create index if not exists request_logs_created_at_idx on public.request_logs (created_at desc);
create index if not exists request_logs_route_created_at_idx on public.request_logs (route, created_at desc);
create index if not exists request_logs_errors_idx on public.request_logs (created_at desc) where level = 'error';

alter table public.request_logs enable row level security;
revoke all on public.request_logs from anon, authenticated;

-- Daily retention purge (03:30 UTC).
create extension if not exists pg_cron;

select cron.schedule(
  'purge-request-logs',
  '30 3 * * *',
  $$delete from public.request_logs where created_at < now() - interval '14 days'$$
);
