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

export interface PageMetadata {
  title: string | null
  description: string | null
  imageUrl: string | null
}

const PAGE_METADATA_TIMEOUT_MS = 5_000
const PAGE_METADATA_MAX_HTML_LENGTH = 200_000
const PAGE_METADATA_TITLE_MAX_LENGTH = 300
const PAGE_METADATA_DESCRIPTION_MAX_LENGTH = 1_000

const HTML_ENTITY_MAP: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
}

function decodeHtmlEntities(str: string): string {
  return str.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] === '#') {
      const isHex = entity[1]?.toLowerCase() === 'x'
      const code = parseInt(isHex ? entity.slice(2) : entity.slice(1), isHex ? 16 : 10)
      return Number.isNaN(code) ? match : String.fromCodePoint(code)
    }
    return HTML_ENTITY_MAP[entity.toLowerCase()] ?? match
  })
}

function matchMetaContent(html: string, name: string): string | null {
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]*content=["']([^"']*)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${name}["']`, 'i'),
  ]
  for (const pattern of patterns) {
    const match = html.match(pattern)
    if (match?.[1]) return decodeHtmlEntities(match[1].trim())
  }
  return null
}

function matchTitleTag(html: string): string | null {
  const match = html.match(/<title[^>]*>([^<]*)<\/title>/i)
  return match?.[1] ? decodeHtmlEntities(match[1].trim()) : null
}

function matchFirstParagraph(html: string): string | null {
  const match = html.match(/<p[^>]*>([\s\S]*?)<\/p>/i)
  if (!match) return null
  const text = decodeHtmlEntities(match[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
  return text || null
}

function resolveUrl(maybeRelative: string, base: string): string | null {
  try {
    return new URL(maybeRelative, base).toString()
  } catch {
    return null
  }
}

/**
 * Fetches lightweight page metadata (og:title/og:description/og:image, falling
 * back to <title> + first paragraph) for a generic (non-YouTube) URL.
 * Returns null on any error, non-HTML response, or when nothing is found —
 * callers should fall back to the raw URL/subject gracefully.
 */
export async function fetchPageMetadata(pageUrl: string): Promise<PageMetadata | null> {
  try {
    const res = await fetch(pageUrl, {
      signal: AbortSignal.timeout(PAGE_METADATA_TIMEOUT_MS),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; drop-note-bot/1.0; +https://dropnote.me)' },
    })
    if (!res.ok) return null

    const contentType = res.headers.get('content-type') ?? ''
    if (!contentType.includes('html')) return null

    const html = (await res.text()).slice(0, PAGE_METADATA_MAX_HTML_LENGTH)

    const title = (matchMetaContent(html, 'og:title') ?? matchTitleTag(html))
      ?.slice(0, PAGE_METADATA_TITLE_MAX_LENGTH) ?? null
    const description = (
      matchMetaContent(html, 'og:description')
      ?? matchMetaContent(html, 'description')
      ?? matchFirstParagraph(html)
    )?.slice(0, PAGE_METADATA_DESCRIPTION_MAX_LENGTH) ?? null
    const rawImageUrl = matchMetaContent(html, 'og:image')
    const imageUrl = rawImageUrl ? resolveUrl(rawImageUrl, pageUrl) : null

    if (!title && !description && !imageUrl) return null

    return { title, description, imageUrl }
  } catch {
    return null
  }
}
