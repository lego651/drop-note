import { describe, it, expect, vi, beforeEach } from 'vitest'
import { extractSingleUrl, extractYouTubeId, getYouTubeThumbnailUrl, fetchYouTubeTitle } from '../url'

describe('extractSingleUrl', () => {
  it('returns null for empty string', () => {
    expect(extractSingleUrl('')).toBeNull()
  })

  it('returns the URL when text is URL only', () => {
    expect(extractSingleUrl('https://example.com')).toBe('https://example.com')
  })

  it('returns the URL when surrounded by short intro text (< 60 chars)', () => {
    expect(extractSingleUrl('Check this out: https://example.com')).toBe('https://example.com')
  })

  it('returns null when non-URL surrounding text exceeds 60 chars', () => {
    const longPrefix = 'a'.repeat(61)
    expect(extractSingleUrl(`${longPrefix} https://example.com`)).toBeNull()
  })

  it('strips trailing punctuation from the URL', () => {
    expect(extractSingleUrl('See https://example.com.')).toBe('https://example.com')
  })

  it('strips trailing punctuation with other punctuation characters', () => {
    expect(extractSingleUrl('Visit https://example.com!')).toBe('https://example.com')
    expect(extractSingleUrl('(https://example.com)')).toBe('https://example.com')
  })

  it('returns the URL when the URL appears twice (second occurrence is part of remainder)', () => {
    // With indexOf+slice: only the first URL match is extracted. The second URL
    // becomes the "after" remainder (13 chars), which is ≤ 60, so the first URL is returned.
    expect(extractSingleUrl('https://x.com https://x.com')).toBe('https://x.com')
  })

  it('returns null when text has no URL', () => {
    expect(extractSingleUrl('just some plain text')).toBeNull()
  })

  it('handles URL with whitespace padding', () => {
    expect(extractSingleUrl('  https://example.com  ')).toBe('https://example.com')
  })

  it('detects a schemeless mp.weixin.qq.com link (WeChat in-app "copy link")', () => {
    expect(extractSingleUrl('mp.weixin.qq.com/s/AbCdEfGhIjKlMnOpQrSt12')).toBe(
      'https://mp.weixin.qq.com/s/AbCdEfGhIjKlMnOpQrSt12'
    )
  })

  it('detects a mp.weixin.qq.com link behind a long Chinese title/teaser (> 60 chars)', () => {
    const text =
      '【重磅】最新研究显示每天走路八千步就能显著改善健康状况,快来看看这篇文章吧,非常值得一读: https://mp.weixin.qq.com/s?__biz=MzI1NDQ4MTM0MA==&mid=2247483848&idx=1&sn=a1b2c3d4e5f60718293a4b5c6d7e8f90&chksm=abcdefg1234567890#rd'
    expect(extractSingleUrl(text)).toBe(
      'https://mp.weixin.qq.com/s?__biz=MzI1NDQ4MTM0MA==&mid=2247483848&idx=1&sn=a1b2c3d4e5f60718293a4b5c6d7e8f90&chksm=abcdefg1234567890#rd'
    )
  })

  it('does not regress xiaohongshu.com links: still subject to the 60-char heuristic', () => {
    const longPrefix = 'a'.repeat(61)
    expect(extractSingleUrl(`${longPrefix} https://www.xiaohongshu.com/explore/abc123`)).toBeNull()
    expect(extractSingleUrl('Check this out: https://www.xiaohongshu.com/explore/abc123')).toBe(
      'https://www.xiaohongshu.com/explore/abc123'
    )
  })

  it('prefers a schemeless WeChat link over another URL elsewhere in the text', () => {
    expect(
      extractSingleUrl('mp.weixin.qq.com/s/AbCdEfGhIjKl\n\n--\nSent from https://example.com/sig')
    ).toBe('https://mp.weixin.qq.com/s/AbCdEfGhIjKl')
  })

  it('prefers a scheme-ful WeChat link over an earlier URL in the text', () => {
    expect(
      extractSingleUrl('see https://example.com then https://mp.weixin.qq.com/s/AbCdEfGhIjKl')
    ).toBe('https://mp.weixin.qq.com/s/AbCdEfGhIjKl')
  })

  it('stops a schemeless WeChat link at glued-on Chinese punctuation/text', () => {
    expect(extractSingleUrl('看这篇mp.weixin.qq.com/s/AbCdEfGhIjKl,写得很好。')).toBe(
      'https://mp.weixin.qq.com/s/AbCdEfGhIjKl'
    )
  })

  it('stops a scheme-ful WeChat link at glued-on Chinese punctuation/text', () => {
    expect(extractSingleUrl('看这篇https://mp.weixin.qq.com/s/AbCdEfGhIjKl,写得很好。')).toBe(
      'https://mp.weixin.qq.com/s/AbCdEfGhIjKl'
    )
  })

  it('does not treat a look-alike host (evilmp.weixin.qq.com) as a WeChat link', () => {
    const longPrefix = 'a'.repeat(61)
    expect(extractSingleUrl(`${longPrefix} https://evilmp.weixin.qq.com/s/AbCd`)).toBeNull()
    expect(extractSingleUrl('Check this out: https://evilmp.weixin.qq.com/s/AbCd')).toBe(
      'https://evilmp.weixin.qq.com/s/AbCd'
    )
  })

  it('detects a twitter.com link even behind a long reaction preamble (> 60 chars)', () => {
    const text =
      'Wow, this is a wild thread about the economy and why everyone is wrong about the recession: https://twitter.com/someuser/status/1234567890123456789'
    expect(extractSingleUrl(text)).toBe('https://twitter.com/someuser/status/1234567890123456789')
  })

  it('detects an x.com link even behind a long reaction preamble (> 60 chars)', () => {
    const text =
      'Honestly this take is wrong on so many levels but worth reading the replies too: https://x.com/someuser/status/9876543210987654321'
    expect(extractSingleUrl(text)).toBe('https://x.com/someuser/status/9876543210987654321')
  })

  it('detects a twitter.com link even when another URL appears earlier in the text', () => {
    const text =
      'Quoting this article (https://example.com/some-long-article-slug) in reply to this thread, which is honestly a better take: https://twitter.com/someuser/status/1234567890123456789'
    expect(extractSingleUrl(text)).toBe('https://twitter.com/someuser/status/1234567890123456789')
  })

  it('returns null for a bare x.com profile link (not a post) behind a long preamble', () => {
    const longPreamble = 'a'.repeat(61)
    expect(extractSingleUrl(`${longPreamble} Twitter: https://x.com/janedoe`)).toBeNull()
  })

  it('returns null for a bare twitter.com profile link behind a long preamble', () => {
    const longPreamble = 'a'.repeat(61)
    expect(extractSingleUrl(`${longPreamble} Follow me: https://twitter.com/janedoe`)).toBeNull()
  })
})

describe('extractYouTubeId', () => {
  const VIDEO_ID = 'dQw4w9WgXcW'

  it('extracts ID from youtube.com/watch?v= URL', () => {
    expect(extractYouTubeId(`https://www.youtube.com/watch?v=${VIDEO_ID}`)).toBe(VIDEO_ID)
  })

  it('extracts ID from youtu.be/ short URL', () => {
    expect(extractYouTubeId(`https://youtu.be/${VIDEO_ID}`)).toBe(VIDEO_ID)
  })

  it('extracts ID from youtube.com/shorts/ URL', () => {
    expect(extractYouTubeId(`https://www.youtube.com/shorts/${VIDEO_ID}`)).toBe(VIDEO_ID)
  })

  it('extracts ID from youtube.com/live/ URL', () => {
    expect(extractYouTubeId(`https://www.youtube.com/live/${VIDEO_ID}`)).toBe(VIDEO_ID)
  })

  it('extracts ID from youtube.com/embed/ URL', () => {
    expect(extractYouTubeId(`https://www.youtube.com/embed/${VIDEO_ID}`)).toBe(VIDEO_ID)
  })

  it('extracts ID from watch URL with additional query params', () => {
    expect(extractYouTubeId(`https://www.youtube.com/watch?v=${VIDEO_ID}&list=PL123`)).toBe(VIDEO_ID)
  })

  it('returns null for a non-YouTube URL', () => {
    expect(extractYouTubeId('https://example.com/video/dQw4w9WgXcW')).toBeNull()
  })

  it('returns null for a malformed URL with no video ID', () => {
    expect(extractYouTubeId('https://www.youtube.com/watch')).toBeNull()
    expect(extractYouTubeId('https://youtu.be/')).toBeNull()
  })
})

describe('getYouTubeThumbnailUrl', () => {
  it('returns a URL containing the video ID and img.youtube.com', () => {
    const videoId = 'dQw4w9WgXcW'
    const url = getYouTubeThumbnailUrl(videoId)
    expect(url).toContain(videoId)
    expect(url).toMatch(/img\.youtube\.com|i\.ytimg\.com/)
  })
})

describe('fetchYouTubeTitle', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('returns the title from a successful oEmbed response', async () => {
    const mockResponse = { title: 'Test Video', author_name: 'Test Channel' }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    }))

    const result = await fetchYouTubeTitle('https://www.youtube.com/watch?v=dQw4w9WgXcW')
    expect(result).toBe('Test Video')
  })

  it('returns null when fetch returns a non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
    }))

    const result = await fetchYouTubeTitle('https://www.youtube.com/watch?v=dQw4w9WgXcW')
    expect(result).toBeNull()
  })

  it('returns null when fetch throws an error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')))

    const result = await fetchYouTubeTitle('https://www.youtube.com/watch?v=dQw4w9WgXcW')
    expect(result).toBeNull()
  })

  it('returns null when oEmbed response has no title field', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ author_name: 'Test Channel' }),
    }))

    const result = await fetchYouTubeTitle('https://www.youtube.com/watch?v=dQw4w9WgXcW')
    expect(result).toBeNull()
  })
})
