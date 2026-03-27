import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  TIER_ITEM_LIMITS,
  SAVE_ACTIONS_FREE_LIMIT,
  isOverItemCap,
  isOverSaveLimit,
  getCurrentMonth,
} from '../tier'
import { priceIdToTier } from '../stripe-helpers'

describe('TIER_ITEM_LIMITS', () => {
  it('has correct limits', () => {
    expect(TIER_ITEM_LIMITS.free).toBe(20)
    expect(TIER_ITEM_LIMITS.pro).toBe(100)
    expect(TIER_ITEM_LIMITS.power).toBe(500)
  })
})

describe('SAVE_ACTIONS_FREE_LIMIT', () => {
  it('is 30', () => {
    expect(SAVE_ACTIONS_FREE_LIMIT).toBe(30)
  })
})

describe('isOverItemCap', () => {
  it('returns false when exactly at cap', () => {
    expect(isOverItemCap(19, 1, 'free')).toBe(false) // 19+1=20, at cap
  })

  it('returns true when one over cap', () => {
    expect(isOverItemCap(19, 2, 'free')).toBe(true) // 19+2=21 > 20
  })

  it('returns false with zero incoming', () => {
    expect(isOverItemCap(20, 0, 'free')).toBe(false) // no-op
  })

  it('returns true when already at cap with any incoming', () => {
    expect(isOverItemCap(20, 1, 'free')).toBe(true)
  })

  it('enforces pro limit', () => {
    expect(isOverItemCap(99, 1, 'pro')).toBe(false) // 100 = at cap
    expect(isOverItemCap(100, 1, 'pro')).toBe(true)
  })

  it('enforces power limit', () => {
    expect(isOverItemCap(499, 1, 'power')).toBe(false) // 500 = at cap
    expect(isOverItemCap(500, 1, 'power')).toBe(true)
  })
})

describe('isOverSaveLimit', () => {
  it('returns false when exactly at limit', () => {
    expect(isOverSaveLimit(29, 1)).toBe(false) // 29+1=30
  })

  it('returns true when one over', () => {
    expect(isOverSaveLimit(30, 1)).toBe(true)
  })

  it('returns true with multiple incoming pushing over', () => {
    expect(isOverSaveLimit(29, 2)).toBe(true) // 29+2=31 > 30
  })

  it('returns false well below limit', () => {
    expect(isOverSaveLimit(0, 1)).toBe(false)
  })
})

describe('getCurrentMonth', () => {
  it('returns YYYY-MM format', () => {
    const result = getCurrentMonth()
    expect(result).toMatch(/^\d{4}-\d{2}$/)
  })

  it('uses provided date', () => {
    const date = new Date('2026-03-15T12:00:00Z')
    expect(getCurrentMonth(date)).toBe('2026-03')
  })

  it('handles year boundary', () => {
    const date = new Date('2026-01-01T00:00:00Z')
    expect(getCurrentMonth(date)).toBe('2026-01')
  })
})

describe('priceIdToTier', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      STRIPE_PRO_PRICE_ID: 'price_pro_test',
      STRIPE_POWER_PRICE_ID: 'price_power_test',
    }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('returns pro for pro price ID', () => {
    expect(priceIdToTier('price_pro_test')).toBe('pro')
  })

  it('returns power for power price ID', () => {
    expect(priceIdToTier('price_power_test')).toBe('power')
  })

  it('returns null for unknown price ID', () => {
    expect(priceIdToTier('price_unknown')).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(priceIdToTier('')).toBeNull()
  })
})
