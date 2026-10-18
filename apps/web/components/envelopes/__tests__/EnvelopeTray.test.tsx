/** @vitest-environment jsdom */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { EnvelopeTray } from '../EnvelopeTray'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

let bulkState: {
  isBulkMode: boolean
  selectedIds: Set<string>
  deselectAll: ReturnType<typeof vi.fn>
}
vi.mock('@/components/items/BulkSelectProvider', () => ({
  useBulkSelect: () => bulkState,
}))

beforeEach(() => {
  bulkState = {
    isBulkMode: false,
    selectedIds: new Set(),
    deselectAll: vi.fn(),
  }
})

describe('EnvelopeTray (DRO-194)', () => {
  it('renders nothing when nothing is selected', () => {
    render(<EnvelopeTray />)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('shows the count and an enabled "Make a plan" action within the 2-8 cap', () => {
    bulkState = {
      isBulkMode: true,
      selectedIds: new Set(['a', 'b', 'c']),
      deselectAll: vi.fn(),
    }
    render(<EnvelopeTray />)
    expect(screen.getByText('3 items selected')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Make a plan/ })).toBeEnabled()
  })

  it('disables "Make a plan" and explains the cap when under the minimum', () => {
    bulkState = {
      isBulkMode: true,
      selectedIds: new Set(['a']),
      deselectAll: vi.fn(),
    }
    render(<EnvelopeTray />)
    expect(screen.getByRole('button', { name: /Make a plan/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Make a plan/ })).toHaveAttribute(
      'title',
      'Select at least 2 items to make a plan.',
    )
  })

  it('disables "Make a plan" and explains the cap when over the maximum', () => {
    bulkState = {
      isBulkMode: true,
      selectedIds: new Set(Array.from({ length: 9 }, (_, i) => `item-${i}`)),
      deselectAll: vi.fn(),
    }
    render(<EnvelopeTray />)
    expect(screen.getByRole('button', { name: /Make a plan/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Make a plan/ })).toHaveAttribute(
      'title',
      'Select up to 8 items to make a plan.',
    )
  })

  it('clears the selection when the clear button is clicked', () => {
    const deselectAll = vi.fn()
    bulkState = {
      isBulkMode: true,
      selectedIds: new Set(['a', 'b']),
      deselectAll,
    }
    render(<EnvelopeTray />)
    fireEvent.click(screen.getByRole('button', { name: 'Clear selection' }))
    expect(deselectAll).toHaveBeenCalled()
  })
})
