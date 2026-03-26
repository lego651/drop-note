import { describe, it, expect } from 'vitest'
import { QUEUE_NAME, type EmailJobPayload } from '../queue'

describe('QUEUE_NAME', () => {
  it('equals "email-pipeline"', () => {
    expect(QUEUE_NAME).toBe('email-pipeline')
  })
})

describe('EmailJobPayload', () => {
  it('accepts a valid payload object (TypeScript satisfies check)', () => {
    const payload = {
      userId: '123e4567-e89b-12d3-a456-426614174000',
      userTier: 'free' as const,
      from: 'user@example.com',
      subject: 'Test subject',
      text: 'Email body text',
      html: '<p>Email body</p>',
      attachmentInfo: JSON.stringify({}),
      attachmentKeys: [],
      attachmentData: {},
      bodyItemId: '456e7890-e89b-12d3-a456-426614174000',
      receivedAt: new Date().toISOString(),
    } satisfies EmailJobPayload

    expect(payload.userId).toBe('123e4567-e89b-12d3-a456-426614174000')
    expect(payload.userTier).toBe('free')
    expect(payload.attachmentKeys).toEqual([])
    expect(payload.attachmentData).toEqual({})
  })

  it('accepts payload with pro tier and attachment data', () => {
    const payload = {
      userId: 'user-id-1',
      userTier: 'pro' as const,
      from: 'pro@example.com',
      subject: 'Pro email',
      text: 'body',
      html: '',
      attachmentInfo: JSON.stringify({ attachment1: { filename: 'doc.pdf', type: 'application/pdf' } }),
      attachmentKeys: ['attachment1'],
      attachmentData: { attachment1: 'base64data==' },
      bodyItemId: 'item-id-1',
      receivedAt: '2026-03-26T00:00:00.000Z',
    } satisfies EmailJobPayload

    expect(payload.userTier).toBe('pro')
    expect(payload.attachmentKeys).toEqual(['attachment1'])
    expect(payload.attachmentData['attachment1']).toBe('base64data==')
  })
})
