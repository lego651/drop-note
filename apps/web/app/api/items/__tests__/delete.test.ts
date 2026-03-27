import { describe, it, expect, vi } from 'vitest'

// Mock the admin client module so the module-level import doesn't blow up
vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: {},
}))

import { deleteItem } from '@/lib/items'

describe('deleteItem', () => {
  it('hard-deletes for free tier', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: { id: 'item-id' }, error: null })
    const selectAfterDelete = vi.fn().mockReturnValue({ maybeSingle })
    const eqUserId = vi.fn().mockReturnValue({ select: selectAfterDelete })
    const eqId = vi.fn().mockReturnValue({ eq: eqUserId })
    const mockDelete = vi.fn().mockReturnValue({ eq: eqId })
    const mockFrom = vi.fn().mockReturnValue({ delete: mockDelete })
    const mockClient = { from: mockFrom } as any

    const result = await deleteItem('item-id', 'user-id', 'free', mockClient)

    expect(mockFrom).toHaveBeenCalledWith('items')
    expect(mockDelete).toHaveBeenCalled()
    expect(result).toEqual({ ok: true, affected: true })
  })

  it('soft-deletes (moves to trash) for pro tier when item not yet in trash', async () => {
    // First call: select to check deleted_at → returns null
    const singleSelect = vi.fn().mockResolvedValue({ data: { deleted_at: null } })
    const eqUserIdSelect = vi.fn().mockReturnValue({ single: singleSelect })
    const eqIdSelect = vi.fn().mockReturnValue({ eq: eqUserIdSelect })
    const mockSelect = vi.fn().mockReturnValue({ eq: eqIdSelect })

    // Second call: update → chains .select().maybeSingle()
    const maybeSingleUpdate = vi.fn().mockResolvedValue({ data: { id: 'item-id' }, error: null })
    const selectAfterUpdate = vi.fn().mockReturnValue({ maybeSingle: maybeSingleUpdate })
    const eqUserIdUpdate = vi.fn().mockReturnValue({ select: selectAfterUpdate })
    const eqIdUpdate = vi.fn().mockReturnValue({ eq: eqUserIdUpdate })
    const mockUpdate = vi.fn().mockReturnValue({ eq: eqIdUpdate })

    let callCount = 0
    const mockFrom = vi.fn().mockImplementation(() => {
      callCount++
      if (callCount === 1) return { select: mockSelect }
      return { update: mockUpdate }
    })

    const mockClient = { from: mockFrom } as any

    const result = await deleteItem('item-id', 'user-id', 'pro', mockClient)

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ deleted_at: expect.any(String) })
    )
    expect(result).toEqual({ ok: true, affected: true })
  })

  it('hard-deletes for pro tier when item is already in trash', async () => {
    // First call: select → returns item already in trash
    const singleSelect = vi.fn().mockResolvedValue({ data: { deleted_at: '2026-01-01T00:00:00Z' } })
    const eqUserIdSelect = vi.fn().mockReturnValue({ single: singleSelect })
    const eqIdSelect = vi.fn().mockReturnValue({ eq: eqUserIdSelect })
    const mockSelect = vi.fn().mockReturnValue({ eq: eqIdSelect })

    // Second call: delete → chains .select().maybeSingle()
    const maybeSingleDelete = vi.fn().mockResolvedValue({ data: { id: 'item-id' }, error: null })
    const selectAfterDelete = vi.fn().mockReturnValue({ maybeSingle: maybeSingleDelete })
    const eqUserIdDelete = vi.fn().mockReturnValue({ select: selectAfterDelete })
    const eqIdDelete = vi.fn().mockReturnValue({ eq: eqUserIdDelete })
    const mockDelete = vi.fn().mockReturnValue({ eq: eqIdDelete })

    let callCount = 0
    const mockFrom = vi.fn().mockImplementation(() => {
      callCount++
      if (callCount === 1) return { select: mockSelect }
      return { delete: mockDelete }
    })

    const mockClient = { from: mockFrom } as any

    const result = await deleteItem('item-id', 'user-id', 'pro', mockClient)

    expect(mockDelete).toHaveBeenCalled()
    expect(result).toEqual({ ok: true, affected: true })
  })

  it('hard-deletes for power tier when item not yet in trash (soft-delete first)', async () => {
    const singleSelect = vi.fn().mockResolvedValue({ data: { deleted_at: null } })
    const eqUserIdSelect = vi.fn().mockReturnValue({ single: singleSelect })
    const eqIdSelect = vi.fn().mockReturnValue({ eq: eqUserIdSelect })
    const mockSelect = vi.fn().mockReturnValue({ eq: eqIdSelect })

    const maybeSingleUpdate = vi.fn().mockResolvedValue({ data: { id: 'item-id' }, error: null })
    const selectAfterUpdate = vi.fn().mockReturnValue({ maybeSingle: maybeSingleUpdate })
    const eqUserIdUpdate = vi.fn().mockReturnValue({ select: selectAfterUpdate })
    const eqIdUpdate = vi.fn().mockReturnValue({ eq: eqUserIdUpdate })
    const mockUpdate = vi.fn().mockReturnValue({ eq: eqIdUpdate })

    let callCount = 0
    const mockFrom = vi.fn().mockImplementation(() => {
      callCount++
      if (callCount === 1) return { select: mockSelect }
      return { update: mockUpdate }
    })

    const mockClient = { from: mockFrom } as any

    const result = await deleteItem('item-id', 'user-id', 'power', mockClient)

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ deleted_at: expect.any(String) })
    )
    expect(result).toEqual({ ok: true, affected: true })
  })
})
