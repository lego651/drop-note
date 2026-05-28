/** @vitest-environment jsdom */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

// Mock Supabase client — login-form uses createClient() + signInWithOAuth
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      signInWithOAuth: vi.fn().mockResolvedValue({ error: null }),
    },
  }),
}))

// Mock lucide-react Mail icon
vi.mock('lucide-react', () => ({
  Mail: () => <svg data-testid="mail-icon" aria-hidden="true" />,
}))

import LoginForm from '../login-form'

describe('LoginForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the drop-note wordmark', () => {
    render(<LoginForm />)
    expect(screen.getByText('drop-note')).toBeInTheDocument()
  })

  it('renders the tagline', () => {
    render(<LoginForm />)
    expect(screen.getByText('Your personal content inbox')).toBeInTheDocument()
  })

  it('renders the sign-in headline', () => {
    render(<LoginForm />)
    expect(screen.getByRole('heading', { name: /sign in to drop-note/i })).toBeInTheDocument()
  })

  it('renders the "Continue with Google" button', () => {
    render(<LoginForm />)
    expect(screen.getByRole('button', { name: /continue with google/i })).toBeInTheDocument()
  })

  it('renders the auto-create account footnote', () => {
    render(<LoginForm />)
    expect(screen.getByText(/signing in creates one automatically/i)).toBeInTheDocument()
  })

  it('renders the Terms of Service link', () => {
    render(<LoginForm />)
    const link = screen.getByRole('link', { name: /terms of service/i })
    expect(link).toBeInTheDocument()
    expect(link).toHaveAttribute('href', '/terms')
  })

  it('renders the Privacy Policy link', () => {
    render(<LoginForm />)
    const link = screen.getByRole('link', { name: /privacy policy/i })
    expect(link).toBeInTheDocument()
    expect(link).toHaveAttribute('href', '/privacy')
  })

  it('shows deleted message when deleted prop is true', () => {
    render(<LoginForm deleted />)
    expect(screen.getByText(/your account has been deleted/i)).toBeInTheDocument()
  })

  it('shows auth error message when authError prop is true', () => {
    render(<LoginForm authError />)
    expect(screen.getByText(/authentication failed/i)).toBeInTheDocument()
  })

  it('does not show deleted or error messages by default', () => {
    render(<LoginForm />)
    expect(screen.queryByText(/your account has been deleted/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/authentication failed/i)).not.toBeInTheDocument()
  })
})
