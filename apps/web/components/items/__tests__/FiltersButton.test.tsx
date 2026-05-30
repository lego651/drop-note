/** @vitest-environment jsdom */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FiltersButton } from '@/components/items/FiltersButton'

const mockPush = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => new URLSearchParams(),
}))

describe('FiltersButton', () => {
  it('renders the Filters trigger button when no filter active', () => {
    render(<FiltersButton activeSource="all" />)
    expect(screen.getByRole('button', { name: /Filters/i })).toBeInTheDocument()
  })

  it('opens the popover and shows all source options', () => {
    render(<FiltersButton activeSource="all" />)
    fireEvent.click(screen.getByRole('button', { name: /Filters/i }))
    expect(screen.getByText('All sources')).toBeInTheDocument()
    expect(screen.getByText('Email')).toBeInTheDocument()
    expect(screen.getByText('Articles & links')).toBeInTheDocument()
    expect(screen.getByText('Videos')).toBeInTheDocument()
  })

  it('selecting Videos pushes ?source=youtube', () => {
    render(<FiltersButton activeSource="all" />)
    fireEvent.click(screen.getByRole('button', { name: /Filters/i }))
    fireEvent.click(screen.getByText('Videos'))
    expect(mockPush).toHaveBeenCalledWith('/items?source=youtube')
  })

  it('selecting All sources removes the source param (clean URL)', () => {
    // When activeSource="youtube", button label is now "Videos" (Fix 4a)
    render(<FiltersButton activeSource="youtube" />)
    // Click the trigger button — now shows "Videos"
    fireEvent.click(screen.getByRole('button', { name: /Videos/i }))
    fireEvent.click(screen.getByText('All sources'))
    expect(mockPush).toHaveBeenCalledWith('/items')
  })

  // Fix 4a: active state tests
  it('shows source label (not "Filters") when a source filter is active', () => {
    render(<FiltersButton activeSource="youtube" />)
    // The trigger button text should be "Videos", not "Filters"
    expect(screen.getByRole('button', { name: /Videos/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Filters$/i })).not.toBeInTheDocument()
  })

  it('shows "Email" label when email filter is active', () => {
    render(<FiltersButton activeSource="email" />)
    expect(screen.getByRole('button', { name: /Email/i })).toBeInTheDocument()
  })

  it('trigger button has bg-foreground class when a filter is active', () => {
    render(<FiltersButton activeSource="youtube" />)
    const btn = screen.getByRole('button', { name: /Videos/i })
    expect(btn.className).toContain('bg-foreground')
  })

  it('trigger button does NOT have bg-foreground class when no filter active', () => {
    render(<FiltersButton activeSource="all" />)
    const btn = screen.getByRole('button', { name: /Filters/i })
    expect(btn.className).not.toContain('bg-foreground')
  })
})
