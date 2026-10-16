import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/auth/require-admin'
import { buildDayBuckets, countDistinctUsers, type DayBucket, type TrendPoint } from '@/lib/admin/stats'
import { withRouteLogging } from '@/lib/observability/logger'

// Matches supabase/config.toml's PostgREST max_rows; pagination must stop before this cap.
const USAGE_LOG_PAGE_SIZE = 1000

async function fetchDailyCounts(
  table: 'items' | 'users',
  buckets: DayBucket[]
): Promise<TrendPoint[]> {
  const results = await Promise.all(
    buckets.map(({ startISO, endISO }) =>
      supabaseAdmin
        .from(table)
        .select('*', { count: 'exact', head: true })
        .gte('created_at', startISO)
        .lt('created_at', endISO)
    )
  )
  return buckets.map((bucket, i) => ({ date: bucket.date, count: results[i].count ?? 0 }))
}

// Pages through usage_log with `.range()` so counts aren't silently capped at
// PostgREST's max_rows (1000) once a window has more rows than that.
async function fetchUsageLogUserIds(sinceISO: string): Promise<{ user_id: string }[]> {
  const rows: { user_id: string }[] = []
  let offset = 0
  for (;;) {
    const { data, error } = await supabaseAdmin
      .from('usage_log')
      .select('user_id')
      .gte('created_at', sinceISO)
      .order('id', { ascending: true })
      .range(offset, offset + USAGE_LOG_PAGE_SIZE - 1)
    if (error || !data || data.length === 0) break
    rows.push(...data)
    if (data.length < USAGE_LOG_PAGE_SIZE) break
    offset += USAGE_LOG_PAGE_SIZE
  }
  return rows
}

async function handleGET() {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const now = new Date()
  const last7Buckets = buildDayBuckets(now, 7)
  const last14Buckets = buildDayBuckets(now, 14)
  const todayISO = last7Buckets[last7Buckets.length - 1].startISO
  const sevenDaysAgoISO = last7Buckets[0].startISO

  const [
    { count: totalUsers },
    { count: newUsersToday },
    { count: itemsIngestedToday },
    { count: failedItems },
    { count: totalActiveItems },
    { count: itemsSavedTotal },
    itemsSavedTrend,
    signupsTrend,
    usageToday,
    usageLast7Days,
  ] = await Promise.all([
    supabaseAdmin.from('users').select('*', { count: 'exact', head: true }),
    supabaseAdmin
      .from('users')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', todayISO),
    supabaseAdmin
      .from('items')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', todayISO),
    supabaseAdmin
      .from('items')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'failed'),
    supabaseAdmin
      .from('items')
      .select('*', { count: 'exact', head: true })
      .is('deleted_at', null),
    supabaseAdmin.from('items').select('*', { count: 'exact', head: true }),
    fetchDailyCounts('items', last7Buckets),
    fetchDailyCounts('users', last14Buckets),
    fetchUsageLogUserIds(todayISO),
    fetchUsageLogUserIds(sevenDaysAgoISO),
  ])

  return NextResponse.json({
    totalUsers: totalUsers ?? 0,
    newUsersToday: newUsersToday ?? 0,
    itemsIngestedToday: itemsIngestedToday ?? 0,
    failedItems: failedItems ?? 0,
    totalActiveItems: totalActiveItems ?? 0,
    itemsSavedTotal: itemsSavedTotal ?? 0,
    itemsSavedTrend,
    signupsTrend,
    dauProxy: countDistinctUsers(usageToday),
    wauProxy: countDistinctUsers(usageLast7Days),
  })
}

export const GET = withRouteLogging('GET /api/admin/stats', handleGET)
