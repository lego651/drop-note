import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { getUser, resolveIdeaPoolForSheet, createAIProvider } = vi.hoisted(() => ({
  getUser: vi.fn(),
  resolveIdeaPoolForSheet: vi.fn(),
  createAIProvider: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser }, from: vi.fn() }),
}))

vi.mock('@/lib/envelope-idea-pool', () => ({ resolveIdeaPoolForSheet }))

vi.mock('@drop-note/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@drop-note/shared')>()
  return { ...actual, createAIProvider }
})

import { GET } from '../route'

beforeEach(() => {
  getUser.mockReset()
  resolveIdeaPoolForSheet.mockReset()
  createAIProvider.mockReset()

  getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
  createAIProvider.mockReturnValue({})
})

// Next.js always calls a route's exported GET with a real Request, even when
// the handler itself declares no parameter — withRouteLogging's wrapper reads
// args[0].headers regardless, so every call here needs a real NextRequest.
function makeRequest(): NextRequest {
  return new NextRequest('http://localhost/api/envelopes/ideas')
}

describe('GET /api/envelopes/ideas', () => {
  it('401s when unauthenticated', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    const res = await GET(makeRequest())
    expect(res.status).toBe(401)
    expect(resolveIdeaPoolForSheet).not.toHaveBeenCalled()
  })

  it('returns the resolved idea pool for an authenticated user', async () => {
    resolveIdeaPoolForSheet.mockResolvedValue({
      ideas: [{ label: 'Weekend hike', seedTerms: ['hike'], matchingItemIds: [] }],
      source: 'pool',
      generatedAt: '2026-10-24T00:00:00Z',
    })
    const res = await GET(makeRequest())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({
      ideas: [{ label: 'Weekend hike', seedTerms: ['hike'], matchingItemIds: [] }],
      source: 'pool',
      generatedAt: '2026-10-24T00:00:00Z',
    })
    expect(resolveIdeaPoolForSheet).toHaveBeenCalledWith(expect.anything(), expect.anything(), 'user-1')
  })

  it('500s when resolveIdeaPoolForSheet throws', async () => {
    resolveIdeaPoolForSheet.mockRejectedValue(new Error('boom'))
    const res = await GET(makeRequest())
    expect(res.status).toBe(500)
  })
})
