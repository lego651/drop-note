/** @vitest-environment jsdom */

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import PricingPage from '../page'

// PricingPage is a static Server Component with no props (D1: Stripe tiers killed)

describe('PricingPage — D1 compliance (free-only)', () => {
  it('renders the free tier heading', () => {
    render(<PricingPage />)
    expect(screen.getByRole('heading', { name: /^free$/i })).toBeInTheDocument()
  })

  it('does NOT render the $9.99 Pro tier', () => {
    render(<PricingPage />)
    expect(screen.queryByText(/\$9\.99/)).toBeNull()
  })

  it('does NOT render the $49.99 Power tier', () => {
    render(<PricingPage />)
    expect(screen.queryByText(/\$49\.99/)).toBeNull()
  })

  it('does NOT show "Pro" as a tier heading', () => {
    render(<PricingPage />)
    expect(screen.queryByRole('heading', { name: /^pro$/i })).toBeNull()
  })

  it('does NOT show "Power" as a tier heading', () => {
    render(<PricingPage />)
    expect(screen.queryByRole('heading', { name: /^power$/i })).toBeNull()
  })

  it('renders a GitHub self-host link', () => {
    render(<PricingPage />)
    const githubLink = screen.getByRole('link', { name: /view on github/i })
    expect(githubLink).toHaveAttribute('href', 'https://github.com/lego651/drop-note')
  })

  it('renders a "Get started free" CTA', () => {
    render(<PricingPage />)
    expect(screen.getByRole('link', { name: /get started free/i })).toBeInTheDocument()
  })
})
