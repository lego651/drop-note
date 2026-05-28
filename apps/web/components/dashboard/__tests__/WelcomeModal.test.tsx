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
    // New universal-capture framing — no longer says "Email anything" exclusively
    // The phrase appears in both description and step 1, so use getAllByText
    expect(screen.getAllByText(/send anything to your drop address/i).length).toBeGreaterThan(0)
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

  it('copies the drop address when the copy button is clicked', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', {
      ...global.navigator,
      clipboard: { writeText },
    })

    render(<WelcomeModal />)

    const copyBtn = screen.getByRole('button', { name: /copy drop address/i })
    await act(async () => {
      fireEvent.click(copyBtn)
    })

    expect(writeText).toHaveBeenCalledWith('drop@dropnote.me')
  })
})
