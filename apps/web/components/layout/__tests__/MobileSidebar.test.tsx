/** @vitest-environment jsdom */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MobileSidebar } from '../MobileSidebar'

vi.mock('next/navigation', () => ({
  usePathname: () => '/items',
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
}))

// DRO-247: the hamburger trigger was 36x36 — needs a 44px tap target on mobile.
describe('MobileSidebar open-menu trigger (DRO-247)', () => {
  it('gives the open-menu button a 44px tap target', () => {
    render(<MobileSidebar userEmail="a@b.com" envelopeCount={0} />)
    const trigger = screen.getByRole('button', { name: 'Open menu' })
    expect(trigger.className).toContain('h-11')
    expect(trigger.className).toContain('w-11')
  })
})
