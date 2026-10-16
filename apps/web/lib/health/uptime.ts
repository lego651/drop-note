import type { HealthStatus } from './checks'

// Turns daily health-check counts into the 90-day uptime bars on /status.

export interface DailyCounts {
  component: string
  day: string // YYYY-MM-DD (UTC)
  total: number
  up: number
  degraded: number
  down: number
}

export type BarLevel = 'nodata' | 'ok' | 'minor' | 'major'

export interface DayBar {
  day: string
  level: BarLevel
  uptimePct: number | null
  checks: number
  down: number
  degraded: number
}

export interface ComponentUptime {
  bars: DayBar[]
  /** Up + degraded checks over all checks in the window; null when there is no data yet. */
  uptimePct: number | null
}

/** A day is "major" when ≥ 5% of its checks were down, "minor" for any degraded/down check. */
export function barLevel(c: Pick<DailyCounts, 'total' | 'degraded' | 'down'>): BarLevel {
  if (c.total === 0) return 'nodata'
  if (c.down / c.total >= 0.05) return 'major'
  if (c.down > 0 || c.degraded > 0) return 'minor'
  return 'ok'
}

/** The last `days` UTC dates, oldest first, ending today. */
export function lastDays(days: number, now: Date = new Date()): string[] {
  const out: string[] = []
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  for (let i = days - 1; i >= 0; i--) out.push(new Date(today - i * 86_400_000).toISOString().slice(0, 10))
  return out
}

export function buildUptime(rows: DailyCounts[], component: string, days = 90, now: Date = new Date()): ComponentUptime {
  const byDay = new Map(rows.filter((r) => r.component === component).map((r) => [r.day, r]))
  let total = 0
  let available = 0
  const bars = lastDays(days, now).map((day): DayBar => {
    const r = byDay.get(day)
    if (!r || r.total === 0) return { day, level: 'nodata', uptimePct: null, checks: 0, down: 0, degraded: 0 }
    total += r.total
    available += r.up + r.degraded
    return {
      day,
      level: barLevel(r),
      uptimePct: round2(((r.up + r.degraded) / r.total) * 100),
      checks: r.total,
      down: r.down,
      degraded: r.degraded,
    }
  })
  return { bars, uptimePct: total === 0 ? null : round2((available / total) * 100) }
}

export type OverallState = 'operational' | 'degraded' | 'outage' | 'nodata' | 'stale'

/** Checks run every 5 minutes; a newest result older than this means monitoring has stopped. */
export const STALE_MS = 15 * 60 * 1000

export function isStale(lastCheckedAt: string | null | undefined, now: Date = new Date()): boolean {
  if (!lastCheckedAt) return false
  return now.getTime() - new Date(lastCheckedAt).getTime() > STALE_MS
}

/** Old results must not keep the page green: `stale` wins over any last-known status. */
export function overallState(latest: (HealthStatus | null)[], stale = false): OverallState {
  const known = latest.filter((s): s is HealthStatus => s !== null)
  if (known.length === 0) return 'nodata'
  if (stale) return 'stale'
  if (known.includes('down')) return 'outage'
  if (known.includes('degraded')) return 'degraded'
  return 'operational'
}

function round2(n: number): number {
  return Math.floor(n * 100) / 100
}
