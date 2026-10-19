/** @vitest-environment jsdom */

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DashboardMain } from '../DashboardMain'

// Reserving room below the floating envelopes FAB/tray (DRO-194/DRO-227) is
// now handled locally by ItemsPageClient (the only page that renders them),
// not here — see ItemsPageClient.test.tsx.
describe('DashboardMain', () => {
  it('renders children in the scrollable main region', () => {
    render(
      <DashboardMain isOverCap={false} itemCount={0} tier="free">
        <div>content</div>
      </DashboardMain>,
    )
    expect(screen.getByText('content').closest('main')).toBeInTheDocument()
  })

  it('shows the over-cap banner when isOverCap is true', () => {
    render(
      <DashboardMain isOverCap itemCount={500} tier="free">
        <div>content</div>
      </DashboardMain>,
    )
    expect(screen.getByText('content').closest('main')).toBeInTheDocument()
  })
})
