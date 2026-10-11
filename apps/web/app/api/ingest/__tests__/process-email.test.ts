/**
 * Ported from apps/worker/src/__tests__/email-processor.test.ts (D11, 2026-05-26).
 *
 * Tests the synchronous processEmail function — AI error handling paths that
 * previously lived in the BullMQ worker. The retry-count concept (BullMQ
 * attemptsMade) is gone; retryable errors now result in status='pending' and
 * the user can re-send to reprocess.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../../lib/ingest/db', () => ({
  setItemProcessing: vi.fn().mockResolvedValue(undefined),
  setItemDone: vi.fn().mockResolvedValue(undefined),
  setItemFailed: vi.fn().mockResolvedValue(undefined),
  setItemPending: vi.fn().mockResolvedValue(undefined),
  upsertTags: vi.fn().mockResolvedValue(undefined),
  createAttachmentItem: vi.fn().mockResolvedValue('attach-1'),
}))

vi.mock('../../../../lib/ingest/ai', () => ({
  summarizeEmailBody: vi.fn(),
  describeImage: vi.fn(),
}))

vi.mock('../../../../lib/ingest/storage', () => ({
  uploadAttachment: vi.fn().mockResolvedValue({ storagePath: 'test/path', error: null }),
}))

vi.mock('../../../../lib/ingest/pdf', () => ({
  extractPdfText: vi.fn().mockResolvedValue({ text: '', error: null }),
}))

vi.mock('@drop-note/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@drop-note/shared')>()
  return {
    ...actual,
    parseSendGridPayload: vi.fn().mockReturnValue({
      subject: 'Test subject',
      bodyText: 'Hello world',
      attachments: [],
    }),
    fetchYouTubeTitle: vi.fn().mockResolvedValue(null),
  }
})

import { processEmail, resolveEffectiveBodyText } from '../../../../lib/ingest/process-email'
import { setItemPending, setItemFailed, setItemDone } from '../../../../lib/ingest/db'
import { summarizeEmailBody } from '../../../../lib/ingest/ai'
import { parseSendGridPayload } from '@drop-note/shared'

function makeParams() {
  return {
    userId: 'user-1',
    userTier: 'free' as const,
    from: 'test@example.com',
    subject: 'Test',
    text: 'Hello',
    html: '',
    attachmentInfo: '{}',
    attachmentKeys: [],
    attachmentData: {},
    bodyItemId: 'item-1',
  }
}

describe('processEmail — AI error handling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('on retryable AI error: sets status pending, returns pending', async () => {
    vi.mocked(summarizeEmailBody).mockResolvedValue({
      summary: '',
      tags: [],
      error: 'OpenAI HTTP 500: Internal Server Error',
      retryable: true,
    })

    const result = await processEmail(makeParams())

    expect(result.status).toBe('pending')
    expect(setItemPending).toHaveBeenCalledWith(
      'item-1',
      'AI summary temporarily unavailable. Your content has been saved.',
    )
    expect(setItemFailed).not.toHaveBeenCalled()
  })

  it('on non-retryable AI error: sets status failed, returns failed', async () => {
    vi.mocked(summarizeEmailBody).mockResolvedValue({
      summary: '',
      tags: [],
      error: 'Invalid AI response format',
      retryable: false,
    })

    const result = await processEmail(makeParams())

    expect(result.status).toBe('failed')
    expect(setItemFailed).toHaveBeenCalledWith('item-1', 'Invalid AI response format')
    expect(setItemPending).not.toHaveBeenCalled()
  })

  it('on successful AI response: sets status done with summary and tags', async () => {
    vi.mocked(summarizeEmailBody).mockResolvedValue({
      summary: 'A test summary',
      tags: ['tag1', 'tag2'],
      error: null,
      retryable: false,
    })

    const result = await processEmail(makeParams())

    expect(result.status).toBe('done')
    expect(setItemDone).toHaveBeenCalledWith(
      'item-1',
      expect.objectContaining({ aiSummary: 'A test summary' }),
    )
    expect(setItemFailed).not.toHaveBeenCalled()
    expect(setItemPending).not.toHaveBeenCalled()
  })

  it('returns aiMs field as a non-negative number', async () => {
    vi.mocked(summarizeEmailBody).mockResolvedValue({
      summary: 'ok',
      tags: [],
      error: null,
      retryable: false,
    })

    const result = await processEmail(makeParams())

    expect(typeof result.aiMs).toBe('number')
    expect(result.aiMs).toBeGreaterThanOrEqual(0)
  })
})

describe('resolveEffectiveBodyText', () => {
  it('returns bodyText unchanged when bodyHtml is empty', () => {
    expect(resolveEffectiveBodyText('Hello world', '')).toBe('Hello world')
  })

  it('falls back to a plain-text rendering of bodyHtml when bodyText is empty', () => {
    const html = '<p>Check out <a href="https://example.com/article">this article</a></p>'
    expect(resolveEffectiveBodyText('', html)).toBe('Check out this article (https://example.com/article)')
  })

  it('falls back to bodyHtml when bodyText is much shorter (HTML-dominant email)', () => {
    const html = `<html><body><table><tr><td>${'x'.repeat(500)}</td></tr></table>` +
      '<p>Check out <a href="https://example.com/article">this article</a></p></body></html>'
    const result = resolveEffectiveBodyText('Hi', html)
    expect(result).toContain('https://example.com/article')
  })

  it('keeps bodyText when it is a substantial fraction of bodyHtml length', () => {
    const bodyText = 'A full plain-text paragraph with real content.'
    const html = `<p>${bodyText}</p>`
    expect(resolveEffectiveBodyText(bodyText, html)).toBe(bodyText)
  })
})

describe('processEmail — HTML-only newsletter fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('detects a link that only exists inside bodyHtml when bodyText is empty', async () => {
    vi.mocked(parseSendGridPayload).mockReturnValue({
      from: 'newsletter@example.com',
      subject: 'Weekly digest',
      bodyText: '',
      bodyHtml: '<html><body><p>Read <a href="https://example.com/article">this piece</a></p></body></html>',
      attachments: [],
    })
    vi.mocked(summarizeEmailBody).mockResolvedValue({
      summary: 'A summary',
      tags: [],
      error: null,
      retryable: false,
    })

    const result = await processEmail(makeParams())

    expect(result.status).toBe('done')
    expect(summarizeEmailBody).toHaveBeenCalledWith(
      'Weekly digest',
      expect.stringContaining('https://example.com/article'),
    )
    expect(setItemDone).toHaveBeenCalledWith(
      'item-1',
      expect.objectContaining({ sourceType: 'url', sourceUrl: 'https://example.com/article' }),
    )
  })
})
