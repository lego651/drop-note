/** @vitest-environment jsdom */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MoodSheet } from '../MoodSheet'
import { isEnvelopeEntryBannerStripped } from '../envelope-entry-storage'

const push = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}))

vi.mock('@/hooks/use-toast', () => ({ toast: vi.fn() }))

beforeEach(() => {
  localStorage.clear()
  push.mockClear()
  vi.restoreAllMocks()
})

function mockFetchSequence(responses: Array<{ ok: boolean; json: unknown }>) {
  let call = 0
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(() => {
      const response = responses[Math.min(call, responses.length - 1)]
      call += 1
      return Promise.resolve({ ok: response.ok, json: async () => response.json })
    }),
  )
}

describe('MoodSheet (DRO-301)', () => {
  it('tapping a starter chip calls /api/envelopes/suggest and moves to the pick review screen', async () => {
    mockFetchSequence([
      {
        ok: true,
        json: {
          items: [
            { id: 'a', subject: 'Costco run', reason: 'mentions Costco' },
            { id: 'b', subject: 'Trail map', reason: 'mentions a trail' },
          ],
          candidateCount: 5,
          insufficientMatches: false,
        },
      },
    ])

    render(<MoodSheet open onOpenChange={vi.fn()} onPickManually={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Feel like exercising' }))

    await waitFor(() => expect(screen.getByRole('heading', { name: /Here/ })).toBeInTheDocument())
    expect(fetch).toHaveBeenCalledWith('/api/envelopes/suggest', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ query: 'Feel like exercising', seedTerms: ['exercise', 'workout', 'gym', 'run', 'fitness'] }),
    }))
    expect(screen.getByText('Costco run')).toBeInTheDocument()
    expect(screen.getByText('mentions Costco')).toBeInTheDocument()
  })

  it('submitting free text via the form (not just Enter) calls suggest with the typed query', async () => {
    mockFetchSequence([
      { ok: true, json: { items: [{ id: 'a', subject: 'Item A', reason: 'why' }, { id: 'b', subject: 'Item B', reason: 'why' }], candidateCount: 2, insufficientMatches: false } },
    ])

    render(<MoodSheet open onOpenChange={vi.fn()} onPickManually={vi.fn()} />)

    const input = screen.getByLabelText('Describe what you feel like')
    fireEvent.change(input, { target: { value: 'pack for a trip' } })
    expect(input).toHaveAttribute('enterKeyHint', 'go')
    fireEvent.submit(input.closest('form')!)

    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/envelopes/suggest', expect.objectContaining({
      body: JSON.stringify({ query: 'pack for a trip' }),
    })))
  })

  it('shows the insufficient-matches fallback and routes it into the manual flow pre-filled with the returned items', async () => {
    mockFetchSequence([
      { ok: true, json: { items: [{ id: 'a', subject: 'Only one', reason: 'why' }], candidateCount: 1, insufficientMatches: true } },
    ])
    const onPickManually = vi.fn()

    render(<MoodSheet open onOpenChange={vi.fn()} onPickManually={onPickManually} />)
    fireEvent.click(screen.getByRole('button', { name: 'Do some work' }))

    await waitFor(() => expect(screen.getByText('Not enough yet. Pick some yourself?')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: 'Pick them myself' }))
    expect(onPickManually).toHaveBeenCalledWith(['a'])
  })

  it('"Make my plan" calls /api/envelopes/generate with the reviewed item ids and the original query as text', async () => {
    mockFetchSequence([
      { ok: true, json: { items: [{ id: 'a', subject: 'A', reason: 'why' }, { id: 'b', subject: 'B', reason: 'why' }], candidateCount: 2, insufficientMatches: false } },
      { ok: true, json: { id: 'envelope-1' } },
    ])

    render(<MoodSheet open onOpenChange={vi.fn()} onPickManually={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Pick up some reading' }))
    await waitFor(() => screen.getByRole('button', { name: /Make my plan/ }))

    expect(isEnvelopeEntryBannerStripped()).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: /Make my plan/ }))

    await waitFor(() => expect(push).toHaveBeenCalledWith('/envelopes/envelope-1'))
    expect(fetch).toHaveBeenLastCalledWith('/api/envelopes/generate', expect.objectContaining({
      body: JSON.stringify({ itemIds: ['a', 'b'], text: 'Pick up some reading', purposeHint: null }),
    }))
    expect(isEnvelopeEntryBannerStripped()).toBe(true)
  })

  it('removing an item down below the minimum shows the insufficient-matches fallback', async () => {
    mockFetchSequence([
      { ok: true, json: { items: [{ id: 'a', subject: 'A', reason: 'why' }, { id: 'b', subject: 'B', reason: 'why' }], candidateCount: 2, insufficientMatches: false } },
    ])

    render(<MoodSheet open onOpenChange={vi.fn()} onPickManually={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Feel like exercising' }))
    await waitFor(() => screen.getByText('A'))

    fireEvent.click(screen.getByRole('button', { name: 'Remove A' }))

    expect(screen.getByText('Not enough yet. Pick some yourself?')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Make my plan/ })).toBeDisabled()
  })

  it('"Pick them myself" on the mood step closes the sheet and opens the manual flow with no pre-fill', () => {
    const onPickManually = vi.fn()
    const onOpenChange = vi.fn()
    render(<MoodSheet open onOpenChange={onOpenChange} onPickManually={onPickManually} />)

    fireEvent.click(screen.getByRole('button', { name: 'Pick them myself' }))

    expect(onPickManually).toHaveBeenCalledWith()
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
