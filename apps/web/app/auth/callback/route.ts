import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendWelcomeEmail } from '@/lib/email'
import { supabaseAdmin } from '../../../lib/supabase/admin'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? ''

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      // Check if this is a first sign-in and send welcome email
      const { data: { user } } = await supabase.auth.getUser()

      // Shared profile query — used by both invite validation and welcome email logic
      const { data: profile } = user
        ? await supabase
            .from('users')
            .select('welcome_email_sent')
            .eq('id', user.id)
            .maybeSingle()
        : { data: null }

      const isNewUser = !profile?.welcome_email_sent

      // Validate invite code for new users in invite mode (S6B02)
      if (isNewUser && user) {
        const [{ data: setting }, { count }] = await Promise.all([
          supabaseAdmin.from('site_settings').select('value').eq('key', 'registration_mode').single(),
          supabaseAdmin.from('users').select('*', { count: 'exact', head: true }),
        ])
        const needsCode = setting?.value === 'invite' || (count ?? 0) >= 50

        if (needsCode) {
          const inviteCode = request.cookies.get('invite_code')?.value
          const valid = inviteCode
            ? await supabaseAdmin
                .from('invite_codes')
                .select('id')
                .eq('code', inviteCode)
                .is('used_by', null)
                .maybeSingle()
                .then(({ data }) => !!data)
            : false

          if (!valid) {
            // Sign out first (clear session cookies), then delete the auth user
            await supabase.auth.signOut()
            await supabaseAdmin.auth.admin.deleteUser(user.id)
            const errorParam = inviteCode ? 'invite_invalid' : 'invite_required'
            return NextResponse.redirect(`${origin}/register?error=${errorParam}`)
          }
        }
      }

      // Consume invite code cookie if present (S503)
      const inviteCode = request.cookies.get('invite_code')?.value
      if (inviteCode && user) {
        await supabaseAdmin
          .from('invite_codes')
          .update({ used_by: user.id, used_at: new Date().toISOString() })
          .eq('code', inviteCode)
          .is('used_by', null)
      }

      if (user?.email && profile && !profile.welcome_email_sent) {
        // Fire-and-forget — do not await
        void sendWelcomeEmail(user.email)
        // Mark as sent (best-effort, fire-and-forget)
        supabase
          .from('users')
          .update({ welcome_email_sent: true })
          .eq('id', user.id)
          .then(({ error }) => {
            if (error) console.error('[auth] welcome_email_sent update failed:', error.message)
          })
      }

      const isValidNext = next.startsWith('/') && !next.startsWith('//')
      return NextResponse.redirect(`${origin}${isValidNext ? next : '/items'}`)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`)
}
