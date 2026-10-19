// Covers the DRO-232 code-review fix: PATCH /api/envelopes/[id] re-validates
// the computed `updatedBody` with parseEnvelopeBody before persisting it, so
// a bug in one of the structural ops can never write a body that later 500s
// as "This plan's content couldn't be read". Isolated into its own file
// because it needs to mock @drop-note/shared's parseEnvelopeBody itself,
// which the sibling route.test.ts doesn't.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { getUser, from } = vi.hoisted(() => ({
  getUser: vi.fn(),
  from: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser }, from }),
}))

const { parseEnvelopeBodyMock } = vi.hoisted(() => ({ parseEnvelopeBodyMock: vi.fn() }))

vi.mock('@drop-note/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@drop-note/shared')>()
  return { ...actual, parseEnvelopeBody: parseEnvelopeBodyMock }
})

import { PATCH } from '../route'

const ENVELOPE_ID = '11111111-1111-1111-1111-111111111111'

function makeRequest(body: unknown): NextRequest {
  return new NextRequest(`http://localhost/api/envelopes/${ENVELOPE_ID}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

function callPatch(body: unknown) {
  return PATCH(makeRequest(body), { params: Promise.resolve({ id: ENVELOPE_ID }) })
}

type EnvelopeRow = { id: string; status: string; body: unknown } | null
function makeFrom(envelopeRow: EnvelopeRow, updates: unknown[]) {
  return vi.fn(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chain: any = {}
    chain.select = vi.fn(() => chain)
    chain.eq = vi.fn(() => chain)
    chain.single = vi.fn(() => Promise.resolve({ data: envelopeRow, error: null }))
    chain.update = vi.fn((row: unknown) => {
      updates.push(row)
      return chain
    })
    chain.then = (onFulfilled: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(onFulfilled)
    return chain
  })
}

beforeEach(() => {
  getUser.mockReset()
  from.mockReset()
  parseEnvelopeBodyMock.mockReset()
  getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
})

describe('PATCH /api/envelopes/[id] — re-validates the result before persisting (DRO-232)', () => {
  it('400s and never calls .update() when the computed updatedBody fails parseEnvelopeBody', async () => {
    const storedBody = { sections: [{ type: 'checklist', items: [{ text: 'a', sourceItemIds: [], confidence: 'suggested' }] }] }
    const updates: unknown[] = []
    from.mockImplementation(makeFrom({ id: ENVELOPE_ID, status: 'done', body: storedBody }, updates))

    // 1st call: parsing the stored envelope.body (succeeds).
    // 2nd call: re-validating the op's result (fails) — this is the new guard.
    parseEnvelopeBodyMock.mockImplementationOnce(() => ({ success: true, data: storedBody }))
    parseEnvelopeBodyMock.mockImplementationOnce(() => ({ success: false, error: 'boom' }))

    const res = await callPatch({ action: 'addItem', sectionIndex: 0, text: 'New line' })

    expect(res.status).toBe(400)
    expect(updates).toHaveLength(0)
    expect(parseEnvelopeBodyMock).toHaveBeenCalledTimes(2)
  })
})
