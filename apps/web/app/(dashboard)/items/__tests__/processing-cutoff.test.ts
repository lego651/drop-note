import { describe, it, expect } from 'vitest'
import { getProcessingCutoffIso, PROCESSING_WINDOW_MINUTES } from '../processing-cutoff'

describe('getProcessingCutoffIso', () => {
  it('uses a 15-minute window', () => {
    expect(PROCESSING_WINDOW_MINUTES).toBe(15)
  })

  it('excludes an item created 20 minutes ago (older than the cutoff)', () => {
    const now = new Date('2026-10-17T12:00:00.000Z')
    const cutoff = getProcessingCutoffIso(now)
    const itemCreatedAt = new Date(now.getTime() - 20 * 60 * 1000).toISOString()

    expect(itemCreatedAt < cutoff).toBe(true)
  })

  it('includes an item created 5 minutes ago (within the cutoff)', () => {
    const now = new Date('2026-10-17T12:00:00.000Z')
    const cutoff = getProcessingCutoffIso(now)
    const itemCreatedAt = new Date(now.getTime() - 5 * 60 * 1000).toISOString()

    expect(itemCreatedAt >= cutoff).toBe(true)
  })

  it('produces a cutoff exactly 15 minutes before now', () => {
    const now = new Date('2026-10-17T12:00:00.000Z')
    const cutoff = getProcessingCutoffIso(now)

    expect(cutoff).toBe('2026-10-17T11:45:00.000Z')
  })
})
