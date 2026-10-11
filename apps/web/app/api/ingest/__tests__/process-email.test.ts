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

vi.mock('@drop-note/shared/page-metadata', () => ({
  fetchPageMetadata: vi.fn().mockResolvedValue(null),
}))

import { processEmail } from '../../../../lib/ingest/process-email'
import { setItemPending, setItemFailed, setItemDone } from '../../../../lib/ingest/db'
import { summarizeEmailBody } from '../../../../lib/ingest/ai'
import { parseSendGridPayload } from '@drop-note/shared'
import { fetchPageMetadata } from '@drop-note/shared/page-metadata'

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

describe('processEmail — generic URL metadata fetch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(parseSendGridPayload).mockReturnValue({
      from: 'test@example.com',
      subject: 'Check this out',
      bodyText: 'https://www.reddit.com/r/programming/comments/1a2b3c4/some_thread/',
      bodyHtml: '',
      attachments: [],
    })
    vi.mocked(summarizeEmailBody).mockResolvedValue({
      summary: 'A reddit thread summary',
      tags: [],
      error: null,
      retryable: false,
    })
  })

  it('rewrites the summarize subject/body and stores a thumbnail when metadata fetch succeeds', async () => {
    vi.mocked(fetchPageMetadata).mockResolvedValue({
      title: 'Some programming thread',
      description: 'A lively discussion about programming.',
      imageUrl: 'https://reddit.com/thumb.jpg',
    })

    const result = await processEmail(makeParams())

    expect(fetchPageMetadata).toHaveBeenCalledWith(
      'https://www.reddit.com/r/programming/comments/1a2b3c4/some_thread/',
    )
    expect(summarizeEmailBody).toHaveBeenCalledWith(
      'Some programming thread',
      'Some programming thread\n\nA lively discussion about programming.',
    )
    expect(result.status).toBe('done')
    expect(setItemDone).toHaveBeenCalledWith(
      'item-1',
      expect.objectContaining({
        sourceType: 'url',
        sourceUrl: 'https://www.reddit.com/r/programming/comments/1a2b3c4/some_thread/',
        thumbnailUrl: 'https://reddit.com/thumb.jpg',
      }),
    )
  })

  it('fails soft to the raw URL text when the metadata fetch fails, without regressing to failed', async () => {
    vi.mocked(fetchPageMetadata).mockResolvedValue(null)

    const result = await processEmail(makeParams())

    expect(summarizeEmailBody).toHaveBeenCalledWith(
      'Check this out',
      'https://www.reddit.com/r/programming/comments/1a2b3c4/some_thread/',
    )
    expect(result.status).toBe('done')
    expect(setItemFailed).not.toHaveBeenCalled()
    expect(setItemDone).toHaveBeenCalledWith(
      'item-1',
      expect.objectContaining({
        sourceType: 'url',
        sourceUrl: 'https://www.reddit.com/r/programming/comments/1a2b3c4/some_thread/',
        thumbnailUrl: null,
      }),
    )
  })
})
