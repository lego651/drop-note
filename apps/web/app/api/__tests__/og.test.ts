/**
 * Smoke test for /api/og route — verifies the handler returns an ImageResponse
 * with image/png content-type.
 *
 * Note: ImageResponse from next/og is an Edge runtime primitive not available
 * in Node. We mock it and verify the handler returns the right shape.
 */
import { describe, it, expect, vi } from 'vitest'

// Mock ImageResponse since it's an Edge runtime primitive unavailable in Node
vi.mock('next/og', () => ({
  ImageResponse: class MockImageResponse {
    headers: Map<string, string>
    status: number
    constructor() {
      this.headers = new Map([['content-type', 'image/png']])
      this.status = 200
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    get(key: string): string | null {
      return this.headers.get(key) ?? null
    }
  },
}))

describe('GET /api/og', () => {
  it('returns an ImageResponse with status 200', async () => {
    const { GET } = await import('../og/route')
    const res = await GET()
    expect(res.status).toBe(200)
  })

  it('returns image/png content-type header', async () => {
    const { GET } = await import('../og/route')
    const res = await GET()
    expect(res.headers.get('content-type')).toBe('image/png')
  })
})
