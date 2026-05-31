import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock admin client: generateLink returns a hashed_token. mock fn is module-level
// so tests can assert it was/was not called (gate-ordering proof).
const { mockGenerateLink } = vi.hoisted(() => ({
  mockGenerateLink: vi.fn(),
}))
vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: { auth: { admin: { generateLink: mockGenerateLink } } },
}))

// Mock SSR server client: verifyOtp succeeds by default.
const { mockVerifyOtp } = vi.hoisted(() => ({
  mockVerifyOtp: vi.fn(),
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { verifyOtp: mockVerifyOtp } })),
}))

import { GET } from '../route'

function makeRequest(query: string) {
  return new Request(`http://localhost/api/dev-login${query}`) as never
}

beforeEach(() => {
  mockGenerateLink.mockReset()
  mockVerifyOtp.mockReset()
  mockGenerateLink.mockResolvedValue({
    data: { properties: { hashed_token: 'tok_abc' } },
    error: null,
  })
  mockVerifyOtp.mockResolvedValue({ data: { session: {} }, error: null })
  vi.stubEnv('VERCEL_ENV', 'preview')
  vi.stubEnv('DEV_LOGIN_SECRET', 's3cret')
  vi.stubEnv('E2E_FREE_USER_EMAIL', 'e2e-free@test.local')
  vi.stubEnv('E2E_PRO_USER_EMAIL', '')
  vi.stubEnv('E2E_ADMIN_USER_EMAIL', '')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('GET /api/dev-login', () => {
  it('returns 404 in production and never mints a session (gate 1 first)', async () => {
    vi.stubEnv('VERCEL_ENV', 'production')
    const res = await GET(makeRequest('?secret=s3cret&as=jasonusca@gmail.com'))
    expect(res.status).toBe(404)
    expect(mockGenerateLink).not.toHaveBeenCalled()
  })

  it('returns 404 when the secret is missing or wrong', async () => {
    const missing = await GET(makeRequest('?as=jasonusca@gmail.com'))
    expect(missing.status).toBe(404)
    const wrong = await GET(makeRequest('?secret=nope&as=jasonusca@gmail.com'))
    expect(wrong.status).toBe(404)
    expect(mockGenerateLink).not.toHaveBeenCalled()
  })

  it('returns 404 for a non-allowlisted as= email (before any generateLink)', async () => {
    const res = await GET(makeRequest('?secret=s3cret&as=attacker@evil.com'))
    expect(res.status).toBe(404)
    expect(mockGenerateLink).not.toHaveBeenCalled()
  })

  it('mints a session and 302-redirects to a validated next for an allowlisted user', async () => {
    const res = await GET(
      makeRequest('?secret=s3cret&as=jasonusca@gmail.com&next=/settings'),
    )
    expect(mockGenerateLink).toHaveBeenCalledWith({
      type: 'magiclink',
      email: 'jasonusca@gmail.com',
    })
    expect(mockVerifyOtp).toHaveBeenCalledWith({
      type: 'magiclink',
      token_hash: 'tok_abc',
    })
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('http://localhost/settings')
  })

  it('defaults as= to jasonusca and rejects an open-redirect next', async () => {
    const res = await GET(makeRequest('?secret=s3cret&next=//evil.com'))
    expect(mockGenerateLink).toHaveBeenCalledWith({
      type: 'magiclink',
      email: 'jasonusca@gmail.com',
    })
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('http://localhost/items')
  })
})
