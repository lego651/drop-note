import { describe, it, expect, vi, beforeEach } from 'vitest'

const lookupMock = vi.fn()

vi.mock('node:dns/promises', () => ({
  lookup: (...args: unknown[]) => lookupMock(...args),
}))

const { fetchPageMetadata } = await import('../page-metadata')

function mockPublicDns() {
  lookupMock.mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
}

describe('fetchPageMetadata', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    lookupMock.mockReset()
    mockPublicDns()
  })

  function mockHtmlResponse(html: string, ok = true, contentType = 'text/html; charset=utf-8') {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok,
      headers: { get: (name: string) => (name === 'content-type' ? contentType : null) },
      text: () => Promise.resolve(html),
    }))
  }

  it('extracts og:title, og:description, and og:image', async () => {
    mockHtmlResponse(`
      <html><head>
        <meta property="og:title" content="A Great Article" />
        <meta property="og:description" content="A short summary of the article." />
        <meta property="og:image" content="https://example.com/thumb.jpg" />
      </head></html>
    `)

    const result = await fetchPageMetadata('https://example.com/article')

    expect(result).toEqual({
      title: 'A Great Article',
      description: 'A short summary of the article.',
      imageUrl: 'https://example.com/thumb.jpg',
    })
  })

  it('falls back to <title> and first paragraph when og tags are missing', async () => {
    mockHtmlResponse(`
      <html><head><title>Plain Title</title></head>
      <body><p>First paragraph text.</p></body></html>
    `)

    const result = await fetchPageMetadata('https://example.com/article')

    expect(result).toEqual({
      title: 'Plain Title',
      description: 'First paragraph text.',
      imageUrl: null,
    })
  })

  it('resolves a relative og:image against the page URL', async () => {
    mockHtmlResponse(`
      <html><head>
        <meta property="og:title" content="Title" />
        <meta property="og:image" content="/images/thumb.jpg" />
      </head></html>
    `)

    const result = await fetchPageMetadata('https://example.com/article')

    expect(result?.imageUrl).toBe('https://example.com/images/thumb.jpg')
  })

  it('decodes HTML entities in title and description', async () => {
    mockHtmlResponse(`
      <html><head>
        <meta property="og:title" content="Cats &amp; Dogs" />
        <meta property="og:description" content="It&#39;s great" />
      </head></html>
    `)

    const result = await fetchPageMetadata('https://example.com/article')

    expect(result?.title).toBe('Cats & Dogs')
    expect(result?.description).toBe("It's great")
  })

  it('returns null when the response is not ok', async () => {
    mockHtmlResponse('<html></html>', false)

    const result = await fetchPageMetadata('https://example.com/404')
    expect(result).toBeNull()
  })

  it('returns null when the content type is not HTML', async () => {
    mockHtmlResponse('{}', true, 'application/json')

    const result = await fetchPageMetadata('https://example.com/data.json')
    expect(result).toBeNull()
  })

  it('returns null when fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')))

    const result = await fetchPageMetadata('https://example.com/article')
    expect(result).toBeNull()
  })

  it('returns null when no metadata can be found at all', async () => {
    mockHtmlResponse('<html><head></head><body></body></html>')

    const result = await fetchPageMetadata('https://example.com/empty')
    expect(result).toBeNull()
  })

  it('reads the body via a size-limited stream instead of buffering the full response', async () => {
    const read = vi.fn()
      .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode('<html><head><title>Streamed</title></head></html>') })
      .mockResolvedValueOnce({ done: true, value: undefined })
    const cancel = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: (name: string) => (name === 'content-type' ? 'text/html' : null) },
      body: { getReader: () => ({ read, cancel }) },
    }))

    const result = await fetchPageMetadata('https://example.com/article')

    expect(result?.title).toBe('Streamed')
    expect(cancel).toHaveBeenCalled()
  })

  describe('SSRF guard', () => {
    it('refuses to fetch a hostname that resolves to a private IP', async () => {
      lookupMock.mockResolvedValue([{ address: '10.0.0.5', family: 4 }])
      const fetchSpy = vi.fn()
      vi.stubGlobal('fetch', fetchSpy)

      const result = await fetchPageMetadata('https://internal.example/secret')

      expect(result).toBeNull()
      expect(fetchSpy).not.toHaveBeenCalled()
    })

    it('refuses to fetch a hostname that resolves to a loopback IP', async () => {
      lookupMock.mockResolvedValue([{ address: '127.0.0.1', family: 4 }])
      const fetchSpy = vi.fn()
      vi.stubGlobal('fetch', fetchSpy)

      const result = await fetchPageMetadata('http://localhost:8080/admin')

      expect(result).toBeNull()
      expect(fetchSpy).not.toHaveBeenCalled()
    })

    it('refuses to fetch a hostname that resolves to a link-local IPv6 address', async () => {
      lookupMock.mockResolvedValue([{ address: 'fe80::1', family: 6 }])
      const fetchSpy = vi.fn()
      vi.stubGlobal('fetch', fetchSpy)

      const result = await fetchPageMetadata('https://metadata.internal/latest')

      expect(result).toBeNull()
      expect(fetchSpy).not.toHaveBeenCalled()
    })

    it('refuses to fetch when any resolved address is private, even if others are public', async () => {
      lookupMock.mockResolvedValue([
        { address: '93.184.216.34', family: 4 },
        { address: '169.254.169.254', family: 4 },
      ])
      const fetchSpy = vi.fn()
      vi.stubGlobal('fetch', fetchSpy)

      const result = await fetchPageMetadata('https://example.com/article')

      expect(result).toBeNull()
      expect(fetchSpy).not.toHaveBeenCalled()
    })

    it('refuses non-http(s) protocols', async () => {
      const fetchSpy = vi.fn()
      vi.stubGlobal('fetch', fetchSpy)

      const result = await fetchPageMetadata('file:///etc/passwd')

      expect(result).toBeNull()
      expect(fetchSpy).not.toHaveBeenCalled()
      expect(lookupMock).not.toHaveBeenCalled()
    })

    it('does not follow redirects', async () => {
      mockPublicDns()
      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => 'text/html' },
        text: () => Promise.resolve('<html></html>'),
      })
      vi.stubGlobal('fetch', fetchSpy)

      await fetchPageMetadata('https://example.com/article')

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://example.com/article',
        expect.objectContaining({ redirect: 'error' }),
      )
    })

    it('returns null when a redirect is encountered (fetch throws with redirect: error)', async () => {
      mockPublicDns()
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('unexpected redirect')))

      const result = await fetchPageMetadata('https://example.com/redirects-away')
      expect(result).toBeNull()
    })

    it('returns null when DNS resolution fails', async () => {
      lookupMock.mockRejectedValue(new Error('ENOTFOUND'))
      const fetchSpy = vi.fn()
      vi.stubGlobal('fetch', fetchSpy)

      const result = await fetchPageMetadata('https://does-not-resolve.invalid/article')

      expect(result).toBeNull()
      expect(fetchSpy).not.toHaveBeenCalled()
    })
  })
})
