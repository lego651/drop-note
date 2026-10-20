/** @vitest-environment jsdom */

import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CookieBanner } from '../CookieBanner'

beforeEach(() => {
  localStorage.clear()
})

// DRO-247: Accept was 76x32 and the Privacy Policy link was inline text with
// no vertical hit area — both need a >=44px tap target on mobile.
describe('CookieBanner tap targets (DRO-247)', () => {
  it('gives Accept a 44px-tall tap target', () => {
    render(<CookieBanner />)
    expect(screen.getByRole('button', { name: 'Accept' }).className).toContain('h-11')
  })

  it('gives the Privacy Policy link a 44px-tall tap target', () => {
    render(<CookieBanner />)
    expect(screen.getByRole('link', { name: 'Privacy Policy' }).className).toContain('min-h-11')
  })
})
