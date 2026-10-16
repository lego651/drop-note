// Pure helpers for the /status/usage dashboard (data comes from the usage_daily and
// usage_top_users SQL functions, migration 20261016000004).

export interface UsageDay {
  day: string // YYYY-MM-DD (UTC)
  emails: number
  items: number
  failed_items: number
  active_users: number
  new_users: number
  total_users: number
}

export interface TopUser {
  user_id: string
  email: string
  tier: string
  items: number
  emails: number
  last_item_at: string
}

/** Postgres bigint columns arrive as numbers or numeric strings; normalise to numbers. */
export function toUsageDays(rows: Record<keyof UsageDay, unknown>[]): UsageDay[] {
  return rows.map((r) => ({
    day: String(r.day),
    emails: Number(r.emails),
    items: Number(r.items),
    failed_items: Number(r.failed_items),
    active_users: Number(r.active_users),
    new_users: Number(r.new_users),
    total_users: Number(r.total_users),
  }))
}

/** "jason@gmail.com" → "jas…@gmail.com": enough to recognise a user, not to copy the address. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@')
  if (at <= 0) return '…'
  const local = email.slice(0, at)
  return `${local.slice(0, Math.min(3, Math.max(1, local.length - 1)))}…${email.slice(at)}`
}

/** Totals over the last `days` rows of the series (the series is oldest first). */
export function sumLast(rows: UsageDay[], days: number): { emails: number; items: number; failed: number; newUsers: number } {
  return rows.slice(-days).reduce(
    (t, r) => ({
      emails: t.emails + r.emails,
      items: t.items + r.items,
      failed: t.failed + r.failed_items,
      newUsers: t.newUsers + r.new_users,
    }),
    { emails: 0, items: 0, failed: 0, newUsers: 0 },
  )
}

/** A round axis maximum ≥ n (1, 2, 5, 10, 20, 50 …), so bar heights read naturally. */
export function niceMax(n: number): number {
  if (n <= 0) return 1
  const pow = 10 ** Math.floor(Math.log10(n))
  for (const step of [1, 2, 5, 10]) if (step * pow >= n) return step * pow
  return 10 * pow
}
