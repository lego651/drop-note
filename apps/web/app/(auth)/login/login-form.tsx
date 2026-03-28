'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'

// Inline Google "G" SVG — no external CDN
const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
    <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
    <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
    <path fill="#FBBC05" d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332z"/>
    <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 7.294C4.672 5.163 6.656 3.58 9 3.58z"/>
  </svg>
)

interface LoginFormProps {
  deleted?: boolean
  authError?: boolean
}

export default function LoginForm({ deleted, authError }: LoginFormProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleGoogleSignIn() {
    setLoading(true)
    setError('')
    const supabase = createClient()
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${location.origin}/auth/callback`,
      },
    })
    if (oauthError) {
      setError('Something went wrong. Please try again.')
      setLoading(false)
    }
    // On success, browser navigates away — no need to setLoading(false)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-sm space-y-6 px-6">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-semibold">drop-note</h1>
          <p className="text-sm text-muted-foreground">Sign in to your account</p>
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

        {error && <p className="text-xs text-destructive text-center">{error}</p>}

        <Button
          variant="outline"
          className="w-full gap-2"
          onClick={handleGoogleSignIn}
          disabled={loading}
        >
          <GoogleIcon />
          {loading ? 'Redirecting…' : 'Continue with Google'}
        </Button>

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
