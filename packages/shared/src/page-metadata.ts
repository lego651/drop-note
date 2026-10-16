/**
 * Server-only page metadata scraper for the email ingest pipeline.
 *
 * Deliberately NOT re-exported from `./index` — it imports `node:dns`/`node:net`,
 * and `index.ts` is barrelled into client bundles (see `url.ts`'s `extractYouTubeId`,
 * which client components import). Import this module directly:
 * `@drop-note/shared/page-metadata`.
 */
import { lookup } from 'node:dns/promises'

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

/**
 * Extracts a quoted attribute value from a single tag's source, matching the
 * actual opening quote character to the closing one via backreference —
 * `[^"']*` would wrongly stop at an apostrophe inside a double-quoted value
 * (e.g. content="Don't Miss This").
 */
function extractAttr(tag: string, attr: string): string | null {
  const match = tag.match(new RegExp(`${attr}=(["'])((?:(?!\\1)[\\s\\S])*)\\1`, 'i'))
  return match ? match[2] : null
}

function matchMetaContent(html: string, name: string): string | null {
  const metaTagPattern = /<meta\b[^>]*>/gi
  let tagMatch: RegExpExecArray | null
  while ((tagMatch = metaTagPattern.exec(html))) {
    const tag = tagMatch[0]
    const tagName = extractAttr(tag, 'property') ?? extractAttr(tag, 'name')
    if (tagName?.toLowerCase() !== name.toLowerCase()) continue
    const content = extractAttr(tag, 'content')
    if (content) return decodeHtmlEntities(content.trim())
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
 * Returns true if `address` is a loopback, private, link-local, or otherwise
 * non-public IP (IPv4 or IPv6), per RFC 1918 / RFC 4193 / RFC 3927 / RFC 4291.
 */
function isPrivateOrReservedIp(address: string): boolean {
  if (address.includes('.')) {
    const parts = address.split('.').map(Number)
    if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) return true
    const [a, b] = parts
    if (a === 0) return true // 0.0.0.0/8
    if (a === 10) return true // 10.0.0.0/8
    if (a === 127) return true // 127.0.0.0/8 loopback
    if (a === 169 && b === 254) return true // 169.254.0.0/16 link-local
    if (a === 172 && b >= 16 && b <= 31) return true // 172.16.0.0/12
    if (a === 192 && b === 168) return true // 192.168.0.0/16
    if (a === 100 && b >= 64 && b <= 127) return true // 100.64.0.0/10 CGNAT
    if (a >= 224) return true // multicast / reserved
    return false
  }

  const normalized = address.toLowerCase()
  if (normalized === '::1' || normalized === '::') return true
  if (normalized.startsWith('::ffff:')) return isPrivateOrReservedIp(normalized.slice('::ffff:'.length))
  if (/^fe[89ab][0-9a-f]:/.test(normalized)) return true // fe80::/10 link-local
  if (/^f[cd][0-9a-f]{2}:/.test(normalized)) return true // fc00::/7 unique local
  return false
}

/**
 * Resolves `hostname` and rejects it if any resolved address is private/loopback/
 * link-local. Used to block SSRF via the email-ingest URL-metadata fetch.
 */
async function isPublicHostname(hostname: string): Promise<boolean> {
  try {
    const addresses = await lookup(hostname, { all: true, verbatim: true })
    if (addresses.length === 0) return false
    return addresses.every((a) => !isPrivateOrReservedIp(a.address))
  } catch {
    return false
  }
}

async function fetchWithSsrfGuard(pageUrl: string): Promise<Response | null> {
  const parsed = new URL(pageUrl)
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
  if (!(await isPublicHostname(parsed.hostname))) return null

  // Reject redirects outright rather than following them — a redirect target
  // could resolve to a private address, and fetch gives no safe way to
  // re-validate each hop before it connects.
  return fetch(pageUrl, {
    signal: AbortSignal.timeout(PAGE_METADATA_TIMEOUT_MS),
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; drop-note-bot/1.0; +https://dropnote.me)' },
    redirect: 'error',
  })
}

/**
 * Reads up to `maxChars` decoded characters from `res`, cancelling the
 * underlying stream once the limit is reached instead of buffering the
 * full response body first.
 */
async function readBodyWithLimit(res: Response, maxChars: number): Promise<string> {
  if (!res.body) return (await res.text()).slice(0, maxChars)

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let text = ''
  try {
    while (text.length < maxChars) {
      const { done, value } = await reader.read()
      if (done) break
      text += decoder.decode(value, { stream: true })
    }
  } finally {
    await reader.cancel().catch(() => {})
  }
  return text.slice(0, maxChars)
}

/**
 * Fetches lightweight page metadata (og:title/og:description/og:image, falling
 * back to <title> + first paragraph) for a generic (non-YouTube) URL.
 * Returns null on any error, non-HTML response, or when nothing is found —
 * callers should fall back to the raw URL/subject gracefully.
 */
export async function fetchPageMetadata(pageUrl: string): Promise<PageMetadata | null> {
  try {
    const res = await fetchWithSsrfGuard(pageUrl)
    if (!res || !res.ok) return null

    const contentType = res.headers.get('content-type') ?? ''
    if (!contentType.includes('html')) return null

    const html = await readBodyWithLimit(res, PAGE_METADATA_MAX_HTML_LENGTH)

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
