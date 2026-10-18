/** @vitest-environment jsdom */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { BulkActionToolbar } from '../BulkActionToolbar'

// The toolbar renders PurposeDialog (DRO-193), which calls useRouter — this
// suite doesn't touch that dialog, but it still needs an app router mounted.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

const categories = [
  { id: 'cat-food', name: 'Food & Drink', position: 0, hidden: false, is_default: true, is_other: false },
  { id: 'cat-tech', name: 'Tech', position: 1, hidden: false, is_default: true, is_other: false },
]

const selectedIds = new Set(['item-1', 'item-2'])

beforeEach(() => {
  vi.unstubAllGlobals()
})

function openMovePicker() {
  fireEvent.pointerDown(screen.getByRole('button', { name: /Move 2 items to a category/ }), {
    button: 0,
    ctrlKey: false,
  })
}

describe('BulkActionToolbar — Move to…', () => {
  it('POSTs the selected ids and category, then reports the move', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ moved: 2 }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const onMoved = vi.fn()

    render(
      <BulkActionToolbar
        selectedIds={selectedIds}
        allPageIds={['item-1', 'item-2']}
        userTier="free"
        categories={categories}
        onDeleted={vi.fn()}
        onTagged={vi.fn()}
        onMoved={onMoved}
        onSelectAll={vi.fn()}
        onDeselectAll={vi.fn()}
      />,
    )

    openMovePicker()
    fireEvent.click(screen.getByText('Tech'))

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/items/bulk-move-category',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ ids: ['item-1', 'item-2'], categoryId: 'cat-tech' }),
        }),
      ),
    )
    await waitFor(() =>
      expect(onMoved).toHaveBeenCalledWith(
        ['item-1', 'item-2'],
        { id: 'cat-tech', name: 'Tech', position: 1, is_other: false },
      ),
    )
  })

  it('disables the trigger and explains the limit when over 100 items are selected', () => {
    const manyIds = new Set(Array.from({ length: 101 }, (_, i) => `item-${i}`))
    render(
      <BulkActionToolbar
        selectedIds={manyIds}
        allPageIds={[]}
        userTier="free"
        categories={categories}
        onDeleted={vi.fn()}
        onTagged={vi.fn()}
        onSelectAll={vi.fn()}
        onDeselectAll={vi.fn()}
      />,
    )
    const trigger = screen.getByRole('button', { name: /Move 101 items to a category/ })
    expect(trigger).toBeDisabled()
    expect(trigger).toHaveAttribute('title', 'You can move up to 100 items at a time.')
  })
})
