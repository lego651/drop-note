/** @vitest-environment jsdom */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { Sheet } from '@/components/ui/sheet'
import { MoodSheetReviewStep } from '../MoodSheetReviewStep'

beforeEach(() => {
  vi.restoreAllMocks()
})

const baseItems = [
  { itemId: 'a', subject: 'Costco run', reason: 'mentions Costco' },
  { itemId: 'b', subject: 'Trail map', reason: 'mentions a trail' },
]

// SheetTitle (used inside MoodSheetReviewStep's header) is a Radix DialogTitle
// and throws if rendered outside a Dialog/Sheet root — wrap every render the
// same way MoodSheet itself does in production.
function renderStep(props: Parameters<typeof MoodSheetReviewStep>[0]) {
  return render(
    <Sheet open>
      <MoodSheetReviewStep {...props} />
    </Sheet>,
  )
}

describe('MoodSheetReviewStep (DRO-301)', () => {
  it('renders each item with its one-line why, and enables "Make my plan" within the 2-8 cap', () => {
    renderStep({
      initialItems: baseItems,
      insufficientMatches: false,
      isGenerating: false,
      onBack: vi.fn(),
      onMakePlan: vi.fn(),
      onPickManually: vi.fn(),
    })

    expect(screen.getByText('Costco run')).toBeInTheDocument()
    expect(screen.getByText('mentions Costco')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Make my plan/ })).toBeEnabled()
  })

  it('Remove drops an item and calls onMakePlan with the remaining ids', () => {
    const onMakePlan = vi.fn()
    renderStep({
      initialItems: [...baseItems, { itemId: 'c', subject: 'Third', reason: 'why' }],
      insufficientMatches: false,
      isGenerating: false,
      onBack: vi.fn(),
      onMakePlan,
      onPickManually: vi.fn(),
    })

    fireEvent.click(screen.getByRole('button', { name: 'Remove Trail map' }))
    expect(screen.queryByText('Trail map')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Make my plan/ }))
    expect(onMakePlan).toHaveBeenCalledWith(['a', 'c'])
  })

  it('Swap opens the item search picker and replaces that item on selection', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => [{ id: 'z', subject: 'Replacement save' }] }),
    )

    renderStep({
      initialItems: baseItems,
      insufficientMatches: false,
      isGenerating: false,
      onBack: vi.fn(),
      onMakePlan: vi.fn(),
      onPickManually: vi.fn(),
    })

    fireEvent.click(screen.getByRole('button', { name: 'Swap Costco run' }))
    expect(screen.getByRole('heading', { name: 'Swap this save' })).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Search your saves'), { target: { value: 'repl' } })
    await waitFor(() => expect(screen.getByText('Replacement save')).toBeInTheDocument(), { timeout: 2000 })

    fireEvent.click(screen.getByRole('button', { name: 'Replacement save' }))

    expect(screen.queryByText('Costco run')).not.toBeInTheDocument()
    expect(screen.getByText('Replacement save')).toBeInTheDocument()
    expect(screen.getByText('Trail map')).toBeInTheDocument()
  })

  it('"Add another save" appends a selection without removing existing items', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => [{ id: 'z', subject: 'New save' }] }),
    )

    renderStep({
      initialItems: baseItems,
      insufficientMatches: false,
      isGenerating: false,
      onBack: vi.fn(),
      onMakePlan: vi.fn(),
      onPickManually: vi.fn(),
    })

    fireEvent.click(screen.getByRole('button', { name: 'Add another save' }))
    fireEvent.change(screen.getByLabelText('Search your saves'), { target: { value: 'new' } })
    await waitFor(() => expect(screen.getByText('New save')).toBeInTheDocument(), { timeout: 2000 })
    fireEvent.click(screen.getByRole('button', { name: 'New save' }))

    expect(screen.getByText('Costco run')).toBeInTheDocument()
    expect(screen.getByText('Trail map')).toBeInTheDocument()
    expect(screen.getByText('New save')).toBeInTheDocument()
  })

  // DRO-304 review: insufficientMatches describes the server's initial response,
  // not the live list — fixing it client-side (e.g. adding a save) must clear
  // the fallback and re-enable "Make my plan", not leave it stuck disabled.
  it('flagged insufficient at 1 item, then adding a second clears the fallback and enables "Make my plan"', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => [{ id: 'z', subject: 'Second save' }] }),
    )

    renderStep({
      initialItems: [baseItems[0]],
      insufficientMatches: true,
      isGenerating: false,
      onBack: vi.fn(),
      onMakePlan: vi.fn(),
      onPickManually: vi.fn(),
    })

    expect(screen.getByText('Not enough yet. Pick some yourself?')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Make my plan/ })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'Add another save' }))
    fireEvent.change(screen.getByLabelText('Search your saves'), { target: { value: 'second' } })
    await waitFor(() => expect(screen.getByText('Second save')).toBeInTheDocument(), { timeout: 2000 })
    fireEvent.click(screen.getByRole('button', { name: 'Second save' }))

    expect(screen.queryByText('Not enough yet. Pick some yourself?')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Make my plan/ })).toBeEnabled()
  })

  it('shows the insufficient-matches fallback when the server flagged it even with items present', () => {
    renderStep({
      initialItems: baseItems,
      insufficientMatches: true,
      isGenerating: false,
      onBack: vi.fn(),
      onMakePlan: vi.fn(),
      onPickManually: vi.fn(),
    })

    expect(screen.getByText('Not enough yet. Pick some yourself?')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Make my plan/ })).toBeDisabled()
  })

  it('"Pick them myself" in the fallback hands back the current review items', () => {
    const onPickManually = vi.fn()
    renderStep({
      initialItems: [baseItems[0]],
      insufficientMatches: false,
      isGenerating: false,
      onBack: vi.fn(),
      onMakePlan: vi.fn(),
      onPickManually,
    })

    fireEvent.click(screen.getByRole('button', { name: 'Pick them myself' }))
    expect(onPickManually).toHaveBeenCalledWith([baseItems[0]])
  })
})
