import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { NextRequest } from 'next/server'

const mockGetUser = vi.fn()
const mockFrom = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: mockGetUser }, from: mockFrom }),
}))

import { POST } from '../route'

function req(body: unknown) {
  return new Request('http://localhost/api/folders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as NextRequest
}

// Chain for the case-insensitive duplicate lookup:
// .from('folders').select('id').eq('user_id', x).ilike('name', n).maybeSingle()
function dupChain(data: unknown) {
  return {
    select: () => ({
      eq: () => ({
        ilike: () => ({
          maybeSingle: async () => ({ data }),
        }),
      }),
    }),
  }
}

// Chain for the folder-count cap:
// .from('folders').select('id', { count, head }).eq('user_id', x)  → { count }
function countChain(count: number) {
  return {
    select: () => ({
      eq: async () => ({ count }),
    }),
  }
}

// Chain for insert:
// .from('folders').insert({...}).select('id, name, position').single()
function insertChain(data: unknown) {
  return {
    insert: () => ({
      select: () => ({
        single: async () => ({ data, error: null }),
      }),
    }),
  }
}

beforeEach(() => {
  mockGetUser.mockReset()
  mockFrom.mockReset()
})

describe('POST /api/folders', () => {
  it('401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await POST(req({ name: 'Sports' }))
    expect(res.status).toBe(401)
  })

  it('400 on empty name', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const res = await POST(req({ name: '   ' }))
    expect(res.status).toBe(400)
  })

  it('creates a folder and returns 201', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockFrom
      .mockReturnValueOnce(dupChain(null)) // duplicate check → none
      .mockReturnValueOnce(countChain(0)) // count → 0
      .mockReturnValueOnce(insertChain({ id: 'f1', name: 'Sports', position: 0 }))
    const res = await POST(req({ name: 'Sports' }))
    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json.folder.name).toBe('Sports')
  })

  it('409 on duplicate name', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockFrom.mockReturnValueOnce(dupChain({ id: 'existing' }))
    const res = await POST(req({ name: 'Sports' }))
    expect(res.status).toBe(409)
  })
})
