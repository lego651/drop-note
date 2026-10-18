/** @vitest-environment jsdom */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { GeneratingPoller } from '../GeneratingPoller'

const mockRefresh = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}))

const mockSingle = vi.fn()
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          single: mockSingle,
        }),
      }),
    }),
  }),
}))

describe('GeneratingPoller', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockRefresh.mockClear()
    mockSingle.mockReset()
    mockSingle.mockResolvedValue({ data: { status: 'generating' } })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows a spinner while the envelope is generating', () => {
    render(<GeneratingPoller envelopeId="env-1" />)
    expect(screen.getByText(/making your plan/i)).toBeInTheDocument()
  })

  it('refreshes once the row leaves "generating"', async () => {
    mockSingle.mockResolvedValue({ data: { status: 'done' } })
    render(<GeneratingPoller envelopeId="env-1" />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000)
    })

    expect(mockRefresh).toHaveBeenCalled()
  })

  it('gives up with a terminal message instead of polling forever if the row never leaves "generating" (DRO-197)', async () => {
    render(<GeneratingPoller envelopeId="env-1" />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(80_000)
    })

    expect(screen.getByText(/taking longer than expected/i)).toBeInTheDocument()
    expect(mockRefresh).not.toHaveBeenCalled()
  })
})
