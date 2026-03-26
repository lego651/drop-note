import { describe, it, expect } from 'vitest'
import {
  parseFromAddress,
  parseSendGridPayload,
  countItems,
  enforceAttachmentSizeLimit,
  type ParsedAttachment,
} from '../email'

describe('parseFromAddress', () => {
  it('extracts email from "Display Name <email>" format and lowercases it', () => {
    expect(parseFromAddress('"Alice Smith" <alice@Example.COM>')).toBe('alice@example.com')
  })

  it('handles plain email address and lowercases it', () => {
    expect(parseFromAddress('bob@example.com')).toBe('bob@example.com')
  })

  it('returns empty string for empty input without throwing', () => {
    expect(parseFromAddress('')).toBe('')
  })

  it('trims whitespace from plain email addresses', () => {
    expect(parseFromAddress('  carol@example.com  ')).toBe('carol@example.com')
  })

  it('lowercases the extracted angle-bracket email', () => {
    expect(parseFromAddress('<Dave@Example.COM>')).toBe('dave@example.com')
  })
})

describe('parseSendGridPayload', () => {
  it('returns empty attachments when attachment-info is missing', () => {
    const result = parseSendGridPayload({
      from: 'user@example.com',
      subject: 'Hello',
      text: 'body',
      html: '<p>body</p>',
    })
    expect(result.attachments.length).toBe(0)
  })

  it('filters out disallowed mime types (keeps PDF, drops ZIP)', () => {
    const attachmentInfo = JSON.stringify({
      attachment1: { filename: 'doc.pdf', type: 'application/pdf' },
      attachment2: { filename: 'archive.zip', type: 'application/zip' },
    })
    const result = parseSendGridPayload({
      from: 'user@example.com',
      subject: 'Files',
      text: '',
      html: '',
      'attachment-info': attachmentInfo,
      attachment1: 'base64pdfdata',
      attachment2: 'base64zipdata',
    })
    expect(result.attachments.length).toBe(1)
    expect(result.attachments[0].mimeType).toBe('application/pdf')
  })

  it('truncates bodyText to 50,000 characters', () => {
    const longText = 'a'.repeat(60_000)
    const result = parseSendGridPayload({
      from: 'user@example.com',
      subject: 'Long email',
      text: longText,
      html: '',
    })
    expect(result.bodyText.length).toBe(50_000)
  })

  it('defaults subject to "(no subject)" when subject is empty', () => {
    const result = parseSendGridPayload({
      from: 'user@example.com',
      subject: '',
      text: 'body',
      html: '',
    })
    expect(result.subject).toBe('(no subject)')
  })

  it('defaults subject to "(no subject)" when subject is whitespace only', () => {
    const result = parseSendGridPayload({
      from: 'user@example.com',
      subject: '   ',
      text: 'body',
      html: '',
    })
    expect(result.subject).toBe('(no subject)')
  })

  it('returns empty attachments when attachment-info is invalid JSON', () => {
    const result = parseSendGridPayload({
      from: 'user@example.com',
      subject: 'Hi',
      text: '',
      html: '',
      'attachment-info': 'not valid json',
    })
    expect(result.attachments.length).toBe(0)
  })

  it('allows text/* mime types', () => {
    const attachmentInfo = JSON.stringify({
      attachment1: { filename: 'notes.txt', type: 'text/plain' },
    })
    const result = parseSendGridPayload({
      from: 'user@example.com',
      subject: 'Text file',
      text: '',
      html: '',
      'attachment-info': attachmentInfo,
      attachment1: 'dGV4dA==',
    })
    expect(result.attachments.length).toBe(1)
    expect(result.attachments[0].filename).toBe('notes.txt')
  })

  it('computes size as floor(base64Length * 0.75)', () => {
    const base64Data = 'A'.repeat(100)
    const attachmentInfo = JSON.stringify({
      attachment1: { filename: 'img.png', type: 'image/png' },
    })
    const result = parseSendGridPayload({
      from: 'user@example.com',
      subject: 'Image',
      text: '',
      html: '',
      'attachment-info': attachmentInfo,
      attachment1: base64Data,
    })
    expect(result.attachments[0].size).toBe(Math.floor(100 * 0.75))
  })
})

describe('countItems', () => {
  it('returns 1 when there are no attachments', () => {
    const parsed = {
      from: 'user@example.com',
      subject: 'Hi',
      bodyText: 'body',
      bodyHtml: '',
      attachments: [],
    }
    expect(countItems(parsed)).toBe(1)
  })

  it('returns 4 when there are 3 attachments', () => {
    const att: ParsedAttachment = { filename: 'f.pdf', mimeType: 'application/pdf', data: '', size: 0 }
    const parsed = {
      from: 'user@example.com',
      subject: 'Hi',
      bodyText: 'body',
      bodyHtml: '',
      attachments: [att, att, att],
    }
    expect(countItems(parsed)).toBe(4)
  })
})

describe('enforceAttachmentSizeLimit', () => {
  const makeAttachment = (size: number): ParsedAttachment => ({
    filename: 'test.pdf',
    mimeType: 'application/pdf',
    data: '',
    size,
  })

  it('returns true for 5MB on free tier (under 10MB limit)', () => {
    expect(enforceAttachmentSizeLimit(makeAttachment(5_000_000), 'free')).toBe(true)
  })

  it('returns false for 11MB on free tier (over 10MB limit)', () => {
    expect(enforceAttachmentSizeLimit(makeAttachment(11_000_000), 'free')).toBe(false)
  })

  it('returns false for 26MB on pro tier (over 25MB limit)', () => {
    expect(enforceAttachmentSizeLimit(makeAttachment(26_000_000), 'pro')).toBe(false)
  })

  it('returns true for 26MB on power tier (under 50MB limit)', () => {
    expect(enforceAttachmentSizeLimit(makeAttachment(26_000_000), 'power')).toBe(true)
  })

  it('returns true exactly at the free tier limit (10_000_000)', () => {
    expect(enforceAttachmentSizeLimit(makeAttachment(10_000_000), 'free')).toBe(true)
  })

  it('returns false one byte over the free tier limit', () => {
    expect(enforceAttachmentSizeLimit(makeAttachment(10_000_001), 'free')).toBe(false)
  })
})
