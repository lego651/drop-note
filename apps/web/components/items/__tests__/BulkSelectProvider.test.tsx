/** @vitest-environment jsdom */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { useEffect } from 'react'
import { BulkSelectProvider, useBulkSelect } from '../BulkSelectProvider'

let pathname = '/items'
vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
}))

beforeEach(() => {
  pathname = '/items'
})

function Harness() {
  const { selectedIds, isBulkMode, selectAll, deselectIds, deselectAll, enterSelectMode, exitSelectMode } = useBulkSelect()
  return (
    <div>
      <span data-testid="selected">{Array.from(selectedIds).sort().join(',')}</span>
      <span data-testid="bulk-mode">{String(isBulkMode)}</span>
      <button onClick={() => selectAll(['cat-a-1', 'cat-a-2'])}>select cat A page</button>
      <button onClick={() => selectAll(['cat-b-1', 'cat-b-2'])}>select cat B page</button>
      <button onClick={() => deselectIds(['cat-b-1', 'cat-b-2'])}>deselect cat B page</button>
      <button onClick={deselectAll}>clear all</button>
      <button onClick={enterSelectMode}>enter select mode</button>
      <button onClick={exitSelectMode}>exit select mode</button>
    </div>
  )
}

// Mimics ItemsPageClient's ?pick=1 effect: calls enterSelectModeFromDeepLink
// once on mount, in the same commit as (and before, since it's a child) the
// provider's own pathname-change effect (DRO-227 / DRO-229 review).
function DeepLinkHarness() {
  const { enterSelectModeFromDeepLink } = useBulkSelect()
  useEffect(() => {
    enterSelectModeFromDeepLink()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return null
}

function renderHarness() {
  return render(
    <BulkSelectProvider>
      <Harness />
    </BulkSelectProvider>,
  )
}

describe('BulkSelectProvider — cross-category picking (DRO-194)', () => {
  it('selectAll merges into the existing selection instead of replacing it', () => {
    renderHarness()

    fireEvent.click(screen.getByText('select cat A page'))
    expect(screen.getByTestId('selected').textContent).toBe('cat-a-1,cat-a-2')

    // Selecting a second category page's "select all" must not drop category A's picks.
    fireEvent.click(screen.getByText('select cat B page'))
    expect(screen.getByTestId('selected').textContent).toBe('cat-a-1,cat-a-2,cat-b-1,cat-b-2')
  })

  it('deselectIds removes only the given ids, leaving the rest of the cross-category selection intact', () => {
    renderHarness()

    fireEvent.click(screen.getByText('select cat A page'))
    fireEvent.click(screen.getByText('select cat B page'))
    fireEvent.click(screen.getByText('deselect cat B page'))

    expect(screen.getByTestId('selected').textContent).toBe('cat-a-1,cat-a-2')
    expect(screen.getByTestId('bulk-mode').textContent).toBe('true')
  })

  it('deselectAll clears the entire cross-category selection', () => {
    renderHarness()

    fireEvent.click(screen.getByText('select cat A page'))
    fireEvent.click(screen.getByText('select cat B page'))
    fireEvent.click(screen.getByText('clear all'))

    expect(screen.getByTestId('selected').textContent).toBe('')
    expect(screen.getByTestId('bulk-mode').textContent).toBe('false')
  })

  it('survives a pathname-stable re-render (e.g. switching ?category= on /items)', () => {
    const { rerender } = renderHarness()

    fireEvent.click(screen.getByText('select cat A page'))
    expect(screen.getByTestId('selected').textContent).toBe('cat-a-1,cat-a-2')

    // pathname unchanged ("/items") — simulates navigating between ?category= values
    rerender(
      <BulkSelectProvider>
        <Harness />
      </BulkSelectProvider>,
    )
    expect(screen.getByTestId('selected').textContent).toBe('cat-a-1,cat-a-2')
  })
})

describe('BulkSelectProvider — explicit selection entry point (DRO-213)', () => {
  it('enterSelectMode turns on isBulkMode with nothing selected', () => {
    renderHarness()

    expect(screen.getByTestId('bulk-mode').textContent).toBe('false')
    fireEvent.click(screen.getByText('enter select mode'))

    expect(screen.getByTestId('bulk-mode').textContent).toBe('true')
    expect(screen.getByTestId('selected').textContent).toBe('')
  })

  it('exitSelectMode turns off isBulkMode and clears any selection', () => {
    renderHarness()

    fireEvent.click(screen.getByText('enter select mode'))
    fireEvent.click(screen.getByText('select cat A page'))
    expect(screen.getByTestId('selected').textContent).toBe('cat-a-1,cat-a-2')

    fireEvent.click(screen.getByText('exit select mode'))

    expect(screen.getByTestId('bulk-mode').textContent).toBe('false')
    expect(screen.getByTestId('selected').textContent).toBe('')
  })

  it('resets select mode on navigation, same as the selection itself', () => {
    const { rerender } = renderHarness()
    fireEvent.click(screen.getByText('enter select mode'))
    expect(screen.getByTestId('bulk-mode').textContent).toBe('true')

    pathname = '/categories'
    rerender(
      <BulkSelectProvider>
        <Harness />
      </BulkSelectProvider>,
    )

    expect(screen.getByTestId('bulk-mode').textContent).toBe('false')
  })
})

describe('BulkSelectProvider — ?pick=1 deep link survives the same-commit navigation reset (DRO-227 / DRO-229 review)', () => {
  it('a deep-link mount into a new pathname is not clobbered by the provider resetting for that same navigation', () => {
    pathname = '/envelopes'
    const { rerender } = render(
      <BulkSelectProvider>
        <div>envelopes page</div>
      </BulkSelectProvider>,
    )

    // Client-side navigation to /items?pick=1: a fresh child mounts under the
    // same, still-mounted provider, in the same commit as the provider's own
    // pathname-change reset effect.
    pathname = '/items'
    rerender(
      <BulkSelectProvider>
        <DeepLinkHarness />
        <Harness />
      </BulkSelectProvider>,
    )

    expect(screen.getByTestId('bulk-mode').textContent).toBe('true')
  })

  it('does not leave a stale deep-link flag that blocks a later, unrelated navigation from resetting select mode', () => {
    pathname = '/envelopes'
    const { rerender } = render(
      <BulkSelectProvider>
        <div>envelopes page</div>
      </BulkSelectProvider>,
    )

    pathname = '/items'
    rerender(
      <BulkSelectProvider>
        <DeepLinkHarness />
        <Harness />
      </BulkSelectProvider>,
    )
    expect(screen.getByTestId('bulk-mode').textContent).toBe('true')

    // A later, unrelated navigation away must still reset select mode —
    // the one-shot deep-link flag from the earlier mount must not linger.
    pathname = '/categories'
    rerender(
      <BulkSelectProvider>
        <Harness />
      </BulkSelectProvider>,
    )

    expect(screen.getByTestId('bulk-mode').textContent).toBe('false')
  })
})
