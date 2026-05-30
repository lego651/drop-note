# Sprint 6 — Engineering Tickets

> Sprint goal: 60% coverage, E2E suite green, Docker Compose working, open source ready, production deployed.
> Deliverable: CI fully green, Playwright E2E covering all critical flows, public GitHub repo with CONTRIBUTING.md, beta-ready production deployment.
> Total: 37 points across 15 tickets.
>
> _Point change from sprint plan (+3): S601 split to absorb fix-failing-tests work (+1); S602 increased for auth.setup.ts (+1); new S615 Privacy Policy/ToS (+1)._

---

## Pre-sprint checklist

> **Do not begin S601 until all of these pass.**

- [ ] `pnpm test` exits 0 — **currently fails with 8 test failures in `delete.test.ts`** (see S601)
- [ ] `pnpm turbo lint && pnpm turbo typecheck` passing on `main`
- [ ] Supabase DB types current (`pnpm gen:types` run after latest S5 migration)
- [ ] Stripe live mode credentials available (for S612 production checklist)
- [ ] `dropnote.com` domain acquired or acquisition in-progress

---

## Schema changes required this sprint

None. All table definitions were finalized in S1–S5.

The only schema-adjacent work is new indexes in S611 (all `CREATE INDEX CONCURRENTLY` — non-blocking, zero downtime). Write them as a new numbered migration file and apply with `supabase db push --linked`.

---

### S601 — Fix failing tests + coverage audit to 60%

**Type:** test
**Points:** 4 _(was 3; +1 to absorb fix-failing-tests work)_
**Depends on:** nothing

**Goal:** The test suite is currently broken. Fix it first, then identify gaps and write targeted tests to reach 60% statement coverage.

---

#### Part A — Fix existing test failures (do this before anything else)

**Failing file:** `apps/web/app/api/items/__tests__/delete.test.ts`

**Root cause:** The `deleteItem` helper in `apps/web/lib/items.ts` was updated to call `.select('id').maybeSingle()` after each write query (to get the affected row for the `affected: boolean` return value). The test mocks were not updated to match.

**Fix:** Update each mock in `delete.test.ts` to chain `.select` and `.maybeSingle` after `.delete()` and `.update()`. Example:

```ts
// Before (broken — mock doesn't chain .select)
mockSupabase.from.mockReturnValueOnce({
  delete: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ error: null }) }),
})

// After (correct — mirrors actual query chain)
mockSupabase.from.mockReturnValueOnce({
  delete: vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'test-id' }, error: null }),
      }),
    }),
  }),
})
```

Apply the same fix to the `.update()` chains. **`pnpm test` must exit 0 before any coverage work begins.**

---

#### Part B — Improve route-level test coverage

The existing `crud.test.ts` and `search.test.ts` files in `apps/web/app/api/items/__tests__/` test internal helper logic, not actual route handlers. They provide near-zero route-level coverage. Do not delete them, but supplement with real route handler tests.

**Priority order (highest business risk first):**

1. `apps/web/app/api/ingest/route.ts` — this is the most complex and highest-risk route (323 lines), currently with zero tests. Must cover: block list check order (block list check runs BEFORE user lookup), rate limit rejection (free: 5/hr; paid: 20/hr), item cap enforcement, unknown sender → 200 discard, BullMQ enqueue on success.
2. `apps/web/app/api/webhooks/stripe/route.ts` — all three event types: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`. Signature verification must be mocked, not bypassed.
3. `packages/shared/src/` — tag dedup (case-insensitive, whitespace trim, emoji), AI prompt construction (char cap at 50k), email body extraction.
4. `apps/worker/src/` — job processor entry, file size enforcement by tier, PDF/image branch selection.

**Test rules:**
- Mock Supabase client at the module level (never hit the real DB)
- Mock Stripe SDK (never hit Stripe)
- Mock Redis client (`@/lib/redis`) — inject the mock in beforeEach, restore in afterEach
- No snapshot tests — assert on behavior
- All tests must pass with `vitest run` (non-watch)

**Acceptance:**
- `pnpm test` exits 0 with no skipped tests
- `pnpm test:coverage` reports ≥ 60% statement coverage
- No existing tests were deleted to inflate the number
- Coverage thresholds enforced in `vitest.config.ts` (see S605 — configure `coverage.thresholds` now so it gates locally, not just in CI)

---

### S602 — Playwright E2E: core user flow

**Type:** test
**Points:** 6 _(was 5; +1 for auth.setup.ts implementation, which was previously a placeholder TODO)_
**Depends on:** S601 (clean test baseline), Vercel preview deploy

**Goal:** Cover the end-to-end critical path: authenticated user → sees drop address → item seeded in DB → edit summary/tags → delete.

**Architecture decision:** The worker is not running in CI. Seed processed items directly into the test DB via service role key (status: `done`). Do not try to test the BullMQ pipeline in E2E.

---

#### Subtask 0 — Implement `e2e/auth.setup.ts` (currently a placeholder TODO)

`e2e/auth.setup.ts` currently writes an empty storage state and does nothing. Every authenticated scenario fails because of this. Implement it before writing any other E2E scenarios.

**Implementation:**
```ts
// e2e/auth.setup.ts
import { test as setup } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL!
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

setup('create test user sessions', async ({ page }) => {
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Create free test user (or get existing)
  const { data: freeUser } = await admin.auth.admin.createUser({
    email: process.env.E2E_FREE_USER_EMAIL!,
    password: process.env.E2E_USER_PASSWORD!,
    email_confirm: true,
  })

  // Sign in to get a session token
  const { data: session } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: process.env.E2E_FREE_USER_EMAIL!,
  })

  // Exchange action_link for a session via the browser
  await page.goto(session.properties.action_link)
  await page.waitForURL('**/items')

  // Save storage state for reuse in tests
  await page.context().storageState({ path: 'e2e/fixtures/free-user.json' })

  // Repeat for Pro and Admin test users
  // ... (same pattern with E2E_PRO_USER_EMAIL, E2E_ADMIN_USER_EMAIL)
})
```

**Required env vars for E2E (add to `.env.example` and CI secrets):**
```
E2E_FREE_USER_EMAIL=e2e-free@test.local
E2E_PRO_USER_EMAIL=e2e-pro@test.local
E2E_ADMIN_USER_EMAIL=e2e-admin@test.local
E2E_USER_PASSWORD=test-password-e2e
```

Playwright `playwright.config.ts` must reference the saved storage states in `projects`:
```ts
{ name: 'free-user', use: { storageState: 'e2e/fixtures/free-user.json' } },
{ name: 'pro-user',  use: { storageState: 'e2e/fixtures/pro-user.json'  } },
{ name: 'admin',     use: { storageState: 'e2e/fixtures/admin.json'     } },
```

---

#### Subtask 1 — Seed helper: `e2e/fixtures/seed.ts`

```ts
// Creates items, sets user tiers, tears down after test
export async function seedItem(userId: string, overrides?: Partial<ItemRow>): Promise<ItemRow>
export async function setUserTier(userId: string, tier: 'free' | 'pro' | 'power'): Promise<void>
export async function cleanupUser(userId: string): Promise<void>
```

Uses `SUPABASE_SERVICE_ROLE_KEY` — only available server-side or in test environments.

---

#### Test file: `e2e/critical-path.spec.ts`

**Core scenarios (must pass):**

```
1. Onboarding empty state
   - Use free-user storageState
   - Ensure 0 items for this user (cleanupUser in beforeEach)
   - Navigate to /items
   - Assert onboarding panel visible: drop address shown, copy button present

2. Item appears after ingest (mocked)
   - seedItem({ status: 'done', ai_summary: 'Test summary', subject: 'Test subject' })
   - Navigate to /items (or reload)
   - Assert item card renders with subject and summary

3. Item detail: edit summary and tags
   - Click item card → detail panel opens
   - Click ai_summary field, clear, type "Edited summary", blur
   - Reload page
   - Assert "Edited summary" persists
   - Add tag "test-tag" via inline tag editor
   - Assert tag chip visible on item card

4. Hard delete (Free user)
   - seedItem for free-user
   - Click delete button on item card
   - Assert confirmation modal appears
   - Click "Delete permanently"
   - Assert item no longer appears in list
```

**Stretch goals (if time allows):**

```
5. Soft delete (Pro user)
   - Use pro-user storageState
   - seedItem, delete → assert moves to trash
   - Navigate to /trash → assert item present with restore button

6. Search returns matching item
   - seedItem({ ai_summary: 'machine learning pipeline' })
   - Type "machine learning" in search box
   - Assert item card appears in results
```

**Acceptance:**
- Scenarios 1–4 pass on a Vercel preview deploy
- `pnpm e2e` exits 0 in CI
- Auth setup produces valid sessions (not empty storage state)
- Test runtime goal: under 3 minutes (not 60 seconds — too aggressive for remote preview + Vercel cold starts)

---

### S603 — Playwright E2E: Stripe upgrade flow

**Type:** test
**Points:** 3
**Depends on:** S602 (test infrastructure, seed helpers, auth sessions)

**Goal:** Verify the Stripe upgrade path from free cap to paid tier, end-to-end.

**Test file:** `e2e/stripe-upgrade.spec.ts`

**Env vars required:**
```
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_test_...
```

**Scenarios:**

```
1. Cap exceeded banner visible
   - Use free-user storageState
   - seedItem × 20 (item cap for free tier)
   - Navigate to /items
   - Assert cap/upgrade banner visible with "Upgrade" link

2. Pricing page upgrade CTA
   - Navigate to /pricing
   - Assert Pro tier card visible with price "$9.99/mo"
   - Assert upgrade button present

3. Checkout session created
   - Click "Upgrade to Pro"
   - Intercept POST /api/checkout via page.route()
   - Assert request body contains { tier: 'pro' }
   - Return mock { url: 'https://checkout.stripe.com/mock' }
   - Assert browser redirects to mock Stripe URL

4. Webhook → tier updated
   - Construct a valid Stripe checkout.session.completed webhook payload
   - POST directly to /api/webhooks/stripe with correct Stripe-Signature header
   - Assert HTTP 200
   - Query test DB: assert users.tier = 'pro' for the test user
```

**Note on scenario 4:** Stripe webhook signature verification requires a real HMAC. Use the Stripe test SDK's `stripe.webhooks.generateTestHeaderString()` to produce a valid header:
```ts
const payload = JSON.stringify({ type: 'checkout.session.completed', ... })
const header = stripe.webhooks.generateTestHeaderString({ payload, secret: process.env.STRIPE_WEBHOOK_SECRET! })
```

**Acceptance:**
- All 4 scenarios pass in Stripe test mode
- Tier change confirmed by direct DB query (not just UI assertion)
- `pnpm e2e` exits 0 in CI

---

### S604 — Playwright E2E: admin smoke test

**Type:** test
**Points:** 2
**Depends on:** S602 (admin session and seed helpers)

**Goal:** Verify the admin panel is gated correctly and core admin actions work.

**Test file:** `e2e/admin.spec.ts`

**Admin user setup:** The `auth.setup.ts` in S602 must seed an admin user with `is_admin = true` in `public.users`. Use service role to set the flag:
```ts
await admin.from('users').update({ is_admin: true }).eq('id', adminUser.id)
```

**Scenarios:**

```
1. Non-admin redirect
   - Use free-user storageState
   - Navigate to /admin
   - Assert redirect to /items (not 403)

2. Admin user list
   - Use admin storageState
   - Navigate to /admin
   - Assert user table visible
   - Assert at least the free and pro test users appear

3. Block list management
   - Navigate to /admin/blocks
   - Add "spam@example.com" via block list form
   - Assert entry appears in table with type "email"
   - Remove entry
   - Assert entry removed from table

4. Invite code generation
   - Navigate to /admin/invites
   - Click "Generate Code"
   - Assert new code row appears (unused, valid format)

5. System stats
   - Navigate to /admin/stats (or /admin — wherever stats live)
   - Assert page renders without error
   - Assert no unhandled JS console errors
```

**Acceptance:**
- All 5 scenarios pass
- `/admin` is inaccessible to non-admin users (asserts redirect, not blank page)

---

### S605 — CI hardening: coverage gate + Playwright on preview URL

**Type:** chore
**Points:** 3
**Depends on:** S601 (coverage ≥ 60%), S602–S604 (E2E tests written), S609 (Vercel OSS — see note)

**Goal:** CI rejects PRs that drop coverage below 60% or have a failing E2E test.

---

#### Coverage gate — use vitest `thresholds` (not a shell script)

Add to `vitest.config.ts`:
```ts
coverage: {
  provider: 'v8',
  reporter: ['text', 'lcov', 'json-summary'],  // add json-summary here
  thresholds: {
    statements: 60,
  },
}
```

This makes `vitest run --coverage` exit with code 1 when coverage drops below 60% — built-in, no fragile shell script needed.

**Also add to `vitest.config.ts` now (not waiting for CI):** Configuring thresholds locally means developers learn immediately when they break coverage, not just in CI.

In `.github/workflows/ci.yml`, the coverage step is simply:
```yaml
- name: Unit tests + coverage
  run: pnpm test:coverage
```

No additional inline script needed — vitest handles the gate.

---

#### E2E job

In `.github/workflows/ci.yml`, add an E2E job after tests:
```yaml
e2e:
  needs: [lint, typecheck, test]
  runs-on: ubuntu-latest
  if: github.event_name == 'pull_request'
  steps:
    - uses: actions/checkout@v4
    - uses: pnpm/action-setup@v2
      with: { version: 9 }
    - run: pnpm install --frozen-lockfile
    - run: pnpm exec playwright install --with-deps chromium
    - run: pnpm e2e
      env:
        BASE_URL: ${{ steps.preview.outputs.url }}    # must match playwright.config.ts: process.env.BASE_URL
        SUPABASE_URL: ${{ secrets.TEST_SUPABASE_URL }}
        SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.TEST_SUPABASE_SERVICE_ROLE_KEY }}
        STRIPE_SECRET_KEY: ${{ secrets.STRIPE_TEST_SECRET_KEY }}
        STRIPE_WEBHOOK_SECRET: ${{ secrets.STRIPE_TEST_WEBHOOK_SECRET }}
        E2E_FREE_USER_EMAIL: ${{ secrets.E2E_FREE_USER_EMAIL }}
        E2E_PRO_USER_EMAIL: ${{ secrets.E2E_PRO_USER_EMAIL }}
        E2E_ADMIN_USER_EMAIL: ${{ secrets.E2E_ADMIN_USER_EMAIL }}
        E2E_USER_PASSWORD: ${{ secrets.E2E_USER_PASSWORD }}
    - uses: actions/upload-artifact@v4
      if: failure()
      with:
        name: playwright-report
        path: playwright-report/
```

**Env var consistency:** `playwright.config.ts` already reads `process.env.BASE_URL`. The CI job must set `BASE_URL`, not `PLAYWRIGHT_BASE_URL`. Verify these match before merging S605.

---

#### Vercel preview URL + SSO note

> **Important:** Vercel Hobby plan preview deploys are protected by Vercel SSO. The E2E runner cannot reach the preview URL until either:
> - (a) Vercel OSS approval is granted (S609 — timeline uncertain), or
> - (b) A `VERCEL_AUTOMATION_BYPASS_SECRET` is configured on the Vercel project (bypass header available on all Vercel plans).
>
> **Recommended:** Configure `VERCEL_AUTOMATION_BYPASS_SECRET` in the Vercel project settings (takes 5 minutes) and add the header in `playwright.config.ts`:
> ```ts
> extraHTTPHeaders: {
>   'x-vercel-protection-bypass': process.env.VERCEL_AUTOMATION_BYPASS_SECRET ?? '',
> }
> ```
> This unblocks E2E immediately, without waiting for OSS approval.

**Vercel preview URL extraction:** Parse from the `vercel-deploy` action output in the existing Vercel deploy step, or use `gh pr view --json url` to fetch the Vercel deployment comment URL. Specify this concretely in the CI YAML — do not leave "use vercel-preview-url action" as a placeholder.

**Acceptance:**
- `pnpm test:coverage` exits 1 when coverage < 60% (tested locally — add a temp test that reduces coverage to verify)
- PR with failing E2E uploads Playwright HTML report as artifact
- `BASE_URL` in CI matches `playwright.config.ts` env var name
- Vercel SSO bypass configured (`VERCEL_AUTOMATION_BYPASS_SECRET` or OSS approved)
- Coverage and E2E status checks visible on every PR

---

### S606 — Docker Compose: self-hosted local setup

**Type:** feat
**Points:** 3
**Depends on:** nothing (standalone)

**Goal:** A developer clones the repo, copies `.env.example`, fills in credentials, runs `docker compose up`, and has a working local environment.

**Note:** `apps/worker/Dockerfile` already exists. The web Dockerfile and `docker-compose.yml` do not yet exist. Only build the missing pieces.

---

#### `docker-compose.yml` (repo root)

```yaml
version: '3.9'
services:
  web:
    build:
      context: .
      dockerfile: apps/web/Dockerfile
    ports: ["3000:3000"]
    env_file: .env
    depends_on: [redis]

  worker:
    build:
      context: .
      dockerfile: apps/worker/Dockerfile
    env_file: .env
    depends_on: [redis]

  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
    volumes: ["redis-data:/data"]

volumes:
  redis-data:
```

#### `apps/web/Dockerfile` (multi-stage)

```dockerfile
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/
RUN corepack enable && pnpm install --frozen-lockfile

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm --filter @drop-note/web build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S nodejs && adduser -S nextjs -G nodejs
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public
USER nextjs
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
```

Note: Next.js standalone output must be enabled in `apps/web/next.config.js`:
```js
output: 'standalone'
```

---

#### `.env.example` (repo root — complete variable list)

```bash
# === Supabase ===
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# === Redis (BullMQ — IORedis connection string) ===
REDIS_URL=redis://localhost:6379

# === Upstash Redis (rate limiting — REST API, separate from BullMQ Redis) ===
UPSTASH_REDIS_REST_URL=https://your-instance.upstash.io
UPSTASH_REDIS_REST_TOKEN=AX...

# === AI Provider (self-hosted: 'openai' | 'anthropic' | 'gemini') ===
AI_PROVIDER=openai
OPENAI_API_KEY=sk-...
# ANTHROPIC_API_KEY=sk-ant-...   # required if AI_PROVIDER=anthropic
# GEMINI_API_KEY=AIza...          # required if AI_PROVIDER=gemini

# === Email Sending (Resend) ===
RESEND_API_KEY=re_...

# === Email Inbound (SendGrid) ===
SENDGRID_INGEST_SECRET=your-webhook-shared-secret

# === Payments (Stripe) ===
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PRO_PRICE_ID=price_...
NEXT_PUBLIC_STRIPE_POWER_PRICE_ID=price_...

# === App URL (used for Stripe redirect URLs) ===
NEXT_PUBLIC_APP_URL=http://localhost:3000

# === Error Monitoring (Sentry) ===
SENTRY_DSN=https://...@sentry.io/...
NEXT_PUBLIC_SENTRY_DSN=https://...@sentry.io/...

# === Cron auth (Vercel cron jobs) ===
CRON_SECRET=your-random-secret-here

# === E2E tests only — do not set in production ===
# E2E_FREE_USER_EMAIL=e2e-free@test.local
# E2E_PRO_USER_EMAIL=e2e-pro@test.local
# E2E_ADMIN_USER_EMAIL=e2e-admin@test.local
# E2E_USER_PASSWORD=test-password-e2e
```

**Acceptance:**
- `docker compose up` from a fresh clone (with valid `.env`) starts all 3 services cleanly
- `http://localhost:3000` returns the login page
- Worker logs show "BullMQ worker ready, connected to Redis"
- `.env.example` contains every env var used by any file in the codebase (audit with `grep -r "process.env\." apps/ packages/ --include="*.ts" | grep -v test | grep -v __tests__`)
- No real secrets in `.env.example`

---

### S607 — CONTRIBUTING.md

**Type:** docs
**Points:** 2
**Depends on:** S606 (Docker Compose documented)

**Goal:** A developer with no prior context can get the project running and submit a PR without asking questions.

**File:** `CONTRIBUTING.md` (repo root)

**Required sections:**
1. **Prerequisites** — Node 20, pnpm 9, Docker Desktop (for Compose path), Supabase CLI
2. **Local dev (pnpm path)** — step-by-step: clone → `pnpm install` → copy `.env.local` → `pnpm --filter @drop-note/web dev`
3. **Local dev (Docker path)** — `cp .env.example .env` → fill in → `docker compose up`
4. **Running tests** — `pnpm test`, `pnpm test:coverage` (fails below 60%), `pnpm e2e`
5. **Monorepo structure** — one-line description of each: `apps/web`, `apps/worker`, `packages/shared`
6. **Database migrations** — write SQL file → `supabase db push --linked` → `pnpm gen:types` (always run after schema changes)
7. **Code conventions** — semantic tokens only, no raw Tailwind colors, Server Components by default, no module-level env reads, no `as any` outside tests
8. **Commit format** — `[sN] type: description`, 72-char limit, co-author trailer
9. **PR process** — title format, which CI checks must pass (lint, typecheck, unit test + 60% coverage, E2E)
10. **AI provider config (self-hosted)** — `AI_PROVIDER` env var, which keys are required per provider (see S613)
11. **Architecture overview** — 4-sentence pitch + link to `docs/architecture/`

**Acceptance:**
- `CONTRIBUTING.md` exists at repo root
- All command examples are copy-pasteable (no unfilled `<placeholder>` values)
- Mentions the 60% coverage gate and E2E requirement for PRs

---

### S608 — README

**Type:** docs
**Points:** 2
**Depends on:** S607 (CONTRIBUTING.md exists)

**Goal:** Anyone landing on the GitHub repo understands what drop-note is, can self-host it, and knows where the SaaS lives.

**File:** `README.md` (repo root)

**Required sections:**
1. **Header** — project name, one-line description, license badge (AGPL-3.0), CI status badge
2. **What it does** — 2–3 sentences: the email-to-dashboard pitch
3. **Screenshots** — placeholder comment if screenshots not ready: `<!-- TODO: add dashboard screenshot -->`
4. **SaaS link** — `dropnote.com`, free tier note
5. **Self-hosted quickstart** — 5-step numbered list using Docker Compose + `.env.example`
6. **Architecture diagram** — Mermaid flowchart:
   ```
   Email → SendGrid Inbound Parse → /api/ingest → BullMQ → Worker
   Worker → OpenAI → Supabase DB
   Dashboard (Next.js) → Supabase Realtime ← Supabase DB
   ```
7. **Tech stack** — brief table
8. **Contributing** — one-liner → `CONTRIBUTING.md`
9. **License** — AGPL-3.0 notice

**Create `LICENSE` file** (root of repo) with the full AGPL-3.0 text if it doesn't already exist. The README's license badge must link to it.

**Acceptance:**
- README renders without errors on GitHub (Mermaid renders natively in GitHub markdown)
- No broken links (especially `CONTRIBUTING.md` and `LICENSE`)
- Self-hosted quickstart is accurate for the Docker Compose setup from S606

---

### S609 — Apply Vercel OSS program

**Type:** chore
**Points:** 1
**Depends on:** S608 (public README ready)
**Status:** ⏸ Deferred — moved to post-launch follow-up

**Goal:** Submit Vercel OSS application. This is not a launch blocker, but it improves the contributor experience by removing Vercel SSO from preview URLs.

**Steps:**
1. Ensure repo is public on GitHub
2. Visit `vercel.com/oss` and submit: repo URL, AGPL license, project description
3. Note: approval is not instant — configure `VERCEL_AUTOMATION_BYPASS_SECRET` (S605) as the immediate workaround for E2E

**Acceptance:**
- Application submitted and confirmation documented in S612 launch checklist

> **Deferred:** `VERCEL_AUTOMATION_BYPASS_SECRET` already unblocks E2E for CI. Revisit after launch.

---

### S610 — Security pass: audit all API routes

**Type:** chore
**Points:** 2
**Depends on:** nothing

**Goal:** Walk every route in `apps/web/app/api/` and verify auth guards, input validation, rate limits, and signature verification. Produce a signed-off checklist.

**Complete route inventory** (do not skip any):

| Route | Auth guard | Rate limit | Input validation | Signature verify |
|---|---|---|---|---|
| `POST /api/ingest` | None (sender lookup) | Yes (Redis, by tier) | SendGrid sig header | Yes |
| `POST /api/auth/register` | None | **No — add one** | invite code format | N/A |
| `GET /api/items` | Supabase session | N/A | pagination params | N/A |
| `GET /api/items/search` | Supabase session | N/A | `q` length (1–200 chars) | N/A |
| `PATCH /api/items/:id` | Supabase session + RLS | N/A | body schema (zod or manual) | N/A |
| `DELETE /api/items` | Supabase session + RLS | N/A | body: array of UUIDs | N/A |
| `POST /api/items/bulk-tag` | Supabase session + RLS | N/A | body: UUID array + tag strings | N/A |
| `POST /api/checkout` | Supabase session | N/A | tier: 'pro'\|'power' only | N/A |
| `POST /api/billing-portal` | Supabase session | N/A | N/A | N/A |
| `POST /api/webhooks/stripe` | None (raw body) | N/A | N/A | Yes (constructEvent) |
| `POST /api/account/delete` | Supabase session | N/A | N/A | N/A |
| `GET /api/cron/purge-trash` | `CRON_SECRET` Bearer | N/A | N/A | N/A |
| `GET /admin/*` | `is_admin` server check | N/A | N/A | N/A |
| `POST /api/admin/*` | `is_admin` server check | N/A | body schema | N/A |

**Fixes to apply (expected):**
1. **`/api/auth/register`:** Add rate limit — 5 attempts per IP per hour (Redis `INCR ip:{hash}:register:{hour}` with 1hr TTL). Reject with 429 on threshold exceeded.
2. **`/api/items/search`:** Validate `q` param: reject empty strings and strings > 200 characters with 400.
3. **`/api/items/bulk-tag` and `DELETE /api/items`:** Validate body as array of valid UUIDs (reject non-UUID strings). Limit array length to 100 items max.
4. **`/api/cron/purge-trash`:** If `CRON_SECRET` is unset, the route should return 500 and log an error. Verify this behavior is intentional and won't cause runaway Vercel cron retries. Consider returning 200 with `{ skipped: true }` if secret is unconfigured, to stop retry storms.
5. **All routes:** No route should return `error.stack` or internal SQL error messages in production responses. Check `catch` blocks — use `process.env.NODE_ENV === 'production'` to gate stack exposure.

**Acceptance:**
- `docs/security-audit.md` committed to repo with the table above, plus a findings + status column
- All P0/P1 findings applied
- `/api/auth/register` has a rate limit
- No route leaks stack traces in production error responses

---

### S611 — DB performance pass: indexes and query analysis

**Type:** chore
**Points:** 2
**Depends on:** nothing

**Goal:** Ensure the most-used queries have appropriate indexes. Document the EXPLAIN results.

**Existing indexes to verify first (do not recreate if present):**
- `items_search_vector_gin` — GIN index on `fts_vector`. Created in Sprint 4 migration `20260326000005_s4_fts_index.sql`. Verify it exists before adding.
- `users.drop_token` — has an implicit unique index from the `UNIQUE` constraint added in Sprint 1. This satisfies query needs. A named `idx_users_drop_token` is optional (cosmetic). Do not add a duplicate index.

**New indexes to add (write as migration `supabase/migrations/YYYYMMDDHHMMSS_s6_perf_indexes.sql`):**

```sql
-- Most common query: dashboard items load
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_items_user_id_created_at
  ON public.items (user_id, created_at DESC)
  WHERE deleted_at IS NULL;

-- Tag filter join
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_item_tags_tag_id
  ON public.item_tags (tag_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_item_tags_item_id
  ON public.item_tags (item_id);

-- Ingest block list check (hot path — runs on every inbound email)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_block_list_type_value
  ON public.block_list (type, value);
```

That is **4 new indexes** (plus 2 existing already verified). Total tracked: 6.

**EXPLAIN ANALYZE on top 3 queries** (run against the live DB with realistic data — even if only a few rows exist, the plan will show index usage):

```sql
-- 1. Dashboard items load
EXPLAIN ANALYZE
SELECT id, subject, ai_summary, status, created_at, pinned
FROM public.items
WHERE user_id = '<test_user_id>'
  AND deleted_at IS NULL
ORDER BY pinned DESC, created_at DESC
LIMIT 20;

-- 2. Tag filter
EXPLAIN ANALYZE
SELECT i.id, i.subject, i.created_at
FROM public.items i
JOIN public.item_tags it ON it.item_id = i.id
JOIN public.tags t ON t.id = it.tag_id
WHERE i.user_id = '<test_user_id>'
  AND t.name_lower = 'technology'
  AND i.deleted_at IS NULL
ORDER BY i.created_at DESC;

-- 3. FTS search
EXPLAIN ANALYZE
SELECT id, subject, ai_summary, created_at
FROM public.items
WHERE user_id = '<test_user_id>'
  AND deleted_at IS NULL
  AND fts_vector @@ plainto_tsquery('english', 'machine learning')
ORDER BY ts_rank(fts_vector, plainto_tsquery('english', 'machine learning')) DESC
LIMIT 20;
```

**Acceptance:**
- All 4 new indexes exist in production (verify with `\d public.items` and `\di`)
- Dashboard load query shows Index Scan or Bitmap Index Scan (not Seq Scan) in EXPLAIN output
- FTS query uses GIN index
- Results documented in `docs/db-performance.md`

---

### S612 — Production launch checklist

**Type:** chore
**Points:** 1
**Depends on:** all other S6 tasks

**Goal:** A single written checklist that the founder runs through manually before announcing the beta.

**File:** `docs/launch-checklist.md`

**Infrastructure**
- [ ] `dropnote.com` domain acquired
- [ ] MX records configured on domain pointing to SendGrid
- [ ] SendGrid Inbound Parse webhook URL set to `https://dropnote.com/api/ingest`
- [ ] SendGrid domain authentication (SPF/DKIM) verified
- [ ] Vercel project linked to production domain
- [ ] All Vercel env vars set to production values (not test values, not `.env.example` examples)
- [ ] Railway worker deployed with production env vars
- [ ] Upstash Redis URLs configured in Railway + Vercel
- [ ] `CRON_SECRET` set in Vercel env vars (required for purge-trash cron job)

**Stripe**
- [ ] Stripe live mode enabled (not test mode)
- [ ] Pro product + price created in live mode; `NEXT_PUBLIC_STRIPE_PRO_PRICE_ID` set
- [ ] Power product + price created in live mode; `NEXT_PUBLIC_STRIPE_POWER_PRICE_ID` set
- [ ] Stripe webhook endpoint: `https://dropnote.com/api/webhooks/stripe`
- [ ] Webhook events registered: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`
- [ ] `STRIPE_WEBHOOK_SECRET` set to live mode webhook signing secret
- [ ] Ran a live test checkout end-to-end before opening beta

**Auth & Email**
- [ ] Supabase Auth email provider configured (SMTP or Supabase-hosted email)
- [ ] Magic link redirect URL: `https://dropnote.com/auth/callback`
- [ ] Welcome email template live in Resend
- [ ] Resend domain verified for sending from `@dropnote.com`

**Monitoring**
- [ ] Sentry DSN set for both `web` and `worker` environments
- [ ] Sentry alert rule: error rate > 1/min → notify
- [ ] Uptime monitor configured (Better Uptime or equivalent)

**Legal**
- [ ] Terms of Service at `dropnote.com/terms` — contains substantive content (not placeholder)
- [ ] Privacy Policy at `dropnote.com/privacy` — contains GDPR Article 13 disclosures and 30-day erasure SLA (not placeholder text)
- [ ] GDPR cookie consent banner live

**OSS & CI**
- [ ] GitHub repo set to public
- [ ] AGPL `LICENSE` file present in repo root
- [ ] Vercel OSS application submitted (S609) — approval date: ___
- [ ] GitHub Actions CI fully green on `main`
- [ ] GitHub Projects public roadmap board created

**Final smoke test (manual, run once before beta)**
- [ ] Register a new account → receive magic link email → click → land on `/items`
- [ ] Send email to `drop@dropnote.com` from registered address → item appears in dashboard within 30s
- [ ] Upgrade to Pro via Stripe (use live card in test mode first, then real card) → tier changes to `pro` in Supabase
- [ ] Admin panel accessible with `is_admin` account
- [ ] Account deletion completes without error, user record removed

**Acceptance:**
- `docs/launch-checklist.md` committed to repo
- All checkboxes ticked and initialed before beta announcement

---

### S613 — AI provider abstraction layer

**Type:** feat
**Points:** 3
**Depends on:** nothing (additive to worker, no breaking changes to SaaS)

**Goal:** Self-hosted operators can configure OpenAI, Anthropic, or Gemini via `.env`. The SaaS deployment always uses OpenAI — no behavior change.

---

#### Interface design note — `suggestTags` vs combined call

The current `apps/worker/src/lib/openai.ts` makes **one API call** that returns both a summary and tag suggestions together. Do not split this into two separate calls — it doubles cost and latency. The interface must reflect this:

```ts
// packages/shared/src/ai-provider.ts
export interface AIProvider {
  // Returns summary and tags from a single API call
  processText(text: string, existingTags: string[]): Promise<{
    summary: string
    tags: string[]
  }>
  // Returns image description (used for Vision-capable models only)
  describeImage(base64: string, mimeType: string): Promise<string>
}
```

Providers that don't support vision (unlikely, but possible) should return `''` from `describeImage` — the processor skips image description if the result is empty.

---

#### Factory

```ts
export function createAIProvider(): AIProvider {
  const provider = process.env.AI_PROVIDER ?? 'openai'
  switch (provider) {
    case 'openai':
      return new OpenAIProvider(process.env.OPENAI_API_KEY!)
    case 'anthropic':
      return new AnthropicProvider(process.env.ANTHROPIC_API_KEY!)
    case 'gemini':
      return new GeminiProvider(process.env.GEMINI_API_KEY!)
    default:
      throw new Error(
        `Unknown AI_PROVIDER: "${provider}". Valid values: openai, anthropic, gemini`
      )
  }
}
```

The factory is called once at worker startup (lazy singleton). Not per-job.

#### Worker integration

Replace the direct `openai` SDK calls in `apps/worker/src/processor.ts` with `createAIProvider().processText(...)` and `.describeImage(...)`. The external behavior of the worker is identical; only the internal routing changes.

#### Tests

- `createAIProvider()` with `AI_PROVIDER=openai` → returns `OpenAIProvider` instance
- `createAIProvider()` with `AI_PROVIDER=anthropic` → returns `AnthropicProvider` instance
- `createAIProvider()` with unknown value → throws with informative error message
- Each provider's `processText()` with mocked HTTP → returns `{ summary, tags }`

**Acceptance:**
- `AI_PROVIDER=anthropic` with valid key processes a job (mock HTTP) without error
- `AI_PROVIDER=openai` (default, no env var set) continues to work for SaaS — no behavior change
- Unknown provider value throws a clear error at startup
- Documented in `CONTRIBUTING.md` (S607) and `README.md` (S608)

---

### S614 — Per-user address migration prep (v2 readiness)

**Type:** chore
**Points:** 2
**Depends on:** S611 (indexes confirmed)

**Goal:** Next developer can activate per-user token routing in ≤ 1 day, without archaeology. Nothing shipped to users.

---

#### Existing index status

`users.drop_token` has an implicit unique index from the `UNIQUE` constraint in Sprint 1 schema. This is sufficient for v2 lookups — **do not add a duplicate named index**. S611 should confirm the constraint exists; if it does, this task is satisfied for the index requirement.

---

#### Migration stub

`supabase/migrations/YYYYMMDDHHMMSS_v2_per_user_routing_stub.sql`

```sql
-- V2 migration stub: per-user inbound address routing
-- Status: STUB ONLY — do not apply to production
--
-- Purpose: Switch from shared inbox (drop@dropnote.com → user lookup by FROM email)
--          to per-user address (drop+[token]@dropnote.com → user lookup by drop_token)
--
-- Prerequisites before activating:
--   1. SendGrid catch-all wildcard routing: *@dropnote.com → /api/ingest
--   2. Update /api/ingest to extract token from TO header (see docs/v2-per-user-routing.md)
--   3. Confirm users.drop_token UNIQUE constraint exists (it does — Sprint 1)
--
-- No SQL changes needed. All schema is already in place.
-- This stub file exists to mark the migration point and document the code change needed.

-- Code change required in apps/web/app/api/ingest/route.ts:
-- 1. Extract token from SendGrid TO header:
--    const token = toAddress.match(/drop\+([^@]+)@/)?.[1]
-- 2. If token found: lookup by drop_token
--    .from('users').select('id, tier').eq('drop_token', token)
-- 3. If no token: fallback to FROM email lookup (backwards compat during transition)
--    .from('users').select('id, tier').eq('email', senderEmail)
```

---

#### `docs/v2-per-user-routing.md`

Required sections:
1. **Current state** — shared inbox, FROM email lookup, why it has limitations
2. **Target state** — per-user `drop+[token]@dropnote.com`, token lookup
3. **SendGrid configuration** — catch-all wildcard `*@dropnote.com` pointing to ingest webhook
4. **Code change** — pseudocode diff of the ingest route change (as in the stub above)
5. **Migration strategies** — three options:
   - A: Hard cutover (notify all users with new address, remove fallback)
   - B: Dual-mode (support both FROM and token lookup, deprecate FROM over 30 days)
   - C: Opt-in (users choose to activate their personal address in Settings)
6. **Estimated effort** — < 1 day (document which files to change)

**Acceptance:**
- Migration stub file committed (not applied to any DB)
- `docs/v2-per-user-routing.md` committed
- A developer with no prior context understands what to do from the doc alone

---

### S615 — Privacy Policy and Terms of Service

**Type:** chore
**Points:** 1
**Depends on:** nothing

**Goal:** Legal pages are live at `dropnote.com/terms` and `dropnote.com/privacy` before the beta opens. Both must contain substantive content — not placeholders — to comply with GDPR Article 13 and avoid liability.

**Approach:** Use an AI-assisted draft (Claude or similar) as a starting point. The founder must review and approve before launch — these are not engineering documents, but they need engineering to get them in front of the founder.

**Privacy Policy must include (GDPR Article 13):**
- Data controller identity (founder name + contact email)
- Categories of personal data collected (email address, sent email content, IP address)
- Legal basis for processing
- Data retention periods (items retained while account active; 30-day trash retention for paid users)
- Right to erasure (Article 17) — self-serve via account deletion in Settings
- Contact for data subject requests

**Terms of Service must include:**
- Description of the service
- Acceptable use (no spam from the ingest address, no illegal content)
- Payment terms (monthly billing, no refunds, cancel anytime)
- Liability limitation
- AGPL license notice for self-hosted users

**Delivery:**
- Create `apps/web/app/(public)/terms/page.tsx` and `apps/web/app/(public)/privacy/page.tsx` with the text
- Add routes to the footer navigation
- Update the S612 checklist to confirm these pages contain substantive content

**Status:** Pages drafted at `apps/web/app/privacy/page.tsx` and `apps/web/app/terms/page.tsx`.

**Remaining before launch (founder action required):**
- [ ] Fill in data controller identity — replace "the operator of this service" in Privacy Policy Section 1 with your real name/company name and confirm `legal@dropnote.com` is the correct contact
- [ ] Read through both pages end-to-end and approve before beta opens

**Acceptance:**
- `/terms` and `/privacy` routes return 200 with substantive legal content (not "Coming soon")
- Privacy Policy includes all 6 required GDPR Article 13 elements listed above
- Footer links to both pages
- Founder has reviewed and approved both texts

---

## Sprint 6 Summary

| Ticket | Theme | Points | Depends on |
|---|---|---|---|
| S601 | Fix failing tests + coverage to 60% | 4 | — |
| S602 | E2E: auth setup + core user flow | 6 | S601 |
| S603 | E2E: Stripe upgrade flow | 3 | S602 |
| S604 | E2E: admin smoke test | 2 | S602 |
| S605 | CI hardening: coverage gate + E2E | 3 | S601–S604 |
| S606 | Docker Compose + Dockerfiles + .env.example | 3 | — |
| S607 | CONTRIBUTING.md | 2 | S606 |
| S608 | README + LICENSE | 2 | S607 |
| S609 | Apply Vercel OSS program | 1 | S608 |
| S610 | Security pass: all API routes | 2 | — |
| S611 | DB performance: indexes + EXPLAIN | 2 | — |
| S612 | Production launch checklist | 1 | all |
| S613 | AI provider abstraction layer | 3 | — |
| S614 | Per-user routing migration prep | 2 | S611 |
| S615 | Privacy Policy + Terms of Service | 1 | — |

**Sprint 6 Total: 37 points**

**Recommended execution order:**
1. **Day 1 (unblocks everything):** S601 Part A — fix 8 failing unit tests. Do not begin any other ticket until `pnpm test` is green.
2. **Parallel (no dependencies):** S606 (Docker), S610 (security), S611 (DB indexes), S613 (AI abstraction), S615 (legal pages)
3. **S601 Part B** — write new tests to reach 60% coverage
4. **S602 → S603 → S604** — E2E suite (sequential, each builds on previous infrastructure)
5. **S605** — CI hardening (after E2E suite is green locally)
6. **S607 → S608 → S609** — docs and OSS (sequential)
7. **S614** — v2 migration prep (after S611 confirms indexes)
8. **S612** — launch checklist (last, as a capstone)
