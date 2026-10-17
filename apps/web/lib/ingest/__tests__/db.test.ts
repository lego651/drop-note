import { describe, it, expect, vi } from 'vitest'

const { mockFrom } = vi.hoisted(() => ({ mockFrom: vi.fn() }))

vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: mockFrom } }))

import { getExistingTagNames, upsertTags } from '../db'

function chain(result: { data: unknown; error: unknown }) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(result),
  }
}

describe('getExistingTagNames', () => {
  it('returns the user\'s tag names', async () => {
    mockFrom.mockReturnValue(chain({ data: [{ name: 'travel' }, { name: 'recipe' }], error: null }))
    const result = await getExistingTagNames('user-1')
    expect(result).toEqual(['travel', 'recipe'])
    expect(mockFrom).toHaveBeenCalledWith('tags')
  })

  it('returns an empty array when the query errors', async () => {
    mockFrom.mockReturnValue(chain({ data: null, error: new Error('db error') }))
    const result = await getExistingTagNames('user-1')
    expect(result).toEqual([])
  })

  it('returns an empty array when the user has no tags', async () => {
    mockFrom.mockReturnValue(chain({ data: [], error: null }))
    const result = await getExistingTagNames('user-1')
    expect(result).toEqual([])
  })
})

describe('upsertTags', () => {
  function setup(existing: { id: string; name: string }[]) {
    const tagUpsert = vi.fn((row: { name: string }) => ({
      select: () => ({ single: () => Promise.resolve({ data: { id: `new-${row.name}` }, error: null }) }),
    }))
    const linkUpsert = vi.fn().mockResolvedValue({ error: null })
    mockFrom.mockImplementation((table: string) => {
      if (table === 'item_tags') return { upsert: linkUpsert }
      return {
        select: () => ({ eq: () => Promise.resolve({ data: existing, error: null }) }),
        upsert: tagUpsert,
      }
    })
    return { tagUpsert, linkUpsert }
  }

  it('reuses an existing tag regardless of its casing instead of inserting a duplicate', async () => {
    const { tagUpsert, linkUpsert } = setup([{ id: 'tag-react', name: 'React' }])
    await upsertTags('user-1', 'item-1', ['react'])
    expect(tagUpsert).not.toHaveBeenCalled()
    expect(linkUpsert).toHaveBeenCalledWith([{ item_id: 'item-1', tag_id: 'tag-react' }], { onConflict: 'item_id,tag_id' })
  })

  it('inserts only the names the user does not already have', async () => {
    const { tagUpsert, linkUpsert } = setup([{ id: 'tag-cooking', name: 'cooking' }])
    await upsertTags('user-1', 'item-1', ['Cooking', 'stir-fry'])
    expect(tagUpsert).toHaveBeenCalledTimes(1)
    expect(tagUpsert.mock.calls[0][0]).toEqual({ user_id: 'user-1', name: 'stir-fry' })
    expect(linkUpsert).toHaveBeenCalledWith(
      [{ item_id: 'item-1', tag_id: 'tag-cooking' }, { item_id: 'item-1', tag_id: 'new-stir-fry' }],
      { onConflict: 'item_id,tag_id' },
    )
  })
})
