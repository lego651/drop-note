/** @vitest-environment jsdom */

// DRO-213: selection had no entry point — isBulkMode only ever became true
// after something was already selected, but nothing could call toggle()
// while checkboxes were hidden, so selection (and the EnvelopeTray) could
// never be reached. These tests cover the "Edit items" toggle fix end-to-end:
// real BulkSelectProvider + ItemsPageClient, which renders EnvelopeTray
// itself (DRO-227) the same way app/(dashboard)/layout.tsx wires the provider.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { ReactNode } from 'react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/items',
}))

vi.mock('next/link', () => ({
  default: function MockLink({ children, href, ...props }: { children: ReactNode; href: string }) {
    return <a href={href} {...props}>{children}</a>
  },
}))

vi.mock('@/hooks/useRealtimeItems', () => ({
  useRealtimeItems: () => ({
    newItems: [],
    updatedItems: [],
    clearNewItems: vi.fn(),
    clearUpdatedItems: vi.fn(),
  }),
}))

beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
  vi.stubGlobal('navigator', {
    ...global.navigator,
    clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
  })
  localStorage.setItem('drop-note:welcomed', 'true')
})

import { ItemsPageClient } from '../ItemsPageClient'
import { BulkSelectProvider } from '../BulkSelectProvider'

const items = [
  {
    id: 'item-1',
    subject: 'First item',
    sender_email: 'sender@example.com',
    ai_summary: 'Summary',
    status: 'done',
    error_message: null,
    pinned: false,
    created_at: '2026-05-29T00:00:00Z',
    source_type: 'email' as const,
    source_url: null,
    thumbnail_url: null,
    item_tags: [],
  },
  {
    id: 'item-2',
    subject: 'Second item',
    sender_email: 'sender@example.com',
    ai_summary: 'Summary',
    status: 'done',
    error_message: null,
    pinned: false,
    created_at: '2026-05-29T00:00:00Z',
    source_type: 'email' as const,
    source_url: null,
    thumbnail_url: null,
    item_tags: [],
  },
]

function renderPage() {
  return render(
    <BulkSelectProvider>
      <ItemsPageClient items={items} totalCount={items.length} page={1} userId="user-1" />
    </BulkSelectProvider>,
  )
}

describe('ItemsPageClient — selection entry point (DRO-213)', () => {
  it('shows no checkboxes and no EnvelopeTray on a fresh page', () => {
    renderPage()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  // DRO-247: the button was 40x40 on mobile — needs a 44px tap target below sm.
  it('gives "Edit items" a 44px tap target on mobile that shrinks back at sm+', () => {
    renderPage()
    const button = screen.getByRole('button', { name: 'Edit items' })
    expect(button.className).toContain('h-11')
    expect(button.className).toContain('w-11')
    expect(button.className).toContain('sm:h-10')
  })

  it('clicking "Edit items" reveals checkboxes with 0 selected, and selecting an item shows the EnvelopeTray', () => {
    renderPage()

    fireEvent.click(screen.getByRole('button', { name: 'Edit items' }))

    const checkboxes = screen.getAllByRole('checkbox')
    expect(checkboxes.length).toBeGreaterThan(0)
    checkboxes.forEach((cb) => expect(cb).not.toBeChecked())
    // Entering select mode shows the tray as a "0 of 2-8" mode indicator,
    // with "Make a plan" disabled until the minimum is met.
    expect(screen.getByText('0 of 2–8 · tap cards to add')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Make a plan/ })).toHaveAttribute('aria-disabled', 'true')

    fireEvent.click(checkboxes[0])

    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.getByText('1 of 2–8 · tap cards to add')).toBeInTheDocument()
  })

  it('"Cancel" exits selection mode and clears any picks', () => {
    renderPage()

    fireEvent.click(screen.getByRole('button', { name: 'Edit items' }))
    fireEvent.click(screen.getAllByRole('checkbox')[0])
    expect(screen.getByRole('status')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Cancel selection' }))

    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('Escape exits selection mode', () => {
    renderPage()

    fireEvent.click(screen.getByRole('button', { name: 'Edit items' }))
    expect(screen.getAllByRole('checkbox').length).toBeGreaterThan(0)

    fireEvent.keyDown(window, { key: 'Escape' })

    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('does not wrap cards in a navigation link while selecting, so a checkbox click cannot navigate away', () => {
    renderPage()

    fireEvent.click(screen.getByRole('button', { name: 'Edit items' }))
    const checkboxes = screen.getAllByRole('checkbox')
    checkboxes.forEach((cb) => expect(cb.closest('a')).toBeNull())

    const firstItemCheckbox = checkboxes[0]
    fireEvent.click(firstItemCheckbox)

    // Selection survives the click — still in select mode with the pick kept.
    expect(firstItemCheckbox).toBeChecked()
    expect(screen.getByText('1 of 2–8 · tap cards to add')).toBeInTheDocument()
  })

  it('clicking a card toggles its selection, and the checkbox click does not double-toggle it', () => {
    renderPage()

    fireEvent.click(screen.getByRole('button', { name: 'Edit items' }))
    const checkboxes = screen.getAllByRole('checkbox')
    const card = checkboxes[0].closest('[role="button"]') as HTMLElement
    expect(card).not.toBeNull()

    fireEvent.click(card)
    expect(checkboxes[0]).toBeChecked()
    expect(screen.getByText('1 of 2–8 · tap cards to add')).toBeInTheDocument()

    fireEvent.click(card)
    expect(checkboxes[0]).not.toBeChecked()

    // A direct checkbox click (bubbling into the card) must toggle exactly once.
    fireEvent.click(checkboxes[0])
    expect(checkboxes[0]).toBeChecked()
  })

  it('Escape inside a nested overlay (bulk delete confirm) closes the overlay but keeps the selection', () => {
    renderPage()

    fireEvent.click(screen.getByRole('button', { name: 'Edit items' }))
    fireEvent.click(screen.getAllByRole('checkbox')[0])
    expect(screen.getByText('1 of 2–8 · tap cards to add')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()

    // Dispatched on document so Radix's DismissableLayer (registered on
    // document, capture phase) sees it before our window-level listener.
    fireEvent.keyDown(document, { key: 'Escape' })

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(screen.getAllByRole('checkbox').length).toBeGreaterThan(0)
    expect(screen.getByText('1 of 2–8 · tap cards to add')).toBeInTheDocument()
  })

  it('Escape while the "Make a plan" dialog is open closes the dialog but keeps pick mode (DRO-227)', () => {
    renderPage()

    // Select by accessible name, not position: selecting the first item
    // mounts BulkActionToolbar's "select all" checkbox ahead of the item
    // checkboxes, which would shift a positional lookup.
    fireEvent.click(screen.getByRole('button', { name: 'Edit items' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select item: First item' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select item: Second item' }))
    expect(screen.getByText('2 of 2–8 · tap cards to add')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Make a plan/ }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getAllByRole('checkbox').length).toBeGreaterThan(0)
    expect(screen.getByText('2 of 2–8 · tap cards to add')).toBeInTheDocument()
  })
})
