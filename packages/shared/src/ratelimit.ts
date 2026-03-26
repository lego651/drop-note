export function getRateLimitThreshold(tier: 'free' | 'pro' | 'power'): number {
  return tier === 'free' ? 5 : 20
}

export function isOverRateLimit(count: number, tier: 'free' | 'pro' | 'power'): boolean {
  return count > getRateLimitThreshold(tier)
}
