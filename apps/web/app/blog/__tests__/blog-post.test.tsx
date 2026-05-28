/** @vitest-environment jsdom */

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import BlogPostPage from '../open-source-omnivore-alternative/page'
import sitemap from '../../sitemap'

describe('Blog post page — open-source-omnivore-alternative', () => {
  it('renders h1 with the expected heading text', () => {
    render(<BlogPostPage />)
    expect(
      screen.getByRole('heading', { level: 1, name: /The Best Open-Source Omnivore Alternative in 2026/i }),
    ).toBeInTheDocument()
  })

  it('contains the word "Omnivore" in the page', () => {
    render(<BlogPostPage />)
    const matches = screen.getAllByText(/Omnivore/i)
    expect(matches.length).toBeGreaterThan(0)
  })

  it('contains a link to /login', () => {
    render(<BlogPostPage />)
    const loginLink = screen.getByRole('link', { name: /try drop-note free/i })
    expect(loginLink).toHaveAttribute('href', '/login')
  })

  it('contains a link to the GitHub repo', () => {
    render(<BlogPostPage />)
    const githubLink = screen.getByRole('link', { name: /self-host it/i })
    expect(githubLink).toHaveAttribute('href', 'https://github.com/lego651/drop-note')
  })
})

describe('Sitemap', () => {
  it('includes the blog post URL', () => {
    const entries = sitemap()
    const urls = entries.map((e) => e.url)
    expect(urls.some((u) => u.includes('/blog/open-source-omnivore-alternative'))).toBe(true)
  })
})
