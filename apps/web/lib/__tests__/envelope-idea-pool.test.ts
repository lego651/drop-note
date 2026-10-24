import { describe, it, expect, vi, beforeEach } from 'vitest'

const { incrementCounter } = vi.hoisted(() => ({ incrementCounter: vi.fn() }))
vi.mock('@/lib/counters', () => ({ incrementCounter }))

import {
  fetchIdeaPoolSignals,
  countActiveItems,
  isIdeaPoolStale,
  generateIdeaPool,
  resolveIdeaPoolForSheet,
  ENVELOPE_IDEA_POOL_MIN_ITEMS,
} from '../envelope-idea-pool'
import { ENVELOPE_STARTER_IDEAS, type AIProvider } from '@drop-note/shared'

// Same chainable-mock pattern as apps/web/lib/__tests__/categories.test.ts: every
// filter method returns the chain itself, and it resolves (via `.then` or
// `.maybeSingle()`) to whatever the table's resolver returns.
type Call = { method: string; args: unknown[] }
type Resolver = (calls: Call[]) => { data?: unknown; error?: unknown; count?: number }

function chainable(resolver: Resolver) {
  const calls: Call[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = {}
  for (const method of ['select', 'in', 'eq', 'is', 'order', 'limit', 'upsert']) {
    chain[method] = vi.fn((...args: unknown[]) => {
      calls.push({ method, args })
      return chain
    })
  }
  const resolve = () => resolver(calls)
  chain.maybeSingle = vi.fn(() => Promise.resolve(resolve()))
  chain.then = (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
    Promise.resolve(resolve()).then(onFulfilled, onRejected)
  return chain
}

function makeClient(resolvers: Record<string, Resolver>) {
  const from = vi.fn((table: string) => chainable(resolvers[table] ?? (() => ({ data: null, error: null }))))
  return { from }
}

function makeProvider(generateStructured: (...args: unknown[]) => Promise<string>): AIProvider {
  return {
    processText: vi.fn(),
    describeImage: vi.fn(),
    generateStructured,
  } as unknown as AIProvider
}

beforeEach(() => {
  incrementCounter.mockReset()
  incrementCounter.mockResolvedValue(1)
})

describe('fetchIdeaPoolSignals', () => {
  it('aggregates category and tag counts and takes recent subjects', async () => {
    const { from } = makeClient({
      items: () => ({
        data: [
          { id: 'item-1', subject: 'Pasta recipe', category_id: 'cat-1', categories: { name: 'Recipes' } },
          { id: 'item-2', subject: 'Pizza recipe', category_id: 'cat-1', categories: { name: 'Recipes' } },
          { id: 'item-3', subject: 'Trail map', category_id: 'cat-2', categories: { name: 'Outdoors' } },
        ],
        error: null,
      }),
      item_tags: () => ({
        data: [{ tags: { name: 'italian' } }, { tags: { name: 'italian' } }, { tags: { name: 'hiking' } }],
        error: null,
      }),
    })

    const signals = await fetchIdeaPoolSignals({ from } as never, 'user-1')
    expect(signals.categoryCounts).toEqual([
      { name: 'Recipes', count: 2 },
      { name: 'Outdoors', count: 1 },
    ])
    expect(signals.tagCounts).toEqual([
      { name: 'italian', count: 2 },
      { name: 'hiking', count: 1 },
    ])
    expect(signals.recentItems).toEqual([
      { id: 'item-1', subject: 'Pasta recipe' },
      { id: 'item-2', subject: 'Pizza recipe' },
      { id: 'item-3', subject: 'Trail map' },
    ])
  })

  it('returns empty signals when the items query errors', async () => {
    const { from } = makeClient({ items: () => ({ data: null, error: new Error('boom') }) })
    const signals = await fetchIdeaPoolSignals({ from } as never, 'user-1')
    expect(signals).toEqual({ categoryCounts: [], tagCounts: [], recentItems: [] })
  })

  it('keeps category counts when the tags query errors', async () => {
    const { from } = makeClient({
      items: () => ({ data: [{ id: 'item-1', subject: 's', category_id: 'c1', categories: { name: 'Recipes' } }], error: null }),
      item_tags: () => ({ data: null, error: new Error('boom') }),
    })
    const signals = await fetchIdeaPoolSignals({ from } as never, 'user-1')
    expect(signals.categoryCounts).toEqual([{ name: 'Recipes', count: 1 }])
    expect(signals.tagCounts).toEqual([])
  })

  it('returns no tag counts and skips the tags query entirely when there are no items', async () => {
    const itemTagsResolver = vi.fn(() => ({ data: [], error: null }))
    const { from } = makeClient({ items: () => ({ data: [], error: null }), item_tags: itemTagsResolver })
    const signals = await fetchIdeaPoolSignals({ from } as never, 'user-1')
    expect(signals).toEqual({ categoryCounts: [], tagCounts: [], recentItems: [] })
    expect(itemTagsResolver).not.toHaveBeenCalled()
  })
})

describe('countActiveItems', () => {
  it('returns the count', async () => {
    const { from } = makeClient({ items: () => ({ data: null, error: null, count: 7 }) })
    expect(await countActiveItems({ from } as never, 'user-1')).toBe(7)
  })

  it('returns 0 on error', async () => {
    const { from } = makeClient({ items: () => ({ data: null, error: new Error('boom') }) })
    expect(await countActiveItems({ from } as never, 'user-1')).toBe(0)
  })

  it('returns 0 when count is null', async () => {
    const { from } = makeClient({ items: () => ({ data: null, error: null, count: null as unknown as number }) })
    expect(await countActiveItems({ from } as never, 'user-1')).toBe(0)
  })
})

describe('isIdeaPoolStale', () => {
  const now = () => new Date('2026-10-24T12:00:00Z').getTime()

  it('is not stale just under 24h old', () => {
    expect(isIdeaPoolStale('2026-10-23T12:00:01Z', now)).toBe(false)
  })

  it('is stale at exactly 24h old', () => {
    expect(isIdeaPoolStale('2026-10-23T12:00:00Z', now)).toBe(true)
  })

  it('is stale well past 24h old', () => {
    expect(isIdeaPoolStale('2026-10-20T12:00:00Z', now)).toBe(true)
  })
})

describe('generateIdeaPool', () => {
  const signals = { categoryCounts: [], tagCounts: [], recentItems: [{ id: 'item-1', subject: 'Pasta' }] }

  it('returns done with validated ideas on a well-formed response', async () => {
    const provider = makeProvider(async () =>
      JSON.stringify({ ideas: [{ label: 'Cook something Italian', seedTerms: ['pasta'], matchingItemIds: ['item-1'] }] }),
    )
    const result = await generateIdeaPool(provider, signals)
    expect(result).toEqual({ status: 'done', ideas: [{ label: 'Cook something Italian', seedTerms: ['pasta'], matchingItemIds: ['item-1'] }] })
  })

  it('drops matchingItemIds outside the given recentItems', async () => {
    const provider = makeProvider(async () =>
      JSON.stringify({ ideas: [{ label: 'x', seedTerms: ['a'], matchingItemIds: ['item-1', 'item-999'] }] }),
    )
    const result = await generateIdeaPool(provider, signals)
    expect(result.status).toBe('done')
    if (result.status === 'done') expect(result.ideas[0].matchingItemIds).toEqual(['item-1'])
  })

  it('fails when the provider throws', async () => {
    const provider = makeProvider(async () => { throw new Error('network down') })
    const result = await generateIdeaPool(provider, signals)
    expect(result).toEqual({ status: 'failed', errorMessage: 'network down' })
  })

  it('fails on invalid JSON', async () => {
    const provider = makeProvider(async () => 'not json')
    const result = await generateIdeaPool(provider, signals)
    expect(result.status).toBe('failed')
  })

  it('fails when the response does not match the idea pool schema', async () => {
    const provider = makeProvider(async () => JSON.stringify({ notIdeas: [] }))
    const result = await generateIdeaPool(provider, signals)
    expect(result.status).toBe('failed')
  })
})

describe('resolveIdeaPoolForSheet', () => {
  const provider = (impl?: () => Promise<string>) => makeProvider(impl ?? (async () => JSON.stringify({ ideas: [] })))

  it('serves the stored pool as-is when fresh, without calling the AI provider', async () => {
    const generateStructured = vi.fn()
    const freshGeneratedAt = new Date().toISOString()
    const { from } = makeClient({
      envelope_idea_pools: () => ({
        data: { ideas: { ideas: [{ label: 'Fresh idea', seedTerms: ['x'], matchingItemIds: [] }] }, generated_at: freshGeneratedAt },
        error: null,
      }),
    })
    const result = await resolveIdeaPoolForSheet({ from } as never, provider(generateStructured), 'user-1')
    expect(result).toEqual({
      ideas: [{ label: 'Fresh idea', seedTerms: ['x'], matchingItemIds: [] }],
      source: 'pool',
      generatedAt: freshGeneratedAt,
    })
    expect(generateStructured).not.toHaveBeenCalled()
  })

  it('falls back to the starter chips for a thin account with no stored pool', async () => {
    const { from } = makeClient({
      envelope_idea_pools: () => ({ data: null, error: null }),
      items: () => ({ data: null, error: null, count: ENVELOPE_IDEA_POOL_MIN_ITEMS - 1 }),
    })
    const result = await resolveIdeaPoolForSheet({ from } as never, provider(), 'user-1')
    expect(result).toEqual({ ideas: [...ENVELOPE_STARTER_IDEAS], source: 'starter', generatedAt: null })
  })

  it('regenerates and upserts when the pool is missing and the account has enough items', async () => {
    const upsert = vi.fn(() => ({ error: null }))
    const now = () => new Date('2026-10-24T12:00:00Z').getTime()
    const { from } = makeClient({
      envelope_idea_pools: (calls) => {
        if (calls.some((c) => c.method === 'upsert')) return upsert()
        return { data: null, error: null }
      },
      items: () => ({ data: [], error: null, count: 20 }),
      item_tags: () => ({ data: [], error: null }),
    })
    const generateStructured = vi.fn(async () =>
      JSON.stringify({ ideas: [{ label: 'New idea', seedTerms: ['x'], matchingItemIds: [] }] }),
    )
    const result = await resolveIdeaPoolForSheet({ from } as never, provider(generateStructured), 'user-1', now)
    expect(result).toEqual({
      ideas: [{ label: 'New idea', seedTerms: ['x'], matchingItemIds: [] }],
      source: 'pool',
      generatedAt: new Date(now()).toISOString(),
    })
  })

  it('falls back to the stale stored pool when regeneration fails', async () => {
    const staleGeneratedAt = '2026-10-01T00:00:00Z'
    const { from } = makeClient({
      envelope_idea_pools: () => ({
        data: { ideas: { ideas: [{ label: 'Old idea', seedTerms: ['x'], matchingItemIds: [] }] }, generated_at: staleGeneratedAt },
        error: null,
      }),
      items: () => ({ data: [], error: null, count: 20 }),
      item_tags: () => ({ data: [], error: null }),
    })
    const generateStructured = vi.fn(async () => {
      throw new Error('provider down')
    })
    const result = await resolveIdeaPoolForSheet({ from } as never, provider(generateStructured), 'user-1')
    expect(result).toEqual({ ideas: [{ label: 'Old idea', seedTerms: ['x'], matchingItemIds: [] }], source: 'pool', generatedAt: staleGeneratedAt })
  })

  it('falls back to the stale stored pool instead of regenerating when rate-limited', async () => {
    incrementCounter.mockResolvedValue(-1)
    const staleGeneratedAt = '2026-10-01T00:00:00Z'
    const generateStructured = vi.fn()
    const { from } = makeClient({
      envelope_idea_pools: () => ({
        data: { ideas: { ideas: [{ label: 'Old idea', seedTerms: ['x'], matchingItemIds: [] }] }, generated_at: staleGeneratedAt },
        error: null,
      }),
      items: () => ({ data: [], error: null, count: 20 }),
    })
    const result = await resolveIdeaPoolForSheet({ from } as never, provider(generateStructured), 'user-1')
    expect(result.source).toBe('pool')
    expect(result.generatedAt).toBe(staleGeneratedAt)
    expect(generateStructured).not.toHaveBeenCalled()
  })

  it('falls back to the starter chips when rate-limited and no stored pool exists', async () => {
    incrementCounter.mockResolvedValue(-1)
    const { from } = makeClient({
      envelope_idea_pools: () => ({ data: null, error: null }),
      items: () => ({ data: null, error: null, count: 20 }),
    })
    const result = await resolveIdeaPoolForSheet({ from } as never, provider(), 'user-1')
    expect(result).toEqual({ ideas: [...ENVELOPE_STARTER_IDEAS], source: 'starter', generatedAt: null })
  })

  it('treats a corrupted stored pool as missing and falls through to thin-account starter chips', async () => {
    const { from } = makeClient({
      envelope_idea_pools: () => ({ data: { ideas: { notIdeas: [] }, generated_at: new Date().toISOString() }, error: null }),
      items: () => ({ data: null, error: null, count: 1 }),
    })
    const result = await resolveIdeaPoolForSheet({ from } as never, provider(), 'user-1')
    expect(result).toEqual({ ideas: [...ENVELOPE_STARTER_IDEAS], source: 'starter', generatedAt: null })
  })

  it('serves the starter chips when generation succeeds but the upsert fails and no prior pool exists', async () => {
    const { from } = makeClient({
      envelope_idea_pools: (calls) => {
        if (calls.some((c) => c.method === 'upsert')) return { error: new Error('db down') }
        return { data: null, error: null }
      },
      items: () => ({ data: [], error: null, count: 20 }),
      item_tags: () => ({ data: [], error: null }),
    })
    const generateStructured = vi.fn(async () => JSON.stringify({ ideas: [{ label: 'New idea', seedTerms: ['x'], matchingItemIds: [] }] }))
    const result = await resolveIdeaPoolForSheet({ from } as never, provider(generateStructured), 'user-1')
    expect(result).toEqual({ ideas: [...ENVELOPE_STARTER_IDEAS], source: 'starter', generatedAt: null })
  })
})
