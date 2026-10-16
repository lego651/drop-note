import { supabaseAdmin } from '@/lib/supabase/admin'

// Short-lived counters in Postgres (public.rate_counters, see migration
// 20261016000003) for rate limits, quotas and send-once flags. Each call is one
// atomic RPC. Throws on database errors — callers choose whether to fail open.

/**
 * Add `by` (default 1) to the counter `key` and return the new total. The counter
 * lives for `ttlSeconds` from its first increment, then restarts from zero.
 * With `limit`, an increment that would exceed it is refused and returns -1.
 */
export async function incrementCounter(
  key: string,
  ttlSeconds: number,
  opts: { by?: number; limit?: number } = {},
): Promise<number> {
  const { data, error } = await supabaseAdmin.rpc('counter_incr', {
    p_key: key,
    p_ttl_seconds: ttlSeconds,
    p_by: opts.by ?? 1,
    p_limit: opts.limit,
  })
  if (error) throw new Error(`counter_incr failed: ${error.message}`)
  return data
}

/** True the first time `key` is claimed within `ttlSeconds`; false after that. */
export async function claimOnce(key: string, ttlSeconds: number): Promise<boolean> {
  return (await incrementCounter(key, ttlSeconds)) === 1
}
