import { describe, it, expect } from 'vitest'
import { sortCategoriesForDisplay, CATEGORY_CAP, CATEGORY_NAME_MAX_LENGTH } from '../category-display'

function cat(position: number, is_other = false) {
  return { position, is_other }
}

describe('sortCategoriesForDisplay', () => {
  it('sorts by position', () => {
    const result = sortCategoriesForDisplay([cat(2), cat(0), cat(1)])
    expect(result.map((c) => c.position)).toEqual([0, 1, 2])
  })

  it('always puts Other last, regardless of its position', () => {
    // Other sitting at position 0 — e.g. right after a backfill — must still render last.
    const result = sortCategoriesForDisplay([cat(0, true), cat(1), cat(2)])
    expect(result.map((c) => c.is_other)).toEqual([false, false, true])
  })

  it('keeps Other last even when every custom category has a higher position', () => {
    const result = sortCategoriesForDisplay([cat(5), cat(3), cat(7, true), cat(1)])
    expect(result[result.length - 1].is_other).toBe(true)
    expect(result.slice(0, -1).map((c) => c.position)).toEqual([1, 3, 5])
  })

  it('does not mutate the input array', () => {
    const input = [cat(2), cat(0)]
    const copy = [...input]
    sortCategoriesForDisplay(input)
    expect(input).toEqual(copy)
  })

  it('handles an empty list', () => {
    expect(sortCategoriesForDisplay([])).toEqual([])
  })
})

describe('constants', () => {
  it('caps at 15 categories and 40-character names', () => {
    expect(CATEGORY_CAP).toBe(15)
    expect(CATEGORY_NAME_MAX_LENGTH).toBe(40)
  })
})
