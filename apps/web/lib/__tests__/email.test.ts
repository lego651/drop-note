import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock Resend before importing the module under test
const mockSend = vi.fn()
vi.mock('resend', () => ({
  Resend: function MockResend() {
    return { emails: { send: mockSend } }
  },
}))

import { sendWeeklyDigestEmail, sendWelcomeEmail } from '../email'

const digestArgs = {
  to: 'user@example.com',
  weekItems: [{ id: '1', subject: 'Hello', source_type: 'email', created_at: '2026-01-01T00:00:00Z' }],
  resurfaceItems: [],
}

describe('sendWeeklyDigestEmail', () => {
  beforeEach(() => {
    mockSend.mockReset()
  })

  it('propagates Resend errors — does NOT swallow them', async () => {
    mockSend.mockRejectedValueOnce(new Error('Resend 403'))
    await expect(sendWeeklyDigestEmail(digestArgs)).rejects.toThrow('Resend 403')
  })

  it('resolves cleanly when Resend succeeds', async () => {
    mockSend.mockResolvedValueOnce({ data: { id: 'msg_1' }, error: null })
    await expect(sendWeeklyDigestEmail(digestArgs)).resolves.toBeUndefined()
  })

  it('includes resurface items section when resurfaceItems is non-empty', async () => {
    mockSend.mockResolvedValueOnce({ data: { id: 'msg_3' }, error: null })
    const argsWithResurface = {
      ...digestArgs,
      resurfaceItems: [{ id: '2', subject: 'Old article', source_type: 'email' as const, created_at: '2026-01-01T00:00:00Z' }],
    }
    await expect(sendWeeklyDigestEmail(argsWithResurface)).resolves.toBeUndefined()
    // The html passed to Resend should contain the resurface section heading
    const callArgs = mockSend.mock.calls[0][0]
    expect(callArgs.html).toContain('From the vault')
  })
})

describe('sendWelcomeEmail', () => {
  beforeEach(() => {
    mockSend.mockReset()
  })

  it('propagates Resend errors — does NOT swallow them', async () => {
    mockSend.mockRejectedValueOnce(new Error('Resend 403'))
    await expect(sendWelcomeEmail('user@example.com')).rejects.toThrow('Resend 403')
  })

  it('resolves cleanly when Resend succeeds', async () => {
    mockSend.mockResolvedValueOnce({ data: { id: 'msg_2' }, error: null })
    await expect(sendWelcomeEmail('user@example.com')).resolves.toBeUndefined()
  })
})
