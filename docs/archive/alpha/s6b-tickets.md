# Sprint 6b — Google OAuth Migration Tickets

> Sprint goal: Replace magic link authentication entirely with Google OAuth. Users click "Continue with Google" to sign in or create an account. Invite code gating is preserved for new users in invite-only mode.
> Deliverable: Zero magic link code in the repo. Login + register flows both use Google OAuth. All existing features (invite codes, welcome email, account deletion, E2E tests) continue working.
> Total: 22 points across 9 tickets.
>
> _Rev 2: Updated after tech lead review. Three blockers resolved by switching to browser-side signInWithOAuth (eliminates PKCE issues), separating login from oauth-init (eliminates invite-mode lockout), fixing session cleanup before deleteUser, fixing page.evaluate env var bug, and adding sameSite: 'none'._

---

## Pre-sprint checklist

> **Do not begin implementation until all of these are confirmed.**

- [ ] `pnpm turbo lint && pnpm turbo typecheck && pnpm test` all pass on current branch
- [ ] Google OAuth app created in Google Cloud Console (Client ID + Secret ready)
- [ ] Supabase Dashboard → Authentication → Providers → Google enabled with the above credentials
- [ ] Supabase redirect URI whitelisted: `https://<project-ref>.supabase.co/auth/v1/callback`
- [ ] Vercel preview + production URLs added to Google OAuth authorized JavaScript origins
- [ ] Supabase Dashboard → Authentication → User Management → "Allow linking multiple providers to a single user account" is **enabled** (so existing magic-link users can link their Google account by signing in with Google)

---

## Schema changes required this sprint

None. No new columns or tables are needed. The existing `invite_codes.used_by` / `invite_codes.used_at` pattern is reused as-is.

---

## Design decisions

### Browser-side OAuth (not server-side)
The frontend calls `supabase.auth.signInWithOAuth({ provider: 'google' })` directly from the browser client. This means Supabase's browser SDK handles PKCE (code_verifier stored in sessionStorage), the redirect to Google, and the redirect back. No server-side `signInWithOAuth` call is needed. This eliminates the PKCE cookie propagation concern entirely.

### Login vs Register routing
- **Login** (`/login`): calls `signInWithOAuth` directly from the browser — no backend call, no invite check. Existing users log in with their Google account. Supabase account linking (enabled in Supabase dashboard) ensures users who previously registered via magic link can log in with Google using the same email.
- **Register** (`/register`): if invite mode is active, the user first enters an invite code which is validated server-side via `POST /api/auth/oauth-init`. On 200, the invite code is stored in a cookie and then `signInWithOAuth` is called from the browser. If invite mode is not active, `signInWithOAuth` is called directly.

### Invite cookie transport
The invite code cookie is set server-side by `/api/auth/oauth-init` and read by `/auth/callback`. Since Google redirects back via a top-level GET, the cookie must survive this cross-site navigation. Setting `sameSite: 'none'; secure: true` ensures it is always sent regardless of browser cross-site cookie policy.

### Existing magic-link users
Since the app is pre-launch (no real users yet), no migration is needed. The Supabase account-linking setting (enabled in pre-sprint checklist) handles the case where a future beta user registered via magic link and later signs in via Google with the same email.

---

### S6B01 — New `POST /api/auth/oauth-init` route (invite code gate only)

**Type:** feat
**Points:** 3
**Depends on:** nothing

**Goal:** Create a server route that validates an invite code when invite mode is active. Returns `{ ok: true }` and sets the invite_code cookie. The frontend then calls `supabase.auth.signInWithOAuth` client-side. This route is called by the **register page only** — the login page never calls it.

**Spec:**

```
POST /api/auth/oauth-init
Content-Type: application/json
Body: { code?: string }

Response 200: { ok: true }             — invite code valid (or not required)
Response 400: { error: string }        — bad/missing invite code
Response 429: { error: string }        — rate limited
```

**Implementation:**

```ts
// apps/web/app/api/auth/oauth-init/route.ts
import { NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { getRedis } from '@/lib/redis'
import { supabaseAdmin } from '@/lib/supabase/admin'

export async function POST(request: Request) {
  // Rate limit: 5 attempts per IP per hour
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      ?? request.headers.get('x-real-ip')
      ?? 'unknown'
    const hour = Math.floor(Date.now() / 3_600_000)
    const hashedIp = createHash('sha256').update(ip).digest('hex').slice(0, 16)
    const rateLimitKey = `oauth-init:${hashedIp}:${hour}`   // distinct key from old register route
    const redis = getRedis()
    const attempts = await redis.incr(rateLimitKey)
    if (attempts === 1) await redis.expire(rateLimitKey, 3600)
    if (attempts > 5) {
      return NextResponse.json({ error: 'Too many attempts. Try again later.' }, { status: 429 })
    }
  } catch (err) {
    console.error('[oauth-init] Redis rate-limit check failed, continuing:', err instanceof Error ? err.message : err)
  }

  let body: { code?: string }
  try {
    body = await request.json()
  } catch {
    body = {}
  }

  // Check if invite mode is required
  const [{ data: setting }, { count }] = await Promise.all([
    supabaseAdmin.from('site_settings').select('value').eq('key', 'registration_mode').single(),
    supabaseAdmin.from('users').select('*', { count: 'exact', head: true }),
  ])
  const needsCode = setting?.value === 'invite' || (count ?? 0) >= 50

  if (needsCode) {
    const code = body.code?.trim().toUpperCase()
    if (!code) {
      return NextResponse.json({ error: 'Invite code is required' }, { status: 400 })
    }
    const { data: inviteCode } = await supabaseAdmin
      .from('invite_codes')
      .select('id, code, used_by')
      .eq('code', code)
      .is('used_by', null)
      .maybeSingle()
    if (!inviteCode) {
      return NextResponse.json({ error: 'Invalid or already used invite code' }, { status: 400 })
    }

    const response = NextResponse.json({ ok: true })
    response.cookies.set('invite_code', code, {
      httpOnly: true,
      secure: true,
      path: '/auth/callback',
      maxAge: 900,
      sameSite: 'none',    // Must survive Google OAuth cross-site redirect
    })
    return response
  }

  return NextResponse.json({ ok: true })
}
```

**Acceptance criteria:**
- [ ] Open mode: `POST /api/auth/oauth-init` returns `{ ok: true }` with no cookie
- [ ] Invite mode with valid code: returns `{ ok: true }`, sets `invite_code` cookie with `SameSite=None; Secure`
- [ ] Invite mode with missing code: returns 400 `{ error: 'Invite code is required' }`
- [ ] Invite mode with invalid/used code: returns 400 `{ error: 'Invalid or already used invite code' }`
- [ ] Rate limit: 6th attempt from same IP within an hour returns 429
- [ ] Rate limit key is `oauth-init:...` (not `register:...`)
- [ ] Route does NOT call `signInWithOAuth` — that is the browser's job

---

### S6B02 — Update `/auth/callback` to handle OAuth new-user flow

**Type:** feat
**Points:** 3
**Depends on:** S6B01

**Goal:** Add invite code validation for new users in invite mode. If a new user (first sign-in) has no valid invite cookie when invite mode is active, sign them out, delete their auth record, and redirect to an error page.

**Logic to insert after `exchangeCodeForSession` succeeds, before the existing invite consumption block:**

```ts
// Is this a first-time sign-in?
const { data: profile } = await supabase
  .from('users')
  .select('welcome_email_sent')
  .eq('id', user.id)
  .maybeSingle()

const isNewUser = !profile?.welcome_email_sent

if (isNewUser) {
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
```

**Then** the existing invite consumption block runs (unchanged):
```ts
const inviteCode = request.cookies.get('invite_code')?.value
if (inviteCode && user) {
  await supabaseAdmin
    .from('invite_codes')
    .update({ used_by: user.id, used_at: new Date().toISOString() })
    .eq('code', inviteCode)
    .is('used_by', null)
}
```

**Important:** `supabase.auth.signOut()` is called **before** `deleteUser` to ensure session cookies are cleared and the browser doesn't retain a dangling session for a deleted user.

**Profile null guard:** If `profile` is null (Postgres trigger hasn't committed yet on a very fresh user), `isNewUser` will be `true`. This is safe — the invite check will correctly run for new users. The welcome email block also already handles `profile === null` safely.

**File:** `apps/web/app/auth/callback/route.ts`

**Acceptance criteria:**
- [ ] New user, invite mode, valid invite cookie → account created, invite consumed, welcome email sent, redirect to `/items`
- [ ] New user, invite mode, no invite cookie → signOut() called, user deleted, redirect to `/register?error=invite_required`
- [ ] New user, invite mode, invalid/used cookie → signOut() called, user deleted, redirect to `/register?error=invite_invalid`
- [ ] New user, open mode → account created normally (no invite check)
- [ ] Returning user → skips invite check entirely, redirects to `/items`
- [ ] Existing welcome email + invite consumption logic unchanged

---

### S6B03 — Remove magic link routes and shared constant

**Type:** refactor
**Points:** 2
**Depends on:** S6B01, S6B02 complete

**Goal:** Delete `/api/auth/register/route.ts`. Remove `AUTH_EMAIL_RATE_LIMIT_PER_HOUR` from `packages/shared/src/` and all import sites.

**Steps:**
1. Delete `apps/web/app/api/auth/register/route.ts`
2. Find `AUTH_EMAIL_RATE_LIMIT_PER_HOUR` definition in `packages/shared/src/` — delete it
3. Remove the import from `apps/web/app/(auth)/login/login-form.tsx`
4. Remove the import from `apps/web/app/(auth)/register/register-form.tsx` (old file will be rewritten by S6B05 anyway)
5. `pnpm turbo typecheck && pnpm turbo lint` must pass

**Acceptance criteria:**
- [ ] `apps/web/app/api/auth/register/route.ts` does not exist
- [ ] No file imports `AUTH_EMAIL_RATE_LIMIT_PER_HOUR`
- [ ] The constant is removed from `packages/shared/src/`
- [ ] `pnpm turbo typecheck` passes
- [ ] `pnpm turbo lint` passes

---

### S6B04 — Replace login page with Google OAuth button

**Type:** feat
**Points:** 3
**Depends on:** nothing (can start in parallel with S6B01)

**Goal:** Replace the email input + "Send magic link" form with a "Continue with Google" button. The button calls `supabase.auth.signInWithOAuth` directly from the browser — no backend call needed for login.

**New `login-form.tsx`:**

```tsx
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
```

**Updated `login/page.tsx`:** Remove `redirectTo` / `next` searchParam (no longer supported — Google OAuth always redirects to `/items` via callback). Keep `deleted` and `authError`.

> **Note on `next` param:** Middleware still sends unauthenticated users to `/login?next=...`. After OAuth, the callback always redirects to `/items` — the `next` param is silently dropped. This is a known UX regression. A follow-up ticket should add OAuth `state` param support to pass the intended destination through the redirect chain.

**Acceptance criteria:**
- [ ] `/login` renders a "Continue with Google" button, no email input
- [ ] Clicking button redirects to Google OAuth consent screen
- [ ] After Google auth, user lands on `/items`
- [ ] `?deleted=1` shows account-deleted banner
- [ ] `?error=auth` shows auth-error banner
- [ ] Google logo is inline SVG (no external `<img src>`)
- [ ] No raw color classes — semantic tokens only
- [ ] No import of `AUTH_EMAIL_RATE_LIMIT_PER_HOUR` or `signInWithOtp`

---

### S6B05 — Replace register page with invite-code gate + Google button

**Type:** feat
**Points:** 5
**Depends on:** S6B01, S6B02

**Goal:** Rewrite the register page. When invite mode is active: user enters invite code → `POST /api/auth/oauth-init` validates + sets cookie → browser calls `signInWithOAuth`. When open mode: browser calls `signInWithOAuth` directly.

**Updated `register/page.tsx`:**
```tsx
// Keep server-side needsCode check — unchanged
// Add searchParams to read error params from callback redirect
export default async function RegisterPage({ searchParams }) {
  const [{ data: setting }, { count }] = await Promise.all([...])
  const needsCode = setting?.value === 'invite' || (count ?? 0) >= 50
  const errorParam = searchParams?.error as string | undefined
  return <RegisterForm needsCode={needsCode} errorParam={errorParam} />
}
```

**New `register-form.tsx`:**
```tsx
'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
// Import GoogleIcon from login form (or inline same SVG)

interface RegisterFormProps {
  needsCode: boolean
  errorParam?: string
}

export function RegisterForm({ needsCode, errorParam }: RegisterFormProps) {
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const callbackError =
    errorParam === 'invite_required' ? 'An invite code is required to create an account.' :
    errorParam === 'invite_invalid'  ? 'Your invite code was invalid or already used.'    :
    undefined

  async function handleGoogleSignIn() {
    setLoading(true)
    setError('')

    // If invite mode: validate code server-side first
    if (needsCode) {
      const res = await fetch('/api/auth/oauth-init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error ?? 'Something went wrong')
        setLoading(false)
        return
      }
    }

    // Trigger Google OAuth from the browser
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
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-sm space-y-6 px-6">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-semibold">drop-note</h1>
          <p className="text-sm text-muted-foreground">Create your account</p>
        </div>

        {callbackError && (
          <p className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive text-center">
            {callbackError}
          </p>
        )}

        {needsCode && (
          <input
            type="text"
            placeholder="Invite code (e.g. ABCD-EFGH-IJKL)"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            required
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring font-mono"
          />
        )}

        {error && <p className="text-xs text-destructive">{error}</p>}

        <Button
          variant="outline"
          className="w-full gap-2"
          onClick={handleGoogleSignIn}
          disabled={loading || (needsCode && !code)}
        >
          <GoogleIcon />
          {loading ? 'Redirecting…' : 'Continue with Google'}
        </Button>

        <p className="text-center text-xs text-muted-foreground">
          Already have an account?{' '}
          <a href="/login" className="underline">
            Sign in
          </a>
        </p>
      </div>
    </div>
  )
}
```

**Acceptance criteria:**
- [ ] Open mode: `/register` shows Google button, clicking it starts OAuth
- [ ] Invite mode: shows code input + Google button; button disabled if code is empty
- [ ] Invite mode, valid code: POST oauth-init succeeds, OAuth redirect starts
- [ ] Invite mode, invalid code: inline error shown, no redirect
- [ ] `?error=invite_required` banner shown
- [ ] `?error=invite_invalid` banner shown
- [ ] No email input, no "Check your email" state, no `signInWithOtp`
- [ ] No raw color classes

---

### S6B06 — Verify Settings signOut redirect works with new login page

**Type:** fix
**Points:** 1
**Depends on:** S6B04

**Goal:** `SettingsClient.tsx` redirects to `/login?deleted=1` after account deletion. Verify the new login page renders the deleted banner correctly. No code change expected — this is an acceptance check.

**Acceptance criteria:**
- [ ] After deleting account, browser lands on `/login?deleted=1`
- [ ] "Your account has been deleted" banner is visible
- [ ] No JS errors in console
- [ ] `SettingsClient.tsx` has no magic link or OTP references

---

### S6B07 — Update `e2e/auth.setup.ts` — password-based session injection

**Type:** test
**Points:** 3
**Depends on:** nothing (fully independent)

**Goal:** Replace `generateLink({ type: 'magiclink' })` with password-based sign-in. Inject the resulting session JWT directly into browser localStorage so `page.waitForURL('**/items')` succeeds without going through the Google OAuth UI (which cannot be automated in Playwright).

**New `createSession` implementation:**

```ts
async function createSession(
  page: import('@playwright/test').Page,
  email: string,
  password: string,
  storagePath: string,
  isAdmin = false,
) {
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Create user if not already exists (idempotent)
  const { data: userData } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })

  let userId = userData?.user?.id

  if (!userId) {
    const { data: existing } = await admin.auth.admin.listUsers({ perPage: 1000, page: 1 })
    const found = existing?.users?.find((u) => u.email === email)
    if (!found) throw new Error(`Could not create or find user: ${email}`)
    userId = found.id
    // Reset password in case it differs from expected
    await admin.auth.admin.updateUserById(userId, { password })
  }

  if (isAdmin) {
    await admin.from('users').update({ is_admin: true }).eq('id', userId)
  }

  // Sign in via password using the anon client to get a real session token
  const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data: sessionData, error: signInError } = await anonClient.auth.signInWithPassword({ email, password })
  if (signInError || !sessionData.session) {
    throw new Error(`Could not sign in as ${email}: ${signInError?.message ?? 'no session'}`)
  }

  // Inject session into browser localStorage
  // NOTE: compute the storage key in Node.js context — process.env is not available inside page.evaluate()
  const supabaseProjectRef = new URL(SUPABASE_URL).hostname.split('.')[0]
  const storageKey = `sb-${supabaseProjectRef}-auth-token`

  const baseUrl = process.env.BASE_URL ?? 'http://localhost:3000'
  await page.goto(baseUrl)
  await page.evaluate(
    ({ key, session }) => {
      localStorage.setItem(key, JSON.stringify(session))
    },
    { key: storageKey, session: sessionData.session },
  )

  await page.goto(`${baseUrl}/items`)
  await page.waitForURL('**/items', { timeout: 15000 })
  await page.context().storageState({ path: storagePath })
}
```

**New env vars to add to `.env.example` (E2E section):**
```
SUPABASE_ANON_KEY=          # same value as NEXT_PUBLIC_SUPABASE_ANON_KEY
BASE_URL=http://localhost:3000
```

**Acceptance criteria:**
- [ ] `pnpm e2e` creates all 3 sessions successfully
- [ ] No `generateLink({ type: 'magiclink' })` anywhere in `e2e/`
- [ ] `SUPABASE_ANON_KEY` and `BASE_URL` documented in `.env.example`
- [ ] Storage key computed in Node.js context (not inside `page.evaluate`)
- [ ] `signInWithPassword` is used, not `signInWithOtp`

---

### S6B08 — Update E2E smoke + spec files for new auth flow

**Type:** test
**Points:** 1
**Depends on:** S6B04, S6B05, S6B07

**Goal:** Audit all E2E spec files for any UI flows that reference the old magic link login form (email input, "Send magic link" button, "Check your email"). Update or remove those steps.

**Files to audit:**
- `e2e/smoke.spec.ts`
- `e2e/critical-path.spec.ts`
- `e2e/stripe-upgrade.spec.ts`
- `e2e/admin.spec.ts`

**What to change:**
- Remove any `page.fill('[type=email]')` targeting the login email input
- Remove assertions for "Send magic link" or "Check your email"
- If any spec navigates to `/login` expecting the email form, update to check for the Google button

**Acceptance criteria:**
- [ ] `pnpm e2e` green with zero failures
- [ ] No spec references "Send magic link" or "Check your email"
- [ ] If login page is visited in a spec, assert "Continue with Google" button is visible

---

### S6B09 — Docs, CLAUDE.md update, Google OAuth setup guide

**Type:** docs
**Points:** 1
**Depends on:** all other tickets

**Goal:** Update docs. Remove magic link references. Document the Google OAuth one-time setup.

**Changes:**

1. **`CLAUDE.md` — Notes & known limitations:**
   - Remove the entire "Supabase Auth email rate limit" section (magic link rate limit no longer applies)
   - Add: "Auth: Google OAuth only. See `docs/google-oauth-setup.md` for one-time Supabase + Google Cloud setup."

2. **`docs/launch-checklist.md`:**
   - Add Google OAuth checklist items:
     - [ ] Google Cloud Console OAuth app created with production domain + redirect URIs
     - [ ] Supabase → Authentication → Providers → Google enabled
     - [ ] Supabase account linking enabled (for magic-link-to-Google migration)
     - [ ] Authorized JavaScript origins include production + Vercel preview base URL

3. **`docs/google-oauth-setup.md` (new):**
   - Step-by-step: Create Google Cloud project, OAuth consent screen, OAuth 2.0 Client ID
   - Whitelist redirect URIs: `https://<ref>.supabase.co/auth/v1/callback`
   - Configure in Supabase Dashboard → Authentication → Providers → Google
   - Enable account linking in Supabase Dashboard
   - Local dev setup (localhost:3000 in authorized origins)
   - Verify with `pnpm dev` + clicking "Continue with Google"

**Acceptance criteria:**
- [ ] No "magic link" or "OTP" or `AUTH_EMAIL_RATE_LIMIT_PER_HOUR` in CLAUDE.md
- [ ] `docs/launch-checklist.md` has Google OAuth items
- [ ] `docs/google-oauth-setup.md` exists and has actionable steps

---

## Implementation order

```
S6B01 (oauth-init route)       ─────────────── independent, start first
S6B04 (login page)             ─────────────── independent, start immediately
S6B07 (e2e auth setup)         ─────────────── independent, start immediately

S6B02 (callback update)        ─────────────── after S6B01
S6B05 (register page)          ─────────────── after S6B01

S6B03 (remove old routes)      ─────────────── after S6B01 + S6B02
S6B06 (settings verify)        ─────────────── after S6B04

S6B08 (e2e spec update)        ─────────────── after S6B04 + S6B05 + S6B07
S6B09 (docs)                   ─────────────── last
```

Parallel tracks:
- **Track A:** S6B01 → S6B02 → S6B03
- **Track B:** S6B04 → S6B06
- **Track C:** S6B05 (after S6B01 + S6B02)
- **Track D:** S6B07 → S6B08 (after B + C)
- **Track E:** S6B09 (final)

## Ticket summary

| Ticket | Type | Points | Depends on |
|---|---|---|---|
| S6B01 | feat | 3 | — |
| S6B02 | feat | 3 | S6B01 |
| S6B03 | refactor | 2 | S6B01, S6B02 |
| S6B04 | feat | 3 | — |
| S6B05 | feat | 5 | S6B01, S6B02 |
| S6B06 | fix | 1 | S6B04 |
| S6B07 | test | 3 | — |
| S6B08 | test | 1 | S6B04, S6B05, S6B07 |
| S6B09 | docs | 1 | all |
| **Total** | | **22** | |
