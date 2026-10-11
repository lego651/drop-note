/**
 * Escapes HTML special characters to prevent injection in email templates.
 * Use when interpolating user-controlled strings into HTML.
 */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const HTML_ENTITIES: Record<string, string> = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'",
  '&#39;': "'",
}

function codePointToChar(codePoint: number): string {
  if (!Number.isFinite(codePoint) || codePoint < 0 || codePoint > 0x10ffff) return ''
  try {
    return String.fromCodePoint(codePoint)
  } catch {
    return ''
  }
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&(?:nbsp|amp|lt|gt|quot|apos|#39);/g, (entity) => HTML_ENTITIES[entity] ?? entity)
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => codePointToChar(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, code: string) => codePointToChar(Number(code)))
}

/** Hard cap on input processed by htmlToText; defense in depth against pathological payloads. */
const MAX_HTML_INPUT_LENGTH = 200_000

/**
 * Converts an HTML email body to a plain-text rendering: strips tags, preserves
 * link hrefs as visible text (so a bare `<a href>` with no plain-text equivalent
 * is still detectable by URL/YouTube parsing), decodes entities, and collapses
 * whitespace. Used as a fallback when an email's text/plain part is empty or
 * much shorter than its HTML part (e.g. HTML-only newsletters).
 */
export function htmlToText(html: string): string {
  if (!html.trim()) return ''

  const bounded = html.length > MAX_HTML_INPUT_LENGTH ? html.slice(0, MAX_HTML_INPUT_LENGTH) : html

  // `[^<>]` (not just `[^>]`) keeps every tag-matching class from spanning past the
  // next `<`, so an unclosed tag only costs bounded backtracking instead of scanning
  // (and re-scanning, per later match attempt) to the end of the input.
  const withoutHiddenBlocks = bounded.replace(/<(script|style)\b[^<>]*>[\s\S]*?<\/\1\s*>/gi, ' ')

  const withLinksInlined = withoutHiddenBlocks.replace(
    /<a\b([^<>]*)>([\s\S]{0,2000}?)<\/a>/gi,
    (_, attrs: string, label: string) => {
      const hrefMatch = /\bhref\s*=\s*["']([^"']*)["']/i.exec(attrs)
      const href = hrefMatch?.[1] ?? ''
      const cleanLabel = label.replace(/<[^<>]+>/g, '').trim()
      if (!href) return cleanLabel
      return cleanLabel && cleanLabel !== href ? `${cleanLabel} (${href})` : href
    },
  )

  const withLineBreaks = withLinksInlined
    .replace(/<\/?(?:p|div|li|tr|h[1-6])\b[^<>]*>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')

  const withoutTags = withLineBreaks.replace(/<[^<>]+>/g, ' ')
  const decoded = decodeHtmlEntities(withoutTags)

  return decoded
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
    .trim()
}
