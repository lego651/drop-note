import { describe, it, expect } from 'vitest'
import { normalizeTags } from '../tags'

describe('normalizeTags', () => {
  it('deduplicates case-insensitive variants', () => {
    expect(normalizeTags(['Python', 'python', 'PYTHON'])).toEqual(['python'])
  })

  it('trims whitespace and lowercases', () => {
    expect(normalizeTags(['  Machine Learning  '])).toEqual(['machine learning'])
  })

  it('filters out empty strings after trimming', () => {
    expect(normalizeTags(['tag1', '', 'tag2'])).toEqual(['tag1', 'tag2'])
  })

  it('returns empty array for empty input', () => {
    expect(normalizeTags([])).toEqual([])
  })

  it('deduplicates mixed-case duplicates, preserving first-seen order', () => {
    expect(normalizeTags(['a', 'b', 'a', 'B'])).toEqual(['a', 'b'])
  })

  it('handles tags that are only whitespace', () => {
    expect(normalizeTags(['   ', 'valid'])).toEqual(['valid'])
  })

  it('preserves order of first occurrence', () => {
    expect(normalizeTags(['c', 'a', 'b', 'A', 'C'])).toEqual(['c', 'a', 'b'])
  })
})
