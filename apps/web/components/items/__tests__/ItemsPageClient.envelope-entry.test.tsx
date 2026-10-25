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
  it('shows the full banner with a single Make a plan CTA and no competing floating FAB on a fresh page', () => {
    renderPage()
    expect(screen.getByText('Turn saves into a plan')).toBeInTheDocument()
    // Only the banner's own CTA exists while its full card occupies the
    // viewport — the floating FAB stays hidden so there's never two.
    expect(screen.getAllByRole('button', { name: /^Make a plan$/ })).toHaveLength(1)
  })

  // DRO-318: the full card's primary button was still calling the old manual
  // pick flow, leaving no visible way to open the Mood Sheet at the top of
  // /items (the FAB that opens it stays hidden while the full card is in view).
  it('clicking the full banner\'s Make a plan CTA opens the Mood Sheet (DRO-318)', () => {
    renderPage()

    fireEvent.click(screen.getByRole('button', { name: /^Make a plan$/ }))

    expect(screen.getByRole('heading', { name: 'What do you feel like?' })).toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('clicking the stripped banner also opens the Mood Sheet (DRO-318)', () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }))

    fireEvent.click(screen.getByRole('button', { name: /Turn saves into a plan/ }))

    expect(screen.getByRole('heading', { name: 'What do you feel like?' })).toBeInTheDocument()
  })

  it('shows the floating FAB once the banner is dismissed to its strip', () => {
    renderPage()

    fireEvent.click(screen.getByRole('button', { name: 'Not now' }))

    expect(screen.getByRole('button', { name: /^Make a plan$/ })).toBeInTheDocument()
  })

  // DRO-301: the FAB's primary tap target now opens the Mood Sheet instead of
  // entering item-selection directly — "Pick them myself" inside the sheet is
  // the new path to the old behavior (see MoodSheet tests for that flow).
  it('clicking the floating FAB opens the Mood Sheet instead of entering pick mode directly', () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }))

    fireEvent.click(screen.getByRole('button', { name: /^Make a plan$/ }))

    expect(screen.getByRole('heading', { name: 'What do you feel like?' })).toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('"Pick them myself" inside the Mood Sheet enters pick mode the same way the old FAB did', () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }))
    fireEvent.click(screen.getByRole('button', { name: /^Make a plan$/ }))

    fireEvent.click(screen.getByRole('button', { name: 'Pick them myself' }))

    expect(screen.getAllByRole('checkbox').length).toBeGreaterThan(0)
    expect(screen.queryByRole('heading', { name: 'What do you feel like?' })).not.toBeInTheDocument()
    expect(screen.getByText('0 of 2–8 · tap cards to add')).toBeInTheDocument()
  })

  it('entering pick mode via "Edit items" also shrinks the banner to its step bar', () => {
    renderPage()

    fireEvent.click(screen.getByRole('button', { name: 'Edit items' }))

    expect(screen.getByText('Step 1 of 2')).toBeInTheDocument()
    expect(screen.getByText('0 picked')).toBeInTheDocument()
    expect(screen.queryByText('Turn saves into a plan')).not.toBeInTheDocument()
  })

  // DRO-244: the FAB and tray are fixed bottom-right and must not cover the
  // last card — the scroll container needs bottom padding that also clears
  // the home-indicator safe area, not just the element's own height.
  it('reserves safe-area-aware bottom padding while the floating FAB is shown', () => {
    const { container } = renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }))

    const scrollPad = container.querySelector('.mx-auto.max-w-6xl')
    expect(scrollPad?.className).toContain('safe-area-inset-bottom')
  })

  it('reserves taller safe-area-aware bottom padding while the pick-mode tray is shown', () => {
    const { container } = renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Edit items' }))

    const scrollPad = container.querySelector('.mx-auto.max-w-6xl')
    expect(scrollPad?.className).toContain('safe-area-inset-bottom')
    // Narrow phones stack the tray's hint and button onto two lines, so they
    // need more clearance than the single-row layout used above 390px.
    expect(scrollPad?.className).toContain('220px')
  })
})
