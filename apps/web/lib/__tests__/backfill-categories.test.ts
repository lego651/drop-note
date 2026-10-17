import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: {} }))

const processText = vi.fn()
vi.mock('@drop-note/shared', () => ({
  createAIProvider: () => ({ processText }),
}))

import { runCategoriesBackfill, BACKFILL_CONCURRENCY } from '../backfill-categories'

// Same chainable Supabase query-builder stand-in used by categories.test.ts: every
// filter method returns the chain itself, and the chain resolves (via `.then`) based on
// the calls recorded so far, so a resolver can inspect which filters/table were used.
type Call = { method: string; args: unknown[] }
type Resolver = (calls: Call[]) => { data: unknown; error: unknown }

function chainable(resolver: Resolver) {
  const calls: Call[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = {}
  for (const method of ['select', 'in', 'eq', 'neq', 'is', 'order', 'limit', 'update', 'insert', 'delete']) {
    chain[method] = vi.fn((...args: unknown[]) => {
      calls.push({ method, args })
      return chain
    })
  }
  chain.then = (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
    Promise.resolve(resolver(calls)).then(onFulfilled, onRejected)
  chain.__calls = calls
  return chain
}

type Category = { id: string; name: string; position: number; hidden: boolean; is_default: boolean; is_other: boolean }

const u1Categories: Category[] = [
  { id: 'cat-a', name: 'Tech', position: 0, hidden: false, is_default: true, is_other: false },
  { id: 'cat-b', name: 'Food & Drink', position: 1, hidden: false, is_default: true, is_other: false },
  { id: 'cat-other', name: 'Other', position: 2, hidden: false, is_default: true, is_other: true },
]
const u2Categories: Category[] = [
  { id: 'cat-x', name: 'Sports', position: 0, hidden: false, is_default: true, is_other: false },
  { id: 'cat-other-2', name: 'Other', position: 1, hidden: false, is_default: true, is_other: true },
]

type ItemRow = {
  id: string
  user_id: string
  subject: string | null
  ai_summary: string | null
  item_tags: { tags: { name: string } | null }[] | null
}

function makeClient(itemRows: ItemRow[], updateResolver?: Resolver) {
  const itemChains: ReturnType<typeof chainable>[] = []
  const from = vi.fn((table: string) => {
    if (table === 'items') {
      const chain = chainable((calls) => {
        if (calls.some((c) => c.method === 'update')) {
          return updateResolver ? updateResolver(calls) : { data: null, error: null }
        }
        return { data: itemRows, error: null }
      })
      itemChains.push(chain)
      return chain
    }
    if (table === 'categories') {
      return chainable((calls) => {
        const userIdCall = calls.find((c) => c.method === 'eq' && c.args[0] === 'user_id')
        const userId = userIdCall?.args[1]
        const categories = userId === 'u1' ? u1Categories : userId === 'u2' ? u2Categories : []
        return { data: categories, error: null }
      })
    }
    return chainable(() => ({ data: null, error: null }))
  })
  return { from, itemChains }
}

function row(overrides: Partial<ItemRow> & { id: string; user_id: string }): ItemRow {
  return { subject: null, ai_summary: null, item_tags: null, ...overrides }
}

beforeEach(() => {
  processText.mockReset()
})

describe('runCategoriesBackfill', () => {
  it('dry run writes nothing and returns the proposed mapping', async () => {
    processText.mockResolvedValue({ summary: '', category: 'Tech', tags: [] })
    const rows = [row({ id: 'item-1', user_id: 'u1', subject: 'New laptop', ai_summary: 'A review of a laptop.' })]
    const client = makeClient(rows)

    const result = await runCategoriesBackfill({ dryRun: true }, client as never)

    expect(result.dryRun).toBe(true)
    expect(result.scanned).toBe(1)
    expect(result.assigned).toBe(1)
    expect(result.mapping).toEqual([{ itemId: 'item-1', category: 'Tech' }])
    expect(result.perUser).toEqual({ u1: { Tech: 1 } })
    // No update call went out against the 'items' table.
    const updateCalls = client.itemChains.flatMap((c) => c.__calls).filter((c: Call) => c.method === 'update')
    expect(updateCalls).toHaveLength(0)
  })

  it('falls back to Other when the item has no usable text', async () => {
    const rows = [row({ id: 'item-1', user_id: 'u1', subject: null, ai_summary: null })]
    const client = makeClient(rows)

    const result = await runCategoriesBackfill({ dryRun: true }, client as never)

    expect(processText).not.toHaveBeenCalled()
    expect(result.fallbackOther).toBe(1)
    expect(result.mapping).toEqual([{ itemId: 'item-1', category: 'Other' }])
  })

  it('falls back to Other when the AI returns an unrecognized category', async () => {
    processText.mockResolvedValue({ summary: '', category: 'Not A Real Category', tags: [] })
    const rows = [row({ id: 'item-1', user_id: 'u1', subject: 'Something', ai_summary: 'Something else.' })]
    const client = makeClient(rows)

    const result = await runCategoriesBackfill({ dryRun: true }, client as never)

    expect(result.fallbackOther).toBe(1)
    expect(result.mapping).toEqual([{ itemId: 'item-1', category: 'Other' }])
  })

  it('falls back to Other and counts an error when the AI call throws', async () => {
    processText.mockRejectedValue(new Error('boom'))
    const rows = [row({ id: 'item-1', user_id: 'u1', subject: 'Something', ai_summary: 'Something else.' })]
    const client = makeClient(rows)

    const result = await runCategoriesBackfill({ dryRun: true }, client as never)

    expect(result.errors).toBe(1)
    expect(result.fallbackOther).toBe(1)
    expect(result.mapping).toEqual([{ itemId: 'item-1', category: 'Other' }])
  })

  it('reads with the NULL-category, unlocked, not-deleted guard (locked/deleted items are excluded by the query)', async () => {
    const rows = [row({ id: 'item-1', user_id: 'u1' })]
    const client = makeClient(rows)

    await runCategoriesBackfill({ dryRun: true }, client as never)

    const calls = client.itemChains[0].__calls as Call[]
    expect(calls).toContainEqual({ method: 'is', args: ['category_id', null] })
    expect(calls).toContainEqual({ method: 'eq', args: ['category_locked', false] })
    expect(calls).toContainEqual({ method: 'is', args: ['deleted_at', null] })
  })

  it('a real run writes category_id with the same NULL/unlocked guard, making re-runs idempotent', async () => {
    processText.mockResolvedValue({ summary: '', category: 'Tech', tags: [] })
    const rows = [row({ id: 'item-1', user_id: 'u1', subject: 'New laptop', ai_summary: 'A review.' })]
    const client = makeClient(rows)

    const result = await runCategoriesBackfill({ dryRun: false }, client as never)

    expect(result.mapping).toBeUndefined()
    const updateChain = client.itemChains.find((c) => (c.__calls as Call[]).some((call) => call.method === 'update'))
    expect(updateChain).toBeDefined()
    const calls = updateChain!.__calls as Call[]
    expect(calls).toContainEqual({ method: 'update', args: [{ category_id: 'cat-a' }] })
    expect(calls).toContainEqual({ method: 'in', args: ['id', ['item-1']] })
    expect(calls).toContainEqual({ method: 'is', args: ['category_id', null] })
    expect(calls).toContainEqual({ method: 'eq', args: ['category_locked', false] })
  })

  it('never exceeds the concurrency cap on AI calls', async () => {
    let current = 0
    let max = 0
    processText.mockImplementation(async () => {
      current += 1
      max = Math.max(max, current)
      await new Promise((resolve) => setTimeout(resolve, 5))
      current -= 1
      return { summary: '', category: 'Tech', tags: [] }
    })

    const rows = Array.from({ length: BACKFILL_CONCURRENCY * 2 + 1 }, (_, i) =>
      row({ id: `item-${i}`, user_id: 'u1', subject: 'Subject', ai_summary: 'Summary.' }),
    )
    const client = makeClient(rows)

    const result = await runCategoriesBackfill({ dryRun: true }, client as never)

    expect(result.scanned).toBe(BACKFILL_CONCURRENCY * 2 + 1)
    expect(max).toBeLessThanOrEqual(BACKFILL_CONCURRENCY)
    expect(max).toBe(BACKFILL_CONCURRENCY)
  })

  it('classifies items for multiple users against each user\'s own category list', async () => {
    processText.mockImplementation(async (_text: string, _keywords: string[], categories: string[]) => ({
      summary: '',
      category: categories[0],
      tags: [],
    }))
    const rows = [
      row({ id: 'item-1', user_id: 'u1', subject: 'Laptop', ai_summary: 'Review.' }),
      row({ id: 'item-2', user_id: 'u2', subject: 'Match', ai_summary: 'Recap.' }),
    ]
    const client = makeClient(rows)

    const result = await runCategoriesBackfill({ dryRun: true }, client as never)

    expect(result.perUser).toEqual({ u1: { Tech: 1 }, u2: { Sports: 1 } })
  })

  it('passes the item\'s own tags through as keywords without altering them', async () => {
    processText.mockResolvedValue({ summary: '', category: 'Tech', tags: [] })
    const rows = [
      row({
        id: 'item-1',
        user_id: 'u1',
        subject: 'Laptop',
        ai_summary: 'Review.',
        item_tags: [{ tags: { name: 'hardware' } }, { tags: { name: 'review' } }, { tags: null }],
      }),
    ]
    const client = makeClient(rows)

    await runCategoriesBackfill({ dryRun: true }, client as never)

    expect(processText).toHaveBeenCalledWith('Laptop\n\nReview.', ['hardware', 'review'], ['Tech', 'Food & Drink', 'Other'])
  })
})
