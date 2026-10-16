/**
 * DRO-60: an unreachable Upstash Redis must not cause the hourly rate-limit
 * check to throw past the route and drop the email. The pipeline must fail
 * open, matching the existing save-limit (`redis.eval`) behavior.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockFrom, mockPipelineExec } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockPipelineExec: vi.fn(),
}))

vi.mock('../../../../lib/supabase/admin', () => ({
  supabaseAdmin: { from: mockFrom },
}))

vi.mock('@upstash/redis', () => ({
  Redis: vi.fn().mockImplementation(function RedisMock(this: Record<string, unknown>) {
    this.pipeline = () => ({
      incr: vi.fn(),
      expire: vi.fn(),
      exec: mockPipelineExec,
    })
    this.eval = vi.fn().mockResolvedValue(1)
    this.incr = vi.fn().mockResolvedValue(1)
    this.expire = vi.fn().mockResolvedValue(undefined)
  }),
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
  dkim: '{@example.com : pass}',
}

describe('POST /api/ingest — rate-limit Redis fail-open (DRO-60)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.SENDGRID_INGEST_SECRET = 'test-secret'
    mockFrom.mockImplementation((table: string) => makeChain(table))
  })

  it('still creates the item when the rate-limit pipeline throws (Redis unreachable)', async () => {
    mockPipelineExec.mockRejectedValue(new Error('fetch failed'))

    const request = makeRequest(baseFields)
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

  it('still rate-limits normally when Redis is healthy', async () => {
    mockPipelineExec.mockResolvedValue([9999])

    const request = makeRequest(baseFields)
    const response = await POST(request)

    expect(await response.json()).toEqual({ ok: true })
    expect(processEmail).not.toHaveBeenCalled()
  })
})
