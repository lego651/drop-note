# S1 Code Review — Post-Sprint Audit

**Reviewer:** Tech Lead / Code Auditor
**Date:** 2026-03-26
**Scope:** Every file shipped in Sprint 1
**Verdict:** Solid foundation, but several security gaps, missing database hardening, and frontend rough edges need attention before Sprint 2 builds on top.

---

## Severity Legend

| Level | Meaning |
|-------|---------|
| **P0 — Critical** | Security risk or data-loss potential. Fix before any new feature work. |
| **P1 — High** | Will cause real bugs or block future sprints if ignored. |
| **P2 — Medium** | Best-practice violation; fix during current or next sprint. |
| **P3 — Low** | Cleanup / DX improvement; schedule when convenient. |

---

## R-001 · P0 · Missing RLS on `block_list`, `invite_codes`, `usage_log`

**What's wrong:**
RLS is enabled on 5 of 8 tables. `block_list`, `invite_codes`, and `usage_log` have **no RLS at all**. With Supabase's default behavior, any authenticated user with the anon key can read, insert, update, and delete rows in all three tables. A malicious user could:
- Delete block-list entries to unblock banned emails/IPs.
- Fabricate invite codes.
- Wipe or inflate usage logs to bypass free-tier caps.

**File:** `supabase/migrations/20240001000001_rls_policies.sql`

**Actionable steps:**
1. Add a new migration enabling RLS on all three tables.
2. `block_list` — read-only for authenticated users; write only via service_role or admin check (`SELECT is_admin FROM public.users WHERE id = auth.uid()`).
3. `invite_codes` — users can select their own created/used codes; insert only via service_role or admin; update (claim) only if `used_by IS NULL`.
4. `usage_log` — users can select their own rows; insert only via service_role (the worker writes these).
5. Write integration tests that verify a non-admin user cannot mutate `block_list`.

**Acceptance:**
- `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` on all three tables.
- Policies exist for every CRUD operation on each table.
- A test confirms an anon-key user gets zero rows from `block_list`.

---

## R-002 · P0 · `site_settings` has no admin write policy

**What's wrong:**
`site_settings` has a single read policy (`auth.uid() IS NOT NULL`). There is **no INSERT/UPDATE/DELETE policy**. Admins cannot modify registration_mode or open_slots through the Supabase client — they'd need the service_role key directly, which defeats the purpose of having an admin dashboard (Sprint 5).

**File:** `supabase/migrations/20240001000001_rls_policies.sql`

**Actionable steps:**
1. Add INSERT, UPDATE, DELETE policies gated by `EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true)`.
2. Verify with a test that a non-admin user cannot update `site_settings`.

**Acceptance:**
- Admin can update `site_settings` via the Supabase JS client with a normal user session.
- Non-admin writes are rejected with a policy violation.

---

## R-003 · P0 · No Supabase generated types — all queries are untyped

**What's wrong:**
There is no `database.types.ts` anywhere in the codebase. Every `supabase.from('items').select(...)` call is completely untyped — the return type is `any`. This means:
- No compile-time safety for column names, types, or RLS-filtered shapes.
- Typos in column names silently pass TypeScript.
- Refactoring the schema has no type-level safety net.

**Actionable steps:**
1. Run `npx supabase gen types typescript --linked > packages/shared/src/database.types.ts`.
2. Export the `Database` type from `@drop-note/shared`.
3. Update all three Supabase client factories (`client.ts`, `server.ts`, `middleware.ts`) to pass the generic: `createBrowserClient<Database>(...)`, `createServerClient<Database>(...)`.
4. Add a `gen:types` script to the root `package.json`.
5. Add a CI step or pre-commit hook that verifies generated types are up-to-date.

**Acceptance:**
- `supabase.from('items').select('nonexistent_column')` causes a TypeScript error.
- All existing `.select()` calls compile cleanly with the generated types.

---

## R-004 · P1 · CI pnpm version mismatch

**What's wrong:**
`package.json` declares `"packageManager": "pnpm@10.33.0"`, but `.github/workflows/ci.yml` installs pnpm **version 9** via `pnpm/action-setup@v3`. This can cause lockfile format mismatches, phantom dependency resolution differences, and non-reproducible builds.

**File:** `.github/workflows/ci.yml` line 21-22

**Actionable steps:**
1. Update CI to `version: 10` (or better: remove the `version` key and let `pnpm/action-setup` read `packageManager` from `package.json` automatically — supported in `@v4`).
2. Upgrade the action to `pnpm/action-setup@v4` which auto-detects the version.
3. Verify `pnpm install --frozen-lockfile` passes in CI after the change.

**Acceptance:**
- CI pnpm version matches `packageManager` field exactly.
- `pnpm install --frozen-lockfile` succeeds without lockfile warnings.

---

## R-005 · P1 · Login page: variable shadowing + client re-creation

**What's wrong:**
In `apps/web/app/(auth)/login/page.tsx`:

1. **Variable shadowing** (line 19): `const { error } = await supabase.auth.signInWithOtp(...)` shadows the `error` state setter from line 12's `const [error, setError] = useState('')`. This works because the destructured `error` is block-scoped inside `handleSubmit`, but it's confusing and a lint trap.

2. **Client re-creation**: `createClient()` is called on every form submit, creating a new GoTrue client instance each time. This is wasteful and can cause stale-session issues if multiple submits happen.

**Actionable steps:**
1. Rename the destructured Supabase error: `const { error: signInError } = await supabase.auth.signInWithOtp(...)`.
2. Move `createClient()` outside `handleSubmit` — either to module scope or wrap in `useMemo`.

**Acceptance:**
- No variable shadowing.
- `createClient()` is called once per component mount, not per submission.

---

## R-006 · P1 · Auth callback ignores `next` redirect parameter

**What's wrong:**
`app/auth/callback/route.ts` always redirects to `/dashboard` after a successful code exchange. If a user was deep-linked to `/dashboard/settings` (or any future route) and got bounced to login, they lose their intended destination.

**File:** `apps/web/app/auth/callback/route.ts`

**Actionable steps:**
1. When the middleware redirects to `/login`, include the original path as a `?next=` query param.
2. Pass `next` through the magic link's `emailRedirectTo` URL.
3. In the callback route, read `next` from `searchParams` and redirect there (with a whitelist or same-origin check to prevent open redirect).

**Acceptance:**
- User visiting `/dashboard/settings` while logged out → login → magic link → lands on `/dashboard/settings`, not `/dashboard`.
- Arbitrary external URLs in `?next=` are rejected.

---

## R-007 · P1 · Missing `error.tsx` and `not-found.tsx` boundaries

**What's wrong:**
No `error.tsx` or `not-found.tsx` exists anywhere in the app directory. Unhandled errors show Next.js's default error page (ugly in production). 404s show the generic Next.js page. This is a bad user experience and leaks framework details.

**Actionable steps:**
1. Add `apps/web/app/error.tsx` (client component) with a user-friendly "Something went wrong" UI and a retry button.
2. Add `apps/web/app/not-found.tsx` with a "Page not found" UI and a link back to `/dashboard`.
3. Add `apps/web/app/(dashboard)/error.tsx` for dashboard-specific error recovery.

**Acceptance:**
- Navigating to `/nonexistent` shows a branded 404 page.
- A thrown error in a dashboard server component shows a recovery UI, not a white screen.

---

## R-008 · P1 · Missing `loading.tsx` Suspense boundaries

**What's wrong:**
The dashboard page makes a Supabase query (`select count`), and the dashboard layout makes a `getUser()` call. Neither has a `loading.tsx` sibling. On slow connections, users see a blank white screen until the server component resolves.

**Actionable steps:**
1. Add `apps/web/app/(dashboard)/loading.tsx` with a skeleton/spinner.
2. Consider adding `apps/web/app/(auth)/login/loading.tsx` for consistency.

**Acceptance:**
- Throttling the network in DevTools shows a loading skeleton instead of a blank page.

---

## R-009 · P1 · No security headers configured

**What's wrong:**
`next.config.mjs` is empty. No Content Security Policy, no `X-Frame-Options`, no `Strict-Transport-Security`, no `X-Content-Type-Options`. The app is vulnerable to:
- Clickjacking (can be iframed by malicious sites).
- MIME sniffing attacks.
- Missing HSTS on production.

**Actionable steps:**
1. Add a `headers()` function in `next.config.mjs` returning at minimum:
   - `X-Frame-Options: DENY`
   - `X-Content-Type-Options: nosniff`
   - `Referrer-Policy: strict-origin-when-cross-origin`
   - `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload` (production only)
2. Plan CSP header for Sprint 2 when external scripts (Stripe, Sentry) are known.

**Acceptance:**
- `curl -I` against the deployed app shows all four headers.

---

## R-010 · P2 · Database: missing `updated_at` columns and triggers

**What's wrong:**
`users` and `items` tables have `created_at` but no `updated_at`. When a user's tier changes or an item's status transitions, there's no record of *when* the last mutation happened. This will be needed for:
- "Last modified" display in the UI.
- Cache invalidation.
- Debugging data issues.

**File:** `supabase/migrations/20240001000000_initial_schema.sql`

**Actionable steps:**
1. New migration: add `updated_at timestamptz NOT NULL DEFAULT now()` to `users` and `items`.
2. Create a reusable trigger function `set_updated_at()` that sets `NEW.updated_at = now()`.
3. Attach `BEFORE UPDATE` triggers to both tables.

**Acceptance:**
- Updating an item's `status` automatically bumps `updated_at`.
- Existing rows get `updated_at = created_at` via migration default.

---

## R-011 · P2 · Database: `block_list` missing unique constraint

**What's wrong:**
`block_list` has no unique index on `(type, value)`. The same email or IP can be inserted multiple times, leading to duplicate entries and confusing admin UIs.

**Actionable steps:**
1. New migration: `CREATE UNIQUE INDEX idx_block_list_type_value ON public.block_list(type, lower(value))`.

**Acceptance:**
- Attempting to insert a duplicate `(email, test@example.com)` returns a unique violation.

---

## R-012 · P2 · Database: `usage_log` missing composite index

**What's wrong:**
`usage_log` will be queried by `(user_id, month)` to check free-tier caps (Sprint 3). There's no index, so these queries will be sequential scans as the table grows.

**Actionable steps:**
1. New migration: `CREATE INDEX idx_usage_log_user_month ON public.usage_log(user_id, month)`.
2. Consider adding a CHECK constraint on `month` to enforce `YYYY-MM` format: `CHECK (month ~ '^\d{4}-(0[1-9]|1[0-2])$')`.

**Acceptance:**
- `EXPLAIN` on `SELECT count(*) FROM usage_log WHERE user_id = $1 AND month = $2` shows an index scan, not a seq scan.

---

## R-013 · P2 · Database: `block_list.type` uses CHECK instead of ENUM

**What's wrong:**
Every other constrained column in the schema uses a proper Postgres ENUM (`user_tier`, `item_type`, `item_status`), but `block_list.type` uses `CHECK (type IN ('email', 'ip'))`. This is inconsistent and provides weaker tooling support (no autocomplete in Supabase Studio, no generated TypeScript union).

**Actionable steps:**
1. New migration: create `CREATE TYPE public.block_type AS ENUM ('email', 'ip')` and alter the column.

**Acceptance:**
- `block_list.type` column uses the `block_type` ENUM.
- Generated Supabase types reflect the union.

---

## R-014 · P2 · Database: no partial index for soft-deleted items

**What's wrong:**
Items use soft-delete via `deleted_at`. The existing index `idx_items_user_id_created_at` covers `(user_id, created_at DESC)` but doesn't filter out deleted items. Every query that fetches "active items" (the vast majority) will have to scan and discard soft-deleted rows.

**Actionable steps:**
1. New migration: `CREATE INDEX idx_items_active ON public.items(user_id, created_at DESC) WHERE deleted_at IS NULL`.
2. Optionally drop the original index if all queries filter by `deleted_at IS NULL` (evaluate in Sprint 4 when queries are finalized).

**Acceptance:**
- `EXPLAIN` on the standard item listing query shows usage of the partial index.

---

## R-015 · P2 · `OnboardingPanel`: nested interactive elements

**What's wrong:**
In `onboarding-panel.tsx` lines 73-78, an `<a href="mailto:...">` wraps a `<Button>`. This nests a `<button>` inside an `<a>`, which is invalid HTML per the spec and causes unpredictable behavior across browsers and screen readers.

**Actionable steps:**
1. Use the `Button` component's `asChild` prop with a child `<a>` tag, so the button renders *as* the link:
   ```tsx
   <Button variant="default" className="gap-2" asChild>
     <a href={`mailto:${DROP_ADDRESS}?subject=Test`}>
       <Mail size={14} />
       Send yourself a test email
     </a>
   </Button>
   ```

**Acceptance:**
- DOM inspection shows a single `<a>` element, not `<a><button>`.
- The `mailto:` link still works.

---

## R-016 · P2 · Sidebar: no active-route highlighting

**What's wrong:**
`sidebar.tsx` renders nav links with identical styling regardless of the current route. The user has no visual indicator of where they are. This is a basic navigation UX expectation.

**Actionable steps:**
1. Import `usePathname` from `next/navigation`.
2. Compare `pathname` against each link's `href`.
3. Apply active styles (e.g., `bg-accent text-accent-foreground font-medium`) to the matching link.

**Acceptance:**
- On `/dashboard`, the "All Items" link is visually highlighted.
- On `/dashboard/settings`, the "Settings" link is highlighted.

---

## R-017 · P2 · Middleware calls `getUser()` on every request including public pages

**What's wrong:**
The Supabase middleware calls `supabase.auth.getUser()` on every matched route — including `/login`, `/auth/callback`, and the root `/`. This makes a round-trip to the Supabase auth server on every page load, even for pages that don't need auth. This adds latency to every navigation.

**File:** `apps/web/lib/supabase/middleware.ts`

**Actionable steps:**
1. Add an early return for public paths before the `getUser()` call:
   ```ts
   const publicPaths = ['/login', '/auth/callback']
   if (publicPaths.some(p => request.nextUrl.pathname.startsWith(p))) {
     return supabaseResponse
   }
   ```
2. Only call `getUser()` for paths that actually need auth verification.

**Acceptance:**
- Loading `/login` no longer makes a `getUser()` network call (verify in Network tab).
- Protected routes still redirect correctly.

---

## R-018 · P2 · Root page double-redirect for unauthenticated users

**What's wrong:**
`app/page.tsx` does an unconditional `redirect('/dashboard')`. For an unauthenticated user, the flow is:
1. `GET /` → server redirect to `/dashboard`
2. Middleware on `/dashboard` → redirect to `/login`

That's two redirects (two round-trips) instead of one.

**Actionable steps:**
1. Either check auth status in `app/page.tsx` and redirect to `/login` or `/dashboard` accordingly, or
2. Simpler: redirect to `/login` by default and let the login page redirect authenticated users to `/dashboard`.

**Acceptance:**
- Unauthenticated visit to `/` results in a single redirect, not two.

---

## R-019 · P2 · No font-family configured

**What's wrong:**
The root layout's `<body>` has no font set. The app relies on browser defaults, which differ across OS/browser combinations (serif on some, sans-serif on others). Most modern web apps use Inter or system font stacks.

**Actionable steps:**
1. Import `next/font/google` or `next/font/local` in `app/layout.tsx`.
2. Apply the font className to `<body>`.
3. Add `font-sans` to the Tailwind config's `fontFamily.sans` for consistency.

**Acceptance:**
- The app renders with a consistent sans-serif font across Chrome, Firefox, Safari.

---

## R-020 · P2 · Missing `autoprefixer` in PostCSS config

**What's wrong:**
`postcss.config.mjs` only includes `tailwindcss`. The standard Tailwind installation guide recommends `autoprefixer` to add vendor prefixes for cross-browser support. Without it, some CSS properties may not work in older browsers.

**File:** `apps/web/postcss.config.mjs`

**Actionable steps:**
1. `pnpm --filter @drop-note/web add -D autoprefixer`
2. Add `autoprefixer: {}` to the PostCSS plugins.

**Acceptance:**
- `postcss.config.mjs` includes both `tailwindcss` and `autoprefixer`.

---

## R-021 · P2 · `DropToken` type alias provides zero type safety

**What's wrong:**
`packages/shared/src/auth.ts` exports `export type DropToken = string`. This is just an alias — `string` is freely assignable to `DropToken` and vice versa. It provides no compile-time protection against accidentally passing a random string where a validated token is expected.

**Actionable steps:**
1. Use a branded/opaque type pattern:
   ```ts
   declare const __brand: unique symbol
   type Brand<T, B> = T & { [__brand]: B }
   export type DropToken = Brand<string, 'DropToken'>
   ```
2. Expose a factory: `function toDropToken(s: string): DropToken` that validates first.
3. Update `isValidDropToken` to be a type guard: `function isValidDropToken(s: string): s is DropToken`.

**Acceptance:**
- `const t: DropToken = "random-string"` produces a type error.
- `if (isValidDropToken(s)) { /* s is DropToken here */ }` compiles.

---

## R-022 · P2 · `isValidEmail` regex is too permissive

**What's wrong:**
The regex `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` matches inputs like `a@b.c`, `@@@.@`, and `user@host.` (with trailing dot). While email validation is famously hard, this regex is below the minimum bar for a production system that relies on email as the primary identity.

**File:** `packages/shared/src/auth.ts`

**Actionable steps:**
1. At minimum, enforce: (a) local part is 1-64 chars, (b) domain has at least two labels, (c) TLD is 2+ alpha chars.
2. Recommended regex: `/^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/`.
3. Add test cases for edge cases: trailing dots, double `@@`, very long local parts.

**Acceptance:**
- `isValidEmail('a@b.c')` returns `false`.
- `isValidEmail('user@example.com')` returns `true`.
- New edge-case tests pass.

---

## R-023 · P3 · Duplicate `@layer base` blocks in `globals.css`

**What's wrong:**
`globals.css` has two separate `@layer base {}` blocks (lines 5-50 and lines 52-59). While CSS handles this fine, it's unnecessarily split.

**Actionable steps:**
1. Merge both blocks into one `@layer base {}`.

**Acceptance:**
- Single `@layer base {}` block in `globals.css`.
- No visual changes.

---

## R-024 · P3 · Worker package is an empty shell with no turbo pipeline compat

**What's wrong:**
`apps/worker/package.json` has no `scripts` at all. When Turborepo runs `turbo lint` or `turbo typecheck`, it looks for those scripts in every workspace package. An empty scripts object means turbo silently skips it, but this will become a problem when Sprint 2 adds real code and someone forgets to add the scripts.

**Actionable steps:**
1. Add placeholder scripts:
   ```json
   "scripts": {
     "lint": "echo 'no lint configured'",
     "typecheck": "echo 'no typecheck configured'",
     "build": "echo 'no build configured'"
   }
   ```
2. Or better: add real tooling (ESLint + TypeScript config) since Sprint 2 is next.

**Acceptance:**
- `pnpm turbo lint` and `pnpm turbo typecheck` complete without warnings about missing scripts in worker.

---

## R-025 · P3 · No `lint` script in `packages/shared`

**What's wrong:**
`packages/shared/package.json` has `test` and `typecheck` but no `lint` script. Turbo's `lint` pipeline won't run any linting for the shared package.

**Actionable steps:**
1. Add `"lint": "eslint src/"` to `packages/shared/package.json`.
2. Ensure the root `.eslintrc.js` config applies properly to the shared package, or add a local `.eslintrc.js`.

**Acceptance:**
- `pnpm turbo lint` includes `@drop-note/shared` in its execution.

---

## R-026 · P3 · Login page missing page-level metadata

**What's wrong:**
`app/(auth)/login/page.tsx` doesn't export a `metadata` object. The browser tab shows the global "drop-note" title, with no indication the user is on the login page.

**Actionable steps:**
1. Since the page is a client component (`'use client'`), metadata export won't work directly. Either:
   - Extract the form into a client component and make the page a server component that exports metadata, or
   - Add a `<title>` via `next/head` or the `metadata` API from a parent layout.

**Acceptance:**
- Browser tab reads "Sign in — drop-note" on the login page.

---

## R-027 · P3 · Hardcoded `DROP_ADDRESS` in the onboarding panel

**What's wrong:**
`onboarding-panel.tsx` hardcodes `const DROP_ADDRESS = 'drop@dropnote.com'`. When the app moves to per-user token routing (`drop+[token]@dropnote.com` in v2), or if the domain changes, this needs updating in component code. Config values belong in a central place.

**Actionable steps:**
1. Move `DROP_ADDRESS` to an environment variable (`NEXT_PUBLIC_DROP_ADDRESS`) or a shared config module.
2. Import it in the component.

**Acceptance:**
- Changing the drop address requires modifying one place, not grep-ing components.

---

## R-028 · P3 · Missing `robots.txt` and `sitemap.xml`

**What's wrong:**
No `robots.txt` or `sitemap.xml`. While the app is mostly behind auth, the login page and any future marketing pages should be indexable (or explicitly blocked).

**Actionable steps:**
1. Add `apps/web/app/robots.ts` using Next.js 14's metadata API.
2. Add `apps/web/app/sitemap.ts` with at minimum the login page.

**Acceptance:**
- `/robots.txt` returns valid robots content.
- `/sitemap.xml` returns valid sitemap XML.

---

## R-029 · P3 · No accessibility skip-to-content link

**What's wrong:**
The dashboard layout has a sidebar and main content area but no skip-to-content link. Keyboard users have to tab through the entire sidebar to reach content.

**Actionable steps:**
1. Add a visually-hidden skip link as the first child of `<body>` or the dashboard layout:
   ```tsx
   <a href="#main" className="sr-only focus:not-sr-only focus:absolute ...">
     Skip to content
   </a>
   ```
2. Add `id="main"` to the `<main>` element.

**Acceptance:**
- Pressing Tab on page load reveals a "Skip to content" link.
- Activating it moves focus to the main content area.

---

## R-030 · P3 · `handleSignOut` in sidebar doesn't handle errors

**What's wrong:**
`sidebar.tsx` calls `await supabase.auth.signOut()` without checking for errors. If the sign-out fails (network error, expired session), the user is silently redirected to `/login` while potentially still having a stale session cookie.

**Actionable steps:**
1. Check the error return from `signOut()`.
2. On failure, show a toast/alert rather than silently redirecting.
3. On success, call `router.refresh()` before `router.push('/login')` to clear the server component cache.

**Acceptance:**
- Network-error during sign-out shows a user-visible error message.
- Successful sign-out fully clears the cached session.

---

## Summary by Priority

| Priority | Count | Tickets |
|----------|-------|---------|
| P0 — Critical | 3 | R-001, R-002, R-003 |
| P1 — High | 5 | R-004, R-005, R-006, R-007, R-008 |
| P2 — Medium | 12 | R-009 – R-020, R-021, R-022 |
| P3 — Low | 8 | R-023 – R-030 |
| **Total** | **30** | |

### Recommended execution order

1. **Immediate** (before S2 starts): R-001, R-002, R-003, R-004, R-005
2. **This week**: R-006 through R-014 (database hardening + security headers)
3. **Sprint 2 alongside feature work**: R-015 through R-022
4. **Backlog / as-convenient**: R-023 through R-030
