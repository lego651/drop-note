/** @vitest-environment jsdom */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { BulkSelectProvider, useBulkSelect } from '../BulkSelectProvider'

let pathname = '/items'
vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
}))

beforeEach(() => {
  pathname = '/items'
})

function Harness() {
  const { selectedIds, isBulkMode, selectAll, deselectIds, deselectAll } = useBulkSelect()
  return (
    <div>
      <span data-testid="selected">{Array.from(selectedIds).sort().join(',')}</span>
      <span data-testid="bulk-mode">{String(isBulkMode)}</span>
      <button onClick={() => selectAll(['cat-a-1', 'cat-a-2'])}>select cat A page</button>
      <button onClick={() => selectAll(['cat-b-1', 'cat-b-2'])}>select cat B page</button>
      <button onClick={() => deselectIds(['cat-b-1', 'cat-b-2'])}>deselect cat B page</button>
      <button onClick={deselectAll}>clear all</button>
    </div>
  )
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
