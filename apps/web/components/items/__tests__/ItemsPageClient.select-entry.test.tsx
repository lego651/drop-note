/** @vitest-environment jsdom */

// DRO-213: selection had no entry point — isBulkMode only ever became true
// after something was already selected, but nothing could call toggle()
// while checkboxes were hidden, so selection (and the EnvelopeTray) could
// never be reached. These tests cover the "Select" toggle fix end-to-end:
// real BulkSelectProvider + ItemsPageClient + EnvelopeTray wired together,
// the same way app/(dashboard)/layout.tsx wires them.

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
import { EnvelopeTray } from '@/components/envelopes/EnvelopeTray'

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
      <EnvelopeTray />
    </BulkSelectProvider>,
  )
}

describe('ItemsPageClient — selection entry point (DRO-213)', () => {
  it('shows no checkboxes and no EnvelopeTray on a fresh page', () => {
    renderPage()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('clicking "Select" reveals checkboxes with 0 selected, and selecting an item shows the EnvelopeTray', () => {
    renderPage()

    fireEvent.click(screen.getByRole('button', { name: 'Select' }))

    const checkboxes = screen.getAllByRole('checkbox')
    expect(checkboxes.length).toBeGreaterThan(0)
    checkboxes.forEach((cb) => expect(cb).not.toBeChecked())
    // Entering select mode shows the tray as a "0 selected" mode indicator,
    // with "Make a plan" disabled until the minimum is met.
    expect(screen.getByText('0 items selected')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Make a plan/ })).toBeDisabled()

    fireEvent.click(checkboxes[0])

    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.getByText('1 item selected')).toBeInTheDocument()
  })

  it('"Cancel" exits selection mode and clears any picks', () => {
    renderPage()

    fireEvent.click(screen.getByRole('button', { name: 'Select' }))
    fireEvent.click(screen.getAllByRole('checkbox')[0])
    expect(screen.getByRole('status')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('Escape exits selection mode', () => {
    renderPage()

    fireEvent.click(screen.getByRole('button', { name: 'Select' }))
    expect(screen.getAllByRole('checkbox').length).toBeGreaterThan(0)

    fireEvent.keyDown(window, { key: 'Escape' })

    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })
})
