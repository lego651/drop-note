/**
 * URL detection and YouTube helpers for the email ingest pipeline.
 * Used by the worker to classify items before AI summarization.
 */

const URL_PATTERN = /https?:\/\/[^\s<>"{}|\\^`[\]]+/i

/**
 * Returns the URL if the text is primarily a single URL (ignoring surrounding whitespace).
 * Allows a few extra non-URL words (e.g. a short intro before the link).
 */
export function extractSingleUrl(text: string): string | null {
  const trimmed = text.trim()
  if (!trimmed) return null

  const match = trimmed.match(URL_PATTERN)
  if (!match) return null

  const url = match[0]
  // Strip trailing punctuation that may have been included in the regex match
  const cleaned = url.replace(/[.,!?;:'")\]]+$/, '')

  // Only treat as "primarily a URL" if non-URL text is short (≤ 60 chars)
  const idx = trimmed.indexOf(cleaned)
  const before = trimmed.slice(0, idx).trim()
  const after = trimmed.slice(idx + cleaned.length).trim()
  const remainderLength = before.length + after.length
  if (remainderLength > 60) return null

  return cleaned
}

const YOUTUBE_PATTERNS = [
  // youtube.com/watch?v=ID
  /(?:youtube\.com\/watch[^#]*[?&]v=)([a-zA-Z0-9_-]{11})/,
  // youtu.be/ID
  /(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/,
  // youtube.com/shorts/ID
  /(?:youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
  // youtube.com/live/ID
  /(?:youtube\.com\/live\/)([a-zA-Z0-9_-]{11})/,
  // youtube.com/embed/ID
  /(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
]

export function extractYouTubeId(url: string): string | null {
  for (const pattern of YOUTUBE_PATTERNS) {
    const match = url.match(pattern)
    if (match) return match[1]
  }
  return null
}

export function getYouTubeThumbnailUrl(videoId: string): string {
  return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`
}

interface YouTubeOEmbedResponse {
  title?: string
  author_name?: string
  thumbnail_url?: string
}

/**
 * Fetches the video title via YouTube's oEmbed API (no API key required).
 * Returns null on any error so the caller can fall back gracefully.
 */
export async function fetchYouTubeTitle(videoUrl: string): Promise<string | null> {
  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(videoUrl)}&format=json`
    const res = await fetch(oembedUrl, { signal: AbortSignal.timeout(5_000) })
    if (!res.ok) return null
    const data = await res.json() as YouTubeOEmbedResponse
    return data.title ?? null
  } catch {
    return null
  }
}
