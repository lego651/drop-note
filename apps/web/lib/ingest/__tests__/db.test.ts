import { describe, it, expect, vi } from 'vitest'

const { mockFrom } = vi.hoisted(() => ({ mockFrom: vi.fn() }))

vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: mockFrom } }))

import { getExistingTagNames, upsertTags, getCategoriesForUser, setItemCategory } from '../db'

function chain(result: { data: unknown; error: unknown }) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(result),
  }
}

/** Like `chain()`, but resolves on `.order()` (no `.limit()` call) for getCategoriesForUser. */
function orderResolvedChain(result: { data: unknown; error: unknown }) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue(result),
  }
}

/** A thenable update chain for setItemCategory: .update().eq().eq() resolves the whole chain. */
function updateChain(result: { error: unknown }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c: any = {}
  c.update = vi.fn(() => c)
  c.eq = vi.fn(() => c)
  c.then = (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(onFulfilled, onRejected)
  return c
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

describe('getCategoriesForUser', () => {
  it('orders the Other category last even if it sorts first by position', async () => {
    mockFrom.mockReturnValue(orderResolvedChain({
      data: [
        { id: 'other', name: 'Other', hidden: false, is_other: true },
        { id: 'tech', name: 'Tech', hidden: false, is_other: false },
      ],
      error: null,
    }))
    const result = await getCategoriesForUser('user-1')
    expect(result).toEqual([{ id: 'tech', name: 'Tech' }, { id: 'other', name: 'Other' }])
  })

  it('drops hidden categories except the Other category', async () => {
    mockFrom.mockReturnValue(orderResolvedChain({
      data: [
        { id: 'tech', name: 'Tech', hidden: true, is_other: false },
        { id: 'other', name: 'Other', hidden: true, is_other: true },
        { id: 'sports', name: 'Sports', hidden: false, is_other: false },
      ],
      error: null,
    }))
    const result = await getCategoriesForUser('user-1')
    expect(result).toEqual([{ id: 'sports', name: 'Sports' }, { id: 'other', name: 'Other' }])
  })

  it('returns an empty array on a DB error', async () => {
    mockFrom.mockReturnValue(orderResolvedChain({ data: null, error: new Error('db error') }))
    const result = await getCategoriesForUser('user-1')
    expect(result).toEqual([])
  })
})

describe('setItemCategory', () => {
  const categories = [{ id: 'tech-id', name: 'Tech' }, { id: 'other-id', name: 'Other' }]

  it('updates category_id for the matching category name', async () => {
    const chainObj = updateChain({ error: null })
    mockFrom.mockReturnValue(chainObj)
    await setItemCategory('item-1', 'Tech', categories)
    expect(mockFrom).toHaveBeenCalledWith('items')
    expect(chainObj.update).toHaveBeenCalledWith({ category_id: 'tech-id' })
  })

  it('filters on category_locked=false so a user-moved item is never overwritten', async () => {
    const chainObj = updateChain({ error: null })
    mockFrom.mockReturnValue(chainObj)
    await setItemCategory('item-1', 'Tech', categories)
    expect(chainObj.eq).toHaveBeenCalledWith('category_locked', false)
  })

  it('does not touch the item when the category name has no match', async () => {
    mockFrom.mockClear()
    await setItemCategory('item-1', 'Nonexistent', categories)
    expect(mockFrom).not.toHaveBeenCalled()
  })
})
