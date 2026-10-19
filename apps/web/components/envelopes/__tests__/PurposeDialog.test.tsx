/** @vitest-environment jsdom */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { PurposeDialog } from '../PurposeDialog'
import { isEnvelopeEntryBannerStripped } from '../envelope-entry-storage'

const push = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}))

vi.mock('@/hooks/use-toast', () => ({
  toast: vi.fn(),
}))

beforeEach(() => {
  localStorage.clear()
  push.mockClear()
  vi.restoreAllMocks()
})

describe('PurposeDialog — first plan permanently retires the entry banner (DRO-227)', () => {
  it('marks the envelope entry banner stripped once /api/envelopes/generate succeeds', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 'envelope-1' }) }),
    )

    render(<PurposeDialog open onOpenChange={vi.fn()} itemIds={['a', 'b']} />)

    expect(isEnvelopeEntryBannerStripped()).toBe(false)

    fireEvent.change(screen.getByPlaceholderText('Describe what you want to make from these…'), {
      target: { value: 'Pack for the trip' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Make plan/ }))

    await waitFor(() => expect(push).toHaveBeenCalledWith('/envelopes/envelope-1'))
    expect(isEnvelopeEntryBannerStripped()).toBe(true)
  })

  it('does not strip the banner when the request fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: 'nope' }) }))

    render(<PurposeDialog open onOpenChange={vi.fn()} itemIds={['a', 'b']} />)

    fireEvent.change(screen.getByPlaceholderText('Describe what you want to make from these…'), {
      target: { value: 'Pack for the trip' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Make plan/ }))

    await waitFor(() => expect(screen.getByRole('button', { name: /Make plan/ })).toBeEnabled())
    expect(push).not.toHaveBeenCalled()
    expect(isEnvelopeEntryBannerStripped()).toBe(false)
  })
})
