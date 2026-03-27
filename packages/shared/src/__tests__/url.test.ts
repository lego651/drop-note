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
