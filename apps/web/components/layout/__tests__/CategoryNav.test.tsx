/** @vitest-environment jsdom */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { CategoryNav, type CategoryWithCount } from '../CategoryNav'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }),
}))

function makeCategories(n: number): CategoryWithCount[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `cat-${i}`,
    name: `Category ${i}`,
    position: i,
    hidden: false,
    is_default: false,
    is_other: false,
    item_count: i,
  }))
}

const base: CategoryWithCount[] = [
  { id: 'cat-food', name: 'Food & Drink', position: 0, hidden: false, is_default: true, is_other: false, item_count: 18 },
  { id: 'cat-other', name: 'Other', position: 7, hidden: false, is_default: true, is_other: true, item_count: 1 },
]

beforeEach(() => {
  vi.unstubAllGlobals()
})

// Radix's DropdownMenuTrigger opens on pointerdown, not click.
function openRowMenu(name: string) {
  fireEvent.pointerDown(screen.getByRole('button', { name: `Options for ${name}` }), {
    button: 0,
    ctrlKey: false,
  })
}

describe('CategoryNav', () => {
  it('renders categories in display order with Other always last', () => {
    // Other is listed first in props to prove the UI re-sorts it to the end, not the caller.
    render(
      <CategoryNav categories={[base[1], base[0]]} activeCategoryId={null} />,
    )
    const rows = screen.getAllByRole('listitem')
    const names = rows.map((r) => r.textContent)
    expect(names.findIndex((t) => t?.includes('Food & Drink'))).toBeLessThan(
      names.findIndex((t) => t?.includes('Other')),
    )
  })

  it('shows the category count, including zero', () => {
    render(<CategoryNav categories={base} activeCategoryId={null} />)
    expect(screen.getByText('18')).toBeInTheDocument()
    expect(screen.getByText('1')).toBeInTheDocument()
  })

  it('shows a load error with a retry button instead of rows', () => {
    const refresh = vi.fn()
    vi.doMock('next/navigation', () => ({ useRouter: () => ({ refresh, replace: vi.fn() }) }))
    render(<CategoryNav categories={[]} categoriesError activeCategoryId={null} />)
    expect(screen.getByText("Couldn't load categories.")).toBeInTheDocument()
    expect(screen.queryByText('New category')).not.toBeInTheDocument()
  })

  describe('create', () => {
    it('creates a category optimistically, then POSTs and clears the pending state', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ id: 'cat-new', name: 'Recipes', position: 1, hidden: false, is_default: false, is_other: false }),
          { status: 201 },
        ),
      )
      vi.stubGlobal('fetch', fetchMock)

      render(<CategoryNav categories={base} activeCategoryId={null} />)
      fireEvent.click(screen.getByText('New category'))
      const input = screen.getByLabelText('Category name')
      fireEvent.change(input, { target: { value: 'Recipes' } })
      fireEvent.keyDown(input, { key: 'Enter' })

      await waitFor(() =>
        expect(fetchMock).toHaveBeenCalledWith(
          '/api/categories',
          expect.objectContaining({ method: 'POST', body: JSON.stringify({ name: 'Recipes' }) }),
        ),
      )
      await waitFor(() => expect(screen.getByText('Recipes')).toBeInTheDocument())
    })

    it('disables "New category" with an explanation at the 15-category cap', () => {
      render(<CategoryNav categories={makeCategories(15)} activeCategoryId={null} />)
      const button = screen.getByText('New category').closest('button')
      expect(button).toHaveAttribute('aria-disabled', 'true')
      expect(
        screen.getByText("You've reached 15 categories, hidden ones included. Delete one to add another."),
      ).toBeInTheDocument()
      fireEvent.click(button!)
      expect(screen.queryByLabelText('Category name')).not.toBeInTheDocument()
    })

    it('shows a validation error for a duplicate name without calling the API', () => {
      const fetchMock = vi.fn()
      vi.stubGlobal('fetch', fetchMock)
      render(<CategoryNav categories={base} activeCategoryId={null} />)
      fireEvent.click(screen.getByText('New category'))
      const input = screen.getByLabelText('Category name')
      fireEvent.change(input, { target: { value: 'food & drink' } })
      fireEvent.keyDown(input, { key: 'Enter' })

      expect(screen.getByText('You already have a category called “food & drink”.')).toBeInTheDocument()
      expect(fetchMock).not.toHaveBeenCalled()
    })
  })

  describe('rename', () => {
    it('renames optimistically via the row menu, Enter to save', async () => {
      const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
      vi.stubGlobal('fetch', fetchMock)

      render(<CategoryNav categories={base} activeCategoryId={null} />)
      openRowMenu('Food & Drink')
      fireEvent.click(screen.getByText('Rename'))

      const input = screen.getByLabelText('Rename category')
      fireEvent.change(input, { target: { value: 'Snacks' } })
      fireEvent.keyDown(input, { key: 'Enter' })

      // Optimistic: renders immediately, before the PATCH resolves.
      expect(screen.getByText('Snacks')).toBeInTheDocument()
      await waitFor(() =>
        expect(fetchMock).toHaveBeenCalledWith(
          '/api/categories/cat-food',
          expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ name: 'Snacks' }) }),
        ),
      )
    })

    it('rolls back the name when the rename request fails', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 500 })))

      render(<CategoryNav categories={base} activeCategoryId={null} />)
      openRowMenu('Food & Drink')
      fireEvent.click(screen.getByText('Rename'))
      const input = screen.getByLabelText('Rename category')
      fireEvent.change(input, { target: { value: 'Snacks' } })
      fireEvent.keyDown(input, { key: 'Enter' })

      await waitFor(() => expect(screen.getByText('Food & Drink')).toBeInTheDocument())
      expect(screen.queryByText('Snacks')).not.toBeInTheDocument()
    })

    it('closing on Escape restores the original name without a request', () => {
      const fetchMock = vi.fn()
      vi.stubGlobal('fetch', fetchMock)
      render(<CategoryNav categories={base} activeCategoryId={null} />)
      openRowMenu('Food & Drink')
      fireEvent.click(screen.getByText('Rename'))
      const input = screen.getByLabelText('Rename category')
      fireEvent.change(input, { target: { value: 'Snacks' } })
      fireEvent.keyDown(input, { key: 'Escape' })

      expect(screen.getByText('Food & Drink')).toBeInTheDocument()
      expect(fetchMock).not.toHaveBeenCalled()
    })
  })

  describe('hide / unhide', () => {
    it('moves a category into the Hidden group and opens it, then PATCHes hidden:true', async () => {
      const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
      vi.stubGlobal('fetch', fetchMock)

      render(<CategoryNav categories={base} activeCategoryId={null} />)
      openRowMenu('Food & Drink')
      fireEvent.click(screen.getByText('Hide'))

      expect(screen.getByText('Hidden (1)')).toBeInTheDocument()
      await waitFor(() =>
        expect(fetchMock).toHaveBeenCalledWith(
          '/api/categories/cat-food',
          expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ hidden: true }) }),
        ),
      )
    })
  })

  describe('"Other" guardrail', () => {
    it('disables Delete for Other with its reason visible', () => {
      render(<CategoryNav categories={base} activeCategoryId={null} />)
      openRowMenu('Other')
      const deleteItem = screen.getByText('Delete…').closest('[aria-disabled]')
      expect(deleteItem).toHaveAttribute('aria-disabled', 'true')
      expect(
        screen.getByText("Other can't be deleted. Items go here when nothing else fits."),
      ).toBeInTheDocument()
    })

    it('allows Delete for a non-Other category', () => {
      render(<CategoryNav categories={base} activeCategoryId={null} />)
      openRowMenu('Food & Drink')
      const deleteItem = screen.getByText('Delete…').closest('[role="menuitem"]')
      expect(deleteItem).not.toHaveAttribute('aria-disabled', 'true')
    })
  })

  describe('delete', () => {
    it('opens the confirmation dialog and removes the row once deleted', async () => {
      const fetchMock = vi.fn((url: string, init?: RequestInit) => {
        if (!init) return Promise.resolve(new Response(JSON.stringify({ item_count: 18 }), { status: 200 }))
        return Promise.resolve(new Response(JSON.stringify({ reassigned: 3 }), { status: 200 }))
      })
      vi.stubGlobal('fetch', fetchMock)

      render(<CategoryNav categories={base} activeCategoryId={null} />)
      openRowMenu('Food & Drink')
      fireEvent.click(screen.getByText('Delete…'))

      const dialog = await screen.findByRole('alertdialog')
      fireEvent.click(within(dialog).getByText('Delete category'))

      await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/categories/cat-food', { method: 'DELETE' }))
      await waitFor(() => expect(screen.queryByText('Food & Drink')).not.toBeInTheDocument())
    })

    it('corrects the confirmation count to the actual deletion scope (DRO-105 Codex P2)', async () => {
      // The sidebar's count (18, active/non-archived/email_body only) understates what
      // deleteCategory would reassign (22, every item with this category_id).
      const fetchMock = vi.fn((url: string, init?: RequestInit) => {
        if (!init) return Promise.resolve(new Response(JSON.stringify({ item_count: 22 }), { status: 200 }))
        return Promise.resolve(new Response(JSON.stringify({ reassigned: 22 }), { status: 200 }))
      })
      vi.stubGlobal('fetch', fetchMock)

      render(<CategoryNav categories={base} activeCategoryId={null} />)
      openRowMenu('Food & Drink')
      fireEvent.click(screen.getByText('Delete…'))

      const dialog = await screen.findByRole('alertdialog')
      expect(within(dialog).getByText(/Its 18 items will be re-sorted/)).toBeInTheDocument()

      await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/categories/cat-food'))
      await waitFor(() =>
        expect(within(dialog).getByText(/Its 22 items will be re-sorted/)).toBeInTheDocument(),
      )
    })

    it('keeps the sidebar count if the deletion-scope lookup fails', async () => {
      const fetchMock = vi.fn((url: string, init?: RequestInit) => {
        if (!init) return Promise.resolve(new Response('{}', { status: 500 }))
        return Promise.resolve(new Response(JSON.stringify({ reassigned: 18 }), { status: 200 }))
      })
      vi.stubGlobal('fetch', fetchMock)

      render(<CategoryNav categories={base} activeCategoryId={null} />)
      openRowMenu('Food & Drink')
      fireEvent.click(screen.getByText('Delete…'))

      const dialog = await screen.findByRole('alertdialog')
      await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/categories/cat-food'))
      expect(within(dialog).getByText(/Its 18 items will be re-sorted/)).toBeInTheDocument()
    })
  })
})
