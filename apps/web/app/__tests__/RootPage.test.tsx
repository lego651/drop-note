/** @vitest-environment jsdom */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

// vi.hoisted ensures these refs are created before vi.mock factories run
const { mockRedirect, mockGetUser } = vi.hoisted(() => ({
  mockRedirect: vi.fn(),
  mockGetUser: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  redirect: mockRedirect,
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: {
      getUser: mockGetUser,
    },
  }),
}))

vi.mock('@/components/marketing/LandingPage', () => ({
  LandingPage: () => <div data-testid="landing-page">Landing Page</div>,
}))

import RootPage from '../page'

describe('RootPage', () => {
  beforeEach(() => {
    mockRedirect.mockReset()
    mockGetUser.mockReset()
  })

  it('redirects logged-in users to /items', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } } })
    mockRedirect.mockImplementation(() => {
      throw new Error('NEXT_REDIRECT')
    })

    await expect(RootPage()).rejects.toThrow('NEXT_REDIRECT')
    expect(mockRedirect).toHaveBeenCalledWith('/items')
  })

  it('renders LandingPage for logged-out visitors', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })

    const result = await RootPage()
    render(result)

    expect(screen.getByTestId('landing-page')).toBeInTheDocument()
    expect(mockRedirect).not.toHaveBeenCalled()
  })
})
