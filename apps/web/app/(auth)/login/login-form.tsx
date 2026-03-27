'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'

const supabase = createClient()

interface LoginFormProps {
  redirectTo?: string
  deleted?: boolean
  authError?: boolean
}

export default function LoginForm({ redirectTo, deleted, authError }: LoginFormProps) {
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const emailRedirectTo = redirectTo
      ? `${location.origin}/auth/callback?next=${encodeURIComponent(redirectTo)}`
      : `${location.origin}/auth/callback`

    const { error: signInError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo,
      },
    })

    if (signInError) {
      setError(signInError.message)
      setLoading(false)
      return
    }

    setSubmitted(true)
    setLoading(false)
  }

  if (submitted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="w-full max-w-sm space-y-4 px-6 text-center">
          <h1 className="text-2xl font-semibold">Check your email</h1>
          <p className="text-sm text-muted-foreground">
            We sent a magic link to <span className="font-medium text-foreground">{email}</span>.
            Click it to sign in.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-sm space-y-6 px-6">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-semibold">drop-note</h1>
          <p className="text-sm text-muted-foreground">Sign in with your email</p>
        </div>

        {deleted && (
          <p className="rounded-md bg-muted px-4 py-3 text-sm text-muted-foreground text-center">
            Your account has been deleted.
          </p>
        )}
        {authError && (
          <p className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive text-center">
            Authentication failed. Please try again.
          </p>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Sending…' : 'Send magic link'}
          </Button>
        </form>

        <p className="text-center text-xs text-muted-foreground">
          New here?{' '}
          <a href="/register" className="underline">
            Create an account
          </a>
        </p>
      </div>
    </div>
  )
}
