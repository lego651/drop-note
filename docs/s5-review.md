# S5 Code Review — Post-Sprint Audit

**Reviewer:** Tech Lead / Code Auditor
**Date:** 2026-03-27
**Scope:** All files added or modified in Sprint 5 commits (`[s5]`), covering S501–S514
**Verdict:** Sprint 5 delivered an impressive volume of work — 14 tickets across Realtime subscriptions, a full admin panel (users, blocks, invite codes, stats), registration gating, Sentry integration, account deletion, mobile responsiveness, cookie consent, and error boundaries. The architectural decisions are mostly sound: the admin `is_admin` guard in the layout is correct, the Realtime hook approach in `useRealtimeItems` follows the Supabase pattern, the Sentry instrumentation setup is textbook, and the mobile sidebar-as-Sheet approach is clean.

However, several critical bugs will prevent features from working in production: the registration route generates a magic link but never sends the email (users see "Check your email" and nothing arrives), the ingest route's auto-block logic creates `block_list` entries that are never checked for unknown senders (defeating the purpose of S506), and the `block_list.created_by` column exists in the DB schema but is missing from the generated TypeScript types — causing a type mismatch in the ingest upsert. The login page silently ignores `?deleted=1` so account deletion has no user confirmation. Multiple routes reference `/dashboard` as the primary destination, but that route doesn't exist — the app uses `/items`.

Beyond bugs, there are structural issues: the `requireAdmin()` function is copy-pasted verbatim across 6 API routes, the admin stats route creates and tears down a Redis connection on every request, and the Realtime hook accumulates state indefinitely without cleanup.

**20 findings total: 5 P0, 5 P1, 6 P2, 4 P3.**

---

## Severity Legend

| Level | Meaning |
|-------|---------|
| **P0 — Critical** | Will cause silent failures, broken features, or data corruption in production. Fix immediately. |
| **P1 — High** | Incorrect behavior, security gap, or significant technical debt. Fix before launch. |
| **P2 — Medium** | Best-practice violation, convention break, or latent performance issue. Fix this sprint or next. |
| **P3 — Low** | Cleanup / DX improvement. Schedule when convenient. |

---

## S5-R001 · P0 · Registration route generates magic link but never sends the email

**What's wrong:**
In `apps/web/app/api/auth/register/route.ts` line 43:
```ts
const { error: otpError } = await supabaseAdmin.auth.admin.generateLink({
  type: 'magiclink',
  email,
  options: {
    redirectTo: `${new URL(request.url).origin}/auth/callback`,
  },
})
```

`supabaseAdmin.auth.admin.generateLink()` returns an `action_link` object but **does not send an email**. From the Supabase docs: "Generates email links and OTPs to be sent via a custom email provider." The caller is responsible for delivering the email.

The route returns `{ ok: true }`, the client shows "Check your email", and the user never receives anything. Registration is completely broken for all invite-code users.

**Contrast with login:** The login form uses `supabase.auth.signInWithOtp({ email })` which **does** send the email via Supabase's configured SMTP/email provider. The register route should use the same mechanism, or must send the generated link via Resend.

**File:** `apps/web/app/api/auth/register/route.ts`

**Actionable steps:**
1. **Option A (recommended):** Replace `generateLink` with a server-side Supabase client `signInWithOtp()` call, matching the login flow. This sends the email automatically via Supabase's configured email provider.
2. **Option B:** Keep `generateLink` but extract the `action_link` from the response and send it via Resend (the project's email service) using a registration email template.
3. In either case, verify the magic link's redirect URL includes the `/auth/callback` path so the invite code cookie is consumed.
4. Add an integration test that verifies a register request results in an email delivery (mock the email provider, assert it was called).

**Acceptance:**
- A new user entering email + valid invite code on `/register` receives a magic link email within 30 seconds.
- Clicking the link completes auth callback, consumes the invite code, and redirects to `/items`.

---

## S5-R002 · P0 · Block list never checked for unknown senders — auto-block is functionally useless

**What's wrong:**
In `apps/web/app/api/ingest/route.ts`, the execution order is:

1. **Line 152:** User lookup — `supabase.from('users').select(...).eq('email', senderEmail)`
2. **Line 159:** If `!user` → enter auto-block logic (Redis incr, upsert to `block_list` after 10 attempts), then `return`
3. **Line 183:** Block list check — `supabase.from('block_list').select(...).eq('value', senderEmail)`

Step 3 **only runs if the user exists** (step 2 returns early for unknown senders). This means:

- Attempt 10 from an unknown sender: Redis counter hits 10, email added to `block_list`. Good.
- Attempt 11+: Code enters `!user` branch again, Redis increments to 11+, `upsert` with `ignoreDuplicates` is a no-op. The `block_list` entry is **never checked** because the check is at step 3, after the `!user` early return.

The S506 ticket specification explicitly states: "On the 11th+ attempt from this sender, `block_list` check catches it first — the auto-block code is never reached again." **This is not what the code does.** Every subsequent attempt still performs a user lookup, Redis call, and upsert attempt.

**Impact:** Auto-block creates entries that are never enforced for unknown senders. The feature provides zero protection — it's purely decorative database writes.

**File:** `apps/web/app/api/ingest/route.ts`

**Actionable steps:**
1. Move the block list check **before** the user lookup:
   ```ts
   // Block list check — must run BEFORE user lookup
   const { data: blocked } = await supabase
     .from('block_list')
     .select('id')
     .eq('type', 'email')
     .eq('value', senderEmail)
     .maybeSingle()
   if (blocked) {
     return NextResponse.json({ ok: true }, { status: 200 })
   }

   // User lookup
   const { data: user } = await supabase
     .from('users')
     .select('id, tier, email')
     .eq('email', senderEmail)
     .maybeSingle()
   ```
2. This also improves performance — blocked emails (both admin-blocked and auto-blocked) are rejected with a single DB query instead of going through user lookup + Redis.
3. Verify with a test: simulate 12 ingest POSTs from an unregistered email. Assert that attempts 11+ are caught by the block list check and never hit the Redis auto-block path.

**Acceptance:**
- After 10 attempts from an unregistered email, the `block_list` entry exists.
- Attempt 11+ is rejected at the block list check (before user lookup).
- No Redis calls are made for already-blocked senders.

---

## S5-R003 · P0 · `block_list.created_by` missing from generated types — ingest upsert will fail typecheck

**What's wrong:**
The S1 migration defines `block_list` with a `created_by uuid` column (confirmed in `s5-tickets.md` schema reference). But the generated TypeScript types in `packages/shared/src/database.types.ts` show `block_list` with only 4 columns:

```ts
block_list: {
  Row: {
    created_at: string
    id: string
    type: Database["public"]["Enums"]["block_list_entry_type"]
    value: string
  }
  // Insert and Update types also lack created_by
}
```

The ingest route (S506) does:
```ts
.upsert(
  { type: 'email', value: senderEmail, created_by: null },
  { onConflict: 'type,value', ignoreDuplicates: true }
)
```

Passing `created_by: null` to an Insert type that doesn't include `created_by` will fail `pnpm turbo typecheck`. At runtime, Supabase may silently ignore the extra field or throw, depending on the client version.

This also means the admin blocks page (S505) cannot query `created_by` to distinguish admin-added vs auto-blocked entries — a gap noted separately in S5-R010.

**Files:** `packages/shared/src/database.types.ts`, `apps/web/app/api/ingest/route.ts`

**Actionable steps:**
1. Run `pnpm gen:types` to regenerate types from the live DB schema. Confirm `created_by` appears in the `block_list` table types.
2. If the column doesn't exist in the live DB, add a migration: `ALTER TABLE public.block_list ADD COLUMN created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;`
3. After types are regenerated, verify `pnpm turbo typecheck` passes.
4. Update the admin blocks POST route to set `created_by: admin.id` when an admin adds a block entry.

**Acceptance:**
- `pnpm turbo typecheck` passes without errors.
- `block_list` Insert/Update types include `created_by`.
- Admin-added block entries have `created_by` set to the admin's user ID.

---

## S5-R004 · P0 · Account deletion cascading deletes have zero error handling

**What's wrong:**
In `apps/web/app/api/account/delete/route.ts`, lines 50–67 perform 5 sequential deletes with **no error checking**:

```ts
await supabaseAdmin.from('items').delete().eq('user_id', user.id)       // no error check
await supabaseAdmin.from('tags').delete().eq('user_id', user.id)        // no error check
await supabaseAdmin.from('usage_log').delete().eq('user_id', user.id)   // no error check
await supabaseAdmin.from('users').delete().eq('id', user.id)            // no error check
const { error: deleteAuthError } = await supabaseAdmin.auth.admin.deleteUser(user.id)
```

If the `items` delete fails (e.g., RLS policy, network error), the code continues to delete tags, usage_log, and the user row. This leaves orphaned items pointing to a deleted user. If the `users` delete fails but `auth.admin.deleteUser` succeeds, the auth account is gone but the `public.users` row persists — the `on_auth_user_created` trigger won't recreate it if the user re-registers.

**Impact:** Partial account deletion leaves the database in an inconsistent state with no way for the user or admin to recover.

**File:** `apps/web/app/api/account/delete/route.ts`

**Actionable steps:**
1. Check each delete's `{ error }` response. If any critical delete fails (items, users, auth), log the error and return a 500 with context.
2. Consider wrapping the deletes in a Supabase RPC that runs as a transaction:
   ```sql
   CREATE OR REPLACE FUNCTION delete_user_data(target_user_id uuid)
   RETURNS void AS $$
   BEGIN
     DELETE FROM item_tags WHERE item_id IN (SELECT id FROM items WHERE user_id = target_user_id);
     DELETE FROM items WHERE user_id = target_user_id;
     DELETE FROM tags WHERE user_id = target_user_id;
     DELETE FROM usage_log WHERE user_id = target_user_id;
     DELETE FROM users WHERE id = target_user_id;
   END;
   $$ LANGUAGE plpgsql SECURITY DEFINER;
   ```
3. Call `supabaseAdmin.rpc('delete_user_data', { target_user_id: user.id })` followed by `auth.admin.deleteUser()`.
4. Keep Stripe cancellation and Storage cleanup as best-effort outside the transaction (they already are).

**Acceptance:**
- If any delete operation fails, the endpoint returns 500 with an error message — not a false `{ ok: true }`.
- All-or-nothing: either all user data is deleted, or none is (transaction rollback).
- Stripe cancel and Storage cleanup remain best-effort (logged but not blocking).

---

## S5-R005 · P0 · Login page doesn't show "account deleted" confirmation message

**What's wrong:**
S511 specifies: "/login page: if `?deleted=1` show 'Your account has been deleted.'"

After successful account deletion, `SettingsClient.tsx` redirects to `/login?deleted=1`. But the login page (`apps/web/app/(auth)/login/page.tsx`) does not read the `deleted` search param:

```ts
export default async function LoginPage({ searchParams }: { searchParams?: Record<string, string | string[] | undefined> }) {
  return <LoginForm redirectTo={searchParams?.next as string | undefined} />
}
```

Only `next` is read. `deleted` is ignored. `LoginForm` has no prop or logic to display a deletion confirmation message.

**Impact:** After deleting their account, the user is redirected to a standard login page with no feedback. They may think something went wrong or try to log in again.

**Files:** `apps/web/app/(auth)/login/page.tsx`, `apps/web/app/(auth)/login/login-form.tsx`

**Actionable steps:**
1. Pass `deleted` (and `error`) search params to `LoginForm`:
   ```ts
   return <LoginForm
     redirectTo={searchParams?.next as string | undefined}
     deleted={searchParams?.deleted === '1'}
     authError={searchParams?.error === 'auth'}
   />
   ```
2. In `LoginForm`, show a success banner when `deleted` is true: "Your account has been deleted."
3. Also handle `?error=auth` from the auth callback failure path (currently also ignored).

**Acceptance:**
- After account deletion redirect, login page shows "Your account has been deleted." message.
- The message uses a non-destructive color (e.g., `text-muted-foreground`) — it's a confirmation, not an error.
- After `?error=auth`, login page shows "Authentication failed. Please try again."

---

## S5-R006 · P1 · Auth callback and not-found link to `/dashboard` — route doesn't exist

**What's wrong:**
Two files reference `/dashboard` as the primary destination:

1. **`apps/web/app/auth/callback/route.ts` line 49:**
   ```ts
   return NextResponse.redirect(`${origin}${isValidNext ? next : '/dashboard'}`)
   ```
2. **`apps/web/app/not-found.tsx` line 14:**
   ```tsx
   <Link href="/dashboard" ...>Go to dashboard</Link>
   ```

The app's primary authenticated route is `/items`, not `/dashboard`. There is no route at `/dashboard` — the `(dashboard)` route group is a layout group (parenthesized), not a URL segment. Redirecting to `/dashboard` will hit the not-found page, which links back to `/dashboard`, creating an infinite loop of 404s.

**Files:** `apps/web/app/auth/callback/route.ts`, `apps/web/app/not-found.tsx`

**Actionable steps:**
1. Change auth callback default redirect from `/dashboard` to `/items`.
2. Change not-found link from `/dashboard` to `/items`.
3. Search the entire codebase for other references to `/dashboard` and fix them.

**Acceptance:**
- After successful auth, user lands on `/items`.
- The 404 page "Go home" link navigates to `/items`.
- No references to `/dashboard` as a URL path remain in the codebase.

---

## S5-R007 · P1 · Admin settings PATCH route accepts arbitrary keys — no whitelist

**What's wrong:**
In `apps/web/app/api/admin/settings/route.ts`, the PATCH handler accepts any `key` and `value`:

```ts
const { error } = await supabaseAdmin
  .from('site_settings')
  .update({ value: body.value })
  .eq('key', body.key)
```

There is no validation that `body.key` is a known setting or that `body.value` is valid for that key. An admin (or an attacker who compromises an admin session) could:
- Set `registration_mode` to an arbitrary string (e.g., `'closed'`), breaking the registration gate logic that checks for `'invite'`.
- Update `open_slots` to a non-numeric value, breaking any code that `parseInt()`s it.
- Insert or update keys that don't exist, creating phantom settings.

**File:** `apps/web/app/api/admin/settings/route.ts`

**Actionable steps:**
1. Add a whitelist of allowed keys and their valid values:
   ```ts
   const ALLOWED_SETTINGS: Record<string, (v: string) => boolean> = {
     registration_mode: (v) => v === 'open' || v === 'invite',
     open_slots: (v) => /^\d+$/.test(v) && parseInt(v) >= 0,
   }
   ```
2. Reject requests with unknown keys (400) or invalid values (400).
3. Add unit tests verifying that invalid keys and values are rejected.

**Acceptance:**
- `PATCH { key: 'registration_mode', value: 'invite' }` succeeds.
- `PATCH { key: 'registration_mode', value: 'closed' }` returns 400.
- `PATCH { key: 'unknown_key', value: '...' }` returns 400.
- `PATCH { key: 'open_slots', value: 'abc' }` returns 400.

---

## S5-R008 · P1 · `requireAdmin()` copy-pasted in 6 admin API routes

**What's wrong:**
The exact same `requireAdmin()` function is duplicated verbatim in:
1. `apps/web/app/api/admin/blocks/route.ts`
2. `apps/web/app/api/admin/blocks/[id]/route.ts`
3. `apps/web/app/api/admin/invite-codes/route.ts`
4. `apps/web/app/api/admin/invite-codes/[id]/route.ts`
5. `apps/web/app/api/admin/settings/route.ts`
6. `apps/web/app/api/admin/stats/route.ts`

Each copy: creates a server Supabase client, calls `getUser()`, queries `users.is_admin`, returns `null` or the user. If the auth check logic needs to change (e.g., add audit logging, change from 403 to 401 for unauthenticated), all 6 files must be updated in lockstep.

**Impact:** Maintenance hazard and DRY violation. Divergent copies are inevitable as the admin panel grows.

**Files:** All 6 files listed above

**Actionable steps:**
1. Extract `requireAdmin()` into a shared utility: `apps/web/lib/admin.ts` (or `apps/web/lib/auth/require-admin.ts`).
2. Return a discriminated result: `{ user: User } | { error: NextResponse }` so callers can early-return the error response directly.
3. Replace all 6 copies with the shared import.
4. Consider a higher-order wrapper: `withAdminAuth(handler)` that automatically rejects non-admins, reducing per-route boilerplate further.

**Acceptance:**
- `requireAdmin()` exists in exactly one file.
- All 6 admin API routes import and use the shared version.
- Adding a new admin route requires zero auth logic — just import the helper.

---

## S5-R009 · P1 · Realtime hook accumulates state arrays indefinitely — memory leak

**What's wrong:**
In `apps/web/hooks/useRealtimeItems.ts`:

```ts
(payload) => setNewItems((prev) => [payload.new as ItemSummary, ...prev])
```

and:

```ts
(payload) => setUpdatedItems((prev) => {
  const updated = payload.new as ItemSummary
  // ... finds or appends
  return [...prev, updated]
})
```

Both `newItems` and `updatedItems` arrays grow monotonically. They are never cleared or capped. In `ItemsPageClient.tsx`, the `useEffect` that prepends new items and applies updates runs on every change, but the hook's internal arrays are never reset.

For a user who leaves their tab open while processing many emails (or for a power user who sends hundreds of emails per day), both arrays grow without bound. Each entry is a full `ItemSummary` object (subject, summary, tags, timestamps).

**File:** `apps/web/hooks/useRealtimeItems.ts`, `apps/web/components/items/ItemsPageClient.tsx`

**Actionable steps:**
1. After `ItemsPageClient` consumes new/updated items and merges them into `optimisticItems`, clear the hook's state:
   ```ts
   // In useRealtimeItems, expose a reset function
   const clearNewItems = useCallback(() => setNewItems([]), [])
   const clearUpdatedItems = useCallback(() => setUpdatedItems([]), [])
   return { newItems, updatedItems, clearNewItems, clearUpdatedItems }
   ```
2. In the consuming `useEffect`s, call the clear functions after merging:
   ```ts
   useEffect(() => {
     if (newItems.length === 0) return
     setOptimisticItems(prev => { /* merge logic */ })
     clearNewItems()
   }, [newItems, clearNewItems])
   ```
3. Alternatively, redesign the hook to use a callback pattern (`onInsert`, `onUpdate`) instead of accumulating state, which avoids the problem entirely.

**Acceptance:**
- After a Realtime INSERT is consumed, the hook's `newItems` array is empty.
- After a Realtime UPDATE is consumed, the hook's `updatedItems` array is empty.
- A tab open for 1 hour with 100 Realtime events does not accumulate 100+ entries in hook state.

---

## S5-R010 · P1 · Admin blocks page missing "Admin" vs "Auto-blocked" source label

**What's wrong:**
S505 acceptance criteria explicitly requires: "Admin-added entries (non-null `created_by`) show as 'Admin'; auto-blocked entries (`created_by IS NULL`) show as 'Auto-blocked' in the table."

The `BlockListClient` component renders 4 columns: Type, Value, Added (date), Actions. There is no "Source" column. The server component (`blocks/page.tsx`) queries only `id, type, value, created_at` — `created_by` is not selected.

Even if `created_by` were queried, the admin blocks POST route (`/api/admin/blocks/route.ts`) doesn't set `created_by` on insert:
```ts
const { data: block, error } = await supabaseAdmin
  .from('block_list')
  .insert({ type, value })  // no created_by
```

**Files:** `apps/web/app/(admin)/admin/blocks/page.tsx`, `apps/web/app/(admin)/admin/blocks/BlockListClient.tsx`, `apps/web/app/api/admin/blocks/route.ts`

**Actionable steps:**
1. Fix S5-R003 first (get `created_by` into the types).
2. Update the blocks POST route to include `created_by: admin.id` in the insert.
3. Update the blocks page server query to include `created_by` in the select.
4. Add a "Source" column to the table:
   - `created_by` is not null → "Admin"
   - `created_by` is null → "Auto-blocked"
5. Pass the admin user ID from `requireAdmin()` to the insert call.

**Acceptance:**
- Block entries added by an admin show "Admin" in the Source column.
- Block entries created by the auto-block system (S506) show "Auto-blocked".
- The distinction is visible in the admin block list table.

---

## S5-R011 · P2 · `InviteCodesClient` uses `dark:` variant and raw Tailwind colors

**What's wrong:**
In `apps/web/app/(admin)/admin/invite-codes/InviteCodesClient.tsx` line 110:
```tsx
<span className="text-green-600 dark:text-green-400">Unused</span>
```

This violates two project conventions from `CLAUDE.md`:
1. **"No `dark:` variants in components — only in `globals.css`"** — the `dark:text-green-400` class belongs in a CSS variable, not inline.
2. **"No raw Tailwind color classes — always use semantic tokens"** — `text-green-600` is a raw color. Should use a semantic token like a custom `--color-success` variable mapped in `globals.css`.

**File:** `apps/web/app/(admin)/admin/invite-codes/InviteCodesClient.tsx`

**Actionable steps:**
1. Define a semantic success color in `globals.css`:
   ```css
   :root { --color-status-success: 22 163 74; }  /* green-600 */
   .dark { --color-status-success: 74 222 128; }  /* green-400 */
   ```
2. Replace the inline classes with the semantic token: `className="text-status-success"`.
3. Alternatively, use an existing semantic class if one fits (e.g., create a Badge variant for "success" status).

**Acceptance:**
- No `dark:` utility classes in any S5 component file.
- No raw Tailwind color classes (`text-green-*`, `text-red-*`, etc.) in S5 component files.
- Colors adapt to light/dark mode via CSS variables.

---

## S5-R012 · P2 · Admin stats route creates a new Redis connection per request

**What's wrong:**
In `apps/web/app/api/admin/stats/route.ts`, the GET handler creates fresh `IORedis` and `Queue` instances on every request:

```ts
const IORedis = (await import('ioredis')).default
const { Queue } = await import('bullmq')
const connection = new IORedis(process.env.REDIS_URL!, {
  maxRetriesPerRequest: 1,
  enableOfflineQueue: false,
  lazyConnect: true,
  connectTimeout: 3000,
})
await connection.connect()
const q = new Queue(QUEUE_NAME, { connection })
const counts = await q.getJobCounts()
await q.close()
await connection.quit()
```

This is 4 network operations per request (connect, getJobCounts, queue close, connection quit) plus the overhead of dynamic imports. The ingest route already uses a lazy singleton for its `Queue` instance (the `getQueue()` function). The stats route should follow the same pattern.

**File:** `apps/web/app/api/admin/stats/route.ts`

**Actionable steps:**
1. Extract a shared `getQueue()` or `getQueueMetrics()` helper that reuses a connection.
2. Use the existing lazy singleton pattern from the ingest route, or create a shared `lib/redis.ts` that exports a reusable `IORedis` connection.
3. Keep the `try/catch` and fallback for when Redis is unavailable.

**Acceptance:**
- Admin stats page loads queue metrics using a reused connection, not a fresh one per request.
- If Redis is unavailable, the page still loads with "Queue unavailable" message (current behavior preserved).

---

## S5-R013 · P2 · Admin users page fires N+1 queries for item counts

**What's wrong:**
In `apps/web/app/(admin)/admin/users/page.tsx`, after fetching the user list (1 query), the page fires one count query per user:

```ts
await Promise.all(
  userList.map(async (u) => {
    const { count: c } = await supabaseAdmin
      .from('items')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', u.id)
      .is('deleted_at', null)
    itemCountMap.set(u.id, c ?? 0)
  })
)
```

For a full page of 50 users, that's 51 queries total. The S504 ticket acknowledges this: "for ≤50 alpha users, N parallel count queries is acceptable" and notes the scale fix: "replace with a DB function `get_user_item_counts(user_ids uuid[])` when user count grows."

While acceptable for alpha, this pattern will become a problem as the user base grows, and it's a straightforward optimization.

**File:** `apps/web/app/(admin)/admin/users/page.tsx`

**Actionable steps:**
1. Create a Postgres function:
   ```sql
   CREATE OR REPLACE FUNCTION get_user_item_counts(user_ids uuid[])
   RETURNS TABLE(user_id uuid, item_count bigint) AS $$
     SELECT user_id, COUNT(*) as item_count
     FROM items
     WHERE user_id = ANY(user_ids)
       AND deleted_at IS NULL
     GROUP BY user_id;
   $$ LANGUAGE sql SECURITY INVOKER;
   ```
2. Call it with `supabaseAdmin.rpc('get_user_item_counts', { user_ids: userList.map(u => u.id) })`.
3. This reduces 50 queries to 1, regardless of page size.

**Acceptance:**
- Admin users page loads with 2 queries total (users + item counts).
- Item counts are correct for each user.

---

## S5-R014 · P2 · `global-error.tsx` uses hardcoded colors that don't respect dark mode

**What's wrong:**
In `apps/web/app/global-error.tsx`, inline styles use hardcoded color values:
```tsx
<p style={{ fontSize: '0.875rem', color: '#6b7280' }}>...</p>
<button style={{ background: '#111827', color: '#fff', ... }}>Reload</button>
```

`#6b7280` (gray-500) and `#111827` (gray-900) are light-mode-only values. In dark mode, gray text on a dark background will be nearly invisible, and the dark button will blend into the background.

This is understandable — `global-error.tsx` replaces the root layout so Tailwind CSS is unavailable. However, a CSS media query can handle this.

**File:** `apps/web/app/global-error.tsx`

**Actionable steps:**
1. Add a `<style>` tag inside the `<html>` element with a `prefers-color-scheme` media query:
   ```tsx
   <html lang="en">
     <head>
       <style>{`
         body { background: #fff; color: #111827; }
         @media (prefers-color-scheme: dark) {
           body { background: #111827; color: #f9fafb; }
           .ge-btn { background: #f9fafb !important; color: #111827 !important; }
           .ge-sub { color: #9ca3af !important; }
         }
       `}</style>
     </head>
     <body>
   ```
2. Apply the class names to the corresponding elements.

**Acceptance:**
- Global error page is readable in both light and dark system color schemes.
- Button is visible and clickable in dark mode.

---

## S5-R015 · P2 · Admin panel has no `loading.tsx` — no navigation feedback

**What's wrong:**
The admin route group `apps/web/app/(admin)/` has no `loading.tsx` file. When navigating between admin pages (Users → Blocks → Invite Codes → Stats), there is no loading indicator. The dashboard route group has a `loading.tsx` for skeleton feedback during navigation — the admin panel should have one too.

The admin pages make server-side DB queries (users page: 51 queries, blocks page: 1 query, invite codes: 2+ queries, stats: client-side). Without a loading indicator, clicking a nav link appears to do nothing until the server query completes.

**File:** (missing) `apps/web/app/(admin)/admin/loading.tsx`

**Actionable steps:**
1. Create `apps/web/app/(admin)/admin/loading.tsx` with a skeleton or spinner matching the admin panel's layout.
2. A simple centered spinner is sufficient for alpha:
   ```tsx
   export default function AdminLoading() {
     return (
       <div className="flex items-center justify-center h-64">
         <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
       </div>
     )
   }
   ```

**Acceptance:**
- Navigating between admin pages shows a loading indicator.
- The indicator disappears when the new page's data has loaded.

---

## S5-R016 · P2 · Block list remove and invite code revoke have no error feedback

**What's wrong:**
In `BlockListClient.tsx`:
```ts
async function handleRemove(id: string) {
  const res = await fetch(`/api/admin/blocks/${id}`, { method: 'DELETE' })
  if (res.ok) {
    setBlocks((prev) => prev.filter((b) => b.id !== id))
  }
  // No else — silent failure
}
```

In `InviteCodesClient.tsx`:
```ts
async function handleRevoke(id: string) {
  const res = await fetch(`/api/admin/invite-codes/${id}`, { method: 'DELETE' })
  if (res.ok) {
    setCodes((prev) => prev.filter((c) => c.id !== id))
  }
  // No else — silent failure
}
```

If the DELETE request fails (network error, server error), the user gets no feedback. The item remains in the list, but the user might click "Remove" repeatedly, thinking it's laggy.

**Files:** `apps/web/app/(admin)/admin/blocks/BlockListClient.tsx`, `apps/web/app/(admin)/admin/invite-codes/InviteCodesClient.tsx`

**Actionable steps:**
1. Add error handling to both functions:
   ```ts
   if (!res.ok) {
     const data = await res.json().catch(() => ({}))
     // Show toast or inline error
     alert(data.error ?? 'Failed to remove entry')
     return
   }
   ```
2. Prefer a toast notification over `alert()` — the project uses `@/components/ui/toaster`.
3. Consider adding a loading state per row to disable the button while the request is in flight.

**Acceptance:**
- A failed DELETE shows an error message to the admin.
- The button shows a loading state during the request.
- On error, the item remains in the list (no false removal).

---

## S5-R017 · P3 · Admin sidebar nav links have no active route highlighting

**What's wrong:**
In `apps/web/app/(admin)/layout.tsx`, the admin sidebar uses static `<Link>` elements:

```tsx
{[
  { href: '/admin/users', label: 'Users' },
  { href: '/admin/blocks', label: 'Block List' },
  { href: '/admin/invite-codes', label: 'Invite Codes' },
  { href: '/admin/stats', label: 'Stats' },
].map(({ href, label }) => (
  <Link
    key={href}
    href={href}
    className="flex items-center rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
  >
    {label}
  </Link>
))}
```

No active state detection. All links look the same regardless of current page. The dashboard sidebar (`sidebar.tsx`) correctly uses `usePathname()` to highlight the active link — the admin sidebar should follow the same pattern.

**Caveat:** The admin layout is a Server Component, so `usePathname()` isn't available directly. Either convert the nav to a client component or use a `NavLink` client component wrapper.

**File:** `apps/web/app/(admin)/layout.tsx`

**Actionable steps:**
1. Extract the admin nav into a `'use client'` component: `AdminNav.tsx`.
2. Use `usePathname()` to compare against each `href` and apply active styles (matching the dashboard sidebar pattern).
3. Active style: `bg-accent text-accent-foreground font-medium`.

**Acceptance:**
- The current admin page's nav link is visually highlighted.
- Other links show the default muted style.

---

## S5-R018 · P3 · `UserTierSelect` error message is generic "Failed"

**What's wrong:**
In `apps/web/app/(admin)/admin/users/UserTierSelect.tsx`:
```ts
if (res.ok) {
  setTier(newTier)
} else {
  setError('Failed')
}
```

"Failed" tells the admin nothing. The API response likely includes a more specific error message.

**File:** `apps/web/app/(admin)/admin/users/UserTierSelect.tsx`

**Actionable steps:**
1. Parse the error response:
   ```ts
   if (res.ok) {
     setTier(newTier)
   } else {
     const data = await res.json().catch(() => ({}))
     setError(data.error ?? `Failed (${res.status})`)
   }
   ```
2. Optionally auto-clear the error after 5 seconds.

**Acceptance:**
- Error messages from the API are shown to the admin.
- The error clears on the next successful tier change.

---

## S5-R019 · P3 · `error.tsx` and `global-error.tsx` both export `GlobalError` function name

**What's wrong:**
Both `apps/web/app/error.tsx` and `apps/web/app/global-error.tsx` export `default function GlobalError(...)`. While not a runtime issue (they're separate modules), the naming is confusing for developers:

- `error.tsx` catches errors in child routes (below the root layout).
- `global-error.tsx` catches errors in the root layout itself.

The `error.tsx` component is **not** the global error handler — it's the root route error boundary. Calling it `GlobalError` is misleading.

**Files:** `apps/web/app/error.tsx`, `apps/web/app/global-error.tsx`

**Actionable steps:**
1. Rename the export in `error.tsx` to `RootError` (or `AppError`).
2. Keep `GlobalError` in `global-error.tsx` since that actually is the global error handler.

**Acceptance:**
- `error.tsx` exports `RootError` (or similar).
- `global-error.tsx` exports `GlobalError`.
- No functional change — just naming clarity.

---

## S5-R020 · P3 · Privacy page is a placeholder — track as follow-up

**What's wrong:**
`apps/web/app/privacy/page.tsx` renders "Privacy policy coming soon." — which is per the S512 ticket scope ("Full legal text = out of scope for this ticket"). However, the cookie banner links to this page, and shipping to production with a placeholder privacy policy may have legal implications under GDPR.

**File:** `apps/web/app/privacy/page.tsx`

**Actionable steps:**
1. Add a ticket to S6 (or a pre-launch checklist) for drafting a real privacy policy.
2. At minimum, the placeholder should state: what data is collected (email, items, cookies), how it's stored (Supabase, Sentry), and who to contact for data requests.
3. Consider a terms-of-service page as well (linked from the registration flow).

**Acceptance:**
- Before public launch, `/privacy` has a real privacy policy covering GDPR Article 13 requirements.
- Cookie banner's "Privacy Policy" link leads to substantive content, not a placeholder.

---

## Summary Table

| ID | Sev | Title | Files |
|----|-----|-------|-------|
| S5-R001 | P0 | Registration route never sends email | `api/auth/register/route.ts` |
| S5-R002 | P0 | Block list never checked for unknown senders | `api/ingest/route.ts` |
| S5-R003 | P0 | `block_list.created_by` missing from types | `database.types.ts`, `api/ingest/route.ts` |
| S5-R004 | P0 | Account deletion has no error handling | `api/account/delete/route.ts` |
| S5-R005 | P0 | Login page ignores `?deleted=1` param | `login/page.tsx`, `login/login-form.tsx` |
| S5-R006 | P1 | `/dashboard` links — route doesn't exist | `auth/callback/route.ts`, `not-found.tsx` |
| S5-R007 | P1 | Admin settings allows arbitrary key updates | `api/admin/settings/route.ts` |
| S5-R008 | P1 | `requireAdmin()` duplicated in 6 files | All admin API routes |
| S5-R009 | P1 | Realtime hook leaks memory | `useRealtimeItems.ts`, `ItemsPageClient.tsx` |
| S5-R010 | P1 | Block list missing Admin/Auto-blocked label | `blocks/page.tsx`, `BlockListClient.tsx` |
| S5-R011 | P2 | `dark:` variant in component + raw colors | `InviteCodesClient.tsx` |
| S5-R012 | P2 | Stats route creates Redis conn per request | `api/admin/stats/route.ts` |
| S5-R013 | P2 | N+1 queries for user item counts | `admin/users/page.tsx` |
| S5-R014 | P2 | `global-error.tsx` hardcoded colors | `global-error.tsx` |
| S5-R015 | P2 | Admin panel has no loading.tsx | (missing file) |
| S5-R016 | P2 | Remove/revoke has no error feedback | `BlockListClient.tsx`, `InviteCodesClient.tsx` |
| S5-R017 | P3 | Admin sidebar no active route highlight | `(admin)/layout.tsx` |
| S5-R018 | P3 | UserTierSelect generic error message | `UserTierSelect.tsx` |
| S5-R019 | P3 | Duplicate `GlobalError` export name | `error.tsx`, `global-error.tsx` |
| S5-R020 | P3 | Privacy page placeholder | `privacy/page.tsx` |

---

## Recommended Fix Order

1. **S5-R001** (P0) — Registration is completely non-functional. Fix first.
2. **S5-R003** (P0) — Regenerate types; unblocks R002 and R010.
3. **S5-R002** (P0) — Move block list check before user lookup.
4. **S5-R004** (P0) — Add error handling + transaction to account deletion.
5. **S5-R005** (P0) — Wire `?deleted=1` into login page.
6. **S5-R006** (P1) — Fix `/dashboard` → `/items` everywhere.
7. **S5-R008** (P1) — Extract `requireAdmin()` (unblocks clean R007/R010 work).
8. **S5-R007** (P1) — Add settings key whitelist.
9. **S5-R010** (P1) — Add source label to block list.
10. **S5-R009** (P1) — Fix Realtime hook memory leak.
11. Everything else in priority order.
