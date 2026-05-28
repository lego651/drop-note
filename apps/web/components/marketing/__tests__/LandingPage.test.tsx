/** @vitest-environment jsdom */

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LandingPage } from '../LandingPage'

describe('LandingPage', () => {
  it('renders the hero heading with Omnivore positioning', () => {
    render(<LandingPage />)
    expect(
      screen.getByRole('heading', { level: 1, name: /open-source omnivore alternative/i }),
    ).toBeInTheDocument()
  })

  it('renders "Get started free" link pointing to /login', () => {
    render(<LandingPage />)
    const links = screen.getAllByRole('link', { name: /get started free/i })
    expect(links.length).toBeGreaterThan(0)
    expect(links[0]).toHaveAttribute('href', '/login')
  })

  it('renders a GitHub link pointing to the repo', () => {
    render(<LandingPage />)
    const githubLinks = screen.getAllByRole('link', {
      name: /self-host on github|view on github/i,
    })
    expect(githubLinks.length).toBeGreaterThan(0)
    expect(githubLinks[0]).toHaveAttribute('href', 'https://github.com/lego651/drop-note')
  })

  it('renders the 3-step how-it-works section', () => {
    render(<LandingPage />)
    expect(screen.getByText(/email it/i)).toBeInTheDocument()
    expect(screen.getByText(/ai processes it/i)).toBeInTheDocument()
    expect(screen.getByText(/find it later/i)).toBeInTheDocument()
  })

  it('renders the drop address', () => {
    render(<LandingPage />)
    const matches = screen.getAllByText(/drop@dropnote\.me/i)
    expect(matches.length).toBeGreaterThan(0)
  })

  it('renders the AGPL self-host callout', () => {
    render(<LandingPage />)
    const agplMatches = screen.getAllByText(/agpl/i)
    expect(agplMatches.length).toBeGreaterThan(0)
    const selfHostMatches = screen.getAllByText(/self-hostable|self-host/i)
    expect(selfHostMatches.length).toBeGreaterThan(0)
  })

  it('renders footer with terms, privacy, and aup links', () => {
    render(<LandingPage />)
    expect(screen.getByRole('link', { name: /terms/i })).toHaveAttribute('href', '/terms')
    expect(screen.getByRole('link', { name: /privacy/i })).toHaveAttribute('href', '/privacy')
  })

  it('renders blog link in the nav', () => {
    render(<LandingPage />)
    const blogLinks = screen.getAllByRole('link', { name: /blog/i })
    expect(blogLinks.length).toBeGreaterThan(0)
    expect(blogLinks[0]).toHaveAttribute(
      'href',
      '/blog/open-source-omnivore-alternative',
    )
  })
})
