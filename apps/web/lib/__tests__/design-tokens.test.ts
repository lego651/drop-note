import { describe, it, expect } from 'vitest'
import {
  colorForTag,
  TAG_PALETTE,
  SOURCE_DOT,
  STATUS_DOT,
  STAT_CARD_ACCENT,
} from '../design-tokens'

describe('colorForTag', () => {
  it('is deterministic — returns same value on repeated calls', () => {
    expect(colorForTag('ai')).toBe(colorForTag('ai'))
    expect(colorForTag('research')).toBe(colorForTag('research'))
  })

  it('returns a value from TAG_PALETTE', () => {
    const result = colorForTag('ai')
    expect(TAG_PALETTE as readonly string[]).toContain(result)
  })

  it('does not throw or return undefined for empty string', () => {
    const result = colorForTag('')
    expect(result).toBeDefined()
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })

  it('returns different colors for names with different hashes', () => {
    // 'ai' hash = 97+105 = 202, 202 % 8 = 2 → 'var(--color-tag-pink)'
    // 'research' hash = 114+101+115+101+97+114+99+104 = 845, 845 % 8 = 5 → 'var(--color-tag-orange)'
    expect(colorForTag('ai')).not.toBe(colorForTag('research'))
  })

  it('handles single character names', () => {
    const result = colorForTag('a')
    expect(TAG_PALETTE as readonly string[]).toContain(result)
  })
})

describe('SOURCE_DOT', () => {
  it('has all required source type keys', () => {
    expect(SOURCE_DOT).toHaveProperty('email')
    expect(SOURCE_DOT).toHaveProperty('youtube')
    expect(SOURCE_DOT).toHaveProperty('article')
    expect(SOURCE_DOT).toHaveProperty('note')
    expect(SOURCE_DOT).toHaveProperty('default')
  })

  it('all values are CSS variable strings', () => {
    for (const val of Object.values(SOURCE_DOT)) {
      expect(val).toMatch(/^var\(--/)
    }
  })
})

describe('STATUS_DOT', () => {
  it('has all required status keys', () => {
    expect(STATUS_DOT).toHaveProperty('done')
    expect(STATUS_DOT).toHaveProperty('processing')
    expect(STATUS_DOT).toHaveProperty('pending')
    expect(STATUS_DOT).toHaveProperty('failed')
  })

  it('all values are CSS variable strings', () => {
    for (const val of Object.values(STATUS_DOT)) {
      expect(val).toMatch(/^var\(--/)
    }
  })

  it('pending and processing share the same color', () => {
    expect(STATUS_DOT.pending).toBe(STATUS_DOT.processing)
  })
})

describe('STAT_CARD_ACCENT', () => {
  it('has all required stat card keys', () => {
    expect(STAT_CARD_ACCENT).toHaveProperty('totalSaved')
    expect(STAT_CARD_ACCENT).toHaveProperty('thisWeek')
    expect(STAT_CARD_ACCENT).toHaveProperty('processing')
    expect(STAT_CARD_ACCENT).toHaveProperty('topTag')
  })

  it('all values are CSS variable strings', () => {
    for (const val of Object.values(STAT_CARD_ACCENT)) {
      expect(val).toMatch(/^var\(--/)
    }
  })
})
