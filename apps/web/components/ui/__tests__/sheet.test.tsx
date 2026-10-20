/** @vitest-environment jsdom */

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Sheet, SheetContent } from '../sheet'

// DRO-247: the sheet close × was a bare icon with no padding on mobile.
// It must present a >=44px tap target even though the icon stays small.
describe('SheetContent close button (DRO-247)', () => {
  it('gives the close control a 44px tap target', () => {
    render(
      <Sheet open>
        <SheetContent>Example sheet</SheetContent>
      </Sheet>,
    )

    const close = screen.getByRole('button', { name: 'Close' })
    expect(close.className).toContain('h-11')
    expect(close.className).toContain('w-11')
  })
})
