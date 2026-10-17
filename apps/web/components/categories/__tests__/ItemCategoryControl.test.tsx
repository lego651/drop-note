/** @vitest-environment jsdom */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ItemCategoryControl } from '../ItemCategoryControl'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

const categories = [
  { id: 'cat-food', name: 'Food & Drink', position: 0, hidden: false, is_default: true, is_other: false },
  { id: 'cat-tech', name: 'Tech', position: 1, hidden: false, is_default: true, is_other: false },
  { id: 'cat-other', name: 'Other', position: 7, hidden: false, is_default: true, is_other: true },
]

const foodBadge = { id: 'cat-food', name: 'Food & Drink', position: 0, is_other: false }

beforeEach(() => {
  vi.unstubAllGlobals()
})

// Radix's DropdownMenuTrigger opens on pointerdown (so menus feel instant), not on
// click — fireEvent.click alone never opens it.
function openPicker() {
  fireEvent.pointerDown(screen.getByRole('button', { name: /Category: Food & Drink/ }), {
    button: 0,
    ctrlKey: false,
  })
}

describe('ItemCategoryControl', () => {
  it('opens the picker and shows the other categories to move to', () => {
    render(
      <ItemCategoryControl itemId="item-1" category={foodBadge} locked={false} categories={categories} />,
    )
    openPicker()
    expect(screen.getByText('Tech')).toBeInTheDocument()
    expect(screen.getByText('Other')).toBeInTheDocument()
  })

  it('moves optimistically, then PATCHes the item and reports the move', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const onMoved = vi.fn()

    render(
      <ItemCategoryControl
        itemId="item-1"
        category={foodBadge}
        locked={false}
        categories={categories}
        onMoved={onMoved}
      />,
    )
    openPicker()
    fireEvent.click(screen.getByText('Tech'))

    // Optimistic: the badge switches before the fetch resolves.
    expect(screen.getByRole('button', { name: /Category: Tech/ })).toBeInTheDocument()

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/items/item-1', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ category_id: 'cat-tech' }),
    })))
    await waitFor(() => expect(onMoved).toHaveBeenCalledWith(
      'item-1',
      { id: 'cat-tech', name: 'Tech', position: 1, is_other: false },
      true,
    ))
  })

  it('keeps the optimistic override until refreshed props match it (DRO-105 B3)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const { rerender } = render(
      <ItemCategoryControl itemId="item-1" category={foodBadge} locked={false} categories={categories} />,
    )
    openPicker()
    fireEvent.click(screen.getByText('Tech'))

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(screen.getByRole('button', { name: /Category: Tech/ })).toBeInTheDocument()

    // Simulate a stale re-render (router.refresh() hasn't delivered the new
    // server props yet) — the override must keep showing Tech, not flip back.
    rerender(
      <ItemCategoryControl itemId="item-1" category={foodBadge} locked={false} categories={categories} />,
    )
    expect(screen.getByRole('button', { name: /Category: Tech/ })).toBeInTheDocument()

    // Once the refreshed props catch up, the override clears and props take over.
    const techBadge = { id: 'cat-tech', name: 'Tech', position: 1, is_other: false }
    rerender(
      <ItemCategoryControl itemId="item-1" category={techBadge} locked categories={categories} />,
    )
    expect(screen.getByRole('button', { name: /Category: Tech/ })).toBeInTheDocument()
  })

  it('rolls back the badge when the move request fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'nope' }), { status: 500 })),
    )

    render(
      <ItemCategoryControl itemId="item-1" category={foodBadge} locked={false} categories={categories} />,
    )
    openPicker()
    fireEvent.click(screen.getByText('Tech'))

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Category: Food & Drink/ })).toBeInTheDocument(),
    )
  })

  it('is a no-op when picking the already-current category', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    render(
      <ItemCategoryControl itemId="item-1" category={foodBadge} locked={false} categories={categories} />,
    )
    openPicker()
    fireEvent.click(screen.getAllByText('Food & Drink')[1])

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('shows the lock hint only when showLockHint is set', () => {
    const { rerender } = render(
      <ItemCategoryControl itemId="item-1" category={foodBadge} locked categories={categories} />,
    )
    expect(screen.queryByText(/AI won't change it/)).not.toBeInTheDocument()

    rerender(
      <ItemCategoryControl
        itemId="item-1"
        category={foodBadge}
        locked
        categories={categories}
        showLockHint
      />,
    )
    expect(screen.getByText(/AI won't change it/)).toBeInTheDocument()
  })

  it('shows "Picked by AI" instead of the lock hint when not locked', () => {
    render(
      <ItemCategoryControl
        itemId="item-1"
        category={foodBadge}
        locked={false}
        categories={categories}
        showLockHint
      />,
    )
    expect(screen.getByText('Picked by AI')).toBeInTheDocument()
  })
})
