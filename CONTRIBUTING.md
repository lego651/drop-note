# Contributing to drop-note

drop-note is open source under AGPL-3.0. Contributions are welcome — bug fixes, features, tests, and documentation all help.

---

## Prerequisites

| Tool | Version | Install |
|---|---|---|
| Node.js | 20.x | [nodejs.org](https://nodejs.org) or `nvm install 20` |
| pnpm | 9.x | `npm install -g pnpm@9` |
| Docker Desktop | latest | [docker.com](https://www.docker.com/products/docker-desktop/) |
| Supabase CLI | latest | `npm install -g supabase` |

---

## Local Development — pnpm path

This is the recommended path for most contributors.

```bash
# 1. Clone the repo
git clone https://github.com/your-org/drop-note.git
cd drop-note

# 2. Install all workspace dependencies
pnpm install

# 3. Copy the env template and fill in your values
cp apps/web/.env.example apps/web/.env.local
# Edit apps/web/.env.local — minimum required:
#   NEXT_PUBLIC_SUPABASE_URL
#   NEXT_PUBLIC_SUPABASE_ANON_KEY
#   SUPABASE_SERVICE_ROLE_KEY

# 4. Start the Next.js dev server
pnpm --filter @drop-note/web dev
```

The app will be available at `http://localhost:3000` (falls back to 3001 if the port is taken).

> You will need a Supabase project (free tier works). Create one at supabase.com, run `npx supabase db push --linked` to apply migrations, then copy the URL and keys into `.env.local`.

---

## Local Development — Docker path

Use this if you prefer a fully self-contained environment.

```bash
# 1. Clone the repo
git clone https://github.com/your-org/drop-note.git
cd drop-note

# 2. Copy and fill in the env file
cp .env.example .env
# Edit .env — set all required vars (Supabase, Redis, etc.)

# 3. Start everything
docker compose up
```

Services started: `web` (Next.js on port 3000), `worker` (BullMQ), Redis.

---

## Running Tests

```bash
# Unit tests (Vitest)
pnpm test

# Unit tests with coverage report
# Fails if total coverage drops below 60%
pnpm test:coverage

# End-to-end tests (Playwright)
# Requires a running dev server on localhost:3000
pnpm e2e
```

Before opening a PR, also run:

```bash
pnpm turbo lint        # ESLint across all packages
pnpm turbo typecheck   # TypeScript across all packages
pnpm --filter @drop-note/web build  # Vercel build simulation
```

All three must pass — Vercel runs them on every push and a failure blocks the deployment.

---

## Monorepo Structure

```
drop-note/
├── apps/
│   ├── web/       # Next.js 14 App Router dashboard — deployed to Vercel
│   └── worker/    # BullMQ AI processing worker — deployed to Railway
├── packages/
│   └── shared/    # Shared TypeScript types, helpers, and AI prompts
├── supabase/
│   └── migrations/ # SQL migration files — applied with supabase db push
├── e2e/           # Playwright end-to-end smoke tests
└── docs/          # Sprint plans, tickets, design guide, v1 scope
```

---

## Database Migrations

Never use the Supabase GUI to change schema. All schema changes go through migration files.

```bash
# 1. Write your migration
#    File name format: supabase/migrations/YYYYMMDDHHMMSS_description.sql

# 2. Apply it to your linked project
npx supabase db push --linked

# 3. Regenerate TypeScript types — required after every schema change
pnpm gen:types
```

The generated file is `packages/shared/src/database.types.ts`. Commit both the migration SQL and the regenerated types together in the same commit.

---

## Code Conventions

**Colors and theming**
- Never use raw Tailwind color classes (`text-gray-500`, `bg-blue-600`, etc.)
- Always use semantic tokens: `bg-background`, `text-muted-foreground`, `border`, etc.
- All color definitions live in `apps/web/app/globals.css` as CSS variables
- Never add `dark:` variants in component files — only in `globals.css`

**React and Next.js**
- Server Components by default — only add `'use client'` when you need event handlers, browser APIs, or hooks
- Use the correct Supabase client for the context:
  - Browser / Client Components: `lib/supabase/client.ts` → `createClient()`
  - Server Components / Route Handlers: `lib/supabase/server.ts` → `await createClient()`
  - Middleware: `lib/supabase/middleware.ts` → `updateSession()`

**Environment variables**
- Never read `process.env` or call `requireEnv()` at the top level of a module
- Next.js imports all route modules at build time; a missing env var at module scope will crash the build
- Use lazy singletons (the Proxy pattern in `lib/supabase/admin.ts` and `lib/stripe.ts`) for any client that needs a secret key — Stripe, Redis, Resend, OpenAI all follow this pattern

**TypeScript**
- No `as any` outside test files — use `unknown` + narrowing or `Record<string | symbol, unknown>`
- Test files (`*.test.ts`) are exempt from this rule

**Shared code**
- Anything used by more than one package belongs in `packages/shared/src/`
- Import it as `@drop-note/shared`

---

## Commit Format

Every commit must be prefixed with the sprint it belongs to.

```
[sN] type: description
```

Examples:

```
[s2] feat: /api/ingest route with SendGrid payload parsing
[s2] fix: handle missing from header in ingest route
[s3] feat: Stripe webhook handler for subscription updates
[s6] test: add Vitest coverage for tag normalization
```

**Types:** `feat`, `fix`, `chore`, `refactor`, `test`, `docs`

**Rules:**
- Sprint prefix is required — no exceptions
- Subject line must be 72 characters or fewer
- Use the commit body for the *why*, not the *what*, when the change is non-obvious
- If Claude Code wrote the commit, include the co-author trailer:
  ```
  Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
  ```

---

## Pull Request Process

1. Branch from `main` and keep one sprint's work per PR where possible — don't mix sprint work
2. PR title must follow the same format as commits: `[sN] type: description`
3. Reference the ticket(s) the PR closes in the description: `Closes S201`
4. All CI checks must be green before merge: lint, typecheck, unit tests, E2E smoke tests

---

## AI Provider Configuration

For self-hosted deployments you can swap the AI provider via the `AI_PROVIDER` environment variable.

| Value | Provider | Notes |
|---|---|---|
| `openai` | OpenAI GPT-4o-mini | Default for SaaS |
| `anthropic` | Anthropic Claude | Requires `ANTHROPIC_API_KEY` |
| `gemini` | Google Gemini | Requires `GEMINI_API_KEY` |

Set the corresponding API key env var alongside `AI_PROVIDER`. The worker reads these inside its job handler — never at module load time.

---

## Questions

Open a GitHub Discussion or file an issue. Please check existing issues before opening a duplicate.
