import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { getUser, from, fetchEnvelopeSourceItems, runEnvelopeGeneration, createAIProvider, TEST_LIMIT } = vi.hoisted(() => ({
  getUser: vi.fn(),
  from: vi.fn(),
  fetchEnvelopeSourceItems: vi.fn(),
  runEnvelopeGeneration: vi.fn(),
  createAIProvider: vi.fn(),
  // Override the real limit (20/hour) with something small enough to
  // exhaust in a handful of calls.
  TEST_LIMIT: 2,
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser }, from }),
}))

// A real (in-memory) counter rather than a stub — this test exists to prove
// /api/envelopes/generate and /api/envelopes/[id]/regenerate draw from one
// shared `envelope_gen:{user_id}` budget (DRO-195 review, Codex finding #5),
// which a per-route stub couldn't demonstrate.
vi.mock('@/lib/counters', () => {
  const counts = new Map<string, number>()
  return {
    incrementCounter: vi.fn(async (key: string, _ttlSeconds: number, opts: { limit?: number } = {}) => {
      const next = (counts.get(key) ?? 0) + 1
      if (opts.limit !== undefined && next > opts.limit) return -1
      counts.set(key, next)
      return next
    }),
  }
})

// Override the real limit (20/hour) with something small enough to exhaust
// in a handful of calls (TEST_LIMIT, defined above).
vi.mock('@/lib/envelopes', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/envelopes')>()
  return { ...actual, fetchEnvelopeSourceItems, runEnvelopeGeneration, ENVELOPE_GEN_RATE_LIMIT_PER_HOUR: TEST_LIMIT }
})

vi.mock('@drop-note/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@drop-note/shared')>()
  return { ...actual, createAIProvider }
})

import { POST as generatePOST } from '../generate/route'
import { POST as regeneratePOST } from '../[id]/regenerate/route'

const VALID_IDS = [
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222',
]
const ENVELOPE_ID = '33333333-3333-3333-3333-333333333333'
const INTENT_INPUT = { text: 'Make a shopping list from these', purposeHint: null }
const PREVIOUS_BODY = { sections: [] }

function chainable(resolve: () => { data: unknown; error: unknown }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = {}
  for (const method of ['select', 'in', 'eq', 'is', 'insert', 'update']) {
    chain[method] = vi.fn(() => chain)
  }
  chain.single = vi.fn(() => Promise.resolve(resolve()))
  chain.then = (onFulfilled: (v: unknown) => unknown) => Promise.resolve(resolve()).then(onFulfilled)
  return chain
}

function makeFrom() {
  return vi.fn((table: string) => {
    if (table === 'items') return chainable(() => ({ data: VALID_IDS.map((id) => ({ id })), error: null }))
    if (table === 'envelopes') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const chain: any = { select: vi.fn(() => chain), eq: vi.fn(() => chain), insert: vi.fn(() => chain) }
      chain.single = vi.fn(() =>
        Promise.resolve({ data: { id: ENVELOPE_ID, intent_input: INTENT_INPUT, status: 'done', body: PREVIOUS_BODY }, error: null }),
      )
      chain.update = vi.fn(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const updateChain: any = { eq: vi.fn(() => updateChain) }
        updateChain.then = (onFulfilled: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(onFulfilled)
        return updateChain
      })
      return chain
    }
    if (table === 'envelope_items') {
      return chainable(() => ({ data: [{ item_id: 'item-1' }, { item_id: 'item-2' }], error: null }))
    }
    return chainable(() => ({ data: null, error: null }))
  })
}

function callGenerate() {
  const req = new NextRequest('http://localhost/api/envelopes/generate', {
    method: 'POST',
    body: JSON.stringify({ itemIds: VALID_IDS, text: 'plan' }),
  })
  return generatePOST(req)
}

function callRegenerate() {
  const req = new NextRequest(`http://localhost/api/envelopes/${ENVELOPE_ID}/regenerate`, { method: 'POST' })
  return regeneratePOST(req, { params: Promise.resolve({ id: ENVELOPE_ID }) })
}

beforeEach(() => {
  getUser.mockReset()
  from.mockReset()
  fetchEnvelopeSourceItems.mockReset()
  runEnvelopeGeneration.mockReset()
  createAIProvider.mockReset()

  // A fresh user id per test — the in-memory counter mock above is
  // module-scoped (not reset between tests), so reusing one id across tests
  // would let an earlier test's usage bleed into this one's budget.
  getUser.mockResolvedValue({ data: { user: { id: `user-shared-${Math.random()}` } } })
  from.mockImplementation(makeFrom())
  fetchEnvelopeSourceItems.mockResolvedValue([])
  runEnvelopeGeneration.mockResolvedValue({ status: 'done', body: { sections: [] } })
  createAIProvider.mockReturnValue({})
})

describe('generate + regenerate share one envelope_gen rate-limit budget', () => {
  it(`blocks regenerate once generate calls have used the shared ${TEST_LIMIT}/hour budget`, async () => {
    // Exhaust the (overridden) 2/hour budget with plain generate calls...
    expect((await callGenerate()).status).toBe(200)
    expect((await callGenerate()).status).toBe(200)

    // ...then a regenerate for this same user is blocked too, proving it
    // draws from the same counter rather than an independent one.
    const res = await callRegenerate()
    expect(res.status).toBe(429)
  })

  it('blocks a later generate call once regenerate calls alone have used the shared budget', async () => {
    expect((await callRegenerate()).status).toBe(200)
    expect((await callRegenerate()).status).toBe(200)

    const res = await callGenerate()
    expect(res.status).toBe(429)
  })
})
