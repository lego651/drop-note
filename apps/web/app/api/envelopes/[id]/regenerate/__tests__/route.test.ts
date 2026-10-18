import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { getUser, from, fetchEnvelopeSourceItems, runEnvelopeGeneration, createAIProvider } = vi.hoisted(() => ({
  getUser: vi.fn(),
  from: vi.fn(),
  fetchEnvelopeSourceItems: vi.fn(),
  runEnvelopeGeneration: vi.fn(),
  createAIProvider: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser }, from }),
}))

vi.mock('@/lib/envelopes', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/envelopes')>()
  return { ...actual, fetchEnvelopeSourceItems, runEnvelopeGeneration }
})

vi.mock('@drop-note/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@drop-note/shared')>()
  return { ...actual, createAIProvider }
})

import { POST } from '../route'

const ENVELOPE_ID = '11111111-1111-1111-1111-111111111111'

function makeRequest(): NextRequest {
  return new NextRequest(`http://localhost/api/envelopes/${ENVELOPE_ID}/regenerate`, { method: 'POST' })
}

function callRegenerate() {
  return POST(makeRequest(), { params: Promise.resolve({ id: ENVELOPE_ID }) })
}

const INTENT_INPUT = { text: 'Make a shopping list from these', purposeHint: 'shopping_list' }
const PREVIOUS_BODY = {
  sections: [{ type: 'checklist', items: [{ text: 'Old item', sourceItemIds: [], confidence: 'suggested', checked: true }] }],
}

type EnvelopeRow = { id: string; intent_input: unknown; status: string; body: unknown } | null

function makeFrom(opts: {
  envelopeRow: EnvelopeRow
  linkedItems?: { item_id: string }[] | null
  linkedError?: unknown
  markGeneratingError?: unknown
  finalUpdateError?: unknown
}) {
  const { envelopeRow, linkedItems = [{ item_id: 'item-1' }, { item_id: 'item-2' }], linkedError = null, markGeneratingError = null, finalUpdateError = null } = opts
  const envelopeUpdates: unknown[] = []

  const fromFn = vi.fn((table: string) => {
    if (table === 'envelope_items') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const chain: any = { select: vi.fn(() => chain), eq: vi.fn(() => chain) }
      chain.then = (onFulfilled: (v: unknown) => unknown) =>
        Promise.resolve({ data: linkedItems, error: linkedError }).then(onFulfilled)
      return chain
    }
    if (table === 'envelopes') {
      let updateCallCount = 0
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const chain: any = { select: vi.fn(() => chain), eq: vi.fn(() => chain) }
      chain.single = vi.fn(() => Promise.resolve({ data: envelopeRow, error: null }))
      chain.update = vi.fn((row: unknown) => {
        envelopeUpdates.push(row)
        updateCallCount += 1
        const isMarkGenerating = updateCallCount === 1
        const error = isMarkGenerating ? markGeneratingError : finalUpdateError
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const updateChain: any = { eq: vi.fn(() => updateChain) }
        updateChain.then = (onFulfilled: (v: unknown) => unknown) => Promise.resolve({ data: null, error }).then(onFulfilled)
        return updateChain
      })
      return chain
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chain: any = {}
    for (const m of ['select', 'eq', 'update']) chain[m] = vi.fn(() => chain)
    chain.single = vi.fn(() => Promise.resolve({ data: null, error: null }))
    chain.then = (onFulfilled: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(onFulfilled)
    return chain
  })

  return { fromFn, envelopeUpdates }
}

beforeEach(() => {
  getUser.mockReset()
  from.mockReset()
  fetchEnvelopeSourceItems.mockReset()
  runEnvelopeGeneration.mockReset()
  createAIProvider.mockReset()

  getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
  fetchEnvelopeSourceItems.mockResolvedValue([])
  runEnvelopeGeneration.mockResolvedValue({ status: 'done', body: { sections: [] } })
  createAIProvider.mockReturnValue({})
})

describe('POST /api/envelopes/[id]/regenerate — auth + ownership', () => {
  it('401s when unauthenticated', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    const res = await callRegenerate()
    expect(res.status).toBe(401)
  })

  it('404s when the envelope does not belong to the caller', async () => {
    const { fromFn } = makeFrom({ envelopeRow: null })
    from.mockImplementation(fromFn)
    const res = await callRegenerate()
    expect(res.status).toBe(404)
  })

  it('409s when the envelope is already generating', async () => {
    const { fromFn } = makeFrom({ envelopeRow: { id: ENVELOPE_ID, intent_input: INTENT_INPUT, status: 'generating', body: null } })
    from.mockImplementation(fromFn)
    const res = await callRegenerate()
    expect(res.status).toBe(409)
  })
})

describe('POST /api/envelopes/[id]/regenerate — happy path', () => {
  it('marks the envelope generating, re-runs generation with the previous body as context, and persists the fresh result', async () => {
    const { fromFn, envelopeUpdates } = makeFrom({
      envelopeRow: { id: ENVELOPE_ID, intent_input: INTENT_INPUT, status: 'done', body: PREVIOUS_BODY },
    })
    from.mockImplementation(fromFn)
    runEnvelopeGeneration.mockResolvedValue({ status: 'done', body: { sections: [{ type: 'notes', items: [{ text: 'fresh', sourceItemIds: [], confidence: 'suggested' }] }] } })

    const res = await callRegenerate()
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toEqual({ id: ENVELOPE_ID, status: 'done' })

    // First update marks it generating; last update persists the final result.
    expect(envelopeUpdates[0]).toMatchObject({ status: 'generating' })
    expect(envelopeUpdates[envelopeUpdates.length - 1]).toMatchObject({ status: 'done' })

    expect(fetchEnvelopeSourceItems).toHaveBeenCalledWith(expect.anything(), 'user-1', ['item-1', 'item-2'])
    const [, , , , , previousBodyArg] = runEnvelopeGeneration.mock.calls[0]
    expect(previousBodyArg).toEqual(PREVIOUS_BODY)
  })

  it('still runs when the stored body fails to parse (treats previousBody as absent)', async () => {
    const { fromFn } = makeFrom({
      envelopeRow: { id: ENVELOPE_ID, intent_input: INTENT_INPUT, status: 'failed', body: { not: 'a valid envelope body' } },
    })
    from.mockImplementation(fromFn)

    const res = await callRegenerate()
    expect(res.status).toBe(200)
    const [, , , , , previousBodyArg] = runEnvelopeGeneration.mock.calls[0]
    expect(previousBodyArg).toBeUndefined()
  })

  it('422s when there are no linked items', async () => {
    const { fromFn } = makeFrom({
      envelopeRow: { id: ENVELOPE_ID, intent_input: INTENT_INPUT, status: 'done', body: PREVIOUS_BODY },
      linkedItems: [],
    })
    from.mockImplementation(fromFn)
    const res = await callRegenerate()
    expect(res.status).toBe(422)
  })

  it('reports status "failed" without erroring when generation itself fails', async () => {
    const { fromFn } = makeFrom({
      envelopeRow: { id: ENVELOPE_ID, intent_input: INTENT_INPUT, status: 'done', body: PREVIOUS_BODY },
    })
    from.mockImplementation(fromFn)
    runEnvelopeGeneration.mockResolvedValue({ status: 'failed', errorMessage: 'AI provider down' })

    const res = await callRegenerate()
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toEqual({ id: ENVELOPE_ID, status: 'failed' })
  })
})
