import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/auth/require-admin'

interface TrendPoint {
  date: string
  count: number
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function startOfDay(d: Date): Date {
  const copy = new Date(d)
  copy.setHours(0, 0, 0, 0)
  return copy
}

function daysAgo(d: Date, days: number): Date {
  const copy = new Date(d)
  copy.setDate(copy.getDate() - days)
  return copy
}

// Buckets rows into daily counts, inclusive of `now`'s day, going back `days` total days.
function buildDailyTrend(rows: { created_at: string }[], days: number, now: Date): TrendPoint[] {
  const buckets = new Map<string, number>()
  for (let i = days - 1; i >= 0; i--) {
    buckets.set(dateKey(daysAgo(now, i)), 0)
  }
  for (const row of rows) {
    const key = dateKey(new Date(row.created_at))
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1)
  }
  return Array.from(buckets.entries()).map(([date, count]) => ({ date, count }))
}

function countDistinctUsers(rows: { user_id: string }[]): number {
  return new Set(rows.map((row) => row.user_id)).size
}

export async function GET() {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const now = new Date()
  const todayStart = startOfDay(now)
  const todayISO = todayStart.toISOString()
  const sevenDaysAgoISO = daysAgo(todayStart, 6).toISOString()
  const fourteenDaysAgoISO = daysAgo(todayStart, 13).toISOString()

  const [
    { count: totalUsers },
    { count: newUsersToday },
    { count: itemsIngestedToday },
    { count: failedItems },
    { count: totalActiveItems },
    { count: itemsSavedTotal },
    { data: itemsLast7Days },
    { data: usersLast14Days },
    { data: usageToday },
    { data: usageLast7Days },
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
    supabaseAdmin.from('items').select('created_at').gte('created_at', sevenDaysAgoISO),
    supabaseAdmin.from('users').select('created_at').gte('created_at', fourteenDaysAgoISO),
    supabaseAdmin.from('usage_log').select('user_id').gte('created_at', todayISO),
    supabaseAdmin.from('usage_log').select('user_id').gte('created_at', sevenDaysAgoISO),
  ])

  return NextResponse.json({
    totalUsers: totalUsers ?? 0,
    newUsersToday: newUsersToday ?? 0,
    itemsIngestedToday: itemsIngestedToday ?? 0,
    failedItems: failedItems ?? 0,
    totalActiveItems: totalActiveItems ?? 0,
    itemsSavedTotal: itemsSavedTotal ?? 0,
    itemsSavedTrend: buildDailyTrend(itemsLast7Days ?? [], 7, now),
    signupsTrend: buildDailyTrend(usersLast14Days ?? [], 14, now),
    dauProxy: countDistinctUsers(usageToday ?? []),
    wauProxy: countDistinctUsers(usageLast7Days ?? []),
  })
}
