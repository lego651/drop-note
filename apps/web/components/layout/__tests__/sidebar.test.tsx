/** @vitest-environment jsdom */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SidebarNav } from '../sidebar'

let mockPathname = '/items'

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
}))

describe('SidebarNav — Envelopes nav item (DRO-223)', () => {
  it('renders an Envelopes link to /envelopes with the given count', () => {
    mockPathname = '/items'
    render(<SidebarNav userEmail="a@b.com" envelopeCount={4} />)

    const link = screen.getByRole('link', { name: /Envelopes/ })
    expect(link).toHaveAttribute('href', '/envelopes')
    expect(screen.getByText('4')).toBeInTheDocument()
  })

  it('hides the count pill when there are no envelopes', () => {
    mockPathname = '/items'
    render(<SidebarNav userEmail="a@b.com" envelopeCount={0} />)

    const link = screen.getByRole('link', { name: /Envelopes/ })
    expect(link.textContent).not.toMatch(/\d/)
  })

  it('is marked active on /envelopes', () => {
    mockPathname = '/envelopes'
    render(<SidebarNav userEmail="a@b.com" envelopeCount={1} />)

    const link = screen.getByRole('link', { name: /Envelopes/ })
    expect(link.className).toMatch(/border-ink/)
  })

  it('is marked active on an envelope detail page (/envelopes/[id])', () => {
    mockPathname = '/envelopes/env-123'
    render(<SidebarNav userEmail="a@b.com" envelopeCount={1} />)

    const link = screen.getByRole('link', { name: /Envelopes/ })
    expect(link.className).toMatch(/border-ink/)
  })

  it('is not marked active on other routes', () => {
    mockPathname = '/archive'
    render(<SidebarNav userEmail="a@b.com" envelopeCount={1} />)

    const link = screen.getByRole('link', { name: /Envelopes/ })
    expect(link.className).not.toMatch(/border-ink/)
  })
})
