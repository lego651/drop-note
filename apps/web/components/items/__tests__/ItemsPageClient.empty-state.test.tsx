/** @vitest-environment jsdom */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'

// Mock Next.js navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
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

// Mock clipboard
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

  // Ensure welcomed key is set so WelcomeModal doesn't render on top
  localStorage.setItem('drop-note:welcomed', 'true')
})

import { ItemsPageClient } from '../ItemsPageClient'
import { BulkSelectProvider } from '../BulkSelectProvider'

const defaultProps = {
  items: [],
  totalCount: 0,
  page: 1,
  initialQuery: '',
  userTier: 'free' as const,
  userId: 'user-123',
}

const mockItem = {
  id: 'item-1',
  subject: 'Test subject',
  sender_email: 'sender@example.com',
  ai_summary: 'A test summary',
  status: 'done',
  error_message: null,
  pinned: false,
  created_at: '2026-05-28T00:00:00Z',
  source_type: 'email' as const,
  source_url: null,
  thumbnail_url: null,
  item_tags: [],
}

describe('ItemsPageClient empty state', () => {
  it('shows the drop address when items list is empty', () => {
    render(<BulkSelectProvider><ItemsPageClient {...defaultProps} /></BulkSelectProvider>)
    expect(screen.getByDisplayValue('drop@dropnote.me')).toBeInTheDocument()
  })

  it('shows the 3-step pill labels when items list is empty', () => {
    render(<BulkSelectProvider><ItemsPageClient {...defaultProps} /></BulkSelectProvider>)
    expect(screen.getByText('Send it')).toBeInTheDocument()
    expect(screen.getByText('AI tags it')).toBeInTheDocument()
    expect(screen.getByText('Find it here')).toBeInTheDocument()
  })
})

describe('ItemsPageClient with items', () => {
  it('does NOT show empty state when items exist', () => {
    render(<BulkSelectProvider><ItemsPageClient {...defaultProps} items={[mockItem]} totalCount={1} /></BulkSelectProvider>)
    expect(screen.queryByDisplayValue('drop@dropnote.me')).not.toBeInTheDocument()
    expect(screen.queryByText('Send it')).not.toBeInTheDocument()
  })

  it('renders the search input regardless of items state', () => {
    render(<BulkSelectProvider><ItemsPageClient {...defaultProps} items={[mockItem]} totalCount={1} /></BulkSelectProvider>)
    // input[type="search"] has role searchbox in ARIA
    expect(screen.getByRole('searchbox', { name: /search items/i })).toBeInTheDocument()
  })
})
