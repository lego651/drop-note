import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Job } from 'bullmq'

// Mock all external dependencies before importing the processor
vi.mock('../lib/db', () => ({
  setItemProcessing: vi.fn().mockResolvedValue(undefined),
  setItemDone: vi.fn().mockResolvedValue(undefined),
  setItemFailed: vi.fn().mockResolvedValue(undefined),
  setItemPending: vi.fn().mockResolvedValue(undefined),
  upsertTags: vi.fn().mockResolvedValue(undefined),
  createAttachmentItem: vi.fn().mockResolvedValue('attach-1'),
}))

vi.mock('../lib/openai', () => ({
  summarizeEmailBody: vi.fn(),
  describeImage: vi.fn(),
}))

vi.mock('../lib/storage', () => ({
  uploadAttachment: vi.fn().mockResolvedValue({ storagePath: 'test/path' }),
}))

vi.mock('../lib/pdf', () => ({
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

import { processEmail } from '../processors/email'
import { setItemPending, setItemFailed, setItemDone } from '../lib/db'
import { summarizeEmailBody } from '../lib/openai'

function makeJob(attemptsMade = 0, attempts = 3): Job {
  return {
    id: 'test-job-1',
    attemptsMade,
    opts: { attempts },
    data: {
      userId: 'user-1',
      userTier: 'free',
      from: 'test@example.com',
      subject: 'Test',
      text: 'Hello',
      html: '',
      attachmentInfo: '{}',
      attachmentKeys: [],
      attachmentData: {},
      bodyItemId: 'item-1',
    },
  } as unknown as Job
}

describe('processEmail — AI error handling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('on retryable AI error (500) with retries remaining: sets status pending, rethrows', async () => {
    vi.mocked(summarizeEmailBody).mockResolvedValue({
      summary: '',
      tags: [],
      error: 'OpenAI HTTP 500: Internal Server Error',
      retryable: true,
    })

    const job = makeJob(0, 3) // first attempt, 2 retries remaining
    await expect(processEmail(job)).rejects.toThrow()

    expect(setItemPending).toHaveBeenCalledWith(
      'item-1',
      'AI summary temporarily unavailable. Your content has been saved.',
    )
    expect(setItemFailed).not.toHaveBeenCalled()
  })

  it('on retryable AI error on last attempt: sets status failed, rethrows', async () => {
    vi.mocked(summarizeEmailBody).mockResolvedValue({
      summary: '',
      tags: [],
      error: 'OpenAI HTTP 500: Internal Server Error',
      retryable: true,
    })

    const job = makeJob(2, 3) // 3rd attempt = last (attemptsMade=2, +1 = 3 >= 3)
    await expect(processEmail(job)).rejects.toThrow()

    expect(setItemFailed).toHaveBeenCalledWith('item-1', 'OpenAI HTTP 500: Internal Server Error')
    expect(setItemPending).not.toHaveBeenCalled()
  })

  it('on non-retryable AI error (400 / parse failure): sets status failed, does not rethrow', async () => {
    vi.mocked(summarizeEmailBody).mockResolvedValue({
      summary: '',
      tags: [],
      error: 'Invalid AI response format',
      retryable: false,
    })

    const job = makeJob(0, 3)
    // Should NOT throw — non-retryable, job completes without re-queuing
    const result = await processEmail(job)
    expect(result.status).toBe('done')

    expect(setItemFailed).toHaveBeenCalledWith('item-1', 'Invalid AI response format')
    expect(setItemPending).not.toHaveBeenCalled()
    expect(setItemDone).not.toHaveBeenCalled()
  })

  it('on successful AI response: sets status done with summary and tags', async () => {
    vi.mocked(summarizeEmailBody).mockResolvedValue({
      summary: 'A test summary',
      tags: ['tag1', 'tag2'],
      error: null,
      retryable: false,
    })

    const job = makeJob(0, 3)
    const result = await processEmail(job)
    expect(result.status).toBe('done')

    expect(setItemDone).toHaveBeenCalledWith(
      'item-1',
      expect.objectContaining({ aiSummary: 'A test summary' }),
    )
    expect(setItemFailed).not.toHaveBeenCalled()
    expect(setItemPending).not.toHaveBeenCalled()
  })
})
