# Sprint 5 — Engineering Tickets

> Sprint goal: Real-time updates, admin panel, abuse prevention, account management, and mobile-ready UI.
> Deliverable: Full working app. Real-time processing status. Admin can manage users, blocks, and invite codes. Mobile responsive.
> Total: 28 points across 14 tickets.

---

## Schema changes required this sprint

No new tables — all tables (`block_list`, `invite_codes`, `site_settings`) were created in S1.

**Confirm these columns exist on `block_list`** before writing any admin UI:
```sql
-- Expected schema (from S1 migration)
-- block_list: id uuid pk, type text ('email'|'ip'), value text, created_at timestamptz, created_by uuid
-- invite_codes: id uuid pk, code text unique, used_by uuid nullable, used_at timestamptz nullable, created_by uuid, created_at timestamptz
-- site_settings: key text pk, value text
--   row: ('registration_mode', 'open'|'invite')
--   row: ('open_slots', '50')
```

Run `pnpm gen:types` after confirming — no migration needed unless a column is missing.

> **Note on `block_list.type`:** The ingest route already checks `type = 'email'` and `value = senderEmail`. The admin UI and auto-block logic must use the same shape.

---

### S501 — Supabase Realtime subscription for live item updates
**Type:** feat
**Points:** 3
**Depends on:** S401 (items page exists)

**Goal:** When a user submits an email and the worker processes it, the item appears and transitions in the dashboard without a page reload.

**Architecture decision:** The Supabase Realtime subscription must live in a `'use client'` component. The items page uses a server-fetch → client-render split (`ItemsPageClient`). The subscription belongs in `ItemsPageClient` — it already holds the item list state.

**Scope:**

**New hook:** `apps/web/hooks/useRealtimeItems.ts`
```ts
// Returns: { newItems, updatedIds } to merge into the displayed list
// Subscribes on mount, unsubscribes on unmount
export function useRealtimeItems(userId: string): {
  newItems: ItemRow[]
  updatedItems: ItemRow[]
}
```

Implementation:
```ts
import { createClient } from '@/lib/supabase/client'
import { useEffect, useState } from 'react'

export function useRealtimeItems(userId: string) {
  const [newItems, setNewItems] = useState<ItemRow[]>([])
  const [updatedItems, setUpdatedItems] = useState<ItemRow[]>([])

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`items:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'items',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => setNewItems((prev) => [payload.new as ItemRow, ...prev])
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'items',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => setUpdatedItems((prev) => {
          const updated = payload.new as ItemRow
          const idx = prev.findIndex((i) => i.id === updated.id)
          if (idx >= 0) {
            const next = [...prev]
            next[idx] = updated
            return next
          }
          return [...prev, updated]
        })
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [userId])

  return { newItems, updatedItems }
}
```

**Wire into `ItemsPageClient.tsx`:**
1. Accept `userId: string` as a prop (already available from the server layout's session).
2. Call `useRealtimeItems(userId)`.
3. Merge `newItems` into the displayed list at the top (after pinned items). **Dedup by `id`** to handle the race window between server fetch and Realtime subscription startup: `const merged = [...newItems.filter(n => !serverItems.some(s => s.id === n.id)), ...serverItems]`
4. Apply `updatedItems` by replacing matching IDs in the displayed list.
5. Filter out items with `deleted_at` set (soft deletes from other tabs).

**Supabase Realtime requires enabling replication on the `items` table:**
```sql
-- supabase/migrations/<timestamp>_s5_realtime_items.sql
ALTER PUBLICATION supabase_realtime ADD TABLE public.items;
```
Apply with `npx supabase db push --linked` before testing.

**Acceptance criteria:**
- Send a test email → new skeleton/processing item appears in the list within 2 seconds, without page reload.
- When the worker finishes → item transitions from `processing` to `done` state in-place.
- Navigating to item detail and back does not cause a second subscription or duplicate items.
- `removeChannel` is called on unmount (verified by no console warnings).

---

### S502 — Processing status UX: skeleton → processing → done/error
**Type:** feat
**Points:** 2
**Depends on:** S501

**Goal:** Give users visual feedback that their email is being processed. Items arriving via Realtime start as skeletons and animate to their final state.

**Scope:**

Items arriving via Realtime INSERT with `status = 'pending'` or `status = 'processing'` need a skeleton/loading representation until the UPDATE arrives with `status = 'done'` or `status = 'failed'`.

**Update `ItemCard.tsx`** to handle all status states:

| `status` | Rendering |
|---|---|
| `done` | Normal card (subject, summary preview, tags, date) |
| `pending` / `processing` | Skeleton card: pulsing shimmer on subject + summary lines, "Processing…" badge |
| `failed` | Error card: subject shown, red "Processing failed" text, `error_message` if present |

Skeleton state implementation:
```tsx
if (item.status === 'pending' || item.status === 'processing') {
  return (
    <div className="rounded-lg border border-border p-4 space-y-2 animate-pulse">
      <div className="h-4 bg-muted rounded w-3/4" />
      <div className="h-3 bg-muted rounded w-full" />
      <div className="h-3 bg-muted rounded w-2/3" />
      <span className="text-xs text-muted-foreground">Processing…</span>
    </div>
  )
}
```

Error state implementation (already partially handled — verify `error_message` renders):
```tsx
if (item.status === 'failed') {
  return (
    <div className="rounded-lg border border-destructive/40 p-4 space-y-1">
      <p className="text-sm font-medium truncate">{item.subject ?? '(no subject)'}</p>
      <p className="text-xs text-destructive">Processing failed</p>
      {item.error_message && (
        <p className="text-xs text-muted-foreground truncate">{item.error_message}</p>
      )}
    </div>
  )
}
```

No new CSS classes — use existing Tailwind animation utilities (`animate-pulse`) and semantic tokens.

**Acceptance criteria:**
- A `pending` or `processing` item renders a skeleton card, not a blank or broken card.
- A `failed` item shows "Processing failed" and the error message if one exists.
- When a Realtime UPDATE arrives changing status to `done`, the skeleton is replaced by the full card (no flicker, no duplicate).
- `animate-pulse` does not run in reduced-motion contexts — use `motion-safe:animate-pulse`.

---

### S503 — Registration gate + invite code flow
**Type:** feat
**Points:** 3
**Depends on:** S1 login flow

**Goal:** Enforce the 50-user open-registration limit. After 50 users, require an invite code to register. Existing users are unaffected.

**Background:** Magic link is the only auth method. Sign-up and login share the same flow (enter email → click magic link). The simple approach for alpha scale: validate the invite code on form submit, carry the validated code to the auth callback via a short-lived HttpOnly cookie, and consume it there. No Redis needed. Acceptable tiny race window (two simultaneous signups with the same code) is fine for launch.

**Flow for invite mode:**

```
User visits /register
  → Enters email + invite code
  → POST /api/auth/register validates:
      1. Is site in 'invite' mode? (check site_settings)
      2. Is code valid and unused? (DB check)
      3. Does the email already have an account? (if yes → redirect to /login)
  → If valid:
      - Set HttpOnly cookie: invite_code=XXXX-XXXX-XXXX; Max-Age=900; Path=/auth/callback
      - Call supabase.auth.signInWithOtp({ email }) to send magic link
      - Return 200 "Check your email"
  → On magic link click → /auth/callback:
      1. Read invite_code cookie
      2. If found: mark invite_codes row as used (used_by, used_at)
      3. Clear the cookie
      4. Redirect to /items as normal
```

**For open mode (first 50 users):** The existing `/login` flow continues unchanged. No invite code required.

**New files:**
- `apps/web/app/(auth)/register/page.tsx` — Registration page
- `apps/web/app/(auth)/register/register-form.tsx` — `'use client'` form with email + invite code fields
- `apps/web/app/api/auth/register/route.ts` — POST handler (validate + set cookie + send OTP)

**`/api/auth/register` route:**
```ts
// Check site mode + user count
const { data: setting } = await supabaseAdmin
  .from('site_settings').select('value').eq('key', 'registration_mode').single()
const { count } = await supabaseAdmin
  .from('users').select('*', { count: 'exact', head: true })

const needsCode = setting?.value === 'invite' || (count ?? 0) >= 50

if (needsCode) {
  const { data: inviteCode } = await supabaseAdmin
    .from('invite_codes')
    .select('id, code, used_by')
    .eq('code', body.code.trim().toUpperCase())
    .single()

  if (!inviteCode || inviteCode.used_by !== null) {
    return NextResponse.json({ error: 'Invalid or already used invite code' }, { status: 400 })
  }
}

// Send magic link
await supabaseAdmin.auth.admin.generateLink({ type: 'magiclink', email: body.email })
// OR: use the browser client's signInWithOtp from a server action

const response = NextResponse.json({ ok: true })
if (needsCode) {
  // Carry the validated code to the auth callback via cookie
  response.cookies.set('invite_code', body.code.trim().toUpperCase(), {
    httpOnly: true,
    path: '/auth/callback',
    maxAge: 900, // 15 min — long enough to receive and click the magic link
    sameSite: 'lax',
  })
}
return response
```

**Update `apps/web/app/auth/callback/route.ts`:**
```ts
// After session is established, consume invite code cookie if present
const inviteCode = request.cookies.get('invite_code')?.value
if (inviteCode) {
  await supabaseAdmin
    .from('invite_codes')
    .update({ used_by: session.user.id, used_at: new Date().toISOString() })
    .eq('code', inviteCode)
    .is('used_by', null) // idempotent — safe to call twice
  // Clear the cookie in the redirect response
  const redirectResponse = NextResponse.redirect(redirectUrl)
  redirectResponse.cookies.delete('invite_code')
  return redirectResponse
}
```

**Registration page (`/register`):**
- In open mode (and under 50): show email-only form (same as `/login`) or redirect to `/login`
- In invite mode: show email field + invite code field
- On submit: POST to `/api/auth/register`
- On success: "Check your email for a magic link"
- On error: show specific message (code invalid, code already used)

**Update login page** to include a "Need an invite code? Register here →" link when mode=invite.

**Acceptance criteria:**
- When `registration_mode = 'open'` and user count < 50: entering email on `/login` sends magic link normally.
- When `registration_mode = 'invite'` or user count ≥ 50: visiting `/login` shows a link to `/register`; `/register` requires both email and valid invite code.
- Invalid/used invite code returns error — no OTP is sent.
- Valid invite code is consumed exactly once (second attempt with same code returns "already used").
- Existing users can still log in via `/login` regardless of mode.

---

### S504 — Admin panel layout + user list
**Type:** feat
**Points:** 3
**Depends on:** none (admin API route pattern established in S3)

**Goal:** Give admins a protected panel to view and manage users.

**New routes:**
- `apps/web/app/(admin)/layout.tsx` — Admin layout with `is_admin` server-side guard
- `apps/web/app/(admin)/admin/page.tsx` — Admin home (redirects to `/admin/users`)
- `apps/web/app/(admin)/admin/users/page.tsx` — Paginated user list

**Admin auth guard (layout.tsx):**
```ts
// Server Component — runs on every admin route
const supabase = await createServerClient()
const { data: { user } } = await supabase.auth.getUser()
if (!user) redirect('/login')

const { data: profile } = await supabaseAdmin
  .from('users')
  .select('is_admin')
  .eq('id', user.id)
  .single()

if (!profile?.is_admin) notFound() // 404, not 403 — don't reveal route exists
```

**User list page data fetch:**
```ts
// Paginate: 50 per page, sorted by join date desc
const { data: users } = await supabaseAdmin
  .from('users')
  .select('id, email, tier, is_admin, created_at')
  .order('created_at', { ascending: false })
  .range(offset, offset + 49)

// Item count per user: run parallel count queries (one per user on this page)
// Supabase REST doesn't support GROUP BY — for ≤50 alpha users, N parallel count queries is acceptable
// Scale note: replace with a DB function `get_user_item_counts(user_ids uuid[])` when user count grows
const userIds = users.map(u => u.id)
const itemCountMap = new Map<string, number>()
await Promise.all(
  userIds.map(async (uid) => {
    const { count } = await supabaseAdmin
      .from('items')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', uid)
      .is('deleted_at', null)
    itemCountMap.set(uid, count ?? 0)
  })
)
```

**User list table columns:** Email | Tier | Items | Joined | Actions (Set Tier dropdown)

**Tier override:** Reuse existing `PATCH /api/admin/users/[userId]/tier` route (S310 — already built).

**Admin sidebar nav links:**
- Users (`/admin/users`)
- Block List (`/admin/blocks`) — S505
- Invite Codes (`/admin/invite-codes`) — S507
- Stats (`/admin/stats`) — S508

**Acceptance criteria:**
- Non-admin users hitting `/admin/*` receive a 404.
- Unauthenticated users are redirected to `/login`.
- User list shows all users with email, tier, item count, joined date.
- Changing a user's tier via the dropdown calls the existing API and updates the displayed tier.
- Table paginates at 50 rows per page with prev/next controls.

---

### S505 — Admin block list UI
**Type:** feat
**Points:** 2
**Depends on:** S504 (admin layout)

**Goal:** Let admins view, add, and remove entries from the block list. The ingest route already checks the block list — this ticket is the management UI.

**New route:** `apps/web/app/(admin)/admin/blocks/page.tsx`

**Data:**
```ts
const { data: blocks } = await supabaseAdmin
  .from('block_list')
  .select('id, type, value, created_at')
  .order('created_at', { ascending: false })
```

**UI:**
- Table: Type (Email/IP) | Value | Added | Actions (Remove button)
- "Add entry" form: type selector (email/ip) + value input + Add button
- POST to `/api/admin/blocks` (new route) — inserts row
- DELETE to `/api/admin/blocks/[id]` (new route) — deletes row

**New API routes:**
- `apps/web/app/api/admin/blocks/route.ts` — POST: add block entry
- `apps/web/app/api/admin/blocks/[id]/route.ts` — DELETE: remove block entry

Both routes: require session + `is_admin` check (same pattern as `PATCH /api/admin/users/[userId]/tier`).

**Input validation for POST:**
- `type` must be `'email'` or `'ip'`
- `value` must be non-empty string, trimmed
- Email: validate format with `z.string().email()`
- IP: validate IPv4/IPv6 format with `z.string().ip()`
- Duplicate block entries: return 409 with "Already blocked"

**Acceptance criteria:**
- Block list table shows all current entries.
- Admin-added entries (non-null `created_by`) show as "Admin"; auto-blocked entries (`created_by IS NULL`) show as "Auto-blocked" in the table.
- Admin can add an email block — that sender is silently discarded on next ingest attempt.
- Admin can add an IP block — stored but IP blocking in ingest is out of scope for v1 (stored for future enforcement; note this in UI).
- Admin can remove a block entry.
- Invalid email/IP format returns a validation error message.
- Duplicate entries return "Already blocked" (no duplicate rows created).

---

### S506 — Auto-block unknown senders after 10 attempts
**Type:** feat
**Points:** 2
**Depends on:** S505 (block_list write path exists)

**Goal:** Protect the system from spam by automatically adding repeat unknown-sender addresses to the block list.

**Background:** The ingest route currently silently discards emails from unregistered addresses. This ticket adds a Redis counter per unknown sender. After 10 attempts in 24 hours, the address is auto-added to `block_list`.

**Implementation — add to ingest route after the "user not found" early return:**

```ts
// Current code (after user lookup):
if (!user) {
  return NextResponse.json({ ok: true }, { status: 200 })
}

// Replace with:
if (!user) {
  // Track unknown sender attempts
  const redis = getRedis()
  const abuseKey = `abuse:unknown_sender:${senderEmail}`
  const attempts = await redis.incr(abuseKey)
  if (attempts === 1) {
    await redis.expire(abuseKey, 86400) // 24hr TTL on first increment
  }
  if (attempts >= 10) {
    // Auto-block: insert into block_list if not already present
    await supabaseAdmin
      .from('block_list')
      .upsert(
        { type: 'email', value: senderEmail, created_by: null },
        { onConflict: 'type,value', ignoreDuplicates: true }
      )
    // Don't delete Redis key — let it expire naturally; new attempts still blocked by block_list check
  }
  return NextResponse.json({ ok: true }, { status: 200 })
}
```

**Note:** The block list check already runs before the user lookup. On the 11th+ attempt from this sender, `block_list` check catches it first — the auto-block code is never reached again. This is correct.

**DB constraint:** Add a unique constraint to `block_list(type, value)` if not already present (needed for `upsert` with `onConflict`):
```sql
-- supabase/migrations/<timestamp>_s5_block_list_unique.sql
ALTER TABLE public.block_list ADD CONSTRAINT block_list_type_value_unique UNIQUE (type, value);
```
Apply with `npx supabase db push --linked` then `pnpm gen:types`.

**Acceptance criteria:**
- 10 ingest POSTs from an unregistered email within 24 hours automatically adds that email to `block_list` with `created_by = null`.
- The 11th attempt is caught by the existing block list check (before the user lookup) and silently discarded.
- The auto-block entry appears in the admin block list UI (S505) labeled "Auto-blocked".
- Redis key expires after 24 hours — counter resets (the DB block_list entry persists; only the counter resets).
- If Redis is unavailable: the `incr` call throws; wrap in try/catch and log error — do not let Redis failure prevent normal ingest.

---

### S507 — Admin invite code management UI
**Type:** feat
**Points:** 1
**Depends on:** S504 (admin layout), S503 (invite_codes table used)

**Goal:** Admins can generate, view, and revoke invite codes.

**New route:** `apps/web/app/(admin)/admin/invite-codes/page.tsx`

**Data:**
```ts
const { data: codes } = await supabaseAdmin
  .from('invite_codes')
  .select('id, code, used_by, used_at, created_at, created_by')
  .order('created_at', { ascending: false })
```

**UI:**
- Table: Code | Status (Unused / Used by {email} on {date}) | Created | Actions
- "Generate code" button: POST to `/api/admin/invite-codes`
- "Revoke" button (unused codes only): DELETE to `/api/admin/invite-codes/[id]`
- Toggle for `registration_mode`: radio buttons (Open / Invite-only), PATCH `/api/admin/settings`

**New API routes:**
- `apps/web/app/api/admin/invite-codes/route.ts` — POST: generate a new code (UUID-based, uppercase, formatted as `XXXX-XXXX-XXXX`)
- `apps/web/app/api/admin/invite-codes/[id]/route.ts` — DELETE: revoke an unused code
- `apps/web/app/api/admin/settings/route.ts` — PATCH: update `site_settings` row

All routes: require session + `is_admin` check.

**Code generation:**
```ts
import { randomUUID } from 'crypto'
function generateInviteCode(): string {
  const raw = randomUUID().replace(/-/g, '').toUpperCase().slice(0, 12)
  return `${raw.slice(0,4)}-${raw.slice(4,8)}-${raw.slice(8,12)}`
}
```

**Acceptance criteria:**
- "Generate code" creates a new `XXXX-XXXX-XXXX` formatted code and adds it to the table.
- Used codes show who used them and when; revoke button is disabled for used codes.
- Revoking an unused code removes it (soft delete or hard delete — hard is fine, codes are append-only logs).
- Admin can switch `registration_mode` between open and invite-only; change persists (verified by refreshing the page).

---

### S508 — Admin system stats
**Type:** feat
**Points:** 2
**Depends on:** S504 (admin layout)

**Goal:** Give admins a real-time view of system health — user growth, ingest volume, AI errors, and queue depth.

**New route:** `apps/web/app/(admin)/admin/stats/page.tsx`

**Stats to display:**

| Stat | Source | Query |
|---|---|---|
| Total users | `users` table | `COUNT(*)` |
| New users today | `users.created_at` | `COUNT(*) WHERE created_at >= today` |
| Items ingested today | `items.created_at` | `COUNT(*) WHERE created_at >= today` |
| Items with status=failed | `items.status` | `COUNT(*) WHERE status = 'failed'` |
| Total active items (not deleted) | `items.deleted_at` | `COUNT(*) WHERE deleted_at IS NULL` |
| Queue depth | BullMQ queue metrics | via Redis |

**Queue depth:** BullMQ exposes `queue.getJobCounts()` — returns `{ waiting, active, completed, failed, delayed }`. Call from a server-side API route (not directly from the page component, to avoid including BullMQ in the web bundle):

```ts
// apps/web/app/api/admin/stats/route.ts
// GET: return queue depth + item counts
// Admin-protected. Returns JSON.
```

The stats page fetches from `/api/admin/stats` client-side with `useEffect` + a "Refresh" button (auto-refresh every 30s optional, not required for v1).

**Fallback:** If queue metrics call fails (worker not running), show "Queue unavailable" — do not crash the page.

**Acceptance criteria:**
- Stats page loads without error even if the BullMQ worker is offline.
- User count, new users today, items ingested today, and failed items show correct values from the DB.
- Queue depth shows waiting/active job counts from Redis when the worker is running.
- A "Refresh" button re-fetches stats.

---

### S509 — Sentry error monitoring
**Type:** feat
**Points:** 2
**Depends on:** none

**Goal:** Capture unhandled errors from the web app and worker in Sentry. Give visibility into production crashes.

**Installation:**
```bash
pnpm --filter @drop-note/web add @sentry/nextjs
pnpm --filter @drop-note/worker add @sentry/node
```

**Next.js App Router setup (follows Sentry's Next.js v14 guide):**

1. `apps/web/instrumentation.ts` — Sentry init for server-side (Next.js instrumentation hook):
```ts
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config')
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config')
  }
}
```

2. `apps/web/sentry.client.config.ts` — client-side Sentry init
3. `apps/web/sentry.server.config.ts` — server-side Sentry init
4. `apps/web/sentry.edge.config.ts` — edge runtime Sentry init
5. `apps/web/next.config.ts` — wrap with `withSentryConfig(nextConfig, { ...sentryWebpackOptions })`

All four configs share the same structure:
```ts
import * as Sentry from '@sentry/nextjs'
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1, // 10% — enough for v1 alpha
  environment: process.env.NODE_ENV,
})
```

**Worker setup (`apps/worker/src/index.ts`):**
```ts
import * as Sentry from '@sentry/node'
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 0.1,
})
// Wrap job processor in Sentry.withScope for per-job context
```

**New env vars:**
```
NEXT_PUBLIC_SENTRY_DSN=   # client-visible DSN
SENTRY_DSN=               # worker DSN (same project or separate)
SENTRY_AUTH_TOKEN=        # for source map upload during build
SENTRY_ORG=
SENTRY_PROJECT=
```

Add all to `.env.local` template (not committed) and Vercel + Railway env var settings.

**Source maps:** Sentry webpack plugin uploads source maps on `pnpm build`. Set `hideSourceMaps: true` to prevent leaking source to the client.

**Do NOT wrap manual try/catch blocks to send to Sentry** — Sentry auto-captures unhandled exceptions. Only add `Sentry.captureException(err)` in catch blocks where errors are intentionally swallowed (e.g., fire-and-forget email sends).

**Acceptance criteria:**
- A deliberate `throw new Error('sentry-test')` in a route handler shows up in the Sentry dashboard.
- Worker job failures are captured with job ID context.
- Client-side unhandled errors are captured.
- Source maps are uploaded on build — stack traces in Sentry show original TypeScript line numbers.
- `NEXT_PUBLIC_SENTRY_DSN` is the only var prefixed with `NEXT_PUBLIC_` (DSN is safe to expose; auth token is not).

---

### S510 — Settings page
**Type:** feat
**Points:** 2
**Depends on:** S3 (Stripe portal route exists)

**Goal:** Give users a single place to see their drop address, subscription status, and manage their account.

**New route:** `apps/web/app/(dashboard)/settings/page.tsx`

The sidebar already has a "Settings" link pointing to `/dashboard/settings`. **Fix this:** the route should be `/settings` (under the dashboard layout), not `/dashboard/settings`. Update the sidebar link.

**Data fetch (Server Component):**
```ts
const supabase = await createServerClient()
const { data: { user } } = await supabase.auth.getUser()

const { data: profile } = await supabaseAdmin
  .from('users')
  .select('tier, stripe_customer_id, drop_token, created_at')
  .eq('id', user.id)
  .single()
```

**UI sections:**

**1. Drop Address**
```
Your drop address: drop@dropnote.com
[Copy]
```
All users share this address in v1 (as per v1-scope.md). Display as a read-only copyable field (reuse pattern from onboarding panel).

**2. Account**
- Email: `{user.email}` (read-only — magic link, no password to change)
- Member since: `{profile.created_at}` formatted to locale date
- Current plan: `Free` / `Pro` / `Power` badge

**3. Subscription** (shown when tier = pro or power)
- "Manage Subscription" → calls existing `POST /api/stripe/portal` and redirects
- For free tier: "Upgrade" button → links to `/pricing`

**4. Danger Zone**
- "Delete Account" button → opens confirmation dialog → calls `/api/account/delete` (S511)

**Acceptance criteria:**
- Settings page loads for all users without error.
- Drop address is shown and copyable.
- Current plan badge reflects live `users.tier` value.
- "Manage Subscription" takes paid users to the Stripe Customer Portal.
- Free users see "Upgrade" link to `/pricing`.
- Sidebar "Settings" link navigates to the settings page correctly.

---

### S511 — Account deletion
**Type:** feat
**Points:** 2
**Depends on:** S510 (settings page), S3 (Stripe)

**Goal:** Let users permanently delete their account and all associated data (GDPR Article 17 — right to erasure).

**New API route:** `apps/web/app/api/account/delete/route.ts` — POST (no body required; user is identified by session)

**Deletion order (must be sequential, not parallel — each step has FK deps on the next):**

```ts
export async function POST(request: Request) {
  // 1. Auth
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // 2. Cancel Stripe subscription (best-effort — do not fail if no subscription)
  const { data: profile } = await supabaseAdmin
    .from('users')
    .select('stripe_customer_id, tier')
    .eq('id', user.id)
    .single()

  if (profile?.stripe_customer_id && profile.tier !== 'free') {
    try {
      const stripe = getStripe()
      const subscriptions = await stripe.subscriptions.list({
        customer: profile.stripe_customer_id,
        status: 'active',
        limit: 1,
      })
      if (subscriptions.data.length > 0) {
        await stripe.subscriptions.cancel(subscriptions.data[0].id)
      }
    } catch (err) {
      console.error('[account/delete] Stripe cancel failed:', err)
      // Continue — user data must still be deleted
    }
  }

  // 3. Delete Supabase Storage files (items with file_path)
  const { data: itemsWithFiles } = await supabaseAdmin
    .from('items')
    .select('file_path')
    .eq('user_id', user.id)
    .not('file_path', 'is', null)

  if (itemsWithFiles?.length) {
    const paths = itemsWithFiles.map(i => i.file_path!)
    // Supabase Storage remove() accepts up to 1000 paths per call
    // Batch in chunks of 1000 to handle future power users with many attachments
    for (let i = 0; i < paths.length; i += 1000) {
      await supabaseAdmin.storage.from('attachments').remove(paths.slice(i, i + 1000))
    }
  }

  // 4. Delete items (cascades to item_tags via FK)
  await supabaseAdmin.from('items').delete().eq('user_id', user.id)

  // 5. Delete tags (orphaned after item_tags cascade)
  await supabaseAdmin.from('tags').delete().eq('user_id', user.id)

  // 6. Delete usage_log entries
  await supabaseAdmin.from('usage_log').delete().eq('user_id', user.id)

  // 7. Delete public.users row (triggers or cascades may handle some of above — belt+suspenders)
  await supabaseAdmin.from('users').delete().eq('id', user.id)

  // 8. Delete auth.users entry (Supabase Admin API)
  const { error } = await supabaseAdmin.auth.admin.deleteUser(user.id)
  if (error) {
    console.error('[account/delete] Auth user delete failed:', error)
    // At this point public data is gone; log for manual cleanup
  }

  return NextResponse.json({ ok: true })
}
```

**Settings page confirmation dialog:**
- `shadcn/ui AlertDialog` component
- Text: "This will permanently delete your account, all saved items, files, and cancel your subscription. This cannot be undone."
- Confirm button text: "Delete my account"
- On success: `supabase.auth.signOut()` → redirect to `/login?deleted=1`
- `/login` page: if `?deleted=1` show "Your account has been deleted."

**Acceptance criteria:**
- Confirmation dialog must be clicked before deletion — no single-click delete.
- After deletion: user is signed out, redirect to login with confirmation message.
- All items, tags, item_tags, usage_log, users rows are removed from the DB.
- Supabase Storage files are removed (verified via Supabase dashboard).
- Stripe subscription is cancelled (verified via Stripe test dashboard).
- Re-attempting login with the deleted email sends a new magic link and creates a fresh account (magic link invites = sign up).

---

### S512 — GDPR cookie consent banner
**Type:** feat
**Points:** 1
**Depends on:** none

**Goal:** Display a one-time cookie consent banner on first visit to satisfy GDPR/ePrivacy requirements for cookies.

**Scope:** v1 uses only essential cookies (Supabase session) and optionally Sentry (analytics). A simple "we use essential cookies" banner with Accept is sufficient for v1. No complex consent management library needed.

**Implementation:**

`apps/web/components/CookieBanner.tsx` — `'use client'` component:
```tsx
'use client'
import { useState, useEffect } from 'react'

export function CookieBanner() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!localStorage.getItem('cookie_consent')) {
      setVisible(true)
    }
  }, [])

  function accept() {
    localStorage.setItem('cookie_consent', 'accepted')
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background p-4 flex items-center justify-between gap-4">
      <p className="text-sm text-muted-foreground">
        We use essential cookies to keep you signed in.{' '}
        <a href="/privacy" className="underline">Privacy Policy</a>
      </p>
      <button
        onClick={accept}
        className="shrink-0 rounded-md bg-primary px-4 py-1.5 text-sm text-primary-foreground hover:bg-primary/90"
      >
        Accept
      </button>
    </div>
  )
}
```

Add `<CookieBanner />` to `apps/web/app/layout.tsx` (root layout, outside auth check — appears for all visitors including logged-out).

**Privacy Policy page:** Create `apps/web/app/privacy/page.tsx` as a static page with a placeholder (`<p>Privacy policy coming soon.</p>`). Required for the banner link. Full legal text = out of scope for this ticket.

**Acceptance criteria:**
- Banner appears on first visit (all pages) for new visitors.
- Clicking Accept hides the banner and sets `localStorage.cookie_consent`.
- Refreshing after acceptance: banner does not reappear.
- Banner renders correctly at 375px (mobile) — text wraps, button remains tappable.
- SSR: banner does not cause hydration mismatch (controlled by `useEffect` — renders null on server, only shows on client after localStorage check).

---

### S513 — Mobile responsiveness pass
**Type:** feat
**Points:** 2
**Depends on:** S501 (realtime), S510 (settings)

**Goal:** Make the dashboard usable on mobile (375px–768px). The sidebar becomes a slide-in drawer on small screens.

**Target breakpoints:**
- `< 768px` (mobile): sidebar hidden by default, accessible via hamburger button → shadcn Sheet drawer
- `≥ 768px` (tablet+): sidebar always visible (current behavior)

**Changes:**

**`apps/web/components/layout/sidebar.tsx`:**
- Extract `SidebarContent` as a shared component (the nav links + tags + date sections)
- On desktop (`hidden md:flex`): render as the existing fixed `<aside>`
- On mobile: render nothing (drawer handles it)

**New `apps/web/components/layout/MobileSidebar.tsx`:** `'use client'` component:
```tsx
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { Menu } from 'lucide-react'

export function MobileSidebar(props: SidebarProps) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <button aria-label="Open menu" className="md:hidden p-2">
          <Menu size={20} />
        </button>
      </SheetTrigger>
      <SheetContent side="left" className="w-64 p-0">
        <SidebarContent {...props} />
      </SheetContent>
    </Sheet>
  )
}
```

**`apps/web/app/(dashboard)/layout.tsx`:**
- Add a top bar (`<header>`) visible only on mobile (`md:hidden`): contains `<MobileSidebar>` hamburger + "drop-note" wordmark
- Hide the desktop sidebar at `< md`: `<div className="hidden md:flex">...</div>`

**Item cards at 375px:**
- Verify `ItemCard` text truncates correctly and tag chips wrap without overflow
- Verify bulk checkbox doesn't push card content offscreen
- No fixed widths on card internals — use `min-w-0` + `truncate` as needed

**Item detail at 375px:**
- Verify the edit form for `ai_summary` / `notes` is full-width and usable
- Verify attachment list doesn't overflow

**Acceptance criteria:**
- At 375px viewport width: no horizontal scroll on the items list page.
- Hamburger button opens the sidebar as a Sheet drawer.
- Closing the drawer (tap outside or swipe left) collapses it.
- All primary actions (pin, delete, bulk select, search) are reachable on mobile.
- At 768px+: no visual regression — desktop sidebar still renders as a fixed column.

---

### S514 — Error boundaries + 404/500 pages
**Type:** feat
**Points:** 1
**Depends on:** S509 (Sentry)

**Goal:** Ensure all unhandled errors and missing routes show useful pages to the user and are captured by Sentry. Verify and complete what already exists.

**Current state (from S1/S4):**
- `apps/web/app/error.tsx` — exists (root error boundary)
- `apps/web/app/not-found.tsx` — exists (root 404)
- `apps/web/app/(dashboard)/error.tsx` — exists (dashboard error boundary)

**What to verify and complete:**

1. **Root `error.tsx`:** Confirm it calls `Sentry.captureException(error)` in its `useEffect`. Add if missing:
```tsx
'use client'
import { useEffect } from 'react'
import * as Sentry from '@sentry/nextjs'

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }, reset: () => void }) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4">
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="text-sm text-muted-foreground">Our team has been notified.</p>
      <button onClick={reset} className="...">Try again</button>
    </div>
  )
}
```

2. **Dashboard `error.tsx`:** Same Sentry capture + "Try again" / "Go to home" options.

3. **Root `not-found.tsx`:** Verify it renders a user-friendly 404 page with a "Go home" link. 404s are not captured by Sentry (not errors — expected behavior).

4. **Add `global-error.tsx`:** Next.js App Router requires a separate `global-error.tsx` at the app root (next to `layout.tsx`) to catch errors thrown in root layout. This is distinct from `error.tsx`:
```tsx
// apps/web/app/global-error.tsx
'use client'
// Replaces the root layout on crash — must include <html> and <body>
export default function GlobalError({ error, reset }: ...) {
  return (
    <html><body>
      <div ...>Critical error. <button onClick={reset}>Reload</button></div>
    </body></html>
  )
}
```

5. **`apps/web/app/(dashboard)/loading.tsx`:** Already exists. Verify it shows a skeleton that matches the items page layout (not just a spinner).

**Acceptance criteria:**
- Navigating to a nonexistent route returns a 404 page with a "Go home" link.
- A thrown error in a route handler or server component shows the error boundary page.
- Error boundary captures the error in Sentry (verified in Sentry dashboard by triggering a test throw).
- `global-error.tsx` exists and handles root layout crashes without showing a blank page.
- No `console.error` output for handled 404s.

---

## Sprint 5 Summary

| Ticket | Title | Points |
|---|---|---|
| S501 | Supabase Realtime subscription | 3 |
| S502 | Processing status UX | 2 |
| S503 | Registration gate + invite code flow | 3 |
| S504 | Admin panel layout + user list | 3 |
| S505 | Admin block list UI | 2 |
| S506 | Auto-block unknown senders | 2 |
| S507 | Admin invite code management | 1 |
| S508 | Admin system stats | 2 |
| S509 | Sentry integration | 2 |
| S510 | Settings page | 2 |
| S511 | Account deletion | 2 |
| S512 | GDPR cookie banner | 1 |
| S513 | Mobile responsiveness pass | 2 |
| S514 | Error boundaries + 404/500 pages | 1 |
| **Total** | | **28** |
