/** @vitest-environment jsdom */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SiteFooter } from '../SiteFooter'

let mockPathname = '/'

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
}))

vi.mock('next/link', () => ({
  default: function MockLink({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode
    href: string
    [key: string]: unknown
  }) {
    return (
      <a href={href} {...props}>
        {children}
      </a>
    )
  },
}))

// DRO-245 — the dashboard app shell owns the full viewport and scrolls
// internally; rendering this footer underneath it created a second,
// page-level scroll that revealed the footer below the shell on mobile.
describe('SiteFooter', () => {
  it('renders on marketing routes', () => {
    mockPathname = '/roadmap'
    render(<SiteFooter />)
    expect(screen.getByRole('link', { name: 'Roadmap' })).toBeInTheDocument()
  })

  it('renders on the landing page', () => {
    mockPathname = '/'
    render(<SiteFooter />)
    expect(screen.getByRole('link', { name: 'Privacy Policy' })).toBeInTheDocument()
  })

  it.each(['/dashboard', '/items', '/items/abc-123', '/settings', '/archive', '/trash', '/envelopes', '/admin'])(
    'does not render on the %s app-shell route',
    (pathname) => {
      mockPathname = pathname
      render(<SiteFooter />)
      expect(screen.queryByRole('link', { name: 'Roadmap' })).not.toBeInTheDocument()
    },
  )

  it('does not false-positive match a route that merely starts with an app-shell prefix', () => {
    mockPathname = '/items-export'
    render(<SiteFooter />)
    expect(screen.getByRole('link', { name: 'Roadmap' })).toBeInTheDocument()
  })
})
