import { cookies } from 'next/headers'
import { formatDistanceToNowStrict } from 'date-fns'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { STATUS_COOKIE, hasStatusSession } from '@/lib/health/access'
import { maskEmail, sumLast, toUsageDays, type TopUser } from '@/lib/usage/stats'
import { StatusLogin } from '../StatusClient'
import { StatusNav } from '../StatusNav'
import { DailyChart } from './DailyChart'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Usage — drop-note', robots: { index: false, follow: false } }

const CHART_DAYS = 90
const TOP_DAYS = 30

async function loadUsage() {
  const [daily, top, allItems] = await Promise.all([
    supabaseAdmin.rpc('usage_daily', { p_days: CHART_DAYS }),
    // Every active user in the window: the first 10 fill the table, the length is "active users (30d)".
    supabaseAdmin.rpc('usage_top_users', { p_days: TOP_DAYS, p_limit: 1000 }),
    supabaseAdmin.from('items').select('*', { count: 'exact', head: true }),
  ])
  return {
    days: toUsageDays(daily.data ?? []),
    top: (top.data ?? []).map((u) => ({ ...u, items: Number(u.items), emails: Number(u.emails) })) as TopUser[],
    allItems: allItems.count ?? 0,
    loadError: daily.error?.message ?? top.error?.message ?? allItems.error?.message ?? null,
  }
}

function Stat({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

export default async function UsagePage() {
  // `await` keeps this correct on both Next 14 (sync cookies) and Next 15 (async).
  const authed = await hasStatusSession((await cookies()).get(STATUS_COOKIE)?.value).catch(() => false)
  if (!authed) return <StatusLogin />

  const { days, top, allItems, loadError } = await loadUsage()
  const last30 = sumLast(days, TOP_DAYS)
  const totalUsers = days[days.length - 1]?.total_users ?? 0
  const s = (n: number) => (n === 1 ? '' : 's')

  return (
    <main className="min-h-screen bg-canvas">
      <div className="mx-auto max-w-5xl space-y-8 px-4 py-8">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">drop-note usage</h1>
            <p className="text-sm text-muted-foreground">Users and items by day (UTC) · updated on every page load</p>
          </div>
          <StatusNav active="/status/usage" />
        </header>

        {loadError && (
          <p className="text-sm" style={{ color: 'hsl(var(--color-status-failed))' }}>
            Could not load usage data: {loadError}
          </p>
        )}

        <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Stat label="Total users" value={totalUsers} hint={`+${last30.newUsers} in ${TOP_DAYS} days`} />
          <Stat label={`Active users (${TOP_DAYS}d)`} value={top.length} hint="saved at least 1 item" />
          <Stat label={`Emails (${TOP_DAYS}d)`} value={last30.emails} />
          <Stat label={`Items (${TOP_DAYS}d)`} value={last30.items} hint={last30.failed > 0 ? `${last30.failed} failed` : 'none failed'} />
          <Stat label="Items (all time)" value={allItems} />
        </section>

        <div className="grid gap-4 lg:grid-cols-2">
          <DailyChart
            title="Items processed per day"
            color="hsl(var(--color-source-email))"
            total={`${sumLast(days, CHART_DAYS).items} in ${CHART_DAYS} days`}
            points={days.map((d) => ({
              day: d.day,
              value: d.items,
              label: `${d.day}: ${d.items} item${s(d.items)} from ${d.emails} email${s(d.emails)}${d.failed_items ? ` · ${d.failed_items} failed` : ''}`,
            }))}
          />
          <DailyChart
            title="Total users"
            color="hsl(var(--color-status-done))"
            total={`${totalUsers} now`}
            points={days.map((d) => ({
              day: d.day,
              value: d.total_users,
              label: `${d.day}: ${d.total_users} user${s(d.total_users)}${d.new_users ? ` · +${d.new_users} signed up` : ''}`,
            }))}
          />
          <DailyChart
            title="Active users per day"
            color="hsl(var(--color-tag-purple))"
            total="users who saved ≥ 1 item"
            points={days.map((d) => ({
              day: d.day,
              value: d.active_users,
              label: `${d.day}: ${d.active_users} active user${s(d.active_users)}`,
            }))}
          />
          <DailyChart
            title="Emails received per day"
            color="hsl(var(--color-tag-teal))"
            total={`${sumLast(days, CHART_DAYS).emails} in ${CHART_DAYS} days`}
            points={days.map((d) => ({
              day: d.day,
              value: d.emails,
              label: `${d.day}: ${d.emails} email${s(d.emails)}`,
            }))}
          />
        </div>

        <section className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-xl font-semibold">Top 10 users by items</h2>
            <span className="text-sm text-muted-foreground">last {TOP_DAYS} days · full addresses in Admin → Users</span>
          </div>
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            {top.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">No items saved in the last {TOP_DAYS} days.</p>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr>
                    <th className="p-2">#</th><th className="p-2">User</th><th className="p-2">Tier</th>
                    <th className="p-2 text-right">Items</th><th className="p-2 text-right">Emails</th><th className="p-2">Last item</th>
                  </tr>
                </thead>
                <tbody>
                  {top.slice(0, 10).map((u, i) => (
                    <tr key={u.user_id} className="border-t border-border">
                      <td className="p-2 text-muted-foreground">{i + 1}</td>
                      <td className="p-2 font-mono text-xs">{maskEmail(u.email)}</td>
                      <td className="p-2">{u.tier}</td>
                      <td className="p-2 text-right tabular-nums">{u.items}</td>
                      <td className="p-2 text-right tabular-nums">{u.emails}</td>
                      <td className="p-2 text-muted-foreground">{formatDistanceToNowStrict(new Date(u.last_item_at))} ago</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </div>
    </main>
  )
}
