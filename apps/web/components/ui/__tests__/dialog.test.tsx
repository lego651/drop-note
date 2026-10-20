/** @vitest-environment jsdom */

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Dialog, DialogContent, DialogTitle } from '../dialog'

// DRO-247: the close × was a bare 16x16 icon with no padding on mobile.
// It must present a >=44px tap target even though the icon stays small.
describe('DialogContent close button (DRO-247)', () => {
  it('gives the close control a 44px tap target', () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Example dialog</DialogTitle>
        </DialogContent>
      </Dialog>,
    )

    const close = screen.getByRole('button', { name: 'Close' })
    expect(close.className).toContain('h-11')
    expect(close.className).toContain('w-11')
  })
})
