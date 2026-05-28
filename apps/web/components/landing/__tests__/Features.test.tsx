/** @vitest-environment jsdom */

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Features } from '../Features'

describe('Features', () => {
  it('renders the FEATURES pill', () => {
    render(<Features />)
    expect(screen.getByText('FEATURES')).toBeInTheDocument()
  })

  it('renders AI summaries card', () => {
    render(<Features />)
    expect(screen.getByText('AI summaries')).toBeInTheDocument()
  })

  it('renders Auto-tagging card', () => {
    render(<Features />)
    expect(screen.getByText('Auto-tagging')).toBeInTheDocument()
  })

  it('renders Full-text search card', () => {
    render(<Features />)
    expect(screen.getByText('Full-text search')).toBeInTheDocument()
  })

  it('renders Browse by date card', () => {
    render(<Features />)
    expect(screen.getByText('Browse by date')).toBeInTheDocument()
  })

  it('renders Any content type card', () => {
    render(<Features />)
    expect(screen.getByText('Any content type')).toBeInTheDocument()
  })

  it('renders Self-host option card', () => {
    render(<Features />)
    expect(screen.getByText('Self-host option')).toBeInTheDocument()
  })
})
