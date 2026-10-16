/**
 * DRO-16/DRO-21: a spoofed `From` header must never create an item in the
 * claimed sender's account, and must never be charged against that
 * account's rate limit or item quota.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockFrom, mockIncrement } = vi.hoisted(() => ({ mockFrom: vi.fn(), mockIncrement: vi.fn() }))

vi.mock('../../../../lib/supabase/admin', () => ({
  supabaseAdmin: { from: mockFrom },
}))

vi.mock('../../../../lib/counters', () => ({
  incrementCounter: mockIncrement,
}))

vi.mock('../../../../lib/emails/cap-exceeded', () => ({
  sendCapExceededEmail: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../../../lib/emails/save-limit-exceeded', () => ({
  sendSaveLimitExceededEmail: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../../../lib/ingest/process-email', () => ({
  processEmail: vi.fn().mockResolvedValue({ itemIds: ['item-1'], status: 'done', aiMs: 1 }),
}))

import { POST } from '../route'
import { processEmail } from '../../../../lib/ingest/process-email'

const USER = { id: 'user-1', tier: 'free' as const, email: 'victim@example.com' }

/** `table` selects which row the chain's terminal call resolves to. */
function makeChain(table: string) {
  const resolved: Record<string, unknown> = {
    block_list: { data: null },
    users: { data: USER },
  }
  const chain: Record<string, (...args: unknown[]) => unknown> = {}
  const self = () => chain
  chain.select = vi.fn(self)
  chain.eq = vi.fn(self)
  chain.is = vi.fn(self)
  chain.upsert = vi.fn(self)
  chain.insert = vi.fn(self)
  chain.maybeSingle = vi.fn(() => Promise.resolve(resolved[table] ?? { data: null }))
  chain.single = vi.fn(() => Promise.resolve({ data: { id: 'item-1' }, error: null }))
  // The item-count query (`.select(...).eq(...).is(...)`) and the
  // fire-and-forget usage_log insert are awaited/`.then()`-ed directly
  // without a terminal `maybeSingle`/`single` call.
  chain.then = (...args: unknown[]) => {
    const resolve = args[0] as (v: unknown) => unknown
    return Promise.resolve(table === 'items' ? { count: 0 } : { error: null }).then(resolve)
  }
  return chain
}

function makeRequest(formFields: Record<string, string>) {
  const formData = new FormData()
  for (const [k, v] of Object.entries(formFields)) formData.set(k, v)
  return new Request('http://localhost/api/ingest?key=test-secret', {
    method: 'POST',
    body: formData,
  })
}

const baseFields = {
  from: 'victim@example.com',
  to: 'drop@dropnote.me',
  subject: 'Test',
  text: 'Hello',
  html: '',
}

describe('POST /api/ingest — sender verification (DRO-16/DRO-21)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.SENDGRID_INGEST_SECRET = 'test-secret'
    mockFrom.mockImplementation((table: string) => makeChain(table))
    mockIncrement.mockResolvedValue(1)
  })

  it('rejects a spoofed sender (DKIM fails) without creating an item or touching quota', async () => {
    const request = makeRequest({ ...baseFields, dkim: '{@example.com : fail}' })

    const response = await POST(request)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true })
    expect(processEmail).not.toHaveBeenCalled()

    const itemsChainCalls = mockFrom.mock.results
      .filter((_, i) => mockFrom.mock.calls[i][0] === 'items')
    // Only the fire-and-forget request flow ever touches `items`; a rejected,
    // unverified sender must not reach an `items` insert at all.
    for (const result of itemsChainCalls) {
      expect((result.value as { insert: ReturnType<typeof vi.fn> }).insert).not.toHaveBeenCalled()
    }
  })

  it('allows a verified sender (DKIM passes for the claimed domain) through to item creation', async () => {
    const request = makeRequest({ ...baseFields, dkim: '{@example.com : pass}' })

    const response = await POST(request)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true })
    expect(processEmail).toHaveBeenCalledTimes(1)

    const itemsChainCalls = mockFrom.mock.results
      .filter((_, i) => mockFrom.mock.calls[i][0] === 'items')
    const insertedOnAnyItemsChain = itemsChainCalls.some(
      (result) => (result.value as { insert: ReturnType<typeof vi.fn> }).insert.mock.calls.length > 0,
    )
    expect(insertedOnAnyItemsChain).toBe(true)
  })

  it('does not accept an SPF-shaped pass value as a DKIM pass (regression guard for the SPF/envelope bypass)', async () => {
    // Previously `verifySenderAuth` OR'd in a raw SPF field, which reflects
    // the envelope MAIL FROM domain, not the header `From` domain — letting
    // an attacker verify by passing SPF on their own domain while spoofing
    // `From`. The route now only ever reads `dkim`, so a bare 'pass' string
    // (no domain-qualified record) must fail.
    const request = makeRequest({ ...baseFields, dkim: 'pass' })

    const response = await POST(request)

    expect(await response.json()).toEqual({ ok: true })
    expect(processEmail).not.toHaveBeenCalled()
  })

  it('still saves the email when the rate-limit counter store is down (DRO-60)', async () => {
    mockIncrement.mockRejectedValue(new Error('counter store unreachable'))
    const request = makeRequest({ ...baseFields, dkim: '{@example.com : pass}' })

    const response = await POST(request)

    expect(await response.json()).toEqual({ ok: true })
    expect(processEmail).toHaveBeenCalledTimes(1)
  })
})
