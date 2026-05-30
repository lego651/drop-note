import { describe, it, expect } from 'vitest'

// Mock query builder that records .order() calls
function makeMockQuery() {
  const calls: Array<{ column: string; options?: { ascending?: boolean } }> = []
  const builder = {
    _orderCalls: calls,
    order(column: string, options?: { ascending?: boolean }) {
      calls.push({ column, options })
      return builder
    },
  }
  return builder
}

// Import the helper we'll create
import { applySortOrder } from '../sort-helpers'

describe('applySortOrder', () => {
  it('newest: applies only created_at DESC (no pinned order)', () => {
    const q = makeMockQuery()
    applySortOrder(q as ReturnType<typeof makeMockQuery>, 'newest')
    expect(q._orderCalls).toHaveLength(1)
    expect(q._orderCalls[0].column).toBe('created_at')
    expect(q._orderCalls[0].options?.ascending).toBe(false)
  })

  it('oldest: applies only created_at ASC (no pinned order)', () => {
    const q = makeMockQuery()
    applySortOrder(q as ReturnType<typeof makeMockQuery>, 'oldest')
    expect(q._orderCalls).toHaveLength(1)
    expect(q._orderCalls[0].column).toBe('created_at')
    expect(q._orderCalls[0].options?.ascending).toBe(true)
  })

  it('pinned: applies pinned DESC first, then created_at DESC', () => {
    const q = makeMockQuery()
    applySortOrder(q as ReturnType<typeof makeMockQuery>, 'pinned')
    expect(q._orderCalls).toHaveLength(2)
    expect(q._orderCalls[0].column).toBe('pinned')
    expect(q._orderCalls[0].options?.ascending).toBe(false)
    expect(q._orderCalls[1].column).toBe('created_at')
    expect(q._orderCalls[1].options?.ascending).toBe(false)
  })

  it('newest does NOT call order with pinned column', () => {
    const q = makeMockQuery()
    applySortOrder(q as ReturnType<typeof makeMockQuery>, 'newest')
    const pinnedCall = q._orderCalls.find(c => c.column === 'pinned')
    expect(pinnedCall).toBeUndefined()
  })

  it('oldest does NOT call order with pinned column', () => {
    const q = makeMockQuery()
    applySortOrder(q as ReturnType<typeof makeMockQuery>, 'oldest')
    const pinnedCall = q._orderCalls.find(c => c.column === 'pinned')
    expect(pinnedCall).toBeUndefined()
  })
})
