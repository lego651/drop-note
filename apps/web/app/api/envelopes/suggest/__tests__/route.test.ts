import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import type { AIProvider, EnvelopeSuggestCandidateItem } from '@drop-note/shared'

const { getUser, incrementCounter, fetchEnvelopeSuggestCandidates, createAIProvider } = vi.hoisted(() => ({
  getUser: vi.fn(),
  incrementCounter: vi.fn(),
  fetchEnvelopeSuggestCandidates: vi.fn(),
  createAIProvider: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser } }),
}))

vi.mock('@/lib/counters', () => ({ incrementCounter }))

// fetchEnvelopeSuggestCandidates is mocked so each test controls the candidate pool
// directly, but runEnvelopeSuggestion (and its hallucination guard) stays real —
// the "hallucinated id" test below depends on exercising the real filter.
vi.mock('@/lib/envelopes', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/envelopes')>()
  return { ...actual, fetchEnvelopeSuggestCandidates }
})

vi.mock('@drop-note/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@drop-note/shared')>()
  return { ...actual, createAIProvider }
})

import { POST } from '../route'

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/envelopes/suggest', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

function fakeProvider(response: string): AIProvider {
  return {
    processText: vi.fn(),
    describeImage: vi.fn(),
    generateStructured: vi.fn().mockResolvedValue(response),
  } as unknown as AIProvider
}

const CANDIDATES: EnvelopeSuggestCandidateItem[] = [
  { id: 'item-1', subject: 'Costco run', aiSummary: 'Buy snacks', sourceType: 'email_body', notes: null, categoryName: 'Shopping', tagNames: ['errands'] },
  { id: 'item-2', subject: 'Trail map', aiSummary: 'A hiking trail', sourceType: 'article', notes: null, categoryName: 'Sports', tagNames: [] },
]

beforeEach(() => {
  getUser.mockReset()
  incrementCounter.mockReset()
  fetchEnvelopeSuggestCandidates.mockReset()
  createAIProvider.mockReset()

  getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
  incrementCounter.mockResolvedValue(1)
  fetchEnvelopeSuggestCandidates.mockResolvedValue(CANDIDATES)
  createAIProvider.mockReturnValue(fakeProvider(JSON.stringify({
    items: [
      { itemId: 'item-1', reason: 'mentions Costco' },
      { itemId: 'item-2', reason: 'mentions hiking' },
    ],
  })))
})

describe('POST /api/envelopes/suggest — auth + validation', () => {
  it('401s when unauthenticated', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    const res = await POST(makeRequest({ query: 'weekend errands' }))
    expect(res.status).toBe(401)
  })

  it('400s on invalid JSON', async () => {
    const res = await POST(new NextRequest('http://localhost/api/envelopes/suggest', { method: 'POST', body: '{not json' }))
    expect(res.status).toBe(400)
  })

  it('400s on empty query', async () => {
    const res = await POST(makeRequest({ query: '' }))
    expect(res.status).toBe(400)
  })

  it('400s on query over the 500 char cap', async () => {
    const res = await POST(makeRequest({ query: 'a'.repeat(501) }))
    expect(res.status).toBe(400)
  })

  it('400s when seedTerms is not an array of strings', async () => {
    const res = await POST(makeRequest({ query: 'errands', seedTerms: [1, 2] }))
    expect(res.status).toBe(400)
  })
})

describe('POST /api/envelopes/suggest — rate limit', () => {
  it('429s when the envelope_suggest counter is over the limit', async () => {
    incrementCounter.mockResolvedValue(-1)
    const res = await POST(makeRequest({ query: 'weekend errands' }))
    expect(res.status).toBe(429)
  })

  it('uses a rate-limit key isolated from envelope_gen\'s counter', async () => {
    await POST(makeRequest({ query: 'weekend errands' }))

    expect(incrementCounter).toHaveBeenCalledTimes(1)
    const [key, , opts] = incrementCounter.mock.calls[0]
    expect(key).toBe('envelope_suggest:user-1')
    expect(key).not.toBe('envelope_gen:user-1')
    expect(opts).toMatchObject({ limit: expect.any(Number) })
  })

  it('fails open (continues) when the rate limit counter throws', async () => {
    incrementCounter.mockRejectedValue(new Error('counter db down'))
    const res = await POST(makeRequest({ query: 'weekend errands' }))
    expect(res.status).toBe(200)
  })
})

describe('POST /api/envelopes/suggest — happy path', () => {
  it('returns the model\'s picks with subject + reason, plus candidateCount', async () => {
    const res = await POST(makeRequest({ query: 'weekend errands' }))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json).toEqual({
      items: [
        { itemId: 'item-1', subject: 'Costco run', reason: 'mentions Costco' },
        { itemId: 'item-2', subject: 'Trail map', reason: 'mentions hiking' },
      ],
      candidateCount: 2,
      insufficientMatches: false,
    })
  })

  it('passes the caller\'s query and seedTerms through to the candidate fetch', async () => {
    await POST(makeRequest({ query: 'weekend errands', seedTerms: ['costco', 'groceries'] }))

    expect(fetchEnvelopeSuggestCandidates).toHaveBeenCalledWith(
      expect.anything(),
      'user-1',
      'weekend errands',
      ['costco', 'groceries'],
    )
  })
})

describe('POST /api/envelopes/suggest — insufficient matches', () => {
  it('skips the AI call entirely when fewer than 2 candidates are found', async () => {
    fetchEnvelopeSuggestCandidates.mockResolvedValue([CANDIDATES[0]])

    const res = await POST(makeRequest({ query: 'weekend errands' }))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json).toEqual({ items: [], candidateCount: 1, insufficientMatches: true })
    expect(createAIProvider).not.toHaveBeenCalled()
  })

  it('reports insufficientMatches when the model genuinely picks fewer than 2', async () => {
    createAIProvider.mockReturnValue(fakeProvider(JSON.stringify({
      items: [{ itemId: 'item-1', reason: 'mentions Costco' }],
    })))

    const res = await POST(makeRequest({ query: 'weekend errands' }))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.insufficientMatches).toBe(true)
    expect(json.items).toHaveLength(1)
  })
})

describe('POST /api/envelopes/suggest — hallucinated/foreign item id', () => {
  it('drops a model-picked id that is not in the candidate set before it ever reaches the response', async () => {
    createAIProvider.mockReturnValue(fakeProvider(JSON.stringify({
      items: [
        { itemId: 'item-1', reason: 'mentions Costco' },
        { itemId: 'someone-elses-item-id', reason: 'hallucinated' },
      ],
    })))

    const res = await POST(makeRequest({ query: 'weekend errands' }))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.items).toEqual([{ itemId: 'item-1', subject: 'Costco run', reason: 'mentions Costco' }])
    expect(JSON.stringify(json)).not.toContain('someone-elses-item-id')
  })
})

describe('POST /api/envelopes/suggest — AI provider failure', () => {
  it('500s when the AI provider fails on both attempts', async () => {
    createAIProvider.mockReturnValue({
      processText: vi.fn(),
      describeImage: vi.fn(),
      generateStructured: vi.fn().mockRejectedValue(new Error('OpenAI HTTP 500')),
    })

    const res = await POST(makeRequest({ query: 'weekend errands' }))
    expect(res.status).toBe(500)
  })
})
