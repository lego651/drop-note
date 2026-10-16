import { describe, it, expect } from 'vitest'
import { maskEmail, niceMax, sumLast, toUsageDays, type UsageDay } from '../stats'

const day = (d: string, over: Partial<UsageDay> = {}): UsageDay => ({
  day: d, emails: 0, items: 0, failed_items: 0, active_users: 0, new_users: 0, total_users: 0, ...over,
})

describe('maskEmail', () => {
  it('keeps a short prefix and the domain', () => {
    expect(maskEmail('jasonusca@gmail.com')).toBe('jas…@gmail.com')
    expect(maskEmail('ab@x.io')).toBe('a…@x.io')
    expect(maskEmail('a@x.io')).toBe('a…@x.io')
    expect(maskEmail('not-an-email')).toBe('…')
  })
})

describe('sumLast', () => {
  it('sums only the most recent N days', () => {
    const rows = [day('2026-10-01', { items: 5, emails: 4 }), day('2026-10-02', { items: 2, emails: 1, failed_items: 1, new_users: 1 })]
    expect(sumLast(rows, 1)).toEqual({ emails: 1, items: 2, failed: 1, newUsers: 1 })
    expect(sumLast(rows, 30)).toEqual({ emails: 5, items: 7, failed: 1, newUsers: 1 })
  })
})

describe('niceMax', () => {
  it('rounds up to 1/2/5 × 10^n', () => {
    expect(niceMax(0)).toBe(1)
    expect(niceMax(3)).toBe(5)
    expect(niceMax(9)).toBe(10)
    expect(niceMax(45)).toBe(50)
    expect(niceMax(120)).toBe(200)
  })
})

describe('toUsageDays', () => {
  it('converts bigint strings to numbers', () => {
    const [r] = toUsageDays([{ day: '2026-10-16', emails: '1', items: '2', failed_items: '0', active_users: '1', new_users: '0', total_users: '6' }])
    expect(r).toEqual(day('2026-10-16', { emails: 1, items: 2, active_users: 1, total_users: 6 }))
  })
})
