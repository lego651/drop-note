import { describe, it, expect } from 'vitest'
import {
  colorForTag,
  colorForTagHsl,
  colorForCategoryHsl,
  categoryGlyph,
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

describe('colorForTagHsl', () => {
  it('returns a theme-aware var reference, not literal channels', () => {
    // Literal HSL numbers would ignore the .dark block; var() follows the theme.
    expect(colorForTagHsl('ai')).toBe(colorForTag('ai'))
    expect(colorForTagHsl('ai')).toMatch(/^var\(--color-tag-/)
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

  it('all values are hsl(var(--…)) color strings', () => {
    // SOURCE_DOT wraps the CSS var in hsl() so it resolves to a usable color
    // for inline backgroundColor (the vars hold raw HSL channels).
    for (const val of Object.values(SOURCE_DOT)) {
      expect(val).toMatch(/^hsl\(var\(--/)
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

describe('colorForCategoryHsl', () => {
  it('returns the neutral muted-foreground var for Other, never a hue', () => {
    expect(colorForCategoryHsl({ position: 7, is_other: true })).toBe('var(--muted-foreground)')
    // Even if "Other" somehow had position 0, is_other wins.
    expect(colorForCategoryHsl({ position: 0, is_other: true })).toBe('var(--muted-foreground)')
  })

  it('is stable per position, not per name, so a rename keeps its color', () => {
    const a = colorForCategoryHsl({ position: 2, is_other: false })
    const b = colorForCategoryHsl({ position: 2, is_other: false })
    expect(a).toBe(b)
    expect(a).toMatch(/^var\(--color-tag-/)
  })

  it('cycles the 8-color palette for custom categories past position 7', () => {
    // position 8 (first custom) starts the cycle at purple (index 7 of the 8-slot palette)
    expect(colorForCategoryHsl({ position: 8, is_other: false })).toBe('var(--color-tag-purple)')
    // position 9 wraps back around to orange (index 0)
    expect(colorForCategoryHsl({ position: 9, is_other: false })).toBe('var(--color-tag-orange)')
  })

  it('gives each default category position a distinct color', () => {
    const colors = Array.from({ length: 7 }, (_, position) =>
      colorForCategoryHsl({ position, is_other: false }),
    )
    expect(new Set(colors).size).toBe(7)
  })
})

describe('categoryGlyph', () => {
  it('uppercases a Latin initial', () => {
    expect(categoryGlyph('Food & Drink')).toBe('F')
    expect(categoryGlyph('tech')).toBe('T')
  })

  it('keeps a CJK initial as-is (uppercasing is a no-op)', () => {
    expect(categoryGlyph('美食')).toBe('美')
  })

  it('keeps an emoji initial intact as a single grapheme', () => {
    expect(categoryGlyph('🎬 Movies')).toBe('🎬')
  })

  it('returns an empty string for an empty name', () => {
    expect(categoryGlyph('')).toBe('')
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
