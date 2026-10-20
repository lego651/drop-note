/** @vitest-environment jsdom */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AdminNav } from '../AdminNav'

let mockPathname = '/admin/users'

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
}))

describe('AdminNav (DRO-248)', () => {
  it('renders links for all admin sections', () => {
    render(<AdminNav />)
    expect(screen.getByRole('link', { name: 'Users' })).toHaveAttribute('href', '/admin/users')
    expect(screen.getByRole('link', { name: 'Block List' })).toHaveAttribute('href', '/admin/blocks')
    expect(screen.getByRole('link', { name: 'Invite Codes' })).toHaveAttribute(
      'href',
      '/admin/invite-codes',
    )
    expect(screen.getByRole('link', { name: 'Stats' })).toHaveAttribute('href', '/admin/stats')
  })

  it('marks the current section active', () => {
    mockPathname = '/admin/blocks'
    render(<AdminNav />)
    expect(screen.getByRole('link', { name: 'Block List' }).className).toMatch(/border-ink/)
    expect(screen.getByRole('link', { name: 'Users' }).className).not.toMatch(/border-ink/)
  })

  it('marks active on a nested route under a section', () => {
    mockPathname = '/admin/invite-codes/archived'
    render(<AdminNav />)
    expect(screen.getByRole('link', { name: 'Invite Codes' }).className).toMatch(/border-ink/)
  })

  it('does not require a Sheet ancestor when rendered outside one', () => {
    mockPathname = '/admin/users'
    expect(() => render(<AdminNav />)).not.toThrow()
  })
})
