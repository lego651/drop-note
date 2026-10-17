import { describe, it, expect, vi } from 'vitest'

const { mockFrom } = vi.hoisted(() => ({ mockFrom: vi.fn() }))

vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: mockFrom } }))

import { getExistingTagNames } from '../db'

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
