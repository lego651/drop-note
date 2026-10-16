import { cookies } from 'next/headers'
import { CheckCircle2, AlertTriangle, XCircle, CircleDashed, Search } from 'lucide-react'
import { formatDistanceToNowStrict } from 'date-fns'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { COMPONENTS, type HealthStatus } from '@/lib/health/checks'
import { buildUptime, isStale, overallState, type BarLevel, type DailyCounts, type OverallState } from '@/lib/health/uptime'
import { STATUS_COOKIE, hasStatusSession } from '@/lib/health/access'
import { StatusActions, StatusLogin } from './StatusClient'
import { StatusNav } from './StatusNav'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Status — drop-note', robots: { index: false, follow: false } }

const DAYS = 90
const CID_RE = /^[A-Za-z0-9._:-]{8,128}$/

const STATUS_COLOR: Record<HealthStatus, string> = {
  up: 'hsl(var(--color-status-done))',
  degraded: 'hsl(var(--color-status-processing))',
  down: 'hsl(var(--color-status-failed))',
}
const BAR_COLOR: Record<BarLevel, string> = {
  ok: 'hsl(var(--color-status-done) / 0.7)',
  minor: 'hsl(var(--color-status-processing))',
  major: 'hsl(var(--color-status-failed))',
  nodata: 'hsl(var(--muted-foreground) / 0.25)',
}
const BANNER: Record<OverallState, { text: string; color: string }> = {
  operational: { text: 'All Systems Operational', color: 'hsl(var(--color-status-done))' },
  degraded: { text: 'Degraded Performance', color: 'hsl(var(--color-status-processing))' },
  outage: { text: 'Partial Outage', color: 'hsl(var(--color-status-failed))' },
  nodata: { text: 'Waiting for the first health check', color: 'hsl(var(--muted-foreground))' },
  stale: { text: 'Health checks have stopped — results are out of date', color: 'hsl(var(--color-status-processing))' },
}
const STATUS_LABEL: Record<HealthStatus, string> = { up: 'Normal', degraded: 'Degraded', down: 'Down' }

function StatusIcon({ status }: { status: HealthStatus | null }) {
  if (status === null) return <CircleDashed className="size-5 shrink-0 text-muted-foreground" aria-label="no data" />
  const Icon = status === 'up' ? CheckCircle2 : status === 'degraded' ? AlertTriangle : XCircle
  return <Icon className="size-5 shrink-0" style={{ color: STATUS_COLOR[status] }} aria-label={STATUS_LABEL[status]} />
}

async function loadDashboard(cid: string | null) {
  const [daily, latest, summary, errors, lookup] = await Promise.all([
    supabaseAdmin.rpc('health_daily', { p_days: DAYS }),
    supabaseAdmin
      .from('health_checks')
      .select('component, status, latency_ms, detail, checked_at')
      .order('checked_at', { ascending: false })
      .limit(COMPONENTS.length * 3),
    supabaseAdmin.rpc('request_log_summary', { p_hours: 24 }),
    supabaseAdmin
      .from('request_logs')
      .select('created_at, correlation_id, route, event, message, status')
      .eq('level', 'error')
      .order('created_at', { ascending: false })
      .limit(20),
    cid
      ? supabaseAdmin
          .from('request_logs')
          .select('created_at, kind, level, event, route, method, status, duration_ms, message, meta')
          .eq('correlation_id', cid)
          .order('created_at', { ascending: true })
          .limit(200)
      : Promise.resolve({ data: null, error: null }),
  ])

  const latestByComponent = new Map<string, NonNullable<typeof latest.data>[number]>()
  for (const row of latest.data ?? []) if (!latestByComponent.has(row.component)) latestByComponent.set(row.component, row)

  return {
    daily: (daily.data ?? []) as DailyCounts[],
    latestByComponent,
    summary: summary.data ?? [],
    errors: errors.data ?? [],
    lookup: lookup.data,
    loadError: daily.error?.message ?? latest.error?.message ?? null,
  }
}

export default async function StatusPage({ searchParams }: { searchParams: Promise<{ cid?: string }> }) {
  const authed = await hasStatusSession((await cookies()).get(STATUS_COOKIE)?.value).catch(() => false)
  if (!authed) return <StatusLogin />

  const { cid: rawCid } = await searchParams
  const cid = rawCid && CID_RE.test(rawCid) ? rawCid : null
  const { daily, latestByComponent, summary, errors, lookup, loadError } = await loadDashboard(cid)

  const lastRun = [...latestByComponent.values()][0]?.checked_at
  const stale = isStale(lastRun)
  const latestStatuses = COMPONENTS.map((c) => (latestByComponent.get(c.key)?.status as HealthStatus | undefined) ?? null)
  const banner = BANNER[overallState(latestStatuses, stale)]

  return (
    <main className="min-h-screen bg-canvas">
      <div className="mx-auto max-w-5xl px-4 py-8 space-y-8">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">drop-note status</h1>
            <p className="text-sm text-muted-foreground">
              Synthetic checks every 5 minutes
              {lastRun ? ` · last run ${formatDistanceToNowStrict(new Date(lastRun))} ago` : ''}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusNav active="/status" />
            <StatusActions />
          </div>
        </header>

        <div className="flex items-center gap-3 rounded-lg px-5 py-4 text-lg font-semibold shadow-sm"
          style={{ background: banner.color, color: 'hsl(var(--primary-foreground))' }}>
          {banner.text}
        </div>

        {loadError && (
          <p className="text-sm" style={{ color: 'hsl(var(--color-status-failed))' }}>
            Could not load health data: {loadError}
          </p>
        )}

        <section>
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-xl font-semibold">Current status</h2>
            <span className="text-sm text-muted-foreground">Uptime over the past {DAYS} days</span>
          </div>
          <div className="grid grid-cols-1 overflow-hidden rounded-xl border border-border bg-card md:grid-cols-2">
            {COMPONENTS.map((c) => {
              const latest = latestByComponent.get(c.key)
              const status = stale ? null : (latest?.status as HealthStatus | undefined) ?? null
              const uptime = buildUptime(daily, c.key, DAYS)
              const traffic = summary.filter((s) => c.routes.includes(s.route))
              const requests = traffic.reduce((n, s) => n + Number(s.requests), 0)
              const serverErrors = traffic.reduce((n, s) => n + Number(s.server_errors), 0)
              return (
                <div key={c.key} className="min-w-0 border-b border-border p-5 md:odd:border-r">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-medium">{c.name}</h3>
                      <p className="text-xs text-muted-foreground">{c.description}</p>
                    </div>
                    <StatusIcon status={status} />
                  </div>
                  <div className="mt-3 flex h-8 gap-px" role="img" aria-label={`${c.name} daily uptime, last ${DAYS} days`}>
                    {uptime.bars.map((b) => (
                      <div
                        key={b.day}
                        className="min-w-0 flex-1 rounded-[1px]"
                        style={{ background: BAR_COLOR[b.level] }}
                        title={b.uptimePct === null
                          ? `${b.day}: no data`
                          : `${b.day}: ${b.uptimePct}% · ${b.checks} checks · ${b.down} down · ${b.degraded} degraded`}
                      />
                    ))}
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>{DAYS} days ago</span>
                    <span>{uptime.uptimePct === null ? 'no data yet' : `${uptime.uptimePct}% uptime`}</span>
                    <span>Today</span>
                  </div>
                  <div className="mt-2 text-sm">
                    <span style={{ color: status ? STATUS_COLOR[status] : undefined }}>
                      {status ? STATUS_LABEL[status] : 'No data'}
                    </span>
                    {latest && (
                      <span className="text-muted-foreground"> · {latest.latency_ms}ms · {latest.detail}</span>
                    )}
                  </div>
                  {c.routes.length > 0 && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Real users (24h): {requests} requests
                      {serverErrors > 0 ? (
                        <span style={{ color: STATUS_COLOR.down }}> · {serverErrors} server error{serverErrors === 1 ? '' : 's'}</span>
                      ) : ' · no server errors'}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Find a request</h2>
          <form method="get" className="flex flex-wrap gap-2">
            <label htmlFor="cid" className="sr-only">Correlation ID</label>
            <input
              id="cid"
              name="cid"
              defaultValue={cid ?? ''}
              placeholder="Paste an x-correlation-id"
              className="h-9 min-w-0 flex-1 rounded-md border border-input bg-card px-3 font-mono text-sm"
            />
            <button type="submit" className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm text-primary-foreground">
              <Search className="size-4" aria-hidden /> Search logs
            </button>
          </form>
          {cid && (
            <div className="overflow-x-auto rounded-xl border border-border bg-card">
              {lookup && lookup.length > 0 ? (
                <table className="w-full text-left text-sm">
                  <thead className="text-xs text-muted-foreground">
                    <tr><th className="p-2">Time (UTC)</th><th className="p-2">Level</th><th className="p-2">Event</th><th className="p-2">Route</th><th className="p-2">Status</th><th className="p-2">Details</th></tr>
                  </thead>
                  <tbody>
                    {lookup.map((r, i) => (
                      <tr key={i} className="border-t border-border align-top">
                        <td className="p-2 font-mono text-xs">{r.created_at.slice(11, 23)}</td>
                        <td className="p-2">{r.level}</td>
                        <td className="p-2 font-mono text-xs">{r.event}</td>
                        <td className="p-2 font-mono text-xs">{r.route}</td>
                        <td className="p-2">{r.status ?? ''}{r.duration_ms !== null ? ` · ${r.duration_ms}ms` : ''}</td>
                        <td className="p-2 font-mono text-xs break-all">
                          {r.message}{r.meta && JSON.stringify(r.meta) !== '{}' ? ` ${JSON.stringify(r.meta)}` : ''}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="p-4 text-sm text-muted-foreground">No logs for this correlation ID (logs are kept 14 days).</p>
              )}
            </div>
          )}
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <div className="min-w-0 space-y-3">
            <h2 className="text-xl font-semibold">Recent errors</h2>
            <div className="rounded-xl border border-border bg-card">
              {errors.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">No errors logged in the last 14 days.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {errors.map((e, i) => (
                    <li key={i} className="p-3 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-mono text-xs">{e.event}</span>
                        <span className="text-xs text-muted-foreground">
                          {formatDistanceToNowStrict(new Date(e.created_at))} ago
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">{e.route ?? 'background job'}{e.message ? ` — ${e.message}` : ''}</p>
                      {e.correlation_id && (
                        <a className="font-mono text-xs underline" href={`/status?cid=${encodeURIComponent(e.correlation_id)}`}>
                          {e.correlation_id}
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <div className="min-w-0 space-y-3">
            <h2 className="text-xl font-semibold">Real-user traffic (24h)</h2>
            <div className="overflow-x-auto rounded-xl border border-border bg-card">
              {summary.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">No API traffic in the last 24 hours.</p>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead className="text-xs text-muted-foreground">
                    <tr><th className="p-2">Route</th><th className="p-2">Requests</th><th className="p-2">4xx</th><th className="p-2">5xx</th><th className="p-2">p95</th></tr>
                  </thead>
                  <tbody>
                    {[...summary].sort((a, b) => Number(b.requests) - Number(a.requests)).map((s) => (
                      <tr key={s.route} className="border-t border-border">
                        <td className="p-2 font-mono text-xs">{s.route}</td>
                        <td className="p-2">{s.requests}</td>
                        <td className="p-2">{s.client_errors}</td>
                        <td className="p-2" style={{ color: Number(s.server_errors) > 0 ? STATUS_COLOR.down : undefined }}>{s.server_errors}</td>
                        <td className="p-2">{s.p95_ms}ms</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}
