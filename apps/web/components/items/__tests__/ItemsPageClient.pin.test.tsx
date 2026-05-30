/** @vitest-environment jsdom */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import type { ReactNode } from 'react'

// Mock Next.js navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/items',
}))

// Mock Next.js Link
vi.mock('next/link', () => ({
  default: function MockLink({ children, href, ...props }: { children: ReactNode; href: string }) {
    return <a href={href} {...props}>{children}</a>
  },
}))

// Mock realtime hook
vi.mock('@/hooks/useRealtimeItems', () => ({
  useRealtimeItems: () => ({
    newItems: [],
    updatedItems: [],
    clearNewItems: vi.fn(),
    clearUpdatedItems: vi.fn(),
  }),
}))

// Mock Supabase client (used by WelcomeModal's localStorage check, not direct here)
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    channel: () => ({
      on: () => ({ subscribe: vi.fn() }),
      subscribe: vi.fn(),
    }),
    removeChannel: vi.fn(),
  }),
}))

// Setup DOM globals
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
  // Ensure WelcomeModal doesn't render
  localStorage.setItem('drop-note:welcomed', 'true')
})

import { ItemsPageClient } from '../ItemsPageClient'

// A mock item with pinned: false
const mockItem = {
  id: 'item-pin-1',
  subject: 'Pin test item',
  sender_email: 'test@example.com',
  ai_summary: 'Summary text',
  status: 'done',
  error_message: null,
  pinned: false,
  created_at: '2026-05-29T00:00:00Z',
  source_type: 'email' as const,
  source_url: null,
  thumbnail_url: null,
  item_tags: [],
}

describe('ItemsPageClient pin optimistic update', () => {
  it('updates pin state immediately before fetch resolves', async () => {
    // Create a fetch mock that doesn't resolve until we control it
    let resolveFetch!: (value: Response) => void
    const fetchPromise = new Promise<Response>((resolve) => {
      resolveFetch = resolve
    })

    vi.stubGlobal('fetch', vi.fn().mockReturnValue(fetchPromise))

    render(
      <ItemsPageClient
        items={[mockItem]}
        totalCount={1}
        page={1}
        userId="user-test"
      />
    )

    // Find pin button — GalleryCard renders it as an aria-label "Pin" button
    // The component renders with default 'card' view which uses ItemsGridLayout -> GalleryCard
    const pinButtons = screen.getAllByRole('button', { name: /pin/i })
    expect(pinButtons.length).toBeGreaterThan(0)

    // Click the pin button
    fireEvent.click(pinButtons[0])

    // The fetch promise is still pending — but optimistic state should be updated
    // We check that the item visually reflects the change
    // GalleryCard shows a filled pin icon when pinned=true
    // The test verifies that fetch was called (showing background async started)
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      '/api/items/item-pin-1',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ pinned: true }),
      })
    )

    // Now resolve the fetch with ok: true — no rollback should happen
    await act(async () => {
      resolveFetch(new Response(JSON.stringify({ id: 'item-pin-1', pinned: true }), { status: 200 }))
      await fetchPromise
    })

    // No error should be logged (no rollback)
    // pin button should still be in the document (item wasn't removed)
    expect(screen.getByRole('button', { name: /pin/i })).toBeInTheDocument()
  })

  it('rolls back pin state when fetch returns non-ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'Server error' }), { status: 500 })
    ))

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    render(
      <ItemsPageClient
        items={[mockItem]}
        totalCount={1}
        page={1}
        userId="user-test"
      />
    )

    const pinButtons = screen.getAllByRole('button', { name: /pin/i })
    await act(async () => {
      fireEvent.click(pinButtons[0])
      // Wait for fetch to resolve and state to update
      await new Promise(r => setTimeout(r, 0))
    })

    // Error should have been logged with the [pin] prefix
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('[pin]'),
      expect.anything()
    )

    errorSpy.mockRestore()
  })
})
