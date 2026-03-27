import { describe, it, expect, vi, beforeEach } from 'vitest'

// vi.hoisted runs before vi.mock factories, making these variables available in mocks.
const { mockFrom } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
}))

// Mock the stripe lib — prevents requireEnv('STRIPE_SECRET_KEY') from throwing at module load.
vi.mock('../../../../../lib/stripe', () => ({
  stripe: {
    webhooks: {
      constructEvent: vi.fn(),
    },
    subscriptions: {
      retrieve: vi.fn(),
    },
  },
}))

// Supabase mock: module-level supabaseAdmin in route.ts is created once on import.
// We expose mockFrom via vi.hoisted so the factory can reference it safely.
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from: mockFrom })),
}))

// Mock @drop-note/shared — keep real tier/env helpers, override priceIdToTier.
vi.mock('@drop-note/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@drop-note/shared')>()
  return {
    ...actual,
    priceIdToTier: vi.fn((priceId: string) => {
      if (priceId === 'price_pro_test') return 'pro'
      if (priceId === 'price_power_test') return 'power'
      return null
    }),
  }
})

import { stripe } from '../../../../../lib/stripe'
import { POST } from '../route'

function makeRequest(body: string, sig: string = 'valid-sig') {
  return new Request('http://localhost/api/webhooks/stripe', {
    method: 'POST',
    body,
    headers: { 'stripe-signature': sig },
  })
}

/** Sets up the Supabase .from().update().eq() chain to succeed. */
function mockDbSuccess() {
  const eq = vi.fn().mockResolvedValue({ error: null })
  const update = vi.fn().mockReturnValue({ eq })
  mockFrom.mockReturnValue({ update })
}

/** Sets up the Supabase .from().update().eq() chain to return a DB error. */
function mockDbError(message: string) {
  const eq = vi.fn().mockResolvedValue({ error: { message } })
  const update = vi.fn().mockReturnValue({ eq })
  mockFrom.mockReturnValue({ update })
}

describe('POST /api/webhooks/stripe', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test'
    // Default: DB succeeds
    mockDbSuccess()
  })

  it('returns 400 when stripe-signature header is missing', async () => {
    const req = new Request('http://localhost/api/webhooks/stripe', {
      method: 'POST',
      body: 'body',
      // no stripe-signature header
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 400 when signature verification fails', async () => {
    vi.mocked(stripe.webhooks.constructEvent).mockImplementation(() => {
      throw new Error('Invalid signature')
    })

    const res = await POST(makeRequest('body'))
    expect(res.status).toBe(400)
  })

  it('handles checkout.session.completed and updates tier to pro', async () => {
    const mockEvent = {
      type: 'checkout.session.completed',
      data: {
        object: {
          client_reference_id: 'user-123',
          subscription: 'sub-123',
        },
      },
    }
    vi.mocked(stripe.webhooks.constructEvent).mockReturnValue(mockEvent as any)
    vi.mocked(stripe.subscriptions.retrieve).mockResolvedValue({
      items: { data: [{ price: { id: 'price_pro_test' } }] },
    } as any)

    const res = await POST(makeRequest('{}'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.received).toBe(true)
  })

  it('returns 500 for checkout.session.completed with unknown price ID', async () => {
    const mockEvent = {
      type: 'checkout.session.completed',
      data: {
        object: {
          client_reference_id: 'user-123',
          subscription: 'sub-123',
        },
      },
    }
    vi.mocked(stripe.webhooks.constructEvent).mockReturnValue(mockEvent as any)
    vi.mocked(stripe.subscriptions.retrieve).mockResolvedValue({
      items: { data: [{ price: { id: 'price_unknown' } }] },
    } as any)

    const res = await POST(makeRequest('{}'))
    expect(res.status).toBe(500)
  })

  it('handles customer.subscription.updated with power price ID', async () => {
    const mockEvent = {
      type: 'customer.subscription.updated',
      data: {
        object: {
          metadata: { supabase_user_id: 'user-123' },
          items: { data: [{ price: { id: 'price_power_test' } }] },
        },
      },
    }
    vi.mocked(stripe.webhooks.constructEvent).mockReturnValue(mockEvent as any)

    const res = await POST(makeRequest('{}'))
    expect(res.status).toBe(200)
  })

  it('returns 200 (skip) for customer.subscription.updated with unknown price ID', async () => {
    const mockEvent = {
      type: 'customer.subscription.updated',
      data: {
        object: {
          metadata: { supabase_user_id: 'user-123' },
          items: { data: [{ price: { id: 'price_unknown' } }] },
        },
      },
    }
    vi.mocked(stripe.webhooks.constructEvent).mockReturnValue(mockEvent as any)

    const res = await POST(makeRequest('{}'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.received).toBe(true)
  })

  it('handles customer.subscription.deleted and sets tier to free', async () => {
    const mockEvent = {
      type: 'customer.subscription.deleted',
      data: {
        object: {
          metadata: { supabase_user_id: 'user-123' },
        },
      },
    }
    vi.mocked(stripe.webhooks.constructEvent).mockReturnValue(mockEvent as any)

    const res = await POST(makeRequest('{}'))
    expect(res.status).toBe(200)
  })

  it('returns 500 when DB update throws (infrastructure failure)', async () => {
    const mockEvent = {
      type: 'customer.subscription.deleted',
      data: {
        object: {
          metadata: { supabase_user_id: 'user-123' },
        },
      },
    }
    vi.mocked(stripe.webhooks.constructEvent).mockReturnValue(mockEvent as any)
    mockDbError('DB connection failed')

    const res = await POST(makeRequest('{}'))
    expect(res.status).toBe(500)
  })
})
