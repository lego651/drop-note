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
  it('renders the Filters trigger button', () => {
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
    render(<FiltersButton activeSource="youtube" />)
    fireEvent.click(screen.getByRole('button', { name: /Filters/i }))
    fireEvent.click(screen.getByText('All sources'))
    expect(mockPush).toHaveBeenCalledWith('/items')
  })
})
