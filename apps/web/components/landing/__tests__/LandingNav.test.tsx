/** @vitest-environment jsdom */

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LandingNav } from '../LandingNav'

describe('LandingNav', () => {
  it('renders the drop-note wordmark', () => {
    render(<LandingNav />)
    expect(screen.getByText('drop-note')).toBeInTheDocument()
  })

  it('renders Blog link pointing to the blog post', () => {
    render(<LandingNav />)
    const blogLink = screen.getByRole('link', { name: /blog/i })
    expect(blogLink).toHaveAttribute('href', '/blog/open-source-omnivore-alternative')
  })

  it('renders GitHub link pointing to the repo', () => {
    render(<LandingNav />)
    const githubLink = screen.getByRole('link', { name: /github/i })
    expect(githubLink).toHaveAttribute('href', 'https://github.com/lego651/drop-note')
  })

  it('renders Get started free button linking to /login', () => {
    render(<LandingNav />)
    const ctaLink = screen.getByRole('link', { name: /get started free/i })
    expect(ctaLink).toHaveAttribute('href', '/login')
  })
})
