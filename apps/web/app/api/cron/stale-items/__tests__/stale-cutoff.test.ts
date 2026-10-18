import { describe, it, expect } from 'vitest'
import { getStaleCutoffIso, STALE_WINDOW_HOURS } from '../stale-cutoff'

describe('getStaleCutoffIso', () => {
  it('uses a 24-hour window', () => {
    expect(STALE_WINDOW_HOURS).toBe(24)
  })

  it('excludes an item created 23 hours ago (newer than the cutoff)', () => {
    const now = new Date('2026-10-17T12:00:00.000Z')
    const cutoff = getStaleCutoffIso(now)
    const itemCreatedAt = new Date(now.getTime() - 23 * 60 * 60 * 1000).toISOString()

    expect(itemCreatedAt >= cutoff).toBe(true)
  })

  it('includes an item created 25 hours ago (older than the cutoff)', () => {
    const now = new Date('2026-10-17T12:00:00.000Z')
    const cutoff = getStaleCutoffIso(now)
    const itemCreatedAt = new Date(now.getTime() - 25 * 60 * 60 * 1000).toISOString()

    expect(itemCreatedAt < cutoff).toBe(true)
  })

  it('produces a cutoff exactly 24 hours before now', () => {
    const now = new Date('2026-10-17T12:00:00.000Z')
    const cutoff = getStaleCutoffIso(now)

    expect(cutoff).toBe('2026-10-16T12:00:00.000Z')
  })
})
