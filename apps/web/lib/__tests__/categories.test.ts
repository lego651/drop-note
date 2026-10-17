import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: {} }))

const processText = vi.fn()
vi.mock('@drop-note/shared', () => ({
  createAIProvider: () => ({ processText }),
}))

import {
  getCategories,
  orderedCategoryNamesForAI,
  createCategory,
  renameCategory,
  setCategoryHidden,
  deleteCategory,
  moveItems,
  previewResort,
  applyResort,
  CATEGORY_CAP,
  RESORT_SCAN_LIMIT,
  DELETE_RESORT_CONCURRENCY,
  type UserCategory,
} from '../categories'

// A minimal stand-in for the chainable, thenable Supabase query builder: every
// filter/mutation method returns itself, and the chain resolves (via `.then`,
// `.single()`, or `.maybeSingle()`) based on the calls recorded so far.
type Call = { method: string; args: unknown[] }
type Resolver = (calls: Call[]) => { data: unknown; error: unknown }

function chainable(resolver: Resolver) {
  const calls: Call[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = {}
  for (const method of ['select', 'in', 'eq', 'neq', 'is', 'order', 'limit', 'delete', 'update', 'insert']) {
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
  chain.__calls = calls
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

const cat = (overrides: Partial<UserCategory>): UserCategory => ({
  id: 'id',
  name: 'name',
  position: 0,
  hidden: false,
  is_default: false,
  is_other: false,
  ...overrides,
})

const EIGHT_DEFAULTS: UserCategory[] = [
  cat({ id: '1', name: 'Food & Drink', position: 0, is_default: true }),
  cat({ id: '2', name: 'Health & Fitness', position: 1, is_default: true }),
  cat({ id: '3', name: 'Tech', position: 2, is_default: true }),
  cat({ id: '4', name: 'Entertainment', position: 3, is_default: true }),
  cat({ id: '5', name: 'Sports', position: 4, is_default: true }),
  cat({ id: '6', name: 'Home & DIY', position: 5, is_default: true }),
  cat({ id: '7', name: 'Learning & Work', position: 6, is_default: true }),
  cat({ id: 'other', name: 'Other', position: 7, is_default: true, is_other: true }),
]

beforeEach(() => {
  processText.mockReset()
})

describe('orderedCategoryNamesForAI', () => {
  it('puts the Other category last even when it is not last by position', () => {
    const categories = [cat({ id: 'other', name: 'Other', is_other: true, position: 0 }), cat({ id: '2', name: 'Tech', position: 1 })]
    expect(orderedCategoryNamesForAI(categories)).toEqual(['Tech', 'Other'])
  })

  it('drops hidden categories except Other', () => {
    const categories = [
      cat({ id: '1', name: 'Tech', hidden: true, position: 0 }),
      cat({ id: 'other', name: 'Other', is_other: true, hidden: true, position: 1 }),
      cat({ id: '2', name: 'Sports', position: 2 }),
    ]
    expect(orderedCategoryNamesForAI(categories)).toEqual(['Sports', 'Other'])
  })
})

describe('createCategory', () => {
  it('rejects an empty name', async () => {
    const { from } = makeClient({})
    const result = await createCategory('user-1', '   ', { from } as any)
    expect(result).toEqual({ ok: false, error: 'Name is required' })
  })

  it('rejects a name over 40 characters', async () => {
    const { from } = makeClient({})
    const result = await createCategory('user-1', 'x'.repeat(41), { from } as any)
    expect(result.ok).toBe(false)
  })

  it('rejects a duplicate name case-insensitively', async () => {
    const { from } = makeClient({
      categories: () => ({ data: EIGHT_DEFAULTS, error: null }),
    })
    const result = await createCategory('user-1', 'tech', { from } as any)
    expect(result).toEqual({ ok: false, error: 'A category with this name already exists' })
  })

  it('rejects creating a 16th category (cap of 15)', async () => {
    const fifteen = [...EIGHT_DEFAULTS, ...Array.from({ length: 7 }, (_, i) => cat({ id: `extra-${i}`, name: `Extra ${i}`, position: 8 + i }))]
    expect(fifteen).toHaveLength(CATEGORY_CAP)
    const { from } = makeClient({
      categories: () => ({ data: fifteen, error: null }),
    })
    const result = await createCategory('user-1', 'One Too Many', { from } as any)
    expect(result).toEqual({ ok: false, error: `Category limit of ${CATEGORY_CAP} reached` })
  })

  it('creates a category at the next position after existing ones', async () => {
    const { from, chainsByTable } = makeClient({
      categories: (calls) => {
        if (calls.some((c) => c.method === 'insert')) {
          return { data: cat({ id: 'new', name: 'Crafts', position: 8 }), error: null }
        }
        return { data: EIGHT_DEFAULTS, error: null }
      },
    })
    const result = await createCategory('user-1', 'Crafts', { from } as any)
    expect(result).toEqual({ ok: true, category: cat({ id: 'new', name: 'Crafts', position: 8 }) })
    const insertCall = chainsByTable.categories.find((c) => c.insert.mock.calls.length > 0)
    expect(insertCall.insert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'user-1', name: 'Crafts', position: 8, is_default: false, is_other: false }),
    )
  })
})

describe('renameCategory', () => {
  it('returns an error when the category does not belong to the user', async () => {
    const { from } = makeClient({
      categories: () => ({ data: EIGHT_DEFAULTS, error: null }),
    })
    const result = await renameCategory('user-1', 'does-not-exist', 'New Name', { from } as any)
    expect(result).toEqual({ ok: false, error: 'Category not found' })
  })

  it('rejects renaming to a name already used by another category', async () => {
    const { from } = makeClient({
      categories: () => ({ data: EIGHT_DEFAULTS, error: null }),
    })
    const result = await renameCategory('user-1', '3', 'other', { from } as any)
    expect(result).toEqual({ ok: false, error: 'A category with this name already exists' })
  })

  it('allows renaming the Other category itself (only delete is blocked)', async () => {
    const { from, chainsByTable } = makeClient({
      categories: () => ({ data: EIGHT_DEFAULTS, error: null }),
    })
    const result = await renameCategory('user-1', 'other', 'Misc', { from } as any)
    expect(result).toEqual({ ok: true })
    const updateCall = chainsByTable.categories.find((c) => c.update.mock.calls.length > 0)
    expect(updateCall.update).toHaveBeenCalledWith({ name: 'Misc' })
  })
})

describe('setCategoryHidden', () => {
  it('returns not found when no row matches', async () => {
    const { from } = makeClient({
      categories: () => ({ data: null, error: null }),
    })
    const result = await setCategoryHidden('user-1', 'missing', true, { from } as any)
    expect(result).toEqual({ ok: false, error: 'Category not found' })
  })

  it('updates hidden and returns ok', async () => {
    const { from } = makeClient({
      categories: () => ({ data: { id: '1' }, error: null }),
    })
    const result = await setCategoryHidden('user-1', '1', true, { from } as any)
    expect(result).toEqual({ ok: true })
  })
})

describe('deleteCategory', () => {
  it('refuses to delete the Other category', async () => {
    const { from } = makeClient({
      categories: () => ({ data: EIGHT_DEFAULTS, error: null }),
    })
    const result = await deleteCategory('user-1', 'other', { from } as any)
    expect(result).toEqual({ ok: false, error: 'The Other category cannot be deleted' })
    expect(processText).not.toHaveBeenCalled()
  })

  it('returns not found for a category that does not belong to the user', async () => {
    const { from } = makeClient({
      categories: () => ({ data: EIGHT_DEFAULTS, error: null }),
    })
    const result = await deleteCategory('user-1', 'nope', { from } as any)
    expect(result).toEqual({ ok: false, error: 'Category not found' })
  })

  it('re-sorts every item in the category (including locked ones) via the AI, clears the lock, then deletes the category', async () => {
    processText.mockResolvedValue({ summary: '', category: 'Tech', tags: [] })
    const { from, chainsByTable } = makeClient({
      categories: (calls) => {
        if (calls.some((c) => c.method === 'delete')) return { data: null, error: null }
        return { data: EIGHT_DEFAULTS, error: null }
      },
      items: (calls) => {
        if (calls.some((c) => c.method === 'update')) return { data: null, error: null }
        return {
          data: [
            { id: 'item-1', subject: 'Locked item', ai_summary: 'about react' },
            { id: 'item-2', subject: 'Unlocked item', ai_summary: 'about react too' },
          ],
          error: null,
        }
      },
    })

    const result = await deleteCategory('user-1', '7', { from } as any) // deletes "Learning & Work"
    expect(result).toEqual({ ok: true, reassigned: 2 })

    const itemUpdateCalls = chainsByTable.items.filter((c) => c.update.mock.calls.length > 0)
    expect(itemUpdateCalls).toHaveLength(2)
    for (const call of itemUpdateCalls) {
      expect(call.update).toHaveBeenCalledWith({ category_id: '3', category_locked: false })
    }

    const categoryDeleteCall = chainsByTable.categories.find((c) => c.delete.mock.calls.length > 0)
    expect(categoryDeleteCall).toBeDefined()
  })

  it('caps concurrent AI calls at DELETE_RESORT_CONCURRENCY and skips the AI beyond RESORT_SCAN_LIMIT, moving overflow items straight to Other', async () => {
    let inFlight = 0
    let maxInFlight = 0
    processText.mockImplementation(async () => {
      inFlight++
      maxInFlight = Math.max(maxInFlight, inFlight)
      await new Promise((resolve) => setTimeout(resolve, 0))
      inFlight--
      return { summary: '', category: 'Tech', tags: [] }
    })

    const overflowCount = 10
    const totalItems = RESORT_SCAN_LIMIT + overflowCount
    const items = Array.from({ length: totalItems }, (_, i) => ({
      id: `item-${i}`,
      subject: 'something',
      ai_summary: 'summary',
    }))

    const { from, chainsByTable } = makeClient({
      categories: (calls) => {
        if (calls.some((c) => c.method === 'delete')) return { data: null, error: null }
        return { data: EIGHT_DEFAULTS, error: null }
      },
      items: (calls) => {
        if (calls.some((c) => c.method === 'update')) return { data: null, error: null }
        return { data: items, error: null }
      },
    })

    const result = await deleteCategory('user-1', '7', { from } as any) // deletes "Learning & Work"
    expect(result).toEqual({ ok: true, reassigned: totalItems })

    // Only the first RESORT_SCAN_LIMIT items ever get an AI call; the rest skip it entirely.
    expect(processText).toHaveBeenCalledTimes(RESORT_SCAN_LIMIT)
    expect(maxInFlight).toBeLessThanOrEqual(DELETE_RESORT_CONCURRENCY)
    expect(maxInFlight).toBeGreaterThan(1)

    // The overflow items are moved to Other in one bulk update, without an AI call each.
    const overflowUpdate = chainsByTable.items.find(
      (c) => c.update.mock.calls.length > 0 && c.in.mock.calls.length > 0,
    )
    expect(overflowUpdate.update).toHaveBeenCalledWith({ category_id: 'other', category_locked: false })
    expect(overflowUpdate.in).toHaveBeenCalledWith('id', items.slice(RESORT_SCAN_LIMIT).map((item) => item.id))
  })

  it('falls back to Other when the AI classification call fails', async () => {
    processText.mockRejectedValue(new Error('AI down'))
    const { from, chainsByTable } = makeClient({
      categories: (calls) => {
        if (calls.some((c) => c.method === 'delete')) return { data: null, error: null }
        return { data: EIGHT_DEFAULTS, error: null }
      },
      items: (calls) => {
        if (calls.some((c) => c.method === 'update')) return { data: null, error: null }
        return { data: [{ id: 'item-1', subject: 'Something', ai_summary: 'summary' }], error: null }
      },
    })

    await deleteCategory('user-1', '7', { from } as any)

    const itemUpdateCall = chainsByTable.items.find((c) => c.update.mock.calls.length > 0)
    expect(itemUpdateCall.update).toHaveBeenCalledWith({ category_id: 'other', category_locked: false })
  })
})

describe('moveItems', () => {
  it('sets category_id and category_locked=true (manual move is sticky)', async () => {
    const { from, chainsByTable } = makeClient({
      categories: () => ({ data: { id: 'tech-id' }, error: null }),
      items: () => ({ data: [{ id: 'item-1' }], error: null }),
    })
    const result = await moveItems('user-1', ['item-1'], 'tech-id', { from } as any)
    expect(result).toEqual({ ok: true, moved: 1 })
    const updateCall = chainsByTable.items.find((c) => c.update.mock.calls.length > 0)
    expect(updateCall.update).toHaveBeenCalledWith({ category_id: 'tech-id', category_locked: true })
  })

  it('returns an error when the category does not belong to the user', async () => {
    const { from } = makeClient({
      categories: () => ({ data: null, error: null }),
    })
    const result = await moveItems('user-1', ['item-1'], 'not-mine', { from } as any)
    expect(result).toEqual({ ok: false, error: 'Category not found' })
  })

  it('is a no-op for an empty item list', async () => {
    const { from } = makeClient({})
    const result = await moveItems('user-1', [], 'tech-id', { from } as any)
    expect(result).toEqual({ ok: true, moved: 0 })
    expect(from).not.toHaveBeenCalled()
  })
})

describe('applyResort', () => {
  it('filters on category_locked=false so a locked item id is never moved', async () => {
    const { from, chainsByTable } = makeClient({
      categories: () => ({ data: { id: 'tech-id' }, error: null }),
      items: () => ({ data: [{ id: 'item-1' }], error: null }),
    })
    const result = await applyResort('user-1', 'tech-id', ['item-1', 'locked-item'], { from } as any)
    expect(result).toEqual({ ok: true, moved: 1 })
    const updateCall = chainsByTable.items.find((c) => c.update.mock.calls.length > 0)
    expect(updateCall.eq).toHaveBeenCalledWith('category_locked', false)
  })
})

describe('previewResort', () => {
  it('returns only items the AI now classifies into the target category, never moving them', async () => {
    processText.mockImplementation((text: string) =>
      Promise.resolve({ summary: '', category: text.includes('pottery') ? 'Crafts' : 'Other', tags: [] }),
    )
    const categories = [...EIGHT_DEFAULTS, cat({ id: 'crafts', name: 'Crafts', position: 8 })]
    const { from, chainsByTable } = makeClient({
      categories: () => ({ data: categories, error: null }),
      items: () => ({
        data: [
          { id: 'item-1', subject: 'pottery wheel', ai_summary: '', category_id: '6' },
          { id: 'item-2', subject: 'grocery run', ai_summary: '', category_id: '6' },
        ],
        error: null,
      }),
    })

    const result = await previewResort('user-1', 'crafts', { from } as any)
    expect(result).toEqual({
      ok: true,
      candidates: [{ itemId: 'item-1', subject: 'pottery wheel', currentCategoryId: '6' }],
    })
    // Preview must never write anything.
    expect(chainsByTable.items.every((c) => c.update.mock.calls.length === 0)).toBe(true)
  })

  it('returns an error when the target category does not belong to the user', async () => {
    const { from } = makeClient({
      categories: () => ({ data: EIGHT_DEFAULTS, error: null }),
    })
    const result = await previewResort('user-1', 'not-mine', { from } as any)
    expect(result).toEqual({ ok: false, error: 'Category not found' })
  })
})

describe('getCategories', () => {
  it('returns an empty array on a DB error', async () => {
    const { from } = makeClient({
      categories: () => ({ data: null, error: new Error('db error') }),
    })
    const result = await getCategories('user-1', { from } as any)
    expect(result).toEqual([])
  })
})
