/** @vitest-environment jsdom */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import { SettingsClient } from '../SettingsClient'

// ---------- mocks ----------

const mockPush = vi.fn()
const mockRefresh = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
}))

const mockSignOut = vi.fn()

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { signOut: mockSignOut },
  }),
}))

vi.mock('next-themes', () => ({
  useTheme: () => ({ theme: 'light', setTheme: vi.fn() }),
}))

// Radix components need matchMedia in jsdom
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

  mockPush.mockClear()
  mockRefresh.mockClear()
  mockSignOut.mockClear()
})

function renderSettings() {
  render(
    <SettingsClient
      email="test@example.com"
      name="Test User"
      memberSince="Jan 2026"
      digestEnabled={true}
      itemsCount={42}
      avatarColor="var(--color-tag-blue)"
    />,
  )
}

// ---------- tests ----------

describe('SettingsClient sign-out', () => {
  it('renders a Sign out button on the Account tab', () => {
    renderSettings()
    // Sign out is on Account tab — switch to it first
    fireEvent.click(screen.getByRole('button', { name: /account/i }))
    expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument()
  })

  it('redirects to / (landing page) after successful sign-out', async () => {
    mockSignOut.mockResolvedValue({ error: null })
    renderSettings()

    // Navigate to Account tab first
    fireEvent.click(screen.getByRole('button', { name: /account/i }))

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /sign out/i }))
    })

    await waitFor(() => {
      expect(mockSignOut).toHaveBeenCalledOnce()
      expect(mockPush).toHaveBeenCalledWith('/')
      expect(mockPush).not.toHaveBeenCalledWith('/login')
    })
  })

  it('does NOT redirect when sign-out fails', async () => {
    mockSignOut.mockResolvedValue({ error: new Error('network error') })
    renderSettings()

    // Navigate to Account tab first
    fireEvent.click(screen.getByRole('button', { name: /account/i }))

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /sign out/i }))
    })

    await waitFor(() => {
      expect(mockPush).not.toHaveBeenCalled()
      expect(screen.getByText(/sign out failed/i)).toBeInTheDocument()
    })
  })
})
