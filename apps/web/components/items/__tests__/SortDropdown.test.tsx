/** @vitest-environment jsdom */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SortDropdown } from '@/components/items/SortDropdown'

const mockPush = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => new URLSearchParams(),
}))

describe('SortDropdown', () => {
  it('renders a button showing the active sort label', () => {
    render(<SortDropdown activeSort="newest" />)
    expect(screen.getByRole('button', { name: /Newest/i })).toBeInTheDocument()
  })

  it('shows "Oldest" label when activeSort is oldest', () => {
    render(<SortDropdown activeSort="oldest" />)
    expect(screen.getByRole('button', { name: /Oldest/i })).toBeInTheDocument()
  })

  it('shows "Pinned first" label when activeSort is pinned', () => {
    render(<SortDropdown activeSort="pinned" />)
    expect(screen.getByRole('button', { name: /Pinned first/i })).toBeInTheDocument()
  })

  it('opens dropdown and shows all 3 sort options', () => {
    render(<SortDropdown activeSort="newest" />)
    fireEvent.click(screen.getByRole('button', { name: /Newest/i }))
    expect(screen.getAllByText('Newest').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Oldest')).toBeInTheDocument()
    expect(screen.getByText('Pinned first')).toBeInTheDocument()
  })

  it('clicking Oldest calls router.push with ?sort=oldest', () => {
    render(<SortDropdown activeSort="newest" />)
    fireEvent.click(screen.getByRole('button', { name: /Newest/i }))
    fireEvent.click(screen.getByText('Oldest'))
    expect(mockPush).toHaveBeenCalledWith('/items?sort=oldest')
  })

  it('clicking Newest removes the sort param (clean URL)', () => {
    render(<SortDropdown activeSort="oldest" />)
    fireEvent.click(screen.getByRole('button', { name: /Oldest/i }))
    fireEvent.click(screen.getAllByText('Newest')[0])
    expect(mockPush).toHaveBeenCalledWith('/items')
  })
})
