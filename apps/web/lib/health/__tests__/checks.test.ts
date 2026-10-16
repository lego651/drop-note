import { describe, it, expect, vi, afterEach } from 'vitest'

vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: {} }))
vi.mock('@/lib/counters', () => ({ incrementCounter: vi.fn() }))

import { checkAi, classifyHttp, worst, COMPONENTS, SLOW_MS } from '../checks'

describe('classifyHttp', () => {
  it('is up for an expected status that answered quickly', () => {
    expect(classifyHttp(200, 120, [200])).toBe('up')
    expect(classifyHttp(401, 80, [401])).toBe('up') // unauthenticated probe of a protected API
  })

  it('is degraded when the expected status was slow', () => {
    expect(classifyHttp(200, SLOW_MS + 1, [200])).toBe('degraded')
  })

  it('is down for any unexpected status', () => {
    expect(classifyHttp(500, 50, [200])).toBe('down')
    expect(classifyHttp(200, 50, [401])).toBe('down') // a protected API answering 200 without a session is wrong
    expect(classifyHttp(307, 50, [200])).toBe('down')
  })
})

describe('worst', () => {
  it('picks down over degraded over up', () => {
    expect(worst(['up', 'up'])).toBe('up')
    expect(worst(['up', 'degraded'])).toBe('degraded')
    expect(worst(['degraded', 'down', 'up'])).toBe('down')
  })
})

describe('COMPONENTS', () => {
  it('has unique keys and maps routes in the logger format', () => {
    const keys = COMPONENTS.map((c) => c.key)
    expect(new Set(keys).size).toBe(keys.length)
    for (const r of COMPONENTS.flatMap((c) => c.routes)) expect(r).toMatch(/^(GET|POST|PATCH|PUT|DELETE) \//)
  })
})

describe('checkAi', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('probes the configured provider instead of assuming it is up', async () => {
    vi.stubEnv('AI_PROVIDER', 'anthropic')
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key')
    const fetchMock = vi.fn(async () => new Response('{}', { status: 401 }))
    vi.stubGlobal('fetch', fetchMock)
    const r = await checkAi()
    expect(fetchMock).toHaveBeenCalledWith('https://api.anthropic.com/v1/models', expect.anything())
    expect(r.status).toBe('down')
  })

  it('reports a missing key or unknown provider as down', async () => {
    vi.stubEnv('AI_PROVIDER', 'gemini')
    vi.stubEnv('GEMINI_API_KEY', '')
    expect((await checkAi()).status).toBe('down')
    vi.stubEnv('AI_PROVIDER', 'nope')
    expect((await checkAi()).detail).toContain('unknown AI_PROVIDER')
  })
})
