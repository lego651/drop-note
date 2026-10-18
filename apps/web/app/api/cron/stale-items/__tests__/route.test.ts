import { NextRequest } from 'next/server'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { STALE_ITEM_ERROR_MESSAGE } from '../stale-cutoff'

interface FakeItem {
  id: string
  status: string
  created_at: string
  error_message: string | null
}

const { state } = vi.hoisted(() => ({ state: { items: [] as FakeItem[] } }))

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: {
    from: (table: string) => {
      if (table !== 'items') throw new Error(`unexpected table: ${table}`)
      return {
        update: (patch: Partial<FakeItem>) => {
          const filters: Array<(item: FakeItem) => boolean> = []
          const builder = {
            in: (col: keyof FakeItem, values: string[]) => {
              filters.push((item) => values.includes(item[col] as string))
              return builder
            },
            lt: (col: keyof FakeItem, value: string) => {
              filters.push((item) => (item[col] as string) < value)
              return builder
            },
            select: () => {
              const matched = state.items.filter((item) => filters.every((f) => f(item)))
              matched.forEach((item) => Object.assign(item, patch))
              return Promise.resolve({ data: matched.map((item) => ({ id: item.id })), error: null })
            },
          }
          return builder
        },
      }
    },
  },
}))

import { GET } from '../route'

function makeRequest(authHeader?: string): NextRequest {
  const headers: Record<string, string> = {}
  if (authHeader !== undefined) headers.authorization = authHeader
  return new NextRequest('http://localhost/api/cron/stale-items', { headers })
}

const NOW = new Date('2026-10-17T12:00:00.000Z')

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  process.env.CRON_SECRET = 'test-secret'
  state.items = []
})

function hoursAgo(h: number): string {
  return new Date(NOW.getTime() - h * 60 * 60 * 1000).toISOString()
}

describe('GET /api/cron/stale-items', () => {
  it('rejects a request without the correct cron secret', async () => {
    const res = await GET(makeRequest('Bearer wrong-secret'))

    expect(res.status).toBe(401)
  })

  it('rejects a request with no authorization header', async () => {
    const res = await GET(makeRequest())

    expect(res.status).toBe(401)
  })

  it('flips a pending item older than 24h to failed with the standard message', async () => {
    state.items = [{ id: 'old-pending', status: 'pending', created_at: hoursAgo(25), error_message: null }]

    const res = await GET(makeRequest('Bearer test-secret'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({ failed: 1 })
    expect(state.items[0]).toMatchObject({ status: 'failed', error_message: STALE_ITEM_ERROR_MESSAGE })
  })

  it('flips a processing item older than 24h to failed', async () => {
    state.items = [{ id: 'old-processing', status: 'processing', created_at: hoursAgo(48), error_message: null }]

    const res = await GET(makeRequest('Bearer test-secret'))
    const body = await res.json()

    expect(body).toEqual({ failed: 1 })
    expect(state.items[0].status).toBe('failed')
  })

  it('leaves a pending/processing item newer than 24h untouched', async () => {
    state.items = [
      { id: 'fresh-pending', status: 'pending', created_at: hoursAgo(1), error_message: null },
      { id: 'fresh-processing', status: 'processing', created_at: hoursAgo(23), error_message: null },
    ]

    const res = await GET(makeRequest('Bearer test-secret'))
    const body = await res.json()

    expect(body).toEqual({ failed: 0 })
    expect(state.items[0].status).toBe('pending')
    expect(state.items[1].status).toBe('processing')
  })

  it('leaves done and failed items untouched regardless of age', async () => {
    state.items = [
      { id: 'old-done', status: 'done', created_at: hoursAgo(100), error_message: null },
      { id: 'old-failed', status: 'failed', created_at: hoursAgo(100), error_message: 'already failed' },
    ]

    const res = await GET(makeRequest('Bearer test-secret'))
    const body = await res.json()

    expect(body).toEqual({ failed: 0 })
    expect(state.items[0].status).toBe('done')
    expect(state.items[1]).toMatchObject({ status: 'failed', error_message: 'already failed' })
  })
})
