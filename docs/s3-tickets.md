# Sprint 3 — Engineering Tickets

> Sprint goal: Stripe live, tier limits enforced end-to-end, users can upgrade/downgrade.
> Deliverable: Free user hits cap → gets rejection email → upgrades via Stripe → next email accepted.
> Total: 26 points across 12 tickets.

---

### S301 — Stripe product + price setup
**Type:** setup
**Points:** 1
**Depends on:** none

**Goal:** Create the two Stripe products and prices that the checkout and webhook logic will reference. Keeping price IDs in env vars (not hardcoded) makes it trivial to swap test/live modes.

**Scope:**
- Log in to the Stripe dashboard (test mode first)
- Create product **drop-note Pro**:
  - Price: `$9.99/month`, billing period: monthly, currency: USD
  - Copy the price ID (format `price_...`) → add as `STRIPE_PRO_PRICE_ID` to env vars
- Create product **drop-note Power**:
  - Price: `$49.99/month`, billing period: monthly, currency: USD
  - Copy the price ID → add as `STRIPE_POWER_PRICE_ID` to env vars
- Add both price ID env vars to:
  - `apps/web/.env.local`
  - `.env.example` at repo root (placeholder values, e.g. `price_test_xxx`)
  - Vercel environment variables (Production + Preview environments)
- Add `STRIPE_SECRET_KEY` (test mode key `sk_test_...`) to the same three locations
- Add `STRIPE_PUBLISHABLE_KEY` (test mode `pk_test_...`) to the same three locations
- Install Stripe Node SDK: `pnpm add stripe --filter @drop-note/web`
- Create `apps/web/lib/stripe.ts` — export a singleton `stripe` instance:
  ```ts
  import Stripe from 'stripe'
  import { requireEnv } from '@drop-note/shared'
  export const stripe = new Stripe(requireEnv('STRIPE_SECRET_KEY'), {
    apiVersion: '2024-11-20.acacia',
  })
  ```

**Acceptance criteria:**
1. `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_PRO_PRICE_ID`, `STRIPE_POWER_PRICE_ID` all appear in `.env.example` with placeholder values.
2. Both products are visible in the Stripe test dashboard under Products.
3. `apps/web/lib/stripe.ts` exists and exports a `stripe` constant typed as `Stripe`.
4. `pnpm --filter @drop-note/web typecheck` passes (no TypeScript errors in the new file).
5. Running `node -e "require('./apps/web/lib/stripe')"` (or equivalent TS check) does not throw.

**Out of scope:**
- Live mode price IDs (configure during launch checklist in S6)
- Stripe Customer Portal configuration (S305)
- Any checkout or webhook logic (S302–S304)

**Known gap — multi-environment webhook secrets:**
Each deployed environment (Vercel Preview, Vercel Production) needs its own Stripe webhook endpoint registration and therefore its own `STRIPE_WEBHOOK_SECRET`. During development, register the Stripe webhook against a specific preview URL. Before launch, register a second endpoint against the production URL and update the Production environment variable. Mixing secrets across environments will cause all webhook signature verifications to fail silently. Add this to the S6 launch checklist.

---

### S302 — Lazy Stripe customer creation
**Type:** feat
**Points:** 2
**Depends on:** S301

**Goal:** Ensure every user who attempts to upgrade has a `stripe_customer_id` by creating a Stripe Customer record lazily — only on first checkout attempt — then storing it. This avoids creating orphan Stripe customers at registration and keeps the `users` table clean until payment intent exists.

**Scope:**
- Create `apps/web/lib/stripe-customer.ts` exporting:
  ```ts
  export async function getOrCreateStripeCustomer(userId: string): Promise<string>
  ```
- Logic:
  1. Query `SELECT stripe_customer_id FROM public.users WHERE id = $1` using Supabase admin client
  2. If `stripe_customer_id` is already set: return it immediately
  3. Otherwise: call `stripe.customers.create({ metadata: { supabase_user_id: userId } })`
  4. `UPDATE public.users SET stripe_customer_id = $1 WHERE id = $2` with the new customer ID
  5. Return the new customer ID
- Use Supabase admin client (service role key) for both the read and the write — this runs server-side only, not in a Route Handler that requires auth session
- **Concurrency safety:** The naive SELECT-then-CREATE pattern has a race condition — two simultaneous requests can both read `null` and both call Stripe, creating duplicate customers. Use an atomic conditional UPDATE instead:
  1. Call `stripe.customers.create(...)` to get a new `cus_` ID
  2. `UPDATE public.users SET stripe_customer_id = $newId WHERE id = $userId AND stripe_customer_id IS NULL`
  3. If `rowsAffected === 0`, another concurrent caller already wrote a value — re-query `SELECT stripe_customer_id FROM public.users WHERE id = $userId` and return that value (discard the just-created Stripe customer — orphaned customers in test mode are harmless; in production add a log line)
  4. If `rowsAffected === 1`: return the new ID
- This means a Stripe customer is always created before writing to DB, and the DB write is the idempotent gate

**Migration (if needed):**
- Check whether `users.stripe_customer_id` already has a `UNIQUE` constraint. If not, add migration:
  ```sql
  ALTER TABLE public.users ADD CONSTRAINT users_stripe_customer_id_unique UNIQUE (stripe_customer_id);
  ```
- File: `supabase/migrations/<timestamp>_add_stripe_customer_id_unique.sql`
- Apply: `npx supabase db push --linked` then `pnpm gen:types`

**Acceptance criteria:**
1. `getOrCreateStripeCustomer(userId)` returns a string starting with `cus_`.
2. Calling it twice for the same user returns the same `cus_` value and creates only one Stripe Customer (verified in Stripe test dashboard).
3. After first call, `users.stripe_customer_id` is populated in the database.
4. `pnpm --filter @drop-note/web typecheck` passes.
5. If `stripe_customer_id` is already set, no Stripe API call is made (verify with a mock or by checking Stripe dashboard — no duplicate customers).

**Out of scope:**
- Checkout session creation (S303)
- Webhook handling (S304)
- Any UI (S311)

---

### S303 — Checkout session API route
**Type:** feat
**Points:** 2
**Depends on:** S302

**Goal:** Give authenticated users a server-side URL to initiate Stripe Checkout, redirect to Stripe's hosted checkout page, and return to the app on success or cancellation.

**Scope:**
- Create `apps/web/app/api/stripe/checkout/route.ts` exporting a `POST` handler
- Request body (JSON): `{ priceId: string }` — validated against the two known price IDs
- Auth: extract user from Supabase session cookie (`await createClient()` server-side). Return `401` if no session.
- If `priceId` is not one of `STRIPE_PRO_PRICE_ID` or `STRIPE_POWER_PRICE_ID`: return `400 { error: 'Invalid price' }`
- Call `getOrCreateStripeCustomer(userId)` to ensure customer exists
- Create Stripe Checkout Session:
  ```ts
  stripe.checkout.sessions.create({
    customer: stripeCustomerId,
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    client_reference_id: userId,        // tie checkout to our user
    success_url: `${origin}/pricing?checkout=success`,
    cancel_url: `${origin}/pricing`,
    subscription_data: {
      metadata: { supabase_user_id: userId },
    },
  })
  ```
- Return `{ url: session.url }` — client redirects to this URL
- `origin` derived from `request.headers.get('origin')` or env var `NEXT_PUBLIC_APP_URL`
- Add `NEXT_PUBLIC_APP_URL` to `.env.local`, `.env.example`, and Vercel env vars

**Acceptance criteria:**
1. `POST /api/stripe/checkout` with a valid `priceId` and authenticated session returns `{ url: "https://checkout.stripe.com/..." }` (HTTP 200).
2. Unauthenticated request returns `401`.
3. Invalid `priceId` returns `400`.
4. The returned URL opens a real Stripe Checkout page in test mode (manual verification).
5. After completing test checkout (with Stripe test card `4242 4242 4242 4242`), browser redirects to `/pricing?checkout=success`. The pricing page shows the user's current plan as "Current plan" on the Pro card (tier updated by webhook).
6. `pnpm --filter @drop-note/web typecheck` passes.

**Out of scope:**
- Updating `users.tier` (done by webhook in S304, not by this route)
- Stripe Customer Portal (S305)
- Any UI (S311)

---

### S304 — Stripe webhook handler
**Type:** feat
**Points:** 5
**Depends on:** S301

**Goal:** Reliably update `users.tier` in response to Stripe lifecycle events. This is the single source of truth for tier enforcement — no other code path should set `users.tier` for subscription changes.

**Scope:**
- Create `apps/web/app/api/webhooks/stripe/route.ts` exporting a `POST` handler
- **Signature verification (must be first):**
  - Read raw body: `const rawBody = await request.text()`
  - Get `stripe-signature` header: `request.headers.get('stripe-signature')`
  - Add `STRIPE_WEBHOOK_SECRET` env var (get from Stripe dashboard → Webhooks → signing secret)
  - Call `stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET!)`
  - If signature verification throws: return `400` (Stripe will not retry a 400)
  - **Error handling — two categories:**
    - **Expected non-fatal** (unknown event type, unknown price ID in `subscription.updated`): return `200`. These are not bugs — Stripe may send event types we don't handle.
    - **Unexpected infrastructure failure** (DB write error, `stripe.subscriptions.retrieve()` API error): return `500`. Stripe will retry with exponential backoff. A failed DB write returning `200` means a paying user's tier is never updated — this is the most dangerous failure mode in the sprint.
- **Events to handle:**

  **`checkout.session.completed`** (subscription started):
  - Get `session.client_reference_id` (= our `user_id`)
  - Get `session.subscription` ID
  - Retrieve full subscription with price expansion: `stripe.subscriptions.retrieve(subscriptionId, { expand: ['items.data.price'] })`
  - Map price ID to tier: `priceIdToTier(subscription.items.data[0].price.id)`
  - If `priceIdToTier` returns `null` here: this is a bug (unknown price in a real completed checkout) — log an error and return `500` so Stripe retries. Do NOT silently skip like the `subscription.updated` case.
  - `UPDATE public.users SET tier = $tier WHERE id = $userId` — if this throws, return `500`

  **`customer.subscription.updated`** (plan change or renewal):
  - Get `subscription.metadata.supabase_user_id` (set in S303)
  - Get current price ID from `subscription.items.data[0].price.id`
  - Map to tier. If price ID is unknown: log a warning and return `200` (skip — do not reset to free, this may be a proration event)
  - `UPDATE public.users SET tier = $tier WHERE id = $userId` — if this throws, return `500`

  **`customer.subscription.deleted`** (cancellation takes effect):
  - Get `subscription.metadata.supabase_user_id`
  - `UPDATE public.users SET tier = 'free' WHERE id = $userId` — if this throws, return `500`
  - Do NOT delete the Stripe customer record

- **Idempotency:** All three DB updates are safe to run twice (UPDATE with same value is a no-op). No additional idempotency key needed for v1.
- **Known gap:** `invoice.payment_failed` is not handled. If a renewal payment fails, `users.tier` stays at `pro`/`power` until `customer.subscription.deleted` fires (days later, per Stripe's dunning settings). This gives the user free paid access during the grace period. Acceptable for v1; flagged for v2.
- **Tier mapping helper** in `packages/shared/src/stripe.ts`:
  ```ts
  export function priceIdToTier(priceId: string): 'pro' | 'power' | null
  ```
  Reads `STRIPE_PRO_PRICE_ID` and `STRIPE_POWER_PRICE_ID` from `process.env`. Returns `null` if unknown.
- **Register webhook in Stripe dashboard** (test mode):
  - Endpoint URL: `https://<vercel-preview-url>/api/webhooks/stripe`
  - Events to listen for: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`
  - Copy signing secret → add as `STRIPE_WEBHOOK_SECRET` to Vercel + `.env.local` + `.env.example`
- **Local testing:** use Stripe CLI `stripe listen --forward-to localhost:3000/api/webhooks/stripe`

**Acceptance criteria:**
1. A webhook POST with an invalid `stripe-signature` header returns `400`.
2. After completing a test checkout (Pro price), `users.tier` in Supabase is updated to `'pro'` within 5 seconds (verify in Supabase Studio).
3. After cancelling the test subscription via Stripe dashboard → cancel immediately, `users.tier` reverts to `'free'`.
4. `customer.subscription.updated` with a Power price ID sets `users.tier = 'power'`.
5. Stripe CLI `stripe listen` output shows all three event types forwarded and the endpoint returning `200`.
6. `pnpm --filter @drop-note/web typecheck` passes.
7. `priceIdToTier` is exported from `@drop-note/shared` and accepted by `pnpm turbo typecheck`.

**Out of scope:**
- `invoice.payment_failed` grace period handling (v2)
- Email notification on successful upgrade (v2 — would be in welcome/transactional email sprint)
- Downgrade UI banner (S309)

---

### S305 — Billing portal API route
**Type:** feat
**Points:** 1
**Depends on:** S302, S304

**Goal:** Let users manage their subscription (upgrade, downgrade, cancel) through Stripe's hosted Customer Portal without drop-note needing to build its own subscription management UI.

**Scope:**
- Create `apps/web/app/api/stripe/portal/route.ts` exporting a `POST` handler
- Auth: require authenticated session. Return `401` if no session.
- Get `stripe_customer_id` from `public.users` for the current user
- If `stripe_customer_id` is null (free user who has never checked out): return `400 { error: 'No subscription found' }`
- Call:
  ```ts
  stripe.billingPortal.sessions.create({
    customer: stripeCustomerId,
    return_url: `${origin}/settings`,
  })
  ```
- Return `{ url: session.url }`
- **Stripe Customer Portal must be configured** in the Stripe dashboard (test mode):
  - Settings → Billing → Customer portal
  - Enable: plan switching between Pro and Power, cancellation, update payment method
  - Save the configuration (required before the API call works)

**Acceptance criteria:**
1. `POST /api/stripe/portal` for a Pro user returns `{ url: "https://billing.stripe.com/..." }` (HTTP 200).
2. Opening that URL shows the Stripe Customer Portal with the correct plan details (manual test).
3. Unauthenticated request returns `401`.
4. Request for a free user with no `stripe_customer_id` returns `400`.
5. `pnpm --filter @drop-note/web typecheck` passes.

**Out of scope:**
- "Manage Subscription" button in the Settings UI (S511 in Sprint 5)
- Webhook handling for plan changes made in the portal (already handled by `customer.subscription.updated` in S304)

---

### S306 — Item cap enforcement in `/api/ingest`
**Type:** feat
**Points:** 3
**Depends on:** S304

**Goal:** Prevent free users from exceeding their 20-item cap and paid users from exceeding their tier limit. The entire email is rejected — no partial processing — to keep accounting simple.

**Tier limits (from v1-scope):**

| Tier | Max stored items |
|------|----------------|
| Free | 20 |
| Pro | 100 |
| Power | 500 |

**Scope:**
- Add tier limit constants to `packages/shared/src/tier.ts`:
  ```ts
  export const TIER_ITEM_LIMITS = { free: 20, pro: 100, power: 500 } as const
  export const TIER_ATTACHMENT_SIZE_LIMITS = { free: 10, pro: 25, power: 50 } as const // MB
  export type Tier = keyof typeof TIER_ITEM_LIMITS
  ```
- In `apps/web/app/api/ingest/route.ts`, after user lookup and block list check but **before** BullMQ enqueue:
  1. Count how many items this email would create: `1 (body) + N (valid attachments)`. **Counting rules:**
     - Silently dropped file types (.zip, .exe, etc.): excluded from count
     - Oversized attachments (exceeding the user's tier size limit): **also excluded from count** — they will be rejected by the worker and never saved, so they should not consume cap. The ingest route already has access to attachment sizes from the SendGrid payload; check `TIER_ATTACHMENT_SIZE_LIMITS[user.tier]` here.
  2. Count current active items: `SELECT COUNT(*) FROM public.items WHERE user_id = $1 AND deleted_at IS NULL`
  3. `currentCount + incomingCount > TIER_ITEM_LIMITS[user.tier]` → reject
  4. If cap exceeded: trigger cap-exceeded notification (S307), return `200` (SendGrid must not retry)
- Use Supabase admin client for the count query (bypasses RLS, avoids requiring user session in ingest route)
- Edge case: if user downgrades and already has more than the new cap, that is handled by the downgrade banner (S309) — the ingest route only checks the live count against the current tier

**Acceptance criteria:**
1. A free user with 20 items in the DB receives a test ingest POST → the job is NOT enqueued (verify BullMQ queue depth stays 0), and the route returns HTTP 200.
2. A free user with 19 items receives an email with 1 attachment (2 items) → enqueue is rejected (19 + 2 = 21 > 20), returns 200.
3. A free user with 18 items receives a single-body email (1 item) → enqueued successfully (18 + 1 = 19 ≤ 20).
4. A Pro user with 99 items receives a single-body email → enqueued (99 + 1 = 100 ≤ 100).
5. A Pro user with 100 items → rejected.
6. `pnpm --filter @drop-note/web typecheck` passes.
7. `TIER_ITEM_LIMITS` and `TIER_ATTACHMENT_SIZE_LIMITS` are importable from `@drop-note/shared`.

**Out of scope:**
- The cap-exceeded notification email content (S307)
- Monthly save action limit (S308 — that's a separate check)
- Soft-deleted item recovery counting (S4 — trashed items already excluded via `deleted_at IS NULL`)

---

### S307 — Cap-exceeded notification email
**Type:** feat
**Points:** 1
**Depends on:** S306

**Goal:** Tell users exactly why their email was rejected and give them a direct path to upgrade, so they don't silently lose content.

**Scope:**
- Create `apps/web/lib/emails/cap-exceeded.tsx` — a React Email template (or plain Resend `send()` call if React Email not already set up) with:
  - Subject: `Your drop-note inbox is full`
  - Body:
    - State the cap clearly: "Your free plan stores up to 20 items. You currently have {count} items."
    - The email they tried to send (subject line)
    - Upgrade CTA: button linking to `${NEXT_PUBLIC_APP_URL}/pricing`
    - Footer: "To make room, delete some items from your dashboard."
- Export a function `sendCapExceededEmail({ to, currentCount, tier, emailSubject }: ...)` that calls Resend
- Call this function from `/api/ingest` when cap is exceeded (pass the email subject from the SendGrid payload)
- Reuse the existing Resend client from the welcome email (S210 pattern)
- From address: `drop-note <noreply@dropnote.com>` (or the Resend-verified domain sender)
- Do not send this email more than once per hour per user: use Redis key `cap-exceeded:{userId}` with 1-hour TTL. If key exists, skip sending (but still reject the ingest).

**Acceptance criteria:**
1. Triggering a cap-exceeded scenario (per S306 AC1) results in an email delivered to the user's address within 60 seconds (verify via Resend dashboard or email client).
2. Email subject is `Your drop-note inbox is full`.
3. Email body contains the upgrade URL (`/pricing`).
4. Sending two cap-exceeded emails in the same hour for the same user: second email is suppressed (verify Redis key `cap-exceeded:{userId}` exists after first send).
5. `pnpm --filter @drop-note/web typecheck` passes.

**Out of scope:**
- Monthly save action cap email (S308 — separate trigger, same send-once-per-hour suppression pattern)
- HTML email template system (just a functional email for now)

---

### S308 — Monthly save action limit
**Type:** feat
**Points:** 3
**Depends on:** S304

**Goal:** Enforce the free tier's 30 save actions/month cap. Paid tiers are unlimited. Use Redis for real-time enforcement, and write to `usage_log` for admin reporting.

**Save action definition:** one item processed through the AI pipeline = one action. Counting happens before enqueue, not after processing.

**Scope:**
- Redis key pattern: `saves:{userId}:{YYYY-MM}` (e.g. `saves:abc123:2026-03`)
- TTL: 35 days (set on every write, ensures expiry after the month with buffer)
- In `apps/web/app/api/ingest/route.ts`, after item cap check (S306) but before enqueue:
  1. If `user.tier !== 'free'`: skip this check entirely
  2. Count incoming items from this email (same count as S306: 1 body + N valid non-oversized attachments)
  3. **Atomic check-and-increment via Lua script** — the INCRBY-then-check-then-DECRBY pattern has a race condition where two concurrent requests both increment, both observe the same (incorrect) total, and both accept or reject incorrectly. Use a Lua script that runs atomically in Redis:
     ```lua
     local key = KEYS[1]
     local incoming = tonumber(ARGV[1])
     local limit = tonumber(ARGV[2])
     local ttl = tonumber(ARGV[3])
     local current = tonumber(redis.call('GET', key) or 0)
     if current + incoming > limit then return -1 end
     local new = redis.call('INCRBY', key, incoming)
     redis.call('EXPIRE', key, ttl)
     return new
     ```
     Call via `redis.eval(script, [key], [incomingCount, SAVE_ACTIONS_FREE_LIMIT, 35*86400])`
  4. If script returns `-1`: reject, send save-limit email, return 200
  5. If script returns the new total (≥ 0): proceed to enqueue
- On successful enqueue, write to `usage_log`:
  ```ts
  supabaseAdmin.from('usage_log').insert({ user_id: userId, action_type: 'save', month: currentMonth })
  ```
  Do this asynchronously (fire-and-forget) — do not await it in the request path
- Helper function `getCurrentMonth(): string` returns `'YYYY-MM'` format — pure function, easy to test
- Add `SAVE_ACTIONS_FREE_LIMIT = 30` constant to `packages/shared/src/tier.ts`
- Send a `saves-limit-exceeded` notification email (same Resend pattern as S307) with:
  - Subject: `You've reached your monthly drop-note limit`
  - Body: current count, limit, upgrade CTA
  - Same 1-hour suppression using Redis key `save-limit-exceeded:{userId}:{YYYY-MM}`

**Acceptance criteria:**
1. A free user who has already used 29 save actions this month receives a 2-item email (body + 1 attachment) → total would be 31 → entire email rejected and notification sent.
2. A free user with 29 actions receives a 1-item email → total = 30 → accepted (exactly at limit).
3. A free user with 30 actions receives any email → rejected.
4. A Pro user with 1000 items and any number of prior saves → not rate-limited by this check.
5. After a successful ingest, `usage_log` has a new row for the user (verify in Supabase Studio).
6. Redis key `saves:{userId}:{YYYY-MM}` increments correctly (verify with `redis-cli` or Upstash console).
7. `pnpm --filter @drop-note/web typecheck` passes.

**Out of scope:**
- Admin UI showing monthly usage per user (S5)
- Resetting the counter (handled by TTL expiry)
- Usage log for actions other than `save`

---

### S309 — Downgrade banner
**Type:** feat
**Points:** 2
**Depends on:** S304, S306, S308

**Goal:** When a user's tier decreases and their item count now exceeds the new tier's limit, show a persistent banner on every dashboard page explaining the situation and blocking new ingest at the ingest-route level.

**Scope:**
- **Server-side check on dashboard layout load:**
  - In `apps/web/app/(dashboard)/layout.tsx` (or the root dashboard server component)
  - Query: `SELECT COUNT(*) FROM public.items WHERE user_id = auth.uid() AND deleted_at IS NULL`
  - Compare against `TIER_ITEM_LIMITS[user.tier]`
  - If `itemCount > tierLimit`: pass `isOverCap: true` to the layout
- **Banner component** `apps/web/components/OverCapBanner.tsx`:
  - Renders at the top of the dashboard content area (not covering the sidebar)
  - Text: "Your account has {itemCount} items but your {tier} plan allows {limit}. New emails will be rejected until you delete {itemCount - limit} item(s) or upgrade."
  - CTA buttons: "Upgrade" (→ `/pricing`) and "Delete items" (→ `/items`)
  - Use semantic color tokens only — no raw Tailwind colors
  - No `dark:` variants — handled via CSS variables in `globals.css`
- **Ingest-route enforcement:**
  - In `/api/ingest`, alongside the item cap check (S306): if `currentCount > TIER_ITEM_LIMITS[user.tier]` (user is already over cap, regardless of incoming count) → reject immediately
  - This handles the downgrade case where the user was already over cap before the new email arrived
- **Not a client component:** the layout fetches this data server-side. No `'use client'` needed unless interactive elements require it (the CTAs are plain links, so server component is fine)

**Acceptance criteria:**
1. Manually set a free user to have 21 items in DB → log in → the banner is visible on `/items` with the correct count and limit.
2. Delete items until `itemCount ≤ 20` → reload dashboard → banner is gone.
3. A Pro user with 101 items (simulated) sees the banner; a Pro user with 100 sees nothing.
4. An ingest POST for a user who is already over cap (even by 1) is rejected and returns 200 — confirmed by BullMQ queue depth staying 0.
5. `pnpm --filter @drop-note/web typecheck` passes.
6. Banner uses only semantic color tokens (no `text-red-500` etc.).

**Out of scope:**
- What happens to soft-deleted items in trash after downgrade (S4 — complex edge case, post-MVP)
- Email notification for downgrade (v2)
- Real-time banner update via Supabase Realtime (v2 — server-side check on every dashboard load is sufficient)

---

### S310 — Admin tier override
**Type:** feat
**Points:** 1
**Depends on:** S304

**Goal:** Allow admins to manually set any user's tier for testing and support purposes, without going through Stripe.

**Scope:**
- Create `apps/web/app/api/admin/users/[userId]/tier/route.ts` exporting a `PATCH` handler
- Request body: `{ tier: 'free' | 'pro' | 'power' }`
- Auth:
  1. Get current user from Supabase session. Return `401` if no session.
  2. Query `SELECT is_admin FROM public.users WHERE id = auth.uid()`. Return `403` if not admin.
- Validate `tier` is one of the three valid values. Return `400` if invalid.
- `UPDATE public.users SET tier = $tier WHERE id = $userId` using Supabase admin client
- Return `{ ok: true, userId, tier }`
- This does NOT create or modify any Stripe subscription — it is a direct DB override only

**Acceptance criteria:**
1. `PATCH /api/admin/users/{userId}/tier` with `{ "tier": "pro" }` as an admin → returns `{ ok: true }` and `users.tier` is updated in DB.
2. Same request from a non-admin user → returns `403`.
3. Same request from an unauthenticated user → returns `401`.
4. `{ "tier": "god" }` → returns `400`.
5. `pnpm --filter @drop-note/web typecheck` passes.

**Out of scope:**
- Admin UI for this action (S5 — admin panel)
- Any Stripe side effects

---

### S311 — Pricing page `/pricing`
**Type:** feat
**Points:** 2
**Depends on:** S303

**Goal:** Give users a clear comparison of tiers with one-click upgrade paths. This is the destination for all upgrade CTAs from cap-exceeded emails, the downgrade banner, and the marketing flow.

**Scope:**
- Create `apps/web/app/pricing/page.tsx` — Server Component, no auth required (pricing is public)
- Layout: three-column tier comparison using shadcn `Card` (Free, Pro, Power)
- Each card displays:
  - Tier name + price (Free / $9.99/mo / $49.99/mo)
  - Item storage limit (20 / 100 / 500)
  - Monthly save actions (30 / Unlimited / Unlimited)
  - Attachment size (10MB / 25MB / 50MB)
  - Deletion policy (Immediate / 30-day trash / 30-day trash)
  - CTA button
- CTA button logic (client component `UpgradeButton.tsx` with `'use client'`):
  - If user is not logged in: button → `/auth/login?redirect=/pricing`
  - If user is already on that tier: show "Current plan" (disabled button)
  - If user is on a lower tier: button calls `POST /api/stripe/checkout` with the correct `priceId`, then redirects to the returned URL
  - If user is on a higher tier: show "Manage subscription" → calls `POST /api/stripe/portal`
  - **Loading and error states (required):**
    - Button shows a loading spinner and is disabled while the fetch is in-flight — prevents double-clicks
    - If the fetch returns a non-200 response or throws a network error: display an inline error message below the button ("Something went wrong. Please try again.") — do NOT silently fail
    - The checkout/portal URL is always opened by the client redirecting to the returned URL; never `window.open()` (blocked by pop-up blockers)
- The pricing page also reads `?checkout=success` from the URL (set by S303 `success_url`) and shows a success banner: "You're now on the {tier} plan!"
  - Read the param server-side and pass to a client component toast, or use a simple banner in the page — keep it simple
- The Free card has no CTA button (or "Get started" → `/auth/login` if not logged in)
- Current plan detection: fetch `users.tier` in the Server Component using Supabase server client. Pass it to `UpgradeButton` as a prop.
- Add `/pricing` to the sidebar nav (visible to all authenticated users)
- Link `/pricing` in the `OverCapBanner` upgrade CTA (S309) and in both cap-exceeded email templates (S307, S308)

**Acceptance criteria:**
1. `/pricing` renders without authentication (public route — no redirect to login).
2. All three tier cards are visible with correct prices, limits, and features.
3. A logged-in free user clicking "Upgrade to Pro" initiates Stripe Checkout (manual test with test card).
4. A logged-in Pro user sees "Current plan" on the Pro card and "Upgrade to Power" on the Power card.
5. A logged-in Power user sees "Current plan" on Power, "Manage subscription" on Pro (links to portal).
6. Clicking "Upgrade" shows a loading spinner while the API call is in-flight; if the API returns an error, an inline error message is displayed (no silent failure).
7. After a completed test checkout, `/pricing?checkout=success` shows a success confirmation banner.
8. `pnpm --filter @drop-note/web typecheck` passes.
9. No raw Tailwind color classes in `pricing/page.tsx` or `UpgradeButton.tsx` — semantic tokens only.

**Out of scope:**
- Annual billing toggle (v2)
- FAQ section (v2)
- A/B testing (v2)

---

### S312 — Unit tests: cap enforcement, webhook handlers, save action counter
**Type:** test
**Points:** 3
**Depends on:** S304, S306, S307, S308

**Goal:** Cover the highest-risk payment and tier enforcement logic with fast, pure unit tests. These are the paths where bugs cost users money or silently accept/reject content incorrectly.

**Scope:**
- Test file locations: `packages/shared/src/__tests__/tier.test.ts` for shared logic; `apps/web/app/api/webhooks/stripe/__tests__/webhook.test.ts` for webhook handler

**Tests to write:**

**`priceIdToTier` (shared):**
- Returns `'pro'` for `STRIPE_PRO_PRICE_ID`
- Returns `'power'` for `STRIPE_POWER_PRICE_ID`
- Returns `null` for unknown price ID
- Returns `null` for empty string

**`TIER_ITEM_LIMITS` constants:**
- `free` = 20, `pro` = 100, `power` = 500

**Item cap check logic (pure function, extracted from ingest route):**
```ts
// packages/shared/src/tier.ts
export function isOverItemCap(currentCount: number, incomingCount: number, tier: Tier): boolean
```
- `isOverItemCap(19, 1, 'free')` → `false` (19+1=20, exactly at cap)
- `isOverItemCap(19, 2, 'free')` → `true` (19+2=21 > 20)
- `isOverItemCap(20, 0, 'free')` → `false` (0 incoming = no-op, handled upstream)
- `isOverItemCap(100, 1, 'pro')` → `true`
- `isOverItemCap(499, 1, 'power')` → `false`

**Save action counter logic (pure function — models Lua script result):**
```ts
// packages/shared/src/tier.ts
export function isOverSaveLimit(currentMonthCount: number, incomingCount: number): boolean
```
- `isOverSaveLimit(29, 1)` → `false` (exactly at 30)
- `isOverSaveLimit(30, 1)` → `true`
- `isOverSaveLimit(29, 2)` → `true`

**`getCurrentMonth` helper:**
- Returns string in `'YYYY-MM'` format matching `new Date().toISOString().slice(0, 7)`

**Stripe webhook handler (mock Stripe SDK):**
- Mock `stripe.webhooks.constructEvent` to throw → handler returns `400`
- Mock `checkout.session.completed` with valid Pro payload → `supabaseAdmin.from('users').update({ tier: 'pro' })` is called, handler returns `200`
- Mock `checkout.session.completed` with unknown price ID → `priceIdToTier` returns null → handler returns `500` (bug: unrecognizable price in a real checkout)
- Mock `customer.subscription.deleted` → update called with `{ tier: 'free' }`, handler returns `200`
- Mock `customer.subscription.updated` with Power price ID → update called with `{ tier: 'power' }`, handler returns `200`
- Mock `customer.subscription.updated` with unknown price ID → update NOT called, handler returns `200` (skip — could be proration event)
- Mock DB update to throw on `checkout.session.completed` → handler returns `500` (infrastructure failure should be retriable)

**Acceptance criteria:**
1. `pnpm test` passes with all new tests green.
2. All pure functions (`isOverItemCap`, `isOverSaveLimit`, `getCurrentMonth`, `priceIdToTier`) are exported from `@drop-note/shared` and have 100% branch coverage.
3. Webhook handler tests cover all three event types plus the signature-failure path.
4. `pnpm --filter @drop-note/web typecheck` and `pnpm --filter @drop-note/shared typecheck` both pass.
5. No tests make real network calls (all Stripe and Supabase calls are mocked).

**Out of scope:**
- E2E Stripe upgrade flow test (S603 in Sprint 6)
- Integration tests against real Supabase (Sprint 6)
- Cap-exceeded email send tests (covered by Resend mock in ingest route tests)
