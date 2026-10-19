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
  exitSelectMode: ReturnType<typeof vi.fn>
}
vi.mock('@/components/items/BulkSelectProvider', () => ({
  useBulkSelect: () => bulkState,
}))

beforeEach(() => {
  bulkState = {
    isBulkMode: false,
    selectedIds: new Set(),
    exitSelectMode: vi.fn(),
  }
})

describe('EnvelopeTray (DRO-194, restyled DRO-227)', () => {
  it('renders nothing when not in pick mode', () => {
    render(<EnvelopeTray />)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('shows the slot count and an enabled "Make a plan" action within the 2-8 cap', () => {
    bulkState = {
      isBulkMode: true,
      selectedIds: new Set(['a', 'b', 'c']),
      exitSelectMode: vi.fn(),
    }
    render(<EnvelopeTray />)
    expect(screen.getByText('3 of 2–8 · tap cards to add')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Make a plan/ })).toBeEnabled()
  })

  it('disables "Make a plan" and explains the cap when under the minimum', () => {
    bulkState = {
      isBulkMode: true,
      selectedIds: new Set(['a']),
      exitSelectMode: vi.fn(),
    }
    render(<EnvelopeTray />)
    expect(screen.getByRole('button', { name: /Make a plan/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Make a plan/ })).toHaveAttribute(
      'title',
      'Select at least 2 items.',
    )
  })

  it('disables "Make a plan" and explains the cap when over the maximum', () => {
    bulkState = {
      isBulkMode: true,
      selectedIds: new Set(Array.from({ length: 9 }, (_, i) => `item-${i}`)),
      exitSelectMode: vi.fn(),
    }
    render(<EnvelopeTray />)
    expect(screen.getByRole('button', { name: /Make a plan/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Make a plan/ })).toHaveAttribute('title', 'Select up to 8 items.')
    expect(screen.getByText('9 of 2–8 · remove 1')).toBeInTheDocument()
  })

  it('exits pick mode entirely when the cancel button is clicked', () => {
    const exitSelectMode = vi.fn()
    bulkState = {
      isBulkMode: true,
      selectedIds: new Set(['a', 'b']),
      exitSelectMode,
    }
    render(<EnvelopeTray />)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel picking' }))
    expect(exitSelectMode).toHaveBeenCalled()
  })
})
