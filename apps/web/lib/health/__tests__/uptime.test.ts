import { describe, it, expect } from 'vitest'
import { barLevel, buildUptime, isStale, lastDays, overallState } from '../uptime'

const NOW = new Date('2026-10-16T12:00:00Z')

describe('lastDays', () => {
  it('returns N UTC dates ending today, oldest first', () => {
    expect(lastDays(3, NOW)).toEqual(['2026-10-14', '2026-10-15', '2026-10-16'])
  })
})

describe('barLevel', () => {
  it('classifies a day by its worst checks', () => {
    expect(barLevel({ total: 0, degraded: 0, down: 0 })).toBe('nodata')
    expect(barLevel({ total: 288, degraded: 0, down: 0 })).toBe('ok')
    expect(barLevel({ total: 288, degraded: 3, down: 0 })).toBe('minor')
    expect(barLevel({ total: 288, degraded: 0, down: 5 })).toBe('minor')
    expect(barLevel({ total: 288, degraded: 0, down: 15 })).toBe('major') // 5.2%
  })
})

describe('buildUptime', () => {
  it('builds one bar per day with no-data gaps and a window uptime %', () => {
    const rows = [
      { component: 'db', day: '2026-10-15', total: 100, up: 100, degraded: 0, down: 0 },
      { component: 'db', day: '2026-10-16', total: 100, up: 90, degraded: 5, down: 5 },
      { component: 'other', day: '2026-10-16', total: 100, up: 0, degraded: 0, down: 100 },
    ]
    const u = buildUptime(rows, 'db', 3, NOW)
    expect(u.bars.map((b) => b.level)).toEqual(['nodata', 'ok', 'major'])
    expect(u.bars[2]).toMatchObject({ uptimePct: 95, checks: 100, down: 5, degraded: 5 })
    expect(u.uptimePct).toBe(97.5) // 195 available of 200
  })

  it('reports null uptime when there is no data', () => {
    expect(buildUptime([], 'db', 90, NOW).uptimePct).toBeNull()
  })
})

describe('overallState', () => {
  it('is the worst latest status', () => {
    expect(overallState([])).toBe('nodata')
    expect(overallState([null, null])).toBe('nodata')
    expect(overallState(['up', 'up'])).toBe('operational')
    expect(overallState(['up', 'degraded', null])).toBe('degraded')
    expect(overallState(['degraded', 'down'])).toBe('outage')
  })

  it('reports stale results instead of their last-known status', () => {
    expect(overallState(['up', 'up'], true)).toBe('stale')
    expect(overallState([null], true)).toBe('nodata')
  })
})

describe('isStale', () => {
  it('flags a newest check older than 15 minutes', () => {
    expect(isStale('2026-10-16T11:50:00Z', NOW)).toBe(false)
    expect(isStale('2026-10-16T11:40:00Z', NOW)).toBe(true)
    expect(isStale(undefined, NOW)).toBe(false)
  })
})
