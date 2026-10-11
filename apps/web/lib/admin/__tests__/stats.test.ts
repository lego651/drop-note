import { describe, it, expect } from 'vitest'

import { buildDayBuckets, countDistinctUsers } from '../stats'

describe('buildDayBuckets', () => {
  it('zero-fills: produces one bucket per day even with no data', () => {
    const now = new Date('2026-01-15T18:30:00Z')
    const buckets = buildDayBuckets(now, 7)
    expect(buckets).toHaveLength(7)
  })

  it('is oldest-first and includes `now`s day as the last bucket', () => {
    const now = new Date('2026-01-15T18:30:00Z')
    const buckets = buildDayBuckets(now, 7)
    expect(buckets[0].date).toBe('2026-01-09')
    expect(buckets[6].date).toBe('2026-01-15')
  })

  it('window boundary: the oldest day starts at local midnight, not `now`s time', () => {
    const now = new Date('2026-01-15T18:30:00Z')
    const buckets = buildDayBuckets(now, 7)
    const oldest = buckets[0]
    expect(new Date(oldest.startISO).getHours()).toBe(0)
    expect(new Date(oldest.startISO).getMinutes()).toBe(0)
  })

  it('each bucket is a half-open [start, end) one-day interval with no gaps', () => {
    const now = new Date('2026-01-15T18:30:00Z')
    const buckets = buildDayBuckets(now, 3)
    for (const bucket of buckets) {
      const start = new Date(bucket.startISO)
      const end = new Date(bucket.endISO)
      expect(end.getTime() - start.getTime()).toBe(24 * 60 * 60 * 1000)
    }
    // the day before is excluded: previous bucket's end === next bucket's start
    expect(buckets[0].endISO).toBe(buckets[1].startISO)
    expect(buckets[1].endISO).toBe(buckets[2].startISO)
  })

  it('a single-day window covers just today', () => {
    const now = new Date('2026-01-15T18:30:00Z')
    const buckets = buildDayBuckets(now, 1)
    expect(buckets).toHaveLength(1)
    expect(buckets[0].date).toBe('2026-01-15')
  })
})

describe('countDistinctUsers', () => {
  it('returns 0 for no rows', () => {
    expect(countDistinctUsers([])).toBe(0)
  })

  it('dedupes repeated user_id values from multiple rows', () => {
    const rows = [{ user_id: 'a' }, { user_id: 'a' }, { user_id: 'b' }]
    expect(countDistinctUsers(rows)).toBe(2)
  })

  it('counts every row once when all user_ids are unique', () => {
    const rows = [{ user_id: 'a' }, { user_id: 'b' }, { user_id: 'c' }]
    expect(countDistinctUsers(rows)).toBe(3)
  })
})
