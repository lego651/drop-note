import { describe, it, expect, vi, beforeEach } from 'vitest'

const { getUser } = vi.hoisted(() => ({ getUser: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser } }),
}))

const { usersSingle } = vi.hoisted(() => ({ usersSingle: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: {
    from: () => ({
      select: () => ({
        eq: () => ({ single: usersSingle }),
      }),
    }),
  },
}))

const { runCategoriesBackfill } = vi.hoisted(() => ({ runCategoriesBackfill: vi.fn() }))
vi.mock('@/lib/backfill-categories', () => ({ runCategoriesBackfill }))

import { POST } from '../route'

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/admin/backfill-categories', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  getUser.mockReset()
  usersSingle.mockReset()
  runCategoriesBackfill.mockReset()
})

describe('POST /api/admin/backfill-categories', () => {
  it('returns 401 when there is no session', async () => {
    getUser.mockResolvedValue({ data: { user: null } })

    const res = await POST(makeRequest({ dryRun: true }))

    expect(res.status).toBe(401)
    expect(runCategoriesBackfill).not.toHaveBeenCalled()
  })

  it('returns 403 for a non-admin user', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    usersSingle.mockResolvedValue({ data: { is_admin: false } })

    const res = await POST(makeRequest({ dryRun: true }))

    expect(res.status).toBe(403)
    expect(runCategoriesBackfill).not.toHaveBeenCalled()
  })

  it('returns 400 when dryRun is missing', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } })
    usersSingle.mockResolvedValue({ data: { is_admin: true } })

    const res = await POST(makeRequest({}))

    expect(res.status).toBe(400)
    expect(runCategoriesBackfill).not.toHaveBeenCalled()
  })

  it('returns 400 when userId is not a string', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } })
    usersSingle.mockResolvedValue({ data: { is_admin: true } })

    const res = await POST(makeRequest({ dryRun: true, userId: 123 }))

    expect(res.status).toBe(400)
    expect(runCategoriesBackfill).not.toHaveBeenCalled()
  })

  it('runs the backfill for an admin and returns its result', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } })
    usersSingle.mockResolvedValue({ data: { is_admin: true } })
    runCategoriesBackfill.mockResolvedValue({
      dryRun: true,
      scanned: 2,
      assigned: 2,
      fallbackOther: 0,
      errors: 0,
      durationMs: 10,
      perUser: {},
      mapping: [],
    })

    const res = await POST(makeRequest({ dryRun: true, userId: 'target-user' }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(runCategoriesBackfill).toHaveBeenCalledWith({ dryRun: true, userId: 'target-user' })
    expect(body).toMatchObject({ ok: true, dryRun: true, scanned: 2 })
  })
})
