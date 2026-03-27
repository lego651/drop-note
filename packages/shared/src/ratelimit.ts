export function getRateLimitThreshold(tier: 'free' | 'pro' | 'power'): number {
  return tier === 'free' ? 5 : 20
}

export function isOverRateLimit(count: number, tier: 'free' | 'pro' | 'power'): boolean {
  return count > getRateLimitThreshold(tier)
}

/** Supabase Auth email rate limit — must match the value in supabase/config.toml and the Supabase dashboard */
export const AUTH_EMAIL_RATE_LIMIT_PER_HOUR = 30
