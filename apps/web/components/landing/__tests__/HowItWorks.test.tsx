/** @vitest-environment jsdom */

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { HowItWorks } from '../HowItWorks'

describe('HowItWorks', () => {
  it('renders the section heading', () => {
    render(<HowItWorks />)
    expect(screen.getByText(/three steps/i)).toBeInTheDocument()
  })

  it('renders step 01 — Email it', () => {
    render(<HowItWorks />)
    expect(screen.getByText('Email it')).toBeInTheDocument()
    expect(screen.getByText('01')).toBeInTheDocument()
  })

  it('renders step 02 — AI processes it', () => {
    render(<HowItWorks />)
    expect(screen.getByText('AI processes it')).toBeInTheDocument()
    expect(screen.getByText('02')).toBeInTheDocument()
  })

  it('renders step 03 — Find it later', () => {
    render(<HowItWorks />)
    expect(screen.getByText('Find it later')).toBeInTheDocument()
    expect(screen.getByText('03')).toBeInTheDocument()
  })

  it('renders the HOW IT WORKS pill', () => {
    render(<HowItWorks />)
    expect(screen.getByText('HOW IT WORKS')).toBeInTheDocument()
  })
})
