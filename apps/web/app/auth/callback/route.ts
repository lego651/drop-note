import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendWelcomeEmail } from '@/lib/email'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? ''

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      // Check if this is a first sign-in and send welcome email
      const { data: { user } } = await supabase.auth.getUser()
      if (user?.email) {
        const { data: profile } = await supabase
          .from('users')
          .select('created_at')
          .eq('id', user.id)
          .maybeSingle()

        if (profile && Date.now() - new Date(profile.created_at).getTime() < 30_000) {
          // Fire-and-forget — do not await
          void sendWelcomeEmail(user.email)
        }
      }

      const isValidNext = next.startsWith('/') && !next.startsWith('//')
      return NextResponse.redirect(`${origin}${isValidNext ? next : '/dashboard'}`)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`)
}
