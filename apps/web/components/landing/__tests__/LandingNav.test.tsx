/** @vitest-environment jsdom */

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LandingNav } from '../LandingNav'

describe('LandingNav', () => {
  it('renders the drop-note wordmark', () => {
    render(<LandingNav />)
    expect(screen.getByText('drop-note')).toBeInTheDocument()
  })

  it('renders Roadmap link', () => {
    render(<LandingNav />)
    const roadmapLink = screen.getByRole('link', { name: /roadmap/i })
    expect(roadmapLink).toHaveAttribute('href', '/roadmap')
  })

  it('does NOT render a GitHub link', () => {
    render(<LandingNav />)
    expect(screen.queryByRole('link', { name: /github/i })).toBeNull()
  })

  it('renders Get started free button linking to /login', () => {
    render(<LandingNav />)
    const ctaLink = screen.getByRole('link', { name: /get started free/i })
    expect(ctaLink).toHaveAttribute('href', '/login')
  })
})
