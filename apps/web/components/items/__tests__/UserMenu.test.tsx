/** @vitest-environment jsdom */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { UserMenu } from '../UserMenu'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { signOut: vi.fn() } }),
}))

// DRO-247: the Account menu trigger was 116x32 — needs a >=44px tall tap target.
describe('UserMenu account trigger (DRO-247)', () => {
  it('gives the Account menu trigger a 44px-tall tap target', () => {
    render(
      <UserMenu
        avatarUrl={null}
        userInitials="J"
        avatarColor="214 89% 52%"
      />,
    )
    const trigger = screen.getByRole('button', { name: 'Account menu' })
    expect(trigger.className).toContain('min-h-11')
  })
})
