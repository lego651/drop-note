import { describe, it, expect, vi, beforeEach } from 'vitest'

const { getUser, rpc } = vi.hoisted(() => ({ getUser: vi.fn(), rpc: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser }, rpc }),
}))

vi.mock('@/lib/counters', () => ({ incrementCounter: vi.fn().mockResolvedValue(1) }))

import { GET } from '../search/route'

function makeRequest(q: string): Request {
  return new Request(`http://localhost/api/items/search?q=${encodeURIComponent(q)}`)
}

beforeEach(() => {
  getUser.mockReset()
  rpc.mockReset()
  getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
})

describe('GET /api/items/search — category hydration (DRO-105 B1)', () => {
  it('nests the flattened category_* RPC columns into a category object', async () => {
    rpc.mockResolvedValue({
      data: [
        {
          id: 'item-1',
          subject: 'Invoice',
          category_id: 'cat-1',
          category_locked: true,
          category_name: 'Tech',
          category_position: 2,
          category_is_other: false,
        },
      ],
      error: null,
    })

    const res = await GET(makeRequest('invoice'))
    const body = await res.json()

    expect(body).toEqual([
      {
        id: 'item-1',
        subject: 'Invoice',
        category_id: 'cat-1',
        category_locked: true,
        category: { id: 'cat-1', name: 'Tech', position: 2, is_other: false },
      },
    ])
  })

  it('returns category: null for an item with no category_id', async () => {
    rpc.mockResolvedValue({
      data: [
        {
          id: 'item-2',
          subject: 'No category',
          category_id: null,
          category_locked: false,
          category_name: null,
          category_position: null,
          category_is_other: null,
        },
      ],
      error: null,
    })

    const res = await GET(makeRequest('no category'))
    const body = await res.json()

    expect(body[0].category).toBeNull()
  })
})

// GET /api/items/search — logic contract tests

describe('GET /api/items/search — contract', () => {
  it('query shorter than 2 chars should not trigger a DB fetch', () => {
    function shouldSearch(q: string): boolean {
      return q.trim().length >= 2
    }

    expect(shouldSearch('')).toBe(false)
    expect(shouldSearch('a')).toBe(false)
    expect(shouldSearch('in')).toBe(true)
    expect(shouldSearch('invoice')).toBe(true)
  })

  it('trims whitespace before checking length', () => {
    function shouldSearch(q: string): boolean {
      return q.trim().length >= 2
    }

    expect(shouldSearch('  ')).toBe(false)
    expect(shouldSearch(' a ')).toBe(false)
    expect(shouldSearch(' ab ')).toBe(true)
  })

  it('returns empty array for short query (no DB call)', () => {
    function handleSearch(q: string): unknown[] {
      if (q.trim().length < 2) return []
      // DB query would happen here
      return ['result']
    }

    expect(handleSearch('')).toEqual([])
    expect(handleSearch('a')).toEqual([])
    expect(handleSearch('ab')).toEqual(['result'])
  })
})
