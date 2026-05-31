//
// ============================================================================
// DEV / PREVIEW ONLY — never active in production.
// ----------------------------------------------------------------------------
// Mints a real Supabase SSR session for an allowlisted email and 302-redirects
// to a validated path, with NO Google OAuth round-trip. Lets Jason (and agents)
// land logged-in on any protected page of a Vercel Preview deploy for PR
// verification. Three layered safety gates (prod kill-switch + secret + email
// allowlist); every rejection returns 404 so the route is indistinguishable
// from non-existent in production. Behind Vercel Deployment Protection on top.
// ============================================================================
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

// 404 helper — used for EVERY rejection so prod responses leak nothing.
function notFound() {
  return new NextResponse(null, { status: 404 })
}

export async function GET(request: NextRequest) {
  // GATE 1 (load-bearing, MUST be first — before any other env read or work):
  // hard prod kill-switch. Prod can never reach the session-minting path.
  if (process.env.VERCEL_ENV === 'production') {
    return notFound()
  }

  const { searchParams, origin } = new URL(request.url)

  // GATE 2: secret. Missing DEV_LOGIN_SECRET, or a wrong/absent ?secret → 404.
  const expectedSecret = process.env.DEV_LOGIN_SECRET
  const providedSecret = searchParams.get('secret')
  if (!expectedSecret || providedSecret !== expectedSecret) {
    return notFound()
  }

  // GATE 3: email allowlist — hard-coded constant + named env vars ONLY.
  // Never trust/echo the ?as param into Supabase before this check passes.
  const allowlist = [
    'jasonusca@gmail.com',
    process.env.E2E_FREE_USER_EMAIL,
    process.env.E2E_PRO_USER_EMAIL,
    process.env.E2E_ADMIN_USER_EMAIL,
  ].filter((e): e is string => typeof e === 'string' && e.length > 0)

  const requestedEmail = searchParams.get('as') ?? 'jasonusca@gmail.com'
  if (!allowlist.includes(requestedEmail)) {
    return notFound()
  }

  // Validate redirect target (no open redirect). Mirror auth/callback.
  const next = searchParams.get('next') ?? '/items'
  const isValidNext = next.startsWith('/') && !next.startsWith('//')
  const target = isValidNext ? next : '/items'

  // Mint a real SSR session (Approach A): admin generateLink → SSR verifyOtp.
  const { data: linkData, error: linkError } =
    await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email: requestedEmail,
    })
  if (linkError || !linkData?.properties?.hashed_token) {
    // Do not leak why; behave as non-existent.
    return notFound()
  }

  const supabase = await createClient()
  const { error: verifyError } = await supabase.auth.verifyOtp({
    type: 'magiclink',
    token_hash: linkData.properties.hashed_token,
  })
  if (verifyError) {
    return notFound()
  }

  return NextResponse.redirect(`${origin}${target}`, 302)
}
