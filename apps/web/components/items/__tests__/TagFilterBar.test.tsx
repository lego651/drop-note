/** @vitest-environment jsdom */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TagFilterBar } from '@/components/items/TagFilterBar'

// Mock next/navigation
const mockPush = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => new URLSearchParams(),
}))

const tags = [
  { id: 'tag-1', name: 'ai', count: 38 },
  { id: 'tag-2', name: 'research', count: 31 },
  { id: 'tag-3', name: 'tools', count: 27 },
]

describe('TagFilterBar', () => {
  it('renders the All pill with total count', () => {
    render(<TagFilterBar tags={tags} totalCount={247} />)
    expect(screen.getByText(/All/)).toBeInTheDocument()
    expect(screen.getByText('247')).toBeInTheDocument()
  })

  it('renders a pill for each tag', () => {
    render(<TagFilterBar tags={tags} totalCount={247} />)
    expect(screen.getByText(/ai/)).toBeInTheDocument()
    expect(screen.getByText(/research/)).toBeInTheDocument()
    expect(screen.getByText(/tools/)).toBeInTheDocument()
  })

  it('renders tag counts', () => {
    render(<TagFilterBar tags={tags} totalCount={247} />)
    expect(screen.getByText('38')).toBeInTheDocument()
    expect(screen.getByText('31')).toBeInTheDocument()
  })

  it('All pill has active styling when no activeTagId', () => {
    render(<TagFilterBar tags={tags} totalCount={247} />)
    const allBtn = screen.getByText(/All/).closest('button')
    expect(allBtn?.className).toContain('bg-foreground')
  })

  it('tag pill has active styling when activeTagId matches', () => {
    render(<TagFilterBar tags={tags} totalCount={247} activeTagId="tag-1" />)
    const aiBtn = screen.getByText(/ai/).closest('button')
    expect(aiBtn?.className).toContain('bg-foreground')
  })

  it('All pill does NOT have active styling when a tag is active', () => {
    render(<TagFilterBar tags={tags} totalCount={247} activeTagId="tag-1" />)
    const allBtn = screen.getByText(/All/).closest('button')
    expect(allBtn?.className).not.toContain('bg-foreground')
  })

  it('clicking a tag calls router.push with ?tag= param', () => {
    render(<TagFilterBar tags={tags} totalCount={247} />)
    fireEvent.click(screen.getByText(/research/).closest('button')!)
    expect(mockPush).toHaveBeenCalledWith('/items?tag=tag-2')
  })

  it('clicking All calls router.push with no tag param', () => {
    render(<TagFilterBar tags={tags} totalCount={247} activeTagId="tag-1" />)
    fireEvent.click(screen.getByText(/All/).closest('button')!)
    expect(mockPush).toHaveBeenCalledWith('/items')
  })

  it('clicking the active tag again clears the filter', () => {
    render(<TagFilterBar tags={tags} totalCount={247} activeTagId="tag-2" />)
    fireEvent.click(screen.getByText(/research/).closest('button')!)
    expect(mockPush).toHaveBeenCalledWith('/items')
  })
})
