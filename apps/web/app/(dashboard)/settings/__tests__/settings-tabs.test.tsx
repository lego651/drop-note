/** @vitest-environment jsdom */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SettingsClient } from '../SettingsClient'

// ---------- mocks ----------

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { signOut: vi.fn(), getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }) },
    from: () => ({ update: () => ({ eq: () => Promise.resolve({ error: null }) }) }),
  }),
}))

vi.mock('next-themes', () => ({
  useTheme: () => ({ theme: 'light', setTheme: vi.fn() }),
}))

beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
})

function renderSettings() {
  render(
    <SettingsClient
      email="test@example.com"
      name="Test User"
      memberSince="Jan 12, 2026"
      digestEnabled={true}
      itemsCount={42}
      avatarColor="var(--color-tag-blue)"
    />,
  )
}

// ---------- tests ----------

describe('SettingsClient tab navigation', () => {
  it('default tab is Drop Address — panel heading visible', () => {
    renderSettings()
    // The panel heading for tab 1 should be visible by default
    expect(screen.getByRole('heading', { name: /drop address/i })).toBeInTheDocument()
  })

  it('clicking Notifications tab shows Notifications panel', () => {
    renderSettings()
    fireEvent.click(screen.getByRole('button', { name: /notifications/i }))
    expect(screen.getByRole('heading', { name: /notifications/i })).toBeInTheDocument()
  })

  it('clicking Account tab shows Account panel', () => {
    renderSettings()
    fireEvent.click(screen.getByRole('button', { name: /^account$/i }))
    expect(screen.getByRole('heading', { name: /^account$/i })).toBeInTheDocument()
  })

  it('clicking Danger Zone tab shows Danger Zone panel', () => {
    renderSettings()
    fireEvent.click(screen.getByRole('button', { name: /danger zone/i }))
    expect(screen.getByRole('heading', { name: /danger zone/i })).toBeInTheDocument()
  })

  it('weekly digest toggle renders on Notifications tab and is not disabled', () => {
    renderSettings()
    fireEvent.click(screen.getByRole('button', { name: /notifications/i }))
    // Weekly digest is the only real-wired toggle
    const digestSwitch = screen.getByRole('switch', { name: /weekly digest/i })
    expect(digestSwitch).toBeInTheDocument()
    expect(digestSwitch).not.toBeDisabled()
  })

  it('Sign out button is NOT visible on Drop Address tab (default)', () => {
    renderSettings()
    // On default tab (Drop Address), sign out should not be visible
    expect(screen.queryByRole('button', { name: /sign out/i })).not.toBeInTheDocument()
  })
})
