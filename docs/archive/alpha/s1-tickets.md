# Sprint 1 — Engineering Tickets

> Sprint goal: Monorepo, database schema, auth, CI pipeline, and initial Vercel deployment.
> Deliverable: Magic link login works. User sees the shared drop address (`drop@dropnote.com`) on dashboard after sign-in. CI green on every PR.
> Total: 25 points across 13 tickets.

---

### S101 — Initialize pnpm monorepo with Turborepo
**Type:** setup
**Points:** 2
**Depends on:** none

**Goal:** Establish the monorepo skeleton that every subsequent ticket builds inside. Without this, no other workspace package can be created.

**Scope:**
- Initialize `package.json` at repo root with `"name": "drop-note"`, `"private": true`, pnpm workspaces config pointing to `apps/*` and `packages/*`
- Install Turborepo: `pnpm add -D turbo` at root
- Create `turbo.json` with pipeline tasks: `build`, `lint`, `typecheck`, `test` — each with appropriate `dependsOn` and `outputs`
- Create workspace directories: `apps/web/`, `apps/worker/`, `packages/shared/`
- Add a `package.json` stub (name + version only) in each of `apps/worker/` and `packages/shared/`
- Root `tsconfig.base.json`: `strict: true`, `target: ES2022`, `moduleResolution: bundler`, `paths` alias `@drop-note/shared` → `packages/shared/src`
- Root `.eslintrc.js`: extend `eslint:recommended` + `@typescript-eslint/recommended`; parser `@typescript-eslint/parser`
- Root `.prettierrc`: `{ "semi": false, "singleQuote": true, "printWidth": 100 }`
- Root `.gitignore`: `node_modules`, `.turbo`, `dist`, `.env`, `.env.local`, `coverage`
- Root `.nvmrc` or `engines` field pinning Node 20
- `pnpm-workspace.yaml` listing `apps/*` and `packages/*`

**Acceptance criteria:**
1. Running `pnpm install` from the repo root completes without errors and produces a `pnpm-lock.yaml`.
2. Running `ls apps/` prints `web  worker` and `ls packages/` prints `shared`.
3. `cat turbo.json` contains a `pipeline` (or `tasks`) key with entries for `build`, `lint`, `typecheck`, and `test`.
4. `cat tsconfig.base.json` contains `"strict": true`.
5. Running `pnpm exec prettier --check .` (after adding a trivially formatted file) exits 0.

**Out of scope:**
- Installing Next.js or any app-level dependencies (S103)
- CI workflow files (S102)
- Any source code beyond config and stub `package.json` files

---

### S102 — GitHub Actions CI: lint, typecheck, and unit tests on every PR
**Type:** setup
**Points:** 2
**Depends on:** S101

**Goal:** Enforce code quality automatically on every pull request so regressions are caught before merge.

**Scope:**
- Create `.github/workflows/ci.yml`
- Trigger on: `pull_request` (all branches) and `push` to `main`
- Single job `ci` running on `ubuntu-latest`
- Steps in order:
  1. `actions/checkout@v4`
  2. `pnpm/action-setup@v3` (version: 9)
  3. `actions/setup-node@v4` with `node-version: 20` and `cache: 'pnpm'`
  4. `pnpm install --frozen-lockfile`
  5. `pnpm turbo lint` — fail fast on lint errors
  6. `pnpm turbo typecheck` — fail fast on type errors
  7. `pnpm turbo test` — run Vitest across all packages
- Cache pnpm store using `actions/cache@v4` keyed on `pnpm-lock.yaml` hash (or rely on `pnpm/action-setup` built-in cache)
- Set `fail-fast: true` on the matrix (no matrix needed yet, but noted for future)
- Add a `concurrency` key to cancel in-progress runs on the same branch: `group: ci-${{ github.ref }}`, `cancel-in-progress: true`

**Acceptance criteria:**
1. Opening a pull request against `main` triggers the `ci` workflow automatically (visible in the GitHub Actions tab).
2. A PR with a deliberately introduced TypeScript error (e.g., `const x: number = "oops"`) causes the `typecheck` step to fail and the CI check to report failure.
3. A PR with a clean codebase causes all three steps (`lint`, `typecheck`, `test`) to pass and the overall check to report success.
4. `cat .github/workflows/ci.yml` contains `pnpm install --frozen-lockfile`.
5. The workflow file contains a `concurrency` key with `cancel-in-progress: true`.

**Out of scope:**
- Playwright E2E in CI (S109)
- Coverage gates (Sprint 4)
- Deployment steps (S110)
- Any secrets or environment variables beyond the default `GITHUB_TOKEN`

---

### S103 — Scaffold Next.js 14 app in apps/web
**Type:** setup
**Points:** 2
**Depends on:** S101

**Goal:** Create the `apps/web` Next.js application with all UI dependencies wired so feature tickets can build pages immediately.

**Scope:**
- Run `pnpm create next-app@14 apps/web --typescript --tailwind --eslint --app --no-src-dir --import-alias "@/*"` (or equivalent manual scaffold)
- `apps/web/package.json`: name `@drop-note/web`; add dependency `@drop-note/shared: "workspace:*"`
- Install shadcn/ui: `pnpm dlx shadcn-ui@latest init` inside `apps/web` — choose default style `New York`, base color `Slate`, CSS variables enabled
- Install `next-themes`: `pnpm add next-themes` inside `apps/web`
- Create `apps/web/app/layout.tsx`:
  - Wrap children in `<ThemeProvider attribute="class" defaultTheme="system" enableSystem>` from `next-themes`
  - Include `<html lang="en" suppressHydrationWarning>`
- Create `apps/web/app/globals.css` with Tailwind directives (`@tailwind base/components/utilities`) and shadcn CSS variable block
- `apps/web/next.config.ts`: minimal config, no extra flags needed yet
- `apps/web/tsconfig.json`: extend root `tsconfig.base.json` (`"extends": "../../tsconfig.base.json"`), add Next.js plugin path
- Add `typecheck` script to `apps/web/package.json`: `"typecheck": "tsc --noEmit"`
- Add `lint` script: `"lint": "next lint"`
- Verify shadcn can add a component: `pnpm dlx shadcn-ui@latest add button` — confirm `apps/web/components/ui/button.tsx` exists

**Acceptance criteria:**
1. `pnpm --filter @drop-note/web dev` starts the Next.js dev server on `localhost:3000` without errors.
2. `GET http://localhost:3000` returns HTTP 200 and the default Next.js page HTML.
3. `apps/web/components/ui/button.tsx` exists (confirms shadcn init succeeded).
4. `apps/web/app/layout.tsx` contains `ThemeProvider` from `next-themes`.
5. `pnpm --filter @drop-note/web typecheck` exits 0.

**Out of scope:**
- Auth pages or dashboard routes (S106, S108)
- Any real page content beyond the scaffold default
- Supabase client setup (S106)
- Dark/light theme toggle UI component (S108)

---

### S104 — Supabase project setup and initial schema migration
**Type:** setup
**Points:** 3
**Depends on:** S101

**Goal:** Create all database tables with the correct columns, types, constraints, and indexes so every subsequent sprint can write to the schema without migrations blocking them.

**Scope:**
- Create a Supabase project via the Supabase dashboard (or CLI `supabase projects create`). Record project ref and region.
- Initialize Supabase CLI in repo root: `supabase init` — creates `supabase/` directory
- Create migration file `supabase/migrations/20240001000000_initial_schema.sql` containing exactly:

  **`users` table** (public schema, extends `auth.users`):
  ```sql
  CREATE TYPE public.user_tier AS ENUM ('free', 'pro', 'power');

  CREATE TABLE public.users (
    id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email text NOT NULL,
    tier public.user_tier NOT NULL DEFAULT 'free',
    drop_token uuid UNIQUE,
    stripe_customer_id text,
    is_admin boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now()
  );
  ```

  **`items` table**:
  ```sql
  CREATE TYPE public.item_type AS ENUM ('email_body', 'attachment');
  CREATE TYPE public.item_status AS ENUM ('pending', 'processing', 'done', 'failed');

  CREATE TABLE public.items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    type public.item_type NOT NULL,
    subject text,
    sender_email text NOT NULL,
    filename text,
    storage_path text,
    ai_summary text,
    status public.item_status NOT NULL DEFAULT 'pending',
    error_message text,
    pinned boolean NOT NULL DEFAULT false,
    deleted_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX idx_items_user_id_created_at ON public.items(user_id, created_at DESC);
  ```

  **`tags` table**:
  ```sql
  CREATE TABLE public.tags (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    name text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(user_id, lower(name))
  );
  ```

  **`item_tags` table**:
  ```sql
  CREATE TABLE public.item_tags (
    item_id uuid NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
    tag_id uuid NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
    PRIMARY KEY (item_id, tag_id)
  );
  ```

  **`site_settings` table**:
  ```sql
  CREATE TABLE public.site_settings (
    key text PRIMARY KEY,
    value text NOT NULL
  );
  INSERT INTO public.site_settings (key, value) VALUES
    ('registration_mode', 'open'),
    ('open_slots', '50');
  ```

  **`block_list` table**:
  ```sql
  CREATE TABLE public.block_list (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    type text NOT NULL CHECK (type IN ('email', 'ip')),
    value text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  );
  ```

  **`invite_codes` table**:
  ```sql
  CREATE TABLE public.invite_codes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code text UNIQUE NOT NULL,
    created_by uuid NOT NULL REFERENCES public.users(id),
    used_by uuid REFERENCES public.users(id),
    used_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
  );
  ```

  **`usage_log` table**:
  ```sql
  CREATE TABLE public.usage_log (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    action_type text NOT NULL,
    month text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  );
  ```

- Apply migration to the Supabase project: `supabase db push` (or `supabase migration up` against the linked project)
- Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` to `apps/web/.env.local` (values from Supabase project settings)
- Add `SUPABASE_SERVICE_ROLE_KEY` to `apps/web/.env.local` (for server-side admin operations)
- Document all three env var names in a root `.env.example` file (values as placeholders)

**Acceptance criteria:**
1. `supabase db push` completes without errors against the linked Supabase project.
2. In the Supabase SQL editor, `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name` returns all 8 tables: `block_list`, `invite_codes`, `item_tags`, `items`, `site_settings`, `tags`, `usage_log`, `users`.
3. `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'users'` includes `drop_token` (uuid), `tier` (user_tier enum), `is_admin` (boolean), `stripe_customer_id` (text).
4. `SELECT column_name FROM information_schema.columns WHERE table_name = 'items'` includes `status`, `error_message`, `deleted_at`, `pinned`.
5. `SELECT * FROM public.site_settings` returns exactly two rows: `registration_mode = 'open'` and `open_slots = '50'`.
6. `supabase/migrations/20240001000000_initial_schema.sql` exists in the repo and is committed.
7. `.env.example` exists at repo root and contains `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` as placeholder keys.

**Out of scope:**
- RLS policies (S105)
- The `drop_token` trigger (S107)
- Supabase Auth configuration (S106)
- Supabase Storage bucket creation (Sprint 2)
- Any indexes beyond those explicitly listed above

---

### S105 — RLS policies for items, tags, and item_tags
**Type:** setup
**Points:** 3
**Depends on:** S104

**Goal:** Ensure each user can only read and write their own data, enforced at the database layer using Postgres RLS so no application-level bug can leak another user's items.

**Scope:**
- Create migration file `supabase/migrations/20240001000001_rls_policies.sql`
- Enable RLS on tables: `users`, `items`, `tags`, `item_tags`
- **`users` table policies:**
  - `SELECT`: `auth.uid() = id` (users read only their own row)
  - `INSERT`: disallowed via RLS (rows are created by the trigger in S107 and service role)
  - `UPDATE`: `auth.uid() = id` (users update only their own row; fields like `is_admin` protected by not exposing them via API)
- **`items` table policies:**
  - `SELECT`: `auth.uid() = user_id`
  - `INSERT`: `auth.uid() = user_id`
  - `UPDATE`: `auth.uid() = user_id`
  - `DELETE`: `auth.uid() = user_id`
- **`tags` table policies:**
  - `SELECT`: `auth.uid() = user_id`
  - `INSERT`: `auth.uid() = user_id`
  - `UPDATE`: `auth.uid() = user_id`
  - `DELETE`: `auth.uid() = user_id`
- **`item_tags` table policies:**
  - `SELECT`: join check — `EXISTS (SELECT 1 FROM public.items WHERE items.id = item_tags.item_id AND items.user_id = auth.uid())`
  - `INSERT`: same join check as SELECT
  - `DELETE`: same join check as SELECT
- **`site_settings` table policies:**
  - `SELECT`: allow all authenticated users (`auth.uid() IS NOT NULL`)
  - No INSERT/UPDATE/DELETE for regular users
- Apply migration: `supabase db push`

**Acceptance criteria:**
1. `supabase db push` completes without errors.
2. In the Supabase dashboard, the Tables view shows RLS as "enabled" for `items`, `tags`, `item_tags`, and `users`.
3. Using the Supabase SQL editor with `SET LOCAL role = anon`, a `SELECT * FROM public.items` returns 0 rows (not an error, just 0 — no data leaks to anonymous callers).
4. Using the Supabase SQL editor while authenticated as a test user (via `SET LOCAL "request.jwt.claims" = '{"sub":"<user_a_uuid>"}'`), a `SELECT` on `items` returns only rows where `user_id` matches that UUID.
5. An attempt to `INSERT INTO public.users (id, email) VALUES (gen_random_uuid(), 'x@x.com')` as an authenticated non-owner JWT returns a permission-denied error (RLS blocks it).
6. `supabase/migrations/20240001000001_rls_policies.sql` exists in the repo and is committed.

**Out of scope:**
- Admin bypass policies (Sprint 5)
- Service role bypass (already implicit — service role bypasses RLS by design)
- RLS on `block_list`, `invite_codes`, `usage_log` (Sprint 5)
- Any application-layer auth guards (S106, S108)

---

### S106 — Supabase Auth magic link flow
**Type:** feat
**Points:** 3
**Depends on:** S103, S104, S105

**Goal:** Allow users to sign in via a magic link email, establishing the authenticated session that the dashboard and all API routes depend on.

**Scope:**
- Install Supabase JS client in `apps/web`: `pnpm add @supabase/supabase-js @supabase/ssr`
- Create `apps/web/lib/supabase/client.ts`: exports `createBrowserClient` using `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Create `apps/web/lib/supabase/server.ts`: exports `createServerClient` using cookies from `next/headers` (for Server Components and Route Handlers)
- Create `apps/web/lib/supabase/middleware.ts`: session refresh logic to call in Next.js middleware
- Create `apps/web/middleware.ts`: call session refresh on all routes; redirect unauthenticated users away from `/dashboard` to `/login`
- Create sign-in page at `apps/web/app/(auth)/login/page.tsx`:
  - Single email input + "Send magic link" button
  - On submit: call `supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: '<origin>/auth/callback' } })`
  - Show success state: "Check your email" message after submission
  - Use shadcn `Input` and `Button` components
- Create auth callback route at `apps/web/app/auth/callback/route.ts`:
  - Extract `code` from search params
  - Call `supabase.auth.exchangeCodeForSession(code)`
  - Redirect to `/dashboard` on success, `/login?error=auth` on failure
- Configure Supabase Auth in the project dashboard:
  - Enable "Email" provider with "Magic Link" (disable password sign-in)
  - Set JWT expiry to 30 days (`2592000` seconds)
  - Set session inactivity timeout to 90 days (`7776000` seconds)
  - Set site URL to `http://localhost:3000` for development
  - Add `http://localhost:3000/auth/callback` to allowed redirect URLs
- Customize the Supabase magic link email template (in Supabase dashboard → Auth → Email Templates → Magic Link):
  - Subject: `Sign in to drop-note`
  - Body: plain HTML with the `{{ .ConfirmationURL }}` link and "Sign in" CTA button
- Add env vars `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` to `.env.example` if not already present

**Acceptance criteria:**
1. Navigating to `http://localhost:3000/login` renders the sign-in form without a JavaScript console error.
2. Submitting the form with a valid email causes the Supabase auth flow to dispatch an email (visible in Supabase → Auth → Logs).
3. Clicking the magic link in the email redirects the browser to `http://localhost:3000/auth/callback`, which then redirects to `/dashboard`.
4. After sign-in, `supabase.auth.getUser()` in the browser console returns a user object with the signed-in email.
5. Navigating to `http://localhost:3000/dashboard` while unauthenticated redirects to `/login` (verified by loading the URL in an incognito tab with no session).
6. The Supabase Auth dashboard shows the signed-in user in the "Users" table.

**Out of scope:**
- Password or OAuth login
- The `/dashboard` page content (S108)
- Welcome email via Resend (Sprint 2)
- Account deletion flow (Sprint 5)

---

### S107 — Post-signup Postgres trigger for drop_token
**Type:** feat
**Points:** 2
**Depends on:** S104

**Goal:** Automatically generate a unique `drop_token` UUID and create the public `users` row when a new Supabase auth user is created, so no application code needs to manage this manually.

**Scope:**
- Create migration file `supabase/migrations/20240001000002_signup_trigger.sql`
- Create Postgres function `public.handle_new_user()` in the migration:
  ```sql
  CREATE OR REPLACE FUNCTION public.handle_new_user()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
  BEGIN
    INSERT INTO public.users (id, email, drop_token)
    VALUES (
      NEW.id,
      NEW.email,
      gen_random_uuid()
    );
    RETURN NEW;
  END;
  $$;
  ```
- Create trigger on `auth.users`:
  ```sql
  CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
  ```
- Apply migration: `supabase db push`
- Export the function signature from `packages/shared/src/auth.ts` as a TypeScript type (for documentation purposes): `export type DropToken = string` (UUID format)

**Acceptance criteria:**
1. `supabase db push` completes without errors.
2. After a new user signs up via magic link (using the flow from S106), a row appears in `public.users` with a non-null `drop_token` UUID — confirmed via `SELECT id, email, drop_token FROM public.users WHERE email = '<test_email>'` in the Supabase SQL editor.
3. The `drop_token` value is a valid UUID v4 format (matches regex `^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`).
4. `drop_token` is unique: attempting `INSERT INTO public.users (id, email, drop_token) VALUES (gen_random_uuid(), 'x@test.com', '<existing_drop_token>')` returns a unique constraint violation.
5. `supabase/migrations/20240001000002_signup_trigger.sql` exists in the repo.

**Out of scope:**
- Using `drop_token` for email routing (v2 feature)
- Exposing `drop_token` in any API endpoint (Sprint 2 will use the shared `drop@dropnote.com` address)
- Regenerating `drop_token` on demand

---

### S108 — Dashboard shell with auth layout, sidebar, and onboarding panel
**Type:** feat
**Points:** 3
**Depends on:** S106, S107

**Goal:** Provide the authenticated shell — layout, sidebar navigation, and the empty-state onboarding panel showing the shared drop address — that proves the full sign-in-to-dashboard flow works end-to-end.

**Scope:**
- Create `apps/web/app/(dashboard)/layout.tsx`:
  - Server Component that calls `createServerClient` and checks session; redirect to `/login` if no session
  - Renders `<Sidebar>` + `{children}` in a flex layout
  - Wraps content area appropriately for future page additions
- Create `apps/web/components/layout/sidebar.tsx`:
  - Logo/wordmark at top: "drop-note"
  - Nav links: "All Items" (href `/dashboard`), "Settings" (href `/dashboard/settings`) — use shadcn-compatible link styles
  - User email displayed at bottom
  - Sign out button: calls `supabase.auth.signOut()` then redirects to `/login`
  - Use `next/link` for navigation links
- Create `apps/web/app/(dashboard)/dashboard/page.tsx` (the main dashboard page):
  - Server Component; fetches `user` via `createServerClient`
  - If user has 0 items (always true in Sprint 1): render `<OnboardingPanel>`
- Create `apps/web/components/dashboard/onboarding-panel.tsx`:
  - Full-width empty-state panel
  - Displays the shared drop address in a large, styled read-only input: value hardcoded to `drop@dropnote.com`
  - Copy button: client component using `navigator.clipboard.writeText('drop@dropnote.com')` — shows "Copied!" feedback for 2 seconds (shadcn `Button` + `useState`)
  - "Send yourself a test email" CTA: `<a href="mailto:drop@dropnote.com?subject=Test">` — opens the user's mail client
  - Three-step visual: plain text list "1. Email it → 2. AI tags it → 3. Find it here"
- Add theme toggle button to sidebar or top nav:
  - Client component using `useTheme()` from `next-themes`
  - Cycles through light / dark / system
  - Use a shadcn `Button` with a sun/moon icon (lucide-react icons: `Sun`, `Moon`, `Monitor`)
- Install `lucide-react` if not already installed: `pnpm add lucide-react` in `apps/web`

**Acceptance criteria:**
1. After signing in via magic link, the browser lands on `http://localhost:3000/dashboard` and the page renders without a JavaScript console error.
2. The page displays the text `drop@dropnote.com` in the onboarding panel.
3. Clicking the copy button copies `drop@dropnote.com` to the clipboard (verifiable by pasting into another input) and displays "Copied!" text for approximately 2 seconds.
4. The sidebar displays the signed-in user's email address.
5. Clicking "Sign out" redirects to `/login` and a subsequent direct navigation to `/dashboard` redirects back to `/login` (session cleared).
6. The theme toggle cycles the `<html>` element's `class` attribute between `light`, `dark`, and no class (system) on repeated clicks.

**Out of scope:**
- Items list or item data (Sprint 4)
- Real item count check (hardcode to empty state for Sprint 1)
- Settings page content (Sprint 5)
- Mobile sidebar drawer (Sprint 5)
- Persistent mini-element in sidebar once items exist (Sprint 4)

---

### S109 — Configure Vitest with c8 coverage and scaffold Playwright
**Type:** test
**Points:** 1
**Depends on:** S101, S103

**Goal:** Establish the test infrastructure so unit tests can be written in S111 and Playwright can be expanded in Sprint 6 without retrofitting config.

**Scope:**
- Install in repo root (or as root devDependencies): `vitest`, `@vitest/coverage-c8`, `vite`
- Create root `vitest.config.ts`:
  ```ts
  import { defineConfig } from 'vitest/config'
  export default defineConfig({
    test: {
      coverage: {
        provider: 'c8',
        reporter: ['text', 'lcov'],
        // threshold not enforced until Sprint 4
      },
    },
  })
  ```
- Add `"test": "vitest run"` and `"test:coverage": "vitest run --coverage"` scripts to root `package.json`
- Add `"test": "vitest run"` script to `packages/shared/package.json`
- Create a trivial passing test to confirm Vitest works: `packages/shared/src/__tests__/sanity.test.ts` with `it('true is true', () => expect(true).toBe(true))`
- Install Playwright: `pnpm add -D @playwright/test` at root; run `pnpm exec playwright install --with-deps chromium`
- Create `playwright.config.ts` at repo root:
  - `testDir: './e2e'`
  - `baseURL: process.env.BASE_URL ?? 'http://localhost:3000'`
  - Single project: `chromium`
  - `webServer` block pointing to `pnpm --filter @drop-note/web dev` on port 3000
- Create `e2e/` directory
- Create `e2e/smoke.spec.ts` with one test: navigate to `http://localhost:3000/login`, assert the page contains the text "Sign in" (or the email input is visible)
- Add `"e2e": "playwright test"` script to root `package.json`
- Add `coverage/` and `playwright-report/` to `.gitignore`

**Acceptance criteria:**
1. `pnpm test` (from repo root) exits 0 and prints output showing the sanity test passed.
2. `pnpm test:coverage` exits 0 and produces a `coverage/` directory containing an `lcov.info` file.
3. `pnpm e2e` (with the Next.js dev server running separately or via `webServer` config) executes the smoke test in `e2e/smoke.spec.ts` and exits 0.
4. `cat vitest.config.ts` shows `provider: 'c8'`.
5. `cat playwright.config.ts` shows `testDir: './e2e'` and a `baseURL` configuration.

**Out of scope:**
- Coverage thresholds or CI gates (Sprint 4)
- Additional Playwright tests beyond the single smoke test (Sprint 6)
- Firefox or WebKit Playwright projects

---

### S110 — Vercel project setup with env vars and PR preview deploys
**Type:** setup
**Points:** 2
**Depends on:** S103, S104

**Goal:** Establish continuous deployment to Vercel so every PR generates a preview URL and the production URL is available for integration testing.

**Scope:**
- Create a Vercel project linked to the GitHub repository (via `vercel link` CLI or the Vercel dashboard import)
- Set the **Root Directory** to `apps/web` in the Vercel project settings
- Set the **Framework Preset** to `Next.js`
- Set the **Build Command** to `pnpm turbo build --filter=@drop-note/web` (or the Vercel default if Turborepo is auto-detected)
- Set the **Install Command** to `pnpm install --frozen-lockfile`
- Add the following environment variables in Vercel project settings (for Production, Preview, and Development environments):
  - `NEXT_PUBLIC_SUPABASE_URL` — value from Supabase project
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY` — value from Supabase project
  - `SUPABASE_SERVICE_ROLE_KEY` — value from Supabase project (mark as sensitive)
- Update Supabase Auth allowed redirect URLs to include:
  - `https://<vercel-production-url>/auth/callback`
  - `https://*-drop-note.vercel.app/auth/callback` (wildcard for PR previews — or enumerate if wildcard not supported)
- Update Supabase Auth site URL to the production Vercel URL
- Confirm a deployment by pushing to `main` or manually triggering via `vercel deploy --prod`
- Document the production URL in a top-level comment in `.env.example`

**Acceptance criteria:**
1. The Vercel dashboard shows the project with a successful production deployment (green checkmark).
2. `curl -I https://<production-url>/login` returns HTTP 200.
3. Opening a pull request against `main` causes Vercel to automatically create a preview deployment (visible as a status check on the PR labeled "Vercel – Preview").
4. The preview deployment URL (`https://<pr-preview>.vercel.app/login`) loads the sign-in page without a 500 error.
5. All three environment variables (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) are visible in the Vercel project's Environment Variables settings tab.

**Out of scope:**
- Custom domain configuration
- Vercel OSS program application (Sprint 6)
- Edge Config or KV setup
- Worker deployment (Sprint 2 — Railway)

---

### S111 — Unit tests for drop_token generator and auth helpers in packages/shared
**Type:** test
**Points:** 2
**Depends on:** S107, S109

**Goal:** Establish the test pattern for `packages/shared` early so it is easy to add tests in every subsequent sprint without a setup burden.

**Scope:**
- Create `packages/shared/src/auth.ts` with the following exported functions:
  - `generateDropToken(): string` — returns `crypto.randomUUID()` (Node.js built-in; no external UUID library needed)
  - `isValidDropToken(token: string): boolean` — returns true if the string matches UUID v4 regex: `/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i`
  - `isValidEmail(email: string): boolean` — returns true if the string matches a basic RFC-5321-compatible email regex (no external library)
- Create `packages/shared/src/index.ts` that re-exports everything from `auth.ts`
- Update `packages/shared/package.json`:
  - `"main": "src/index.ts"` (TypeScript source; Turborepo will compile)
  - `"types": "src/index.ts"`
  - Add `"test": "vitest run"` script
- Create `packages/shared/src/__tests__/auth.test.ts` with tests covering:
  - `generateDropToken()` returns a string matching UUID v4 format
  - `generateDropToken()` called twice returns two different values (probabilistic uniqueness)
  - `isValidDropToken()` returns `true` for a valid UUID v4 string
  - `isValidDropToken()` returns `false` for an empty string
  - `isValidDropToken()` returns `false` for a UUID v3 string (version digit ≠ 4)
  - `isValidDropToken()` returns `false` for a plain string like `"not-a-uuid"`
  - `isValidEmail()` returns `true` for `"user@example.com"`
  - `isValidEmail()` returns `false` for `"not-an-email"`
  - `isValidEmail()` returns `false` for an empty string
- Delete the `sanity.test.ts` file created in S109 (it was only a placeholder)

**Acceptance criteria:**
1. `pnpm --filter @drop-note/shared test` exits 0 and reports all tests passed (minimum 9 test cases).
2. `pnpm test` from the repo root also exits 0 (Turborepo runs shared tests as part of the pipeline).
3. `generateDropToken()` output passes `isValidDropToken()` — verified by a test assertion, not just by inspection.
4. `cat packages/shared/src/auth.ts` shows all three exported functions: `generateDropToken`, `isValidDropToken`, `isValidEmail`.
5. CI (`pnpm turbo test`) passes with the new tests included (verifiable by inspecting the Actions run on the PR that adds these files).

**Out of scope:**
- Tests for Supabase client code (integration tests; not unit-testable without a live DB)
- Tests for Next.js page components
- Mocking Supabase in tests (Sprint 2 and beyond)
- Coverage thresholds

---

### S112 — packages/shared scaffold with TypeScript build config
**Type:** setup
**Points:** 1
**Depends on:** S101, S111

**Goal:** Ensure `packages/shared` is properly wired as a TypeScript workspace package so `apps/web` (and future `apps/worker`) can import from it without build errors.

**Scope:**
- Create `packages/shared/tsconfig.json`:
  ```json
  {
    "extends": "../../tsconfig.base.json",
    "compilerOptions": {
      "outDir": "dist",
      "rootDir": "src",
      "declaration": true,
      "declarationMap": true
    },
    "include": ["src"]
  }
  ```
- Add `"typecheck": "tsc --noEmit"` script to `packages/shared/package.json`
- Update `apps/web/tsconfig.json` paths to resolve `@drop-note/shared` → `../../packages/shared/src/index.ts`
- Add an import of `generateDropToken` from `@drop-note/shared` in `apps/web/app/(dashboard)/dashboard/page.tsx` (as a comment or type-only import) to validate the path alias works — remove the import after validating (it is only needed to confirm resolution; S107 uses the trigger, not this function client-side)
- Confirm `pnpm --filter @drop-note/web typecheck` succeeds with the path alias configured

**Acceptance criteria:**
1. `pnpm --filter @drop-note/shared typecheck` exits 0.
2. `pnpm --filter @drop-note/web typecheck` exits 0 with `@drop-note/shared` in the path aliases.
3. `pnpm turbo typecheck` from repo root exits 0 across all packages.
4. `cat packages/shared/tsconfig.json` shows `"extends": "../../tsconfig.base.json"`.

**Out of scope:**
- Compiling `packages/shared` to `dist/` (TypeScript source imports are sufficient for Sprint 1; a build step can be added when `apps/worker` needs a compiled artifact)
- Publishing `packages/shared` to npm

---

### S113 — Sprint 1 smoke test: sign-in to drop address displayed end-to-end
**Type:** test
**Points:** 1
**Depends on:** S108, S109, S110, S111

**Goal:** Verify the complete Sprint 1 deliverable in a single automated test — a new user can sign in via magic link and sees the shared drop address on the dashboard — proving all S1 components work together.

**Scope:**
- Create `e2e/s1-smoke.spec.ts` in the repo root `e2e/` directory
- The test must cover this exact flow using Playwright:
  1. Navigate to `BASE_URL/login`
  2. Assert the email input (`input[type="email"]`) is visible
  3. Assert the page title or heading contains the text `drop-note` or `Sign in`
  4. Use Playwright's `page.route()` to intercept calls to the Supabase Auth API (or use a test account with a pre-seeded session cookie stored via `storageState`) — **do not** require a live email send; mock the session
  5. With a mocked/seeded authenticated session navigate directly to `BASE_URL/dashboard`
  6. Assert the text `drop@dropnote.com` is visible on the page
  7. Assert the copy button is visible (selector: `button` containing text `Copy` or `Copied`)
  8. Assert the sidebar is visible and contains the authenticated user's email or the "Sign out" text
- Alternatively (if mocking Supabase Auth in Playwright is complex): split into two assertions — one unauthenticated test and one authenticated test using `storageState` from a pre-seeded session file:
  - **Unauthenticated test:** navigate to `/dashboard`, assert redirect to `/login`
  - **Authenticated test:** use `storageState: 'e2e/fixtures/auth.json'` (Playwright auth fixture), navigate to `/dashboard`, assert `drop@dropnote.com` is visible
- Create `e2e/fixtures/` directory and document in a comment inside the spec how to generate `auth.json` via `playwright/auth.setup.ts`
- Create `e2e/auth.setup.ts` that logs in via the Supabase JS client (using service role to generate a session, not a real magic link) and saves `storageState` to `e2e/fixtures/auth.json`
- Add `e2e/fixtures/auth.json` to `.gitignore`
- Update `playwright.config.ts` to define a `setup` project that runs `auth.setup.ts` before the main smoke test project

**Acceptance criteria:**
1. `pnpm e2e` runs and exits 0 with all smoke tests passing (against `localhost:3000` with the dev server running).
2. The test output shows at minimum two tests: one that verifies the login page renders, and one that verifies an authenticated session sees `drop@dropnote.com` on the dashboard.
3. A test in the suite asserts that navigating to `/dashboard` without a session redirects to `/login` — this must appear in the test output as a passing assertion.
4. `cat e2e/s1-smoke.spec.ts` shows an assertion for the text `drop@dropnote.com`.
5. `pnpm e2e` against the Vercel preview URL (`BASE_URL=https://<preview>.vercel.app pnpm e2e`) also exits 0 (manual verification acceptable; documents the command in a comment in the spec).

**Out of scope:**
- Testing the magic link email delivery (requires a live email service; deferred to Sprint 6)
- Testing item creation or display (Sprint 4)
- Full Playwright CI integration in GitHub Actions (Sprint 6 — S605)

---

## Summary

| Ticket | Title | Type | Points | Depends on |
|---|---|---|---|---|
| S101 | Initialize pnpm monorepo with Turborepo | setup | 2 | none |
| S102 | GitHub Actions CI: lint, typecheck, and unit tests on every PR | setup | 2 | S101 |
| S103 | Scaffold Next.js 14 app in apps/web | setup | 2 | S101 |
| S104 | Supabase project setup and initial schema migration | setup | 3 | S101 |
| S105 | RLS policies for items, tags, and item_tags | setup | 3 | S104 |
| S106 | Supabase Auth magic link flow | feat | 3 | S103, S104, S105 |
| S107 | Post-signup Postgres trigger for drop_token | feat | 2 | S104 |
| S108 | Dashboard shell with auth layout, sidebar, and onboarding panel | feat | 3 | S106, S107 |
| S109 | Configure Vitest with c8 coverage and scaffold Playwright | test | 1 | S101, S103 |
| S110 | Vercel project setup with env vars and PR preview deploys | setup | 2 | S103, S104 |
| S111 | Unit tests for drop_token generator and auth helpers in packages/shared | test | 2 | S107, S109 |
| S112 | packages/shared scaffold with TypeScript build config | setup | 1 | S101, S111 |
| S113 | Sprint 1 smoke test: sign-in to drop address displayed end-to-end | test | 1 | S108, S109, S110, S111 |
| **Total** | | | **27** | |
