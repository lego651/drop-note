/** @vitest-environment jsdom */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { WelcomeModal } from '../WelcomeModal'

// Radix Dialog uses matchMedia — stub it for jsdom
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

  // Stub clipboard
  vi.stubGlobal('navigator', {
    ...global.navigator,
    clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
  })

  localStorage.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('WelcomeModal', () => {
  it('shows modal when localStorage key is absent', () => {
    render(<WelcomeModal />)
    expect(screen.getByText('Welcome to drop-note')).toBeInTheDocument()
  })

  it('does not show modal when localStorage key is already set', () => {
    localStorage.setItem('drop-note:welcomed', 'true')
    render(<WelcomeModal />)
    expect(screen.queryByText('Welcome to drop-note')).not.toBeInTheDocument()
  })

  it('dismisses modal and sets localStorage key when "Got it" is clicked', async () => {
    render(<WelcomeModal />)
    expect(screen.getByText('Welcome to drop-note')).toBeInTheDocument()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Got it' }))
    })

    expect(screen.queryByText('Welcome to drop-note')).not.toBeInTheDocument()
    expect(localStorage.getItem('drop-note:welcomed')).toBe('true')
  })
})
