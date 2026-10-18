/** @vitest-environment jsdom */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DashboardMain } from '../DashboardMain'

let isBulkMode = false
vi.mock('@/components/items/BulkSelectProvider', () => ({
  useBulkSelect: () => ({ isBulkMode }),
}))

describe('DashboardMain (DRO-194/DRO-205)', () => {
  it('reserves bottom space for the EnvelopeTray when a selection is active', () => {
    isBulkMode = true
    render(
      <DashboardMain isOverCap={false} itemCount={0} tier="free">
        <div>content</div>
      </DashboardMain>,
    )
    expect(screen.getByText('content').closest('main')).toHaveClass('pb-28', 'sm:pb-20')
  })

  it('does not add bottom padding when nothing is selected', () => {
    isBulkMode = false
    render(
      <DashboardMain isOverCap={false} itemCount={0} tier="free">
        <div>content</div>
      </DashboardMain>,
    )
    const main = screen.getByText('content').closest('main')
    expect(main).not.toHaveClass('pb-28')
    expect(main).not.toHaveClass('sm:pb-20')
  })
})
