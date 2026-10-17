import { describe, it, expect } from 'vitest'
import { buildCategoryKeywordPrompt, resolveCategory } from '../prompts'

describe('buildCategoryKeywordPrompt', () => {
  it('lists every category and names the last one as the fallback', () => {
    const prompt = buildCategoryKeywordPrompt(['Tech', 'Food & Drink', 'Other'], [])
    expect(prompt).toContain('Tech, Food & Drink, Other')
    expect(prompt).toContain('use "Other"')
  })

  it('includes existing keywords for reuse', () => {
    const prompt = buildCategoryKeywordPrompt(['Other'], ['travel', 'recipe'])
    expect(prompt).toContain('travel, recipe')
  })

  it('says "(none yet)" when there are no existing keywords', () => {
    const prompt = buildCategoryKeywordPrompt(['Other'], [])
    expect(prompt).toContain('(none yet)')
  })
})

describe('resolveCategory', () => {
  const categories = ['Food & Drink', 'Tech', 'Other']

  it('matches a category case-insensitively', () => {
    expect(resolveCategory('tech', categories)).toBe('Tech')
    expect(resolveCategory('FOOD & DRINK', categories)).toBe('Food & Drink')
  })

  it('matches by meaning regardless of casing or surrounding whitespace', () => {
    expect(resolveCategory('  Other  ', categories)).toBe('Other')
  })

  it('falls back to the last category when the model invents a name', () => {
    expect(resolveCategory('Astrology', categories)).toBe('Other')
  })

  it('falls back to the last category for null/empty/undefined input', () => {
    expect(resolveCategory(null, categories)).toBe('Other')
    expect(resolveCategory(undefined, categories)).toBe('Other')
    expect(resolveCategory('', categories)).toBe('Other')
  })

  it('never overwrites a user-locked category — caller must not call resolveCategory for locked items', () => {
    // resolveCategory itself has no notion of "locked"; the lock check lives in
    // lib/ingest/db.ts (assignCategory), which skips the AI-assigned category entirely
    // when the item is category_locked. This test documents that boundary.
    expect(resolveCategory('Tech', categories)).toBe('Tech')
  })
})
