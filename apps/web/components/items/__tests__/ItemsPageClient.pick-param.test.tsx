/** @vitest-environment jsdom */

// DRO-227: the /envelopes empty state links to /items?pick=1 so "Make a plan"
// drops the user straight into pick mode instead of just landing on the inbox.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'

let pathname = '/items'
const routerReplace = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: routerReplace, push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams('pick=1'),
  usePathname: () => pathname,
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
  pathname = '/items'
  routerReplace.mockClear()
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

describe('ItemsPageClient — ?pick=1 deep link (DRO-227)', () => {
  it('enters pick mode automatically on mount', () => {
    render(
      <BulkSelectProvider>
        <ItemsPageClient items={items} totalCount={items.length} page={1} userId="user-1" />
      </BulkSelectProvider>,
    )

    expect(screen.getAllByRole('checkbox').length).toBeGreaterThan(0)
    expect(screen.getByText('Step 1 of 2')).toBeInTheDocument()
    expect(screen.getByText('0 picked')).toBeInTheDocument()
    // Strips ?pick=1 via replace so a refresh or Back doesn't re-enter pick mode.
    expect(routerReplace).toHaveBeenCalledWith('/items')
  })

  // DRO-229 review: BulkSelectProvider lives in the persistent dashboard
  // layout, so the only way users reach ?pick=1 is a client-side navigation
  // (the /envelopes empty state's <Link href="/items?pick=1">), not a hard
  // load — the hard-load path above doesn't exercise the provider's own
  // pathname-change effect at all, since its ref already equals the pathname
  // on first mount.
  it('enters pick mode on a client-side navigation into /items, not just a hard load', () => {
    pathname = '/envelopes'
    const { rerender } = render(
      <BulkSelectProvider>
        <div>envelopes page (no items here)</div>
      </BulkSelectProvider>,
    )

    pathname = '/items'
    rerender(
      <BulkSelectProvider>
        <ItemsPageClient items={items} totalCount={items.length} page={1} userId="user-1" />
      </BulkSelectProvider>,
    )

    expect(screen.getAllByRole('checkbox').length).toBeGreaterThan(0)
    expect(screen.getByText('Step 1 of 2')).toBeInTheDocument()
    expect(screen.getByText('0 picked')).toBeInTheDocument()
  })
})
