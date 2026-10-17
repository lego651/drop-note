import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: {} }))

import { groupItemsByDate, deleteItem, deleteItems } from '../items'

const base = { ai_summary: null, status: 'done', error_message: null, pinned: false, source_type: null, source_url: null, thumbnail_url: null }

describe('groupItemsByDate', () => {
  it('returns empty array for empty input', () => {
    expect(groupItemsByDate([])).toEqual([])
  })

  it('groups items on the same day', () => {
    const items = [
      { ...base, id: '1', created_at: '2026-01-15T10:00:00Z', subject: 'a', sender_email: 'x@x.com' },
      { ...base, id: '2', created_at: '2026-01-15T14:00:00Z', subject: 'b', sender_email: 'x@x.com' },
    ]
    const groups = groupItemsByDate(items)
    expect(groups).toHaveLength(1)
    expect(groups[0].items).toHaveLength(2)
  })

  it('groups items on two different days', () => {
    const items = [
      { ...base, id: '1', created_at: '2026-01-15T10:00:00Z', subject: 'a', sender_email: 'x@x.com' },
      { ...base, id: '2', created_at: '2026-01-16T10:00:00Z', subject: 'b', sender_email: 'x@x.com' },
    ]
    const groups = groupItemsByDate(items)
    expect(groups).toHaveLength(2)
    // Most recent first
    expect(new Date(groups[0].date).toISOString().startsWith('2026-01-16')).toBe(true)
  })

  it('labels today and yesterday correctly', () => {
    const now = new Date()
    const yesterday = new Date(now)
    yesterday.setDate(now.getDate() - 1)

    const items = [
      { ...base, id: '1', created_at: now.toISOString(), subject: 'a', sender_email: 'x@x.com' },
      { ...base, id: '2', created_at: yesterday.toISOString(), subject: 'b', sender_email: 'x@x.com' },
    ]
    const groups = groupItemsByDate(items)
    expect(groups[0].label).toBe('Today')
    expect(groups[1].label).toBe('Yesterday')
  })

  it('sorts most recent date first across multiple days', () => {
    const items = [
      { ...base, id: '1', created_at: '2026-01-10T00:00:00Z', subject: 'oldest', sender_email: 'x@x.com' },
      { ...base, id: '2', created_at: '2026-01-20T00:00:00Z', subject: 'newest', sender_email: 'x@x.com' },
      { ...base, id: '3', created_at: '2026-01-15T00:00:00Z', subject: 'middle', sender_email: 'x@x.com' },
    ]
    const groups = groupItemsByDate(items)
    expect(groups).toHaveLength(3)
    expect(groups[0].items[0].subject).toBe('newest')
    expect(groups[2].items[0].subject).toBe('oldest')
  })

  it('uses formatted date label for older items', () => {
    const items = [
      { ...base, id: '1', created_at: '2026-01-05T12:00:00Z', subject: 'old', sender_email: 'x@x.com' },
    ]
    const groups = groupItemsByDate(items)
    expect(groups[0].label).toBe('05 January 2026')
  })
})

// A minimal stand-in for the chainable, thenable Supabase query builder: every
// filter/mutation method returns itself, and the chain resolves (via `.then`,
// `.single()`, or `.maybeSingle()`) based on the calls recorded so far — so one
// resolver per table can distinguish e.g. `.in('item_id', ...)` from `.in('tag_id', ...)`.
type Call = { method: string; args: unknown[] }
type Resolver = (calls: Call[]) => { data: unknown; error: unknown }

function chainable(resolver: Resolver) {
  const calls: Call[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = {}
  for (const method of ['select', 'in', 'eq', 'delete', 'update']) {
    chain[method] = vi.fn((...args: unknown[]) => {
      calls.push({ method, args })
      return chain
    })
  }
  const resolve = () => resolver(calls)
  chain.maybeSingle = vi.fn(() => Promise.resolve(resolve()))
  chain.single = vi.fn(() => Promise.resolve(resolve()))
  chain.then = (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
    Promise.resolve(resolve()).then(onFulfilled, onRejected)
  return chain
}

function makeClient(resolvers: Record<string, Resolver>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chainsByTable: Record<string, any[]> = {}
  const from = vi.fn((table: string) => {
    const chain = chainable(resolvers[table] ?? (() => ({ data: null, error: null })))
    chainsByTable[table] = chainsByTable[table] ?? []
    chainsByTable[table].push(chain)
    return chain
  })
  return { from, chainsByTable }
}

/** Finds the `.in('id', [...])` call made on the `.delete()` chain for a table, if any. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function deletedIds(chainsByTable: Record<string, any[]>, table: string): string[] | null {
  for (const chain of chainsByTable[table] ?? []) {
    const inCalls: [string, unknown][] = chain.in.mock.calls
    const deleteCalled = chain.delete.mock.calls.length > 0
    const idCall = inCalls.find(([col]) => col === 'id')
    if (deleteCalled && idCall) return idCall[1] as string[]
  }
  return null
}

describe('deleteItems', () => {
  it('hard-deletes for free tier and returns count', async () => {
    const { from } = makeClient({
      items: () => ({ data: [{ id: '1' }, { id: '2' }], error: null }),
      item_tags: () => ({ data: [], error: null }),
    })
    const result = await deleteItems(['1', '2'], 'user-1', 'free', { from } as Parameters<typeof deleteItems>[3])
    expect(result.deleted).toBe(2)
  })

  it('returns 0 when Supabase returns an error on free tier', async () => {
    const { from } = makeClient({
      items: () => ({ data: null, error: new Error('DB error') }),
      item_tags: () => ({ data: [], error: null }),
    })
    const result = await deleteItems(['1'], 'user-1', 'free', { from } as Parameters<typeof deleteItems>[3])
    expect(result.deleted).toBe(0)
  })

  it('returns 0 when pro tier fetch returns an error', async () => {
    const { from } = makeClient({
      items: () => ({ data: null, error: new Error('DB error') }),
    })
    const result = await deleteItems(['1'], 'user-1', 'pro', { from } as Parameters<typeof deleteItems>[3])
    expect(result.deleted).toBe(0)
  })

  it('orphan cleanup: deletes a tag left with zero links, keeps a tag still used elsewhere', async () => {
    const { from, chainsByTable } = makeClient({
      items: () => ({ data: [{ id: '1' }], error: null }),
      item_tags: (calls) => {
        const inCall = calls.find((c) => c.method === 'in')
        const [column] = inCall?.args ?? []
        if (column === 'item_id') {
          // item '1' was tagged with both 'shared' (also on another item) and 'solo'
          return { data: [{ tag_id: 'shared' }, { tag_id: 'solo' }], error: null }
        }
        // after the hard-delete cascades item_tags, only 'shared' still has a link
        return { data: [{ tag_id: 'shared' }], error: null }
      },
    })

    await deleteItems(['1'], 'user-1', 'free', { from } as Parameters<typeof deleteItems>[3])

    expect(deletedIds(chainsByTable, 'tags')).toEqual(['solo'])
  })

  it('orphan cleanup: does not touch tags when the item delete fails', async () => {
    const { from, chainsByTable } = makeClient({
      items: () => ({ data: null, error: new Error('DB error') }),
      item_tags: () => ({ data: [{ tag_id: 'solo' }], error: null }),
    })

    await deleteItems(['1'], 'user-1', 'free', { from } as Parameters<typeof deleteItems>[3])

    expect(chainsByTable.tags).toBeUndefined()
  })

  it('paid tier: only cleans up tags from the hard-deleted (already-trashed) subset', async () => {
    const { from, chainsByTable } = makeClient({
      items: (calls) => {
        // First query: look up which of the requested ids are already trashed
        const selectCall = calls.find((c) => c.method === 'select')
        if (selectCall?.args[0] === 'id, deleted_at') {
          return {
            data: [
              { id: 'trashed-1', deleted_at: '2026-01-01T00:00:00Z' },
              { id: 'live-1', deleted_at: null },
            ],
            error: null,
          }
        }
        // The not-yet-trashed subset is soft-deleted (update) — irrelevant to this test.
        if (calls.some((c) => c.method === 'update')) return { data: [], error: null }
        // The already-trashed subset is hard-deleted.
        return { data: [{ id: 'trashed-1' }], error: null }
      },
      item_tags: (calls) => {
        const inCall = calls.find((c) => c.method === 'in')
        const [column, ids] = inCall?.args ?? []
        if (column === 'item_id') {
          expect(ids).toEqual(['trashed-1'])
          return { data: [{ tag_id: 'solo' }], error: null }
        }
        return { data: [], error: null }
      },
    })

    const result = await deleteItems(['trashed-1', 'live-1'], 'user-1', 'pro', { from } as Parameters<typeof deleteItems>[3])

    expect(result.deleted).toBe(1)
    expect(deletedIds(chainsByTable, 'tags')).toEqual(['solo'])
  })
})

describe('deleteItem', () => {
  it('free tier: hard-deletes and cleans up an orphaned tag', async () => {
    const { from, chainsByTable } = makeClient({
      items: () => ({ data: { id: '1' }, error: null }),
      item_tags: (calls) => {
        const inCall = calls.find((c) => c.method === 'in')
        const [column] = inCall?.args ?? []
        return column === 'item_id'
          ? { data: [{ tag_id: 'solo' }], error: null }
          : { data: [], error: null }
      },
    })

    const result = await deleteItem('1', 'user-1', 'free', { from } as Parameters<typeof deleteItem>[3])

    expect(result).toEqual({ ok: true, affected: true })
    expect(deletedIds(chainsByTable, 'tags')).toEqual(['solo'])
  })

  it('paid tier: soft-delete (not yet trashed) never queries tags', async () => {
    const { from, chainsByTable } = makeClient({
      items: (calls) => {
        const selectCall = calls.find((c) => c.method === 'select')
        if (selectCall?.args[0] === 'deleted_at') return { data: { deleted_at: null }, error: null }
        return { data: { id: '1' }, error: null }
      },
    })

    const result = await deleteItem('1', 'user-1', 'pro', { from } as Parameters<typeof deleteItem>[3])

    expect(result).toEqual({ ok: true, affected: true })
    expect(chainsByTable.item_tags).toBeUndefined()
  })
})
