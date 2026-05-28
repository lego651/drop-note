/** @vitest-environment jsdom */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import { SidebarNav } from '../sidebar'

// ---------- mocks ----------

const mockPush = vi.fn()
const mockRefresh = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
  usePathname: () => '/items',
  useSearchParams: () => ({ get: () => null }),
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

// Radix UI needs matchMedia in jsdom
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

// ---------- tests ----------

describe('SidebarNav sign-out redirect', () => {
  it('redirects to / (landing page) after successful sign-out', async () => {
    mockSignOut.mockResolvedValue({ error: null })

    render(<SidebarNav userEmail="test@example.com" />)

    const signOutBtn = screen.getByRole('button', { name: /sign out/i })
    await act(async () => {
      fireEvent.click(signOutBtn)
    })

    await waitFor(() => {
      expect(mockSignOut).toHaveBeenCalledOnce()
      expect(mockPush).toHaveBeenCalledWith('/')
      expect(mockPush).not.toHaveBeenCalledWith('/login')
    })
  })

  it('does NOT redirect when sign-out fails', async () => {
    mockSignOut.mockResolvedValue({ error: new Error('network error') })

    render(<SidebarNav userEmail="test@example.com" />)

    const signOutBtn = screen.getByRole('button', { name: /sign out/i })
    await act(async () => {
      fireEvent.click(signOutBtn)
    })

    await waitFor(() => {
      expect(mockPush).not.toHaveBeenCalled()
      // Error message shown to user
      expect(screen.getByText(/sign out failed/i)).toBeInTheDocument()
    })
  })
})
