/** @vitest-environment jsdom */

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LandingPage } from '../LandingPage'

describe('LandingPage', () => {
  it('renders the hero heading with save anything text', () => {
    render(<LandingPage />)
    // The h1 contains "Save anything" — the serif span wraps "from anywhere."
    const heading = screen.getByRole('heading', { level: 1 })
    expect(heading.textContent).toMatch(/save anything/i)
    expect(heading.textContent).toMatch(/from anywhere/i)
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
      name: /self-host on github|view on github|github/i,
    })
    expect(githubLinks.length).toBeGreaterThan(0)
    const repoLink = githubLinks.find(
      (l) => l.getAttribute('href') === 'https://github.com/lego651/drop-note',
    )
    expect(repoLink).toBeDefined()
  })

  it('renders the 3-step how-it-works section', () => {
    render(<LandingPage />)
    // Use getAllByText since "Email it" heading may match feature body text as well
    expect(screen.getAllByText(/^email it$/i).length).toBeGreaterThan(0)
    expect(screen.getByText('AI processes it')).toBeInTheDocument()
    expect(screen.getByText('Find it later')).toBeInTheDocument()
  })

  it('renders the drop address', () => {
    render(<LandingPage />)
    const matches = screen.getAllByText(/drop@dropnote\.me/i)
    expect(matches.length).toBeGreaterThan(0)
  })

  it('renders the 6 feature cards', () => {
    render(<LandingPage />)
    expect(screen.getByText('AI summaries')).toBeInTheDocument()
    expect(screen.getByText('Auto-tagging')).toBeInTheDocument()
    expect(screen.getByText('Full-text search')).toBeInTheDocument()
    expect(screen.getByText('Browse by date')).toBeInTheDocument()
    expect(screen.getByText('Any content type')).toBeInTheDocument()
    expect(screen.getByText('Self-host option')).toBeInTheDocument()
  })

  it('renders testimonials with all three names', () => {
    render(<LandingPage />)
    expect(screen.getByText('Jordan Reeves')).toBeInTheDocument()
    expect(screen.getByText('Priya Nair')).toBeInTheDocument()
    expect(screen.getByText('Marcus Calloway')).toBeInTheDocument()
  })

  it('renders footer with terms and privacy links', () => {
    render(<LandingPage />)
    expect(screen.getByRole('link', { name: /terms/i })).toHaveAttribute('href', '/terms')
    expect(screen.getByRole('link', { name: /privacy/i })).toHaveAttribute('href', '/privacy')
  })

  it('renders blog link in the nav', () => {
    render(<LandingPage />)
    const blogLinks = screen.getAllByRole('link', { name: /blog/i })
    expect(blogLinks.length).toBeGreaterThan(0)
    expect(blogLinks[0]).toHaveAttribute('href', '/blog/open-source-omnivore-alternative')
  })

  it('renders the HOW IT WORKS and FEATURES section pills', () => {
    render(<LandingPage />)
    expect(screen.getByText('HOW IT WORKS')).toBeInTheDocument()
    expect(screen.getByText('FEATURES')).toBeInTheDocument()
  })

  it('renders the FROM USERS testimonials section', () => {
    render(<LandingPage />)
    expect(screen.getByText('FROM USERS')).toBeInTheDocument()
  })

  it('renders the roadmap link in the footer', () => {
    render(<LandingPage />)
    const roadmapLink = screen.getByRole('link', { name: /roadmap/i })
    expect(roadmapLink).toHaveAttribute('href', '/roadmap')
  })
})
