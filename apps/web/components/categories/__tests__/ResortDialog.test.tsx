/** @vitest-environment jsdom */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ResortDialog } from '../ResortDialog'

const category = {
  id: 'cat-recipes',
  name: 'Recipes',
  position: 8,
  hidden: false,
  is_default: false,
  is_other: false,
}

const foodCategory = { id: 'cat-food', name: 'Food & Drink', position: 0, hidden: false, is_default: true, is_other: false }
const categories = [category, foodCategory]

const candidates = [
  { itemId: 'item-1', subject: 'Pasta recipe', currentCategoryId: 'cat-food' },
  { itemId: 'item-2', subject: null, currentCategoryId: null },
]

beforeEach(() => {
  vi.unstubAllGlobals()
})

describe('ResortDialog', () => {
  it('shows a loading state, then the candidate list, all checked by default', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ candidates }), { status: 200 })),
    )
    render(
      <ResortDialog open category={category} categories={categories} onOpenChange={vi.fn()} />,
    )
    expect(screen.getByText('Checking your items…')).toBeInTheDocument()

    await waitFor(() => expect(screen.getByText('Pasta recipe')).toBeInTheDocument())
    expect(screen.getByText('Select all (2)')).toBeInTheDocument()
    expect(screen.getByText('Move 2 items')).toBeInTheDocument()
    expect(screen.getByText('(No subject)')).toBeInTheDocument()
  })

  it('shows the empty state with a Done button when there are no candidates', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ candidates: [] }), { status: 200 })),
    )
    render(
      <ResortDialog open category={category} categories={categories} onOpenChange={vi.fn()} />,
    )
    await waitFor(() =>
      expect(
        screen.getByText(/Nothing you've saved fits “Recipes” better right now/),
      ).toBeInTheDocument(),
    )
    expect(screen.getByText('Done')).toBeInTheDocument()
  })

  it('shows a danger notice with a retry on a preview error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 500 })))
    render(
      <ResortDialog open category={category} categories={categories} onOpenChange={vi.fn()} />,
    )
    await waitFor(() =>
      expect(
        screen.getByText("Couldn't check your items. Your category was created and nothing was moved."),
      ).toBeInTheDocument(),
    )
    expect(screen.getByText('Try again')).toBeInTheDocument()
  })

  it('unchecking an item excludes it from the move count, and apply POSTs only the checked ids', async () => {
    const fetchMock = vi.fn()
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ candidates }), { status: 200 }))
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ moved: 1 }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const onApplied = vi.fn()
    const onOpenChange = vi.fn()

    render(
      <ResortDialog
        open
        category={category}
        categories={categories}
        onOpenChange={onOpenChange}
        onApplied={onApplied}
      />,
    )
    await waitFor(() => expect(screen.getByText('Pasta recipe')).toBeInTheDocument())

    fireEvent.click(screen.getByLabelText('Pasta recipe'))
    expect(screen.getByText('Move 1 item')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Move 1 item'))

    await waitFor(() =>
      expect(fetchMock).toHaveBeenLastCalledWith(
        '/api/categories/cat-recipes/resort',
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ itemIds: ['item-2'] }) }),
      ),
    )
    await waitFor(() => expect(onApplied).toHaveBeenCalled())
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
  })

  it('disables the primary button and shows "Move items" when nothing is checked', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ candidates }), { status: 200 })),
    )
    render(
      <ResortDialog open category={category} categories={categories} onOpenChange={vi.fn()} />,
    )
    await waitFor(() => expect(screen.getByText('Select all (2)')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Select all (2)'))

    const button = screen.getByText('Move items')
    expect(button.closest('button')).toBeDisabled()
  })
})
