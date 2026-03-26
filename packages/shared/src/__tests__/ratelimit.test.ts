import { describe, it, expect } from 'vitest'
import { getRateLimitThreshold, isOverRateLimit } from '../ratelimit'

describe('getRateLimitThreshold', () => {
  it('returns 5 for free tier', () => {
    expect(getRateLimitThreshold('free')).toBe(5)
  })

  it('returns 20 for pro tier', () => {
    expect(getRateLimitThreshold('pro')).toBe(20)
  })

  it('returns 20 for power tier', () => {
    expect(getRateLimitThreshold('power')).toBe(20)
  })
})

describe('isOverRateLimit', () => {
  it('returns false when count equals threshold for free tier (at limit = still allowed)', () => {
    expect(isOverRateLimit(5, 'free')).toBe(false)
  })

  it('returns true when count exceeds threshold for free tier', () => {
    expect(isOverRateLimit(6, 'free')).toBe(true)
  })

  it('returns false when count equals threshold for pro tier', () => {
    expect(isOverRateLimit(20, 'pro')).toBe(false)
  })

  it('returns true when count exceeds threshold for pro tier', () => {
    expect(isOverRateLimit(21, 'pro')).toBe(true)
  })

  it('returns false when count equals threshold for power tier', () => {
    expect(isOverRateLimit(20, 'power')).toBe(false)
  })

  it('returns true when count exceeds threshold for power tier', () => {
    expect(isOverRateLimit(21, 'power')).toBe(true)
  })

  it('returns false for zero count on any tier', () => {
    expect(isOverRateLimit(0, 'free')).toBe(false)
    expect(isOverRateLimit(0, 'pro')).toBe(false)
    expect(isOverRateLimit(0, 'power')).toBe(false)
  })
})
