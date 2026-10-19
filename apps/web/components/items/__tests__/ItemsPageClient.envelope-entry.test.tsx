/** @vitest-environment jsdom */

// DRO-227: the items page hosts the envelopes entry banner (above search)
// and the floating "Make a plan" FAB / pick-mode tray (bottom-right). These
// cover: no two competing cobalt CTAs, the banner's strip/step-bar states,
// and the "no FAB while the full banner is visible" rule.

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
  vi.stubGlobal('navigator', {
    ...global.navigator,
    clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
  })
  localStorage.clear()
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
]

function renderPage() {
  return render(
    <BulkSelectProvider>
      <ItemsPageClient items={items} totalCount={items.length} page={1} userId="user-1" />
    </BulkSelectProvider>,
  )
}

describe('ItemsPageClient — envelopes entry banner + FAB (DRO-227)', () => {
  it('shows the full banner and no floating FAB on a fresh page', () => {
    renderPage()
    expect(screen.getByText('Turn saves into a plan')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Make a plan$/ })).not.toBeInTheDocument()
  })

  it('shows the floating FAB once the banner is dismissed to its strip', () => {
    renderPage()

    fireEvent.click(screen.getByRole('button', { name: 'Not now' }))

    expect(screen.getByRole('button', { name: /^Make a plan$/ })).toBeInTheDocument()
  })

  it('clicking the floating FAB enters pick mode and swaps the FAB for the tray', () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }))

    fireEvent.click(screen.getByRole('button', { name: /^Make a plan$/ }))

    expect(screen.getAllByRole('checkbox').length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: /^Make a plan$/ })).not.toBeInTheDocument()
    expect(screen.getByText('0 of 2–8 · tap cards to add')).toBeInTheDocument()
  })

  it('entering pick mode via "Edit items" also shrinks the banner to its step bar', () => {
    renderPage()

    fireEvent.click(screen.getByRole('button', { name: 'Edit items' }))

    expect(screen.getByText('Step 1 of 2')).toBeInTheDocument()
    expect(screen.getByText('0 picked')).toBeInTheDocument()
    expect(screen.queryByText('Turn saves into a plan')).not.toBeInTheDocument()
  })
})
