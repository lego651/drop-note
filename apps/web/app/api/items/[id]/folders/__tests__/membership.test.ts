import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { NextRequest } from 'next/server'

const mockGetUser = vi.fn()
const mockFrom = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: mockGetUser }, from: mockFrom }),
}))

import { POST } from '../route'

const ITEM = '11111111-1111-1111-1111-111111111111'
const FOLDER = '22222222-2222-2222-2222-222222222222'

function req(body: unknown) {
  return new Request(`http://localhost/api/items/${ITEM}/folders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as NextRequest
}

beforeEach(() => {
  mockGetUser.mockReset()
  mockFrom.mockReset()
})

describe('POST /api/items/:id/folders', () => {
  it('401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await POST(req({ folderId: FOLDER }), { params: { id: ITEM } })
    expect(res.status).toBe(401)
  })

  it('400 on a non-UUID folderId', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const res = await POST(req({ folderId: 'nope' }), { params: { id: ITEM } })
    expect(res.status).toBe(400)
  })

  it('adds membership and returns 200', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockFrom.mockReturnValue({ upsert: async () => ({ error: null }) })
    const res = await POST(req({ folderId: FOLDER }), { params: { id: ITEM } })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.ok).toBe(true)
  })
})
