import { isValidEmail } from './auth'

export interface ParsedEmail {
  from: string
  subject: string          // defaults to "(no subject)" if empty
  bodyText: string         // truncated to 50,000 chars
  bodyHtml: string
  attachments: ParsedAttachment[]
}

export interface ParsedAttachment {
  filename: string
  mimeType: string
  data: string             // base64
  size: number             // decoded byte size (base64 length * 0.75 approx)
}

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
])

function isAllowedMimeType(mimeType: string): boolean {
  if (mimeType.startsWith('text/')) return true
  return ALLOWED_MIME_TYPES.has(mimeType)
}

/**
 * Parse the sender address from a raw From header value.
 * Accepts "Display Name <email@example.com>" or "email@example.com".
 * Returns the bare email in lowercase. Returns "" for empty input.
 */
export function parseFromAddress(raw: string): string {
  if (!raw) return ''
  const match = raw.match(/<([^>]+)>/)
  const email = match ? match[1].toLowerCase() : raw.trim().toLowerCase()
  return isValidEmail(email) ? email : ''
}

/**
 * Parse a SendGrid Inbound Parse POST payload into a structured ParsedEmail.
 */
export function parseSendGridPayload(fields: Record<string, string>): ParsedEmail {
  const from = parseFromAddress(fields.from ?? '')
  const rawSubject = fields.subject ?? ''
  const subject = rawSubject.trim() === '' ? '(no subject)' : rawSubject
  const bodyText = (fields.text ?? '').slice(0, 50_000)
  const bodyHtml = fields.html ?? ''

  const attachments: ParsedAttachment[] = []

  const attachmentInfoRaw = fields['attachment-info']
  if (attachmentInfoRaw) {
    let attachmentInfo: Record<string, { filename?: string; type?: string; charset?: string }>
    try {
      attachmentInfo = JSON.parse(attachmentInfoRaw)
    } catch {
      return { from, subject, bodyText, bodyHtml, attachments }
    }

    for (const key of Object.keys(attachmentInfo)) {
      const info = attachmentInfo[key]
      const mimeType = info.type ?? ''
      if (!isAllowedMimeType(mimeType)) continue

      const base64Data = fields[key] ?? ''
      const size = Math.floor(base64Data.length * 0.75)
      const filename = info.filename ?? key

      attachments.push({ filename, mimeType, data: base64Data, size })
    }
  }

  return { from, subject, bodyText, bodyHtml, attachments }
}

/**
 * Returns the total number of items (body email + each attachment).
 */
export function countItems(parsed: ParsedEmail): number {
  return 1 + parsed.attachments.length
}

/**
 * Returns true if the attachment size is within the tier's allowed limit.
 */
export function enforceAttachmentSizeLimit(
  attachment: ParsedAttachment,
  tier: 'free' | 'pro' | 'power',
): boolean {
  const limits: Record<'free' | 'pro' | 'power', number> = {
    free: 10_000_000,
    pro: 25_000_000,
    power: 50_000_000,
  }
  return attachment.size <= limits[tier]
}
