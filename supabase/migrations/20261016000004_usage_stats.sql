-- Usage rollups for the /status/usage dashboard (owner-only, behind the /status access code).
-- Computed on read: cheap at beta scale (items(created_at) index below). Switch to a nightly
-- rollup table if items grow past ~100k. All days are UTC.

create index if not exists items_created_at_idx on public.items (created_at);

-- One row per day for the last p_days days (oldest first), including days with no activity.
--   emails        = inbound emails processed (one email_body item per email)
--   items         = all items created (email bodies + attachments + links), incl. later-deleted ones
--   failed_items  = items whose AI processing ended in status 'failed'
--   active_users  = distinct users who saved at least one item that day
--   new_users     = sign-ups that day
--   total_users   = all users signed up by the end of that day
create or replace function public.usage_daily(p_days integer default 90)
returns table (
  day date,
  emails bigint,
  items bigint,
  failed_items bigint,
  active_users bigint,
  new_users bigint,
  total_users bigint
)
language sql stable
set search_path = public
as $$
  with days as (
    select generate_series(
      (now() at time zone 'utc')::date - (p_days - 1),
      (now() at time zone 'utc')::date,
      interval '1 day'
    )::date as day
  ),
  item_counts as (
    select (created_at at time zone 'utc')::date as day,
           count(*) filter (where type = 'email_body') as emails,
           count(*) as items,
           count(*) filter (where status = 'failed') as failed_items,
           count(distinct user_id) as active_users
    from public.items
    where created_at >= (now() at time zone 'utc')::date - (p_days - 1)
    group by 1
  ),
  signups as (
    select (created_at at time zone 'utc')::date as day, count(*) as new_users
    from public.users
    group by 1
  )
  select d.day,
         coalesce(i.emails, 0),
         coalesce(i.items, 0),
         coalesce(i.failed_items, 0),
         coalesce(i.active_users, 0),
         coalesce(s.new_users, 0),
         (select count(*) from public.users u where (u.created_at at time zone 'utc')::date <= d.day)
  from days d
  left join item_counts i using (day)
  left join signups s using (day)
  order by d.day
$$;

-- Top users by items created in the last p_days days.
create or replace function public.usage_top_users(p_days integer default 30, p_limit integer default 10)
returns table (
  user_id uuid,
  email text,
  tier text,
  items bigint,
  emails bigint,
  last_item_at timestamptz
)
language sql stable
set search_path = public
as $$
  select i.user_id,
         u.email,
         u.tier::text,
         count(*) as items,
         count(*) filter (where i.type = 'email_body') as emails,
         max(i.created_at) as last_item_at
  from public.items i
  join public.users u on u.id = i.user_id
  where i.created_at >= now() - make_interval(days => p_days)
  group by i.user_id, u.email, u.tier
  order by items desc, last_item_at desc
  limit p_limit
$$;

revoke all on function public.usage_daily(integer) from public, anon, authenticated;
revoke all on function public.usage_top_users(integer, integer) from public, anon, authenticated;
