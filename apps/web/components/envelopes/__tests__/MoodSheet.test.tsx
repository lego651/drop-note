/** @vitest-environment jsdom */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MoodSheet } from '../MoodSheet'
import { isEnvelopeEntryBannerStripped } from '../envelope-entry-storage'
import { ENVELOPE_STARTER_IDEAS } from '@drop-note/shared'

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

const STARTER_IDEAS_RESPONSE = { ok: true, json: { ideas: ENVELOPE_STARTER_IDEAS, source: 'starter' } }

/**
 * `responses` mocks every fetch call AFTER the Mood Sheet's own GET
 * /api/envelopes/ideas, which every render triggers on mount (DRO-309) — so
 * it's always call #0 here. Defaults to the starter fallback so tests that
 * don't care about the idea pool keep working unchanged; pass `ideasResponse`
 * to test pool-sourced behavior instead.
 */
function mockFetchSequence(
  responses: Array<{ ok: boolean; json: unknown }>,
  ideasResponse: { ok: boolean; json: unknown } = STARTER_IDEAS_RESPONSE,
) {
  const all = [ideasResponse, ...responses]
  let call = 0
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(() => {
      const response = all[Math.min(call, all.length - 1)]
      call += 1
      return Promise.resolve({ ok: response.ok, json: async () => response.json })
    }),
  )
}

function moodSuggestionsGroup() {
  return screen.getByRole('group', { name: 'Mood suggestions' })
}

describe('MoodSheet (DRO-301)', () => {
  it('tapping a starter chip calls /api/envelopes/suggest and moves to the pick review screen', async () => {
    mockFetchSequence([
      {
        ok: true,
        json: {
          items: [
            { itemId: 'a', subject: 'Costco run', reason: 'mentions Costco' },
            { itemId: 'b', subject: 'Trail map', reason: 'mentions a trail' },
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
      body: JSON.stringify({
        query: 'Feel like exercising',
        seedTerms: ENVELOPE_STARTER_IDEAS.find((idea) => idea.label === 'Feel like exercising')!.seedTerms,
      }),
    }))
    expect(screen.getByText('Costco run')).toBeInTheDocument()
    expect(screen.getByText('mentions Costco')).toBeInTheDocument()
  })

  it('submitting free text via the form (not just Enter) calls suggest with the typed query', async () => {
    mockFetchSequence([
      { ok: true, json: { items: [{ itemId: 'a', subject: 'Item A', reason: 'why' }, { itemId: 'b', subject: 'Item B', reason: 'why' }], candidateCount: 2, insufficientMatches: false } },
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
      { ok: true, json: { items: [{ itemId: 'a', subject: 'Only one', reason: 'why' }], candidateCount: 1, insufficientMatches: true } },
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
      { ok: true, json: { items: [{ itemId: 'a', subject: 'A', reason: 'why' }, { itemId: 'b', subject: 'B', reason: 'why' }], candidateCount: 2, insufficientMatches: false } },
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
      { ok: true, json: { items: [{ itemId: 'a', subject: 'A', reason: 'why' }, { itemId: 'b', subject: 'B', reason: 'why' }], candidateCount: 2, insufficientMatches: false } },
    ])

    render(<MoodSheet open onOpenChange={vi.fn()} onPickManually={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Feel like exercising' }))
    await waitFor(() => screen.getByText('A'))

    fireEvent.click(screen.getByRole('button', { name: 'Remove A' }))

    expect(screen.getByText('Not enough yet. Pick some yourself?')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Make my plan/ })).toBeDisabled()
  })

  it('"Pick them myself" on the mood step closes the sheet and opens the manual flow with no pre-fill', () => {
    mockFetchSequence([])
    const onPickManually = vi.fn()
    const onOpenChange = vi.fn()
    render(<MoodSheet open onOpenChange={onOpenChange} onPickManually={onPickManually} />)

    fireEvent.click(screen.getByRole('button', { name: 'Pick them myself' }))

    expect(onPickManually).toHaveBeenCalledWith()
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('shows the 4 static starter chips with no Shuffle control and no match-count badge when the pool falls back to source: "starter"', async () => {
    mockFetchSequence([])
    render(<MoodSheet open onOpenChange={vi.fn()} onPickManually={vi.fn()} />)

    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/envelopes/ideas'))
    for (const idea of ENVELOPE_STARTER_IDEAS) {
      expect(within(moodSuggestionsGroup()).getByRole('button', { name: idea.label })).toBeInTheDocument()
    }
    expect(screen.queryByRole('button', { name: 'Shuffle suggestions' })).not.toBeInTheDocument()
  })

  it('shows 5 random ideas from a personalized pool, with each chip\'s matching-save count, and a Shuffle control', async () => {
    // Every idea carries the same 3-item match count so the assertion below
    // doesn't depend on which 5 of the 8 pool ideas the random draw shows.
    const poolIdeas = Array.from({ length: 8 }, (_, i) => ({
      label: `Idea ${i}`,
      seedTerms: [`idea${i}`],
      matchingItemIds: ['a', 'b', 'c'],
    }))
    mockFetchSequence([], { ok: true, json: { ideas: poolIdeas, source: 'pool' } })

    render(<MoodSheet open onOpenChange={vi.fn()} onPickManually={vi.fn()} />)

    let ideaChips: HTMLElement[] = []
    await waitFor(() => {
      const buttons = within(moodSuggestionsGroup()).getAllByRole('button')
      // 5 idea chips + Surprise me + Shuffle.
      expect(buttons).toHaveLength(7)
      ideaChips = buttons.filter((b) => /^Idea \d/.test(b.textContent ?? ''))
    })
    expect(ideaChips).toHaveLength(5)
    for (const chip of ideaChips) {
      expect(within(chip).getByText('3')).toBeInTheDocument()
    }
    expect(screen.getByRole('button', { name: 'Shuffle suggestions' })).toBeInTheDocument()
  })

  it('Shuffle redraws from the already-fetched pool with no new network call', async () => {
    const poolIdeas = Array.from({ length: 8 }, (_, i) => ({
      label: `Idea ${i}`,
      seedTerms: [`idea${i}`],
      matchingItemIds: [],
    }))
    mockFetchSequence([], { ok: true, json: { ideas: poolIdeas, source: 'pool' } })

    render(<MoodSheet open onOpenChange={vi.fn()} onPickManually={vi.fn()} />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Shuffle suggestions' })).toBeInTheDocument())

    expect(fetch).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Shuffle suggestions' }))
    fireEvent.click(screen.getByRole('button', { name: 'Shuffle suggestions' }))
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('"Surprise me" picks from the fetched pool and submits straight to suggest with no extra network call', async () => {
    mockFetchSequence(
      [{ ok: true, json: { items: [{ itemId: 'a', subject: 'A', reason: 'why' }, { itemId: 'b', subject: 'B', reason: 'why' }], candidateCount: 2, insufficientMatches: false } }],
      { ok: true, json: { ideas: [{ label: 'Weekend hike', seedTerms: ['hike'], matchingItemIds: [] }], source: 'pool' } },
    )

    render(<MoodSheet open onOpenChange={vi.fn()} onPickManually={vi.fn()} />)
    await waitFor(() => expect(screen.getByRole('button', { name: /Weekend hike/ })).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: /Surprise me/ }))

    await waitFor(() =>
      expect(fetch).toHaveBeenLastCalledWith(
        '/api/envelopes/suggest',
        expect.objectContaining({ body: JSON.stringify({ query: 'Weekend hike', seedTerms: ['hike'] }) }),
      ),
    )
    expect(fetch).toHaveBeenCalledTimes(2)
  })
})
