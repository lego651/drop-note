/** @vitest-environment jsdom */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'

const routerRefresh = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: routerRefresh }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/items',
}))

vi.mock('next/link', () => ({
  default: function MockLink({ children, href, ...props }: { children: ReactNode; href: string }) {
    return <a href={href} {...props}>{children}</a>
  },
}))

// Controllable realtime hook — tests mutate this object's arrays (with a fresh
// reference each time) and then rerender to simulate a payload arriving.
const realtimeMock: {
  newItems: Record<string, unknown>[]
  updatedItems: Record<string, unknown>[]
  clearNewItems: ReturnType<typeof vi.fn>
  clearUpdatedItems: ReturnType<typeof vi.fn>
} = {
  newItems: [],
  updatedItems: [],
  clearNewItems: vi.fn(),
  clearUpdatedItems: vi.fn(),
}
vi.mock('@/hooks/useRealtimeItems', () => ({
  useRealtimeItems: () => realtimeMock,
}))

// Controllable bulk-select context — lets the bulk-move test start already in
// bulk mode with an item selected, without reverse-engineering the real
// checkbox-driven entry flow (which only renders once isBulkMode is true).
let bulkState: {
  isBulkMode: boolean
  selectedIds: Set<string>
  toggle: ReturnType<typeof vi.fn>
  selectAll: ReturnType<typeof vi.fn>
  deselectAll: ReturnType<typeof vi.fn>
}
vi.mock('@/components/items/BulkSelectProvider', () => ({
  BulkSelectProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  useBulkSelect: () => bulkState,
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

  realtimeMock.newItems = []
  realtimeMock.updatedItems = []
  realtimeMock.clearNewItems = vi.fn()
  realtimeMock.clearUpdatedItems = vi.fn()

  bulkState = {
    isBulkMode: false,
    selectedIds: new Set(),
    toggle: vi.fn(),
    selectAll: vi.fn(),
    deselectAll: vi.fn(),
  }

  routerRefresh.mockClear()
})

import { ItemsPageClient } from '../ItemsPageClient'

const categories = [
  { id: 'cat-food', name: 'Food & Drink', position: 0, hidden: false, is_default: true, is_other: false },
  { id: 'cat-tech', name: 'Tech', position: 1, hidden: false, is_default: true, is_other: false },
]

const baseItem = {
  id: 'item-1',
  subject: 'Item 1',
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
  category: null,
  category_id: null,
  category_locked: false,
}

describe('ItemsPageClient — realtime category hydration (DRO-105 B1)', () => {
  it('hydrates the category badge from a realtime UPDATE payload', async () => {
    const { rerender } = render(
      <ItemsPageClient items={[baseItem]} totalCount={1} page={1} userId="user-1" categories={categories} />,
    )
    expect(screen.queryByRole('button', { name: /Category:/ })).not.toBeInTheDocument()

    // Realtime payloads are raw `items` rows — category_id only, no joined `category`.
    realtimeMock.updatedItems = [{ ...baseItem, category_id: 'cat-tech' }]
    rerender(
      <ItemsPageClient items={[baseItem]} totalCount={1} page={1} userId="user-1" categories={categories} />,
    )

    expect(await screen.findByRole('button', { name: /Category: Tech/ })).toBeInTheDocument()
    expect(realtimeMock.clearUpdatedItems).toHaveBeenCalled()
  })

  it('hydrates the category badge from a realtime INSERT payload', async () => {
    const { rerender } = render(
      <ItemsPageClient items={[]} totalCount={0} page={1} userId="user-1" categories={categories} />,
    )

    realtimeMock.newItems = [{ ...baseItem, id: 'item-2', category_id: 'cat-food' }]
    rerender(
      <ItemsPageClient items={[]} totalCount={0} page={1} userId="user-1" categories={categories} />,
    )

    expect(await screen.findByRole('button', { name: /Category: Food & Drink/ })).toBeInTheDocument()
    expect(realtimeMock.clearNewItems).toHaveBeenCalled()
  })
})

describe('ItemsPageClient — bulk move (DRO-105 B2)', () => {
  it('deselects all and refreshes the router after a successful bulk move', async () => {
    bulkState = {
      isBulkMode: true,
      selectedIds: new Set(['item-1']),
      toggle: vi.fn(),
      selectAll: vi.fn(),
      deselectAll: vi.fn(),
    }
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ moved: 1 }), { status: 200 })),
    )

    render(
      <ItemsPageClient items={[baseItem]} totalCount={1} page={1} userId="user-1" categories={categories} />,
    )

    // Radix's DropdownMenuTrigger opens on pointerdown, not click.
    fireEvent.pointerDown(screen.getByRole('button', { name: /Move 1 items to a category/ }), {
      button: 0,
      ctrlKey: false,
    })
    fireEvent.click(screen.getByText('Tech'))

    await waitFor(() => expect(bulkState.deselectAll).toHaveBeenCalled())
    expect(routerRefresh).toHaveBeenCalled()
  })
})
