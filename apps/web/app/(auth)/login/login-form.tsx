'use client'
import { useState } from 'react'
import { Mail } from 'lucide-react'
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
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      {/* Brand block */}
      <div className="mb-8 flex flex-col items-center gap-2">
        <div className="flex items-center gap-2">
          <Mail className="h-6 w-6" aria-hidden="true" />
          <span className="text-xl font-medium">drop-note</span>
        </div>
        <p className="text-sm text-muted-foreground">Your personal content inbox</p>
      </div>

      {/* Sign-in card */}
      <div className="w-full max-w-[400px] rounded-xl border border-border bg-card px-7 py-8 shadow-sm">
        <div className="mb-6 space-y-1 text-center">
          <h1 className="text-xl font-semibold tracking-tight">Sign in to drop-note</h1>
          <p className="text-sm text-muted-foreground">Continue with your Google account</p>
        </div>

        {deleted && (
          <p className="mb-4 rounded-md bg-muted px-4 py-3 text-sm text-muted-foreground text-center">
            Your account has been deleted.
          </p>
        )}
        {authError && (
          <p className="mb-4 rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive text-center">
            Authentication failed. Please try again.
          </p>
        )}
        {error && <p className="mb-4 text-xs text-destructive text-center">{error}</p>}

        <Button
          variant="outline"
          className="h-[52px] w-full gap-3 text-sm font-medium hover:bg-muted/50"
          onClick={handleGoogleSignIn}
          disabled={loading}
        >
          <GoogleIcon />
          {loading ? 'Redirecting…' : 'Continue with Google'}
        </Button>

        <div className="my-5 border-t border-border" />

        <p className="text-center text-xs text-muted-foreground">
          Don&apos;t have an account?{' '}
          <strong>Signing in creates one automatically.</strong>
        </p>
      </div>

      {/* Legal microcopy */}
      <p className="mt-6 text-center text-xs text-muted-foreground">
        By continuing, you agree to our{' '}
        <a href="/terms" className="underline underline-offset-2 hover:text-foreground">
          Terms of Service
        </a>{' '}
        and{' '}
        <a href="/privacy" className="underline underline-offset-2 hover:text-foreground">
          Privacy Policy
        </a>
        .
      </p>
    </div>
  )
}
