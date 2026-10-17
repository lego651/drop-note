/** @vitest-environment jsdom */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { DeleteCategoryDialog } from '../DeleteCategoryDialog'

const category = {
  id: 'cat-tech',
  name: 'Tech',
  position: 2,
  hidden: false,
  is_default: true,
  is_other: false,
  item_count: 4,
}

beforeEach(() => {
  vi.unstubAllGlobals()
})

describe('DeleteCategoryDialog', () => {
  it('describes a re-sort for a category with multiple items', () => {
    render(
      <DeleteCategoryDialog open category={category} onOpenChange={vi.fn()} onDeleted={vi.fn()} />,
    )
    expect(
      screen.getByText(/Its 4 items will be re-sorted by AI into the closest remaining category/),
    ).toBeInTheDocument()
  })

  it('uses singular copy for exactly one item', () => {
    render(
      <DeleteCategoryDialog
        open
        category={{ ...category, item_count: 1 }}
        onOpenChange={vi.fn()}
        onDeleted={vi.fn()}
      />,
    )
    expect(screen.getByText(/Its 1 item will be re-sorted by AI/)).toBeInTheDocument()
  })

  it('says the category is empty when there are no items, with no re-sort copy', () => {
    render(
      <DeleteCategoryDialog
        open
        category={{ ...category, item_count: 0 }}
        onOpenChange={vi.fn()}
        onDeleted={vi.fn()}
      />,
    )
    expect(screen.getByText('This category is empty. This can’t be undone.')).toBeInTheDocument()
  })

  it('deletes, shows a pending state, then reports the reassigned count', async () => {
    let resolveFetch!: (v: Response) => void
    const fetchPromise = new Promise<Response>((resolve) => {
      resolveFetch = resolve
    })
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(fetchPromise))
    const onDeleted = vi.fn()

    render(
      <DeleteCategoryDialog open category={category} onOpenChange={vi.fn()} onDeleted={onDeleted} />,
    )
    fireEvent.click(screen.getByText('Delete category'))

    expect(screen.getByText('Re-sorting 4 items…')).toBeInTheDocument()
    expect(screen.getByText('Cancel')).toBeDisabled()

    resolveFetch(new Response(JSON.stringify({ reassigned: 4 }), { status: 200 }))
    await waitFor(() => expect(onDeleted).toHaveBeenCalledWith(4))
  })

  it('shows a danger notice and lets the user retry on failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 500 })))

    render(<DeleteCategoryDialog open category={category} onOpenChange={vi.fn()} onDeleted={vi.fn()} />)
    fireEvent.click(screen.getByText('Delete category'))

    await waitFor(() => expect(screen.getByText(/Couldn't delete “Tech”/)).toBeInTheDocument())
    expect(screen.getByText('Delete category')).not.toBeDisabled()
  })
})
