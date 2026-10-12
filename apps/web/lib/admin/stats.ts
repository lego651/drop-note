export interface TrendPoint {
  date: string
  count: number
}

export interface DayBucket {
  date: string
  startISO: string
  endISO: string
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function startOfDay(d: Date): Date {
  const copy = new Date(d)
  copy.setHours(0, 0, 0, 0)
  return copy
}

function addDays(d: Date, days: number): Date {
  const copy = new Date(d)
  copy.setDate(copy.getDate() + days)
  return copy
}

// Builds `days` consecutive day buckets ending on `now`'s day (inclusive), oldest first.
// Each bucket's range is a [startISO, endISO) half-open interval, so a day query is a
// plain gte/lt pair with no row fetch needed -- callers run a head-count query per bucket.
export function buildDayBuckets(now: Date, days: number): DayBucket[] {
  const todayStart = startOfDay(now)
  const buckets: DayBucket[] = []
  for (let i = days - 1; i >= 0; i--) {
    const start = addDays(todayStart, -i)
    const end = addDays(start, 1)
    buckets.push({ date: dateKey(start), startISO: start.toISOString(), endISO: end.toISOString() })
  }
  return buckets
}

export function countDistinctUsers(rows: { user_id: string }[]): number {
  return new Set(rows.map((row) => row.user_id)).size
}
