/** @vitest-environment jsdom */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { EnvelopeEntryBanner } from '../EnvelopeEntryBanner'
import { markEnvelopeEntryPlanMade } from '../envelope-entry-storage'

let bulkState: {
  isBulkMode: boolean
  selectedIds: Set<string>
  exitSelectMode: ReturnType<typeof vi.fn>
}
vi.mock('@/components/items/BulkSelectProvider', () => ({
  useBulkSelect: () => bulkState,
}))

beforeEach(() => {
  localStorage.clear()
  bulkState = {
    isBulkMode: false,
    selectedIds: new Set(),
    exitSelectMode: vi.fn(),
  }
})

describe('EnvelopeEntryBanner (DRO-227, DRO-318)', () => {
  it('shows the full card by default, and opens the Mood Sheet on primary click', () => {
    const onMakePlan = vi.fn()
    render(<EnvelopeEntryBanner onFullCardInViewChange={vi.fn()} onMakePlan={onMakePlan} />)

    expect(screen.getByText('Turn saves into a plan')).toBeInTheDocument()
    expect(screen.getByText('1 · PICK ITEMS')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Make a plan/ }))
    expect(onMakePlan).toHaveBeenCalled()
  })

  it('"Not now" collapses the card to the one-line strip and persists it', () => {
    render(<EnvelopeEntryBanner onFullCardInViewChange={vi.fn()} onMakePlan={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Not now' }))

    expect(screen.queryByText('1 · PICK ITEMS')).not.toBeInTheDocument()
    expect(screen.getByText('Turn saves into a plan')).toBeInTheDocument()
    expect(localStorage.getItem('dropnote.envelopeEntry.notNowUntil')).not.toBeNull()
  })

  it('clicking the strip opens the Mood Sheet', () => {
    markEnvelopeEntryPlanMade()
    const onMakePlan = vi.fn()
    render(<EnvelopeEntryBanner onFullCardInViewChange={vi.fn()} onMakePlan={onMakePlan} />)

    fireEvent.click(screen.getByRole('button', { name: /Turn saves into a plan/ }))
    expect(onMakePlan).toHaveBeenCalled()
  })

  it('shows the step bar with a live picked count in pick mode, and Cancel exits it', () => {
    bulkState = {
      isBulkMode: true,
      selectedIds: new Set(['a', 'b']),
      exitSelectMode: vi.fn(),
    }
    render(<EnvelopeEntryBanner onFullCardInViewChange={vi.fn()} onMakePlan={vi.fn()} />)

    // Text spans multiple nested nodes now (bold step label, a mobile-hidden
    // clause, and the live-region count) — assert the pieces, not one string.
    expect(screen.getByText('Step 1 of 2')).toBeInTheDocument()
    expect(screen.getByText('2 picked')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Cancel picking' }))
    expect(bulkState.exitSelectMode).toHaveBeenCalled()
  })

  it('reports false to onFullCardInViewChange once it is no longer the full card (stripped)', () => {
    markEnvelopeEntryPlanMade()
    const onFullCardInViewChange = vi.fn()
    render(<EnvelopeEntryBanner onFullCardInViewChange={onFullCardInViewChange} onMakePlan={vi.fn()} />)

    expect(onFullCardInViewChange).toHaveBeenCalledWith(false)
  })
})
