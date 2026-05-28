/** @vitest-environment jsdom */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

// Mock Next.js Link
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

import RoadmapPage from '../roadmap/page'

describe('RoadmapPage', () => {
  it('renders the page heading', () => {
    render(<RoadmapPage />)
    expect(screen.getByRole('heading', { name: /roadmap/i, level: 1 })).toBeInTheDocument()
  })

  it('renders "Shipped" section', () => {
    render(<RoadmapPage />)
    expect(screen.getByRole('heading', { name: /shipped/i })).toBeInTheDocument()
  })

  it('renders "Coming next" section', () => {
    render(<RoadmapPage />)
    expect(screen.getByRole('heading', { name: /coming next/i })).toBeInTheDocument()
  })

  it('renders "Intentionally deferred" section', () => {
    render(<RoadmapPage />)
    expect(screen.getByRole('heading', { name: /intentionally deferred/i })).toBeInTheDocument()
  })

  it('renders the Back to drop-note link', () => {
    render(<RoadmapPage />)
    expect(screen.getByRole('link', { name: /back to drop-note/i })).toBeInTheDocument()
  })

  it('renders Get started free link', () => {
    render(<RoadmapPage />)
    expect(screen.getByRole('link', { name: /get started free/i })).toBeInTheDocument()
  })
})
