import { describe, it, expect } from 'vitest'
import { cn } from '../utils'

describe('cn (Airmail tailwind-merge config)', () => {
  it('keeps the stroke width next to an ink border color', () => {
    expect(cn('border-stroke border-ink')).toBe('border-stroke border-ink')
    expect(cn('border-b-stroke border-ink')).toBe('border-b-stroke border-ink')
  })

  it('lets a later ink shadow replace an earlier one', () => {
    expect(cn('shadow-ink-md', 'shadow-ink-sm')).toBe('shadow-ink-sm')
  })

  it('treats font-display as a font family', () => {
    expect(cn('font-sans', 'font-display')).toBe('font-display')
  })
})
