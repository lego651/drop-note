import { describe, it, expect, vi, beforeEach } from 'vitest'

const processText = vi.fn()
const describeImageMock = vi.fn()

vi.mock('@drop-note/shared', () => ({
  createAIProvider: () => ({
    processText,
    describeImage: describeImageMock,
  }),
}))

import { summarizeEmailBody, describeImage, MAX_TAGS_PER_ITEM } from '../ai'

describe('summarizeEmailBody', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('passes existingTags through to the AI provider', async () => {
    processText.mockResolvedValue({ summary: 's', tags: [] })
    await summarizeEmailBody('Subject', 'Body', ['travel', 'recipe'])
    expect(processText).toHaveBeenCalledWith(expect.stringContaining('Body'), ['travel', 'recipe'])
  })

  it('defaults existingTags to an empty array when omitted', async () => {
    processText.mockResolvedValue({ summary: 's', tags: [] })
    await summarizeEmailBody('Subject', 'Body')
    expect(processText).toHaveBeenCalledWith(expect.any(String), [])
  })

  it('caps tags at MAX_TAGS_PER_ITEM even when the model returns more', async () => {
    expect(MAX_TAGS_PER_ITEM).toBe(3)
    processText.mockResolvedValue({ summary: 's', tags: ['a', 'b', 'c', 'd', 'e'] })
    const result = await summarizeEmailBody('Subject', 'Body')
    expect(result.tags).toEqual(['a', 'b', 'c'])
  })

  it('dedupes case-insensitively before capping', async () => {
    processText.mockResolvedValue({ summary: 's', tags: ['Travel', 'travel', 'TRAVEL', 'food'] })
    const result = await summarizeEmailBody('Subject', 'Body')
    expect(result.tags).toEqual(['travel', 'food'])
  })

  it('trims whitespace and drops empty tag strings', async () => {
    processText.mockResolvedValue({ summary: 's', tags: ['  travel  ', '', '   '] })
    const result = await summarizeEmailBody('Subject', 'Body')
    expect(result.tags).toEqual(['travel'])
  })

  it('returns a non-retryable error on invalid JSON', async () => {
    processText.mockRejectedValue(new SyntaxError('bad json'))
    const result = await summarizeEmailBody('Subject', 'Body')
    expect(result.error).toBe('Invalid AI response format')
    expect(result.retryable).toBe(false)
    expect(result.tags).toEqual([])
  })

  it('surfaces a retryable error from the provider', async () => {
    const err = new Error('OpenAI HTTP 500') as Error & { retryable: boolean }
    err.retryable = true
    processText.mockRejectedValue(err)
    const result = await summarizeEmailBody('Subject', 'Body')
    expect(result.retryable).toBe(true)
    expect(result.error).toBe('OpenAI HTTP 500')
  })
})

describe('describeImage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns the provider description', async () => {
    describeImageMock.mockResolvedValue('A cat')
    const result = await describeImage('base64data', 'image/png')
    expect(result).toEqual({ description: 'A cat', error: null })
  })

  it('rejects images over the base64 size limit without calling the provider', async () => {
    const huge = 'a'.repeat(5 * 1024 * 1024 + 1)
    const result = await describeImage(huge, 'image/png')
    expect(result.error).toBe('Image too large for Vision API')
    expect(describeImageMock).not.toHaveBeenCalled()
  })
})
