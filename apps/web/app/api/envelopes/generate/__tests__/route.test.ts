import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { getUser, from, incrementCounter, fetchEnvelopeSourceItems, runEnvelopeGeneration, createAIProvider } = vi.hoisted(() => ({
  getUser: vi.fn(),
  from: vi.fn(),
  incrementCounter: vi.fn(),
  fetchEnvelopeSourceItems: vi.fn(),
  runEnvelopeGeneration: vi.fn(),
  createAIProvider: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser }, from }),
}))

vi.mock('@/lib/counters', () => ({ incrementCounter }))

vi.mock('@/lib/envelopes', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/envelopes')>()
  return { ...actual, fetchEnvelopeSourceItems, runEnvelopeGeneration }
})

vi.mock('@drop-note/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@drop-note/shared')>()
  return { ...actual, createAIProvider }
})

import { POST } from '../route'

const VALID_IDS = [
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222',
]

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/envelopes/generate', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

// Chainable Supabase mock: tables are distinguished by name; each table gets its
// own resolver so insert/select/update chains for `envelopes` vs `envelope_items`
// vs `items` can each return what the test needs.
type Resolver = () => { data: unknown; error: unknown }
function chainable(resolver: Resolver) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = {}
  for (const method of ['select', 'in', 'eq', 'is', 'insert', 'update']) {
    chain[method] = vi.fn(() => chain)
  }
  chain.single = vi.fn(() => Promise.resolve(resolver()))
  chain.then = (onFulfilled: (v: unknown) => unknown) => Promise.resolve(resolver()).then(onFulfilled)
  return chain
}

function makeFrom(resolvers: Record<string, Resolver>) {
  const chains: Record<string, ReturnType<typeof chainable>[]> = {}
  return vi.fn((table: string) => {
    const chain = chainable(resolvers[table] ?? (() => ({ data: null, error: null })))
    chains[table] = chains[table] ?? []
    chains[table].push(chain)
    return chain
  })
}

beforeEach(() => {
  getUser.mockReset()
  from.mockReset()
  incrementCounter.mockReset()
  fetchEnvelopeSourceItems.mockReset()
  runEnvelopeGeneration.mockReset()
  createAIProvider.mockReset()

  getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
  incrementCounter.mockResolvedValue(1)
  fetchEnvelopeSourceItems.mockResolvedValue([])
  runEnvelopeGeneration.mockResolvedValue({ status: 'done', body: { sections: [] } })
  createAIProvider.mockReturnValue({})
})

describe('POST /api/envelopes/generate — auth + validation', () => {
  it('401s when unauthenticated', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    const res = await POST(makeRequest({ itemIds: VALID_IDS, text: 'plan' }))
    expect(res.status).toBe(401)
  })

  it('400s when fewer than 2 itemIds', async () => {
    const res = await POST(makeRequest({ itemIds: [VALID_IDS[0]], text: 'plan' }))
    expect(res.status).toBe(400)
  })

  it('400s when more than 8 itemIds', async () => {
    const ids = Array.from({ length: 9 }, (_, i) => `1111111${i}-1111-1111-1111-111111111111`)
    const res = await POST(makeRequest({ itemIds: ids, text: 'plan' }))
    expect(res.status).toBe(400)
  })

  it('400s on a non-UUID itemId', async () => {
    const res = await POST(makeRequest({ itemIds: ['not-a-uuid', VALID_IDS[1]], text: 'plan' }))
    expect(res.status).toBe(400)
  })

  it('400s on duplicate itemIds', async () => {
    const res = await POST(makeRequest({ itemIds: [VALID_IDS[0], VALID_IDS[0]], text: 'plan' }))
    expect(res.status).toBe(400)
  })

  it('400s on empty text', async () => {
    const res = await POST(makeRequest({ itemIds: VALID_IDS, text: '' }))
    expect(res.status).toBe(400)
  })

  it('400s on text over the 500 char cap', async () => {
    const res = await POST(makeRequest({ itemIds: VALID_IDS, text: 'a'.repeat(501) }))
    expect(res.status).toBe(400)
  })

  it('400s on an unknown purposeHint', async () => {
    const res = await POST(makeRequest({ itemIds: VALID_IDS, text: 'plan', purposeHint: 'bogus' }))
    expect(res.status).toBe(400)
  })
})

describe('POST /api/envelopes/generate — ownership + rate limit', () => {
  it('403s when an itemId does not belong to the caller', async () => {
    from.mockImplementation(makeFrom({
      items: () => ({ data: [{ id: VALID_IDS[0] }], error: null }), // only 1 of 2 owned
    }))

    const res = await POST(makeRequest({ itemIds: VALID_IDS, text: 'plan' }))
    expect(res.status).toBe(403)
  })

  it('429s when the envelope_gen counter is over the limit', async () => {
    incrementCounter.mockResolvedValue(-1)
    from.mockImplementation(makeFrom({
      items: () => ({ data: VALID_IDS.map((id) => ({ id })), error: null }),
    }))

    const res = await POST(makeRequest({ itemIds: VALID_IDS, text: 'plan' }))
    expect(res.status).toBe(429)
  })

  it('uses a rate-limit key isolated from ingest\'s `ratelimit:email:*` key', async () => {
    from.mockImplementation(makeFrom({
      items: () => ({ data: VALID_IDS.map((id) => ({ id })), error: null }),
      envelopes: () => ({ data: { id: 'envelope-1' }, error: null }),
      envelope_items: () => ({ data: null, error: null }),
    }))

    await POST(makeRequest({ itemIds: VALID_IDS, text: 'plan' }))

    expect(incrementCounter).toHaveBeenCalledTimes(1)
    const [key, , opts] = incrementCounter.mock.calls[0]
    expect(key).toBe('envelope_gen:user-1')
    expect(key).not.toMatch(/^ratelimit:email:/)
    expect(opts).toMatchObject({ limit: expect.any(Number) })
  })

  it('fails open (continues) when the rate limit counter throws', async () => {
    incrementCounter.mockRejectedValue(new Error('counter db down'))
    from.mockImplementation(makeFrom({
      items: () => ({ data: VALID_IDS.map((id) => ({ id })), error: null }),
      envelopes: () => ({ data: { id: 'envelope-1' }, error: null }),
      envelope_items: () => ({ data: null, error: null }),
    }))

    const res = await POST(makeRequest({ itemIds: VALID_IDS, text: 'plan' }))
    expect(res.status).toBe(200)
  })
})

describe('POST /api/envelopes/generate — happy path', () => {
  it('inserts the envelope with intent_input, links the items, runs generation, and returns {id, status}', async () => {
    const insertedEnvelopes: unknown[] = []
    const insertedEnvelopeItems: unknown[] = []
    const updatedEnvelopes: unknown[] = []

    from.mockImplementation((table: string) => {
      if (table === 'items') {
        return chainable(() => ({ data: VALID_IDS.map((id) => ({ id })), error: null }))
      }
      if (table === 'envelopes') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const chain: any = {
          insert: vi.fn((row: unknown) => { insertedEnvelopes.push(row); return chain }),
          update: vi.fn((row: unknown) => { updatedEnvelopes.push(row); return chain }),
          select: vi.fn(() => chain),
          eq: vi.fn(() => chain),
          single: vi.fn(() => Promise.resolve({ data: { id: 'envelope-1' }, error: null })),
          then: (onFulfilled: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(onFulfilled),
        }
        return chain
      }
      if (table === 'envelope_items') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const chain: any = {
          insert: vi.fn((rows: unknown) => { insertedEnvelopeItems.push(rows); return chain }),
          then: (onFulfilled: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(onFulfilled),
        }
        return chain
      }
      return chainable(() => ({ data: null, error: null }))
    })

    runEnvelopeGeneration.mockResolvedValue({
      status: 'done',
      body: { sections: [{ type: 'notes', items: [{ text: 'ok', sourceItemIds: [], confidence: 'suggested' }] }] },
    })

    const res = await POST(makeRequest({ itemIds: VALID_IDS, text: 'Make a shopping list from these', purposeHint: 'shopping_list' }))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json).toEqual({ id: 'envelope-1', status: 'done' })

    expect(insertedEnvelopes[0]).toEqual({
      user_id: 'user-1',
      intent_input: { text: 'Make a shopping list from these', purposeHint: 'shopping_list' },
      status: 'generating',
    })
    expect(insertedEnvelopeItems[0]).toEqual(
      VALID_IDS.map((id) => ({ envelope_id: 'envelope-1', item_id: id })),
    )
    expect(updatedEnvelopes[0]).toMatchObject({ status: 'done' })
  })
})
