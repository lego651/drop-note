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

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&(?:nbsp|amp|lt|gt|quot|apos|#39);/g, (entity) => HTML_ENTITIES[entity] ?? entity)
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
}

/**
 * Converts an HTML email body to a plain-text rendering: strips tags, preserves
 * link hrefs as visible text (so a bare `<a href>` with no plain-text equivalent
 * is still detectable by URL/YouTube parsing), decodes entities, and collapses
 * whitespace. Used as a fallback when an email's text/plain part is empty or
 * much shorter than its HTML part (e.g. HTML-only newsletters).
 */
export function htmlToText(html: string): string {
  if (!html.trim()) return ''

  const withoutHiddenBlocks = html.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')

  const withLinksInlined = withoutHiddenBlocks.replace(
    /<a\b[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi,
    (_, href: string, label: string) => {
      const cleanLabel = label.replace(/<[^>]+>/g, '').trim()
      return cleanLabel && cleanLabel !== href ? `${cleanLabel} (${href})` : href
    },
  )

  const withLineBreaks = withLinksInlined
    .replace(/<\/?(?:p|div|li|tr|h[1-6])[^>]*>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')

  const withoutTags = withLineBreaks.replace(/<[^>]+>/g, ' ')
  const decoded = decodeHtmlEntities(withoutTags)

  return decoded
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
    .trim()
}
