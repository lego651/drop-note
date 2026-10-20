/** @vitest-environment jsdom */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ViewSwitcher } from '../ViewSwitcher'

// DRO-247: each view button was 36x30 on mobile — needs a 44px tap target
// below sm, while staying the original compact size at sm+.
describe('ViewSwitcher tap targets (DRO-247)', () => {
  it('gives each view button a 44px tap target on mobile that shrinks back at sm+', () => {
    render(<ViewSwitcher activeView="card" onViewChange={vi.fn()} />)
    for (const label of ['Gallery view', 'List view', 'Compact view']) {
      const button = screen.getByRole('button', { name: label })
      expect(button.className).toContain('h-11')
      expect(button.className).toContain('w-11')
      expect(button.className).toContain('sm:h-[30px]')
      expect(button.className).toContain('sm:w-9')
    }
  })
})
