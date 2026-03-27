# drop-note — Claude Code Project Guide

## What this project is

drop-note is an email-to-dashboard content saver. Users email anything to `drop@dropnote.com` from their registered address. An AI pipeline summarizes and tags each item. Users browse, search, and manage everything from a clean web dashboard.

- **License:** AGPL-3.0
- **Model:** Free tier + paid SaaS (Pro $9.99/mo, Power $49.99/mo) + self-hosted option
- **Status:** Sprint 1 complete, building toward v1 launch

---

## Monorepo structure

```
drop-note/
├── apps/
│   ├── web/          # Next.js 14 dashboard — deployed to Vercel
│   └── worker/       # BullMQ AI processing worker — deployed to Railway
├── packages/
│   └── shared/       # Shared TypeScript types, helpers, AI prompts
├── supabase/
│   └── migrations/   # SQL migration files — applied via supabase db push
├── e2e/              # Playwright end-to-end tests
└── docs/             # Sprint plans, tickets, design guide, v1 scope
```

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | Next.js 14 (App Router) + TypeScript + shadcn/ui + Tailwind |
| Database | Supabase (Postgres + RLS) |
| Auth | Supabase Auth (magic link only — no passwords) |
| File Storage | Supabase Storage |
| Email Inbound | SendGrid Inbound Parse → `/api/ingest` |
| Queue | BullMQ + Redis (Upstash/Railway) |
| AI | OpenAI GPT-4o-mini (SaaS fixed); `.env` configurable self-hosted |
| Email Sending | Resend |
| Payments | Stripe (Sprint 3) |
| Error Monitoring | Sentry (Sprint 5) |
| Deployment | Vercel (web) + Railway (worker) |
| Monorepo | pnpm workspaces + Turborepo |

## Key env vars (all in `apps/web/.env.local`)

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
```

Never commit `.env.local`. Never commit `supabase/.temp/`.

---

## Database schema (live on Supabase)

8 tables in `public` schema:

| Table | Purpose |
|---|---|
| `users` | Extends `auth.users`. Has `tier`, `drop_token`, `stripe_customer_id`, `is_admin` |
| `items` | Saved content. Has `status` enum, `deleted_at`, `pinned`, `error_message` |
| `tags` | Per-user tags. Case-insensitive unique via `tags_user_id_name_lower_idx` |
| `item_tags` | Many-to-many join |
| `site_settings` | `registration_mode` (open/invite), `open_slots` |
| `block_list` | Email + IP blocklist (admin-managed) |
| `invite_codes` | Invite code system for post-50-user registration |
| `usage_log` | Monthly save action tracking for free tier cap |

RLS is enabled on all 8 tables.
A Postgres trigger `on_auth_user_created` auto-creates a `public.users` row with a `drop_token` UUID on every new sign-up.

Migrations live in `supabase/migrations/`. Apply with `npx supabase db push --linked`.

---

## Commands

```bash
pnpm install                          # install all workspace deps
pnpm --filter @drop-note/web dev      # start Next.js dev server
pnpm turbo lint                       # lint all packages
pnpm turbo typecheck                  # typecheck all packages
pnpm test                             # run Vitest unit tests
pnpm test:coverage                    # run with coverage report
pnpm e2e                              # run Playwright smoke tests
pnpm gen:types                        # regenerate Supabase TypeScript types
npx supabase db push --linked         # apply migrations to remote DB
npx supabase migration list --linked  # check migration status
```

> **Before pushing to Vercel:** run `pnpm turbo lint && pnpm turbo typecheck && pnpm --filter @drop-note/web build` locally. Vercel runs all three and a build failure blocks the deployment.

> **Railway auto-deploys on push to `main`** — but there is a build delay (typically 2–4 minutes). Any emails processed during that window will use the old worker code. If you change anything in `apps/worker/` or `packages/shared/`, note that:
> - Items processed before the Railway deploy finishes won't reflect the new logic (re-send the email to reprocess)
> - Check the Railway dashboard to confirm the deploy succeeded before testing worker behaviour
> - **Watch Paths must be newline-separated** (one pattern per line) in Railway Settings. Comma-separated values are not parsed correctly and will silently break auto-deploy. Correct config:
>   ```
>   apps/worker/**
>   packages/shared/**
>   ```

> **IMPORTANT:** Every time the database schema changes (new migration applied), run `pnpm gen:types` to regenerate `packages/shared/src/database.types.ts`. All three Supabase client factories (`client.ts`, `server.ts`, `middleware.ts`) are typed with `Database` — stale types will cause TypeScript errors or silently wrong column names across the entire app.

---

## Code conventions

- **No passwords** — Supabase magic link only
- **No raw Tailwind color classes** — always use semantic tokens (`bg-background`, `text-muted-foreground`, etc.). All color decisions go through CSS variables in `globals.css`.
- **No `dark:` variants in components** — only in `globals.css`
- **Server Components by default** — only add `'use client'` when strictly needed (event handlers, browser APIs, hooks)
- **Supabase clients:**
  - Browser: `lib/supabase/client.ts` → `createClient()`
  - Server Components / Route Handlers: `lib/supabase/server.ts` → `await createClient()`
  - Middleware: `lib/supabase/middleware.ts` → `updateSession()`
- **Shared code** goes in `packages/shared/src/` — imported as `@drop-note/shared`
- **SQL migrations** — write migration files, never use the Supabase GUI to change schema
- **No module-level env var access** — never call `requireEnv()` or read `process.env` at the top level of a module. Next.js imports all route modules at build time; env var reads must happen inside request handlers or lazy initializers. Use a lazy singleton (the Proxy pattern in `lib/supabase/admin.ts` and `lib/stripe.ts`) for any client that needs a secret key. This applies to Stripe, Redis, Resend, OpenAI — every service client.
- **No `as any` outside tests** — use `unknown` + narrowing or `Record<string | symbol, unknown>` instead. Test files (`*.test.ts`) are exempt.
- **ESLint config** — `apps/web/.eslintrc.json` extends `next/core-web-vitals`. Do not remove it. Inline `eslint-disable` comments for `@next/next/*` and `react-hooks/*` rules only work when the config loads those plugins.

---

## Sprint overview

| Sprint | Theme | Status |
|---|---|---|
| S1 | Foundation & Schema | ✅ Complete |
| S2 | Email Ingestion & AI Pipeline | 🔨 Next |
| S3 | Payments & Tier Enforcement | Pending |
| S4 | Dashboard & Item Management UI | Pending |
| S5 | Real-time, Admin & Polish | Pending |
| S6 | Testing, OSS & Launch | Pending |

Full ticket breakdowns in `docs/s1-tickets.md` and `docs/sprint-plan.md`.

---

## Commit message rules

**Every commit must be prefixed with either a sprint tag or `[bug]`.**

Format: `[s{N}] type: description` or `[bug] type: description`

```
[s1] feat: add magic link login flow
[s2] feat: /api/ingest route with SendGrid payload parsing
[s6] feat: add batch delete support
[bug] fix: sidebar blank on mobile
[bug] fix: raise Supabase auth email rate limit
```

**Types:** `feat`, `fix`, `chore`, `refactor`, `test`, `docs`

**Rules:**
- A prefix is required on every commit — no exceptions.
- Use `[s{N}]` for planned sprint work — features, tasks, and improvements scoped to a sprint.
- Use `[bug]` for follow-up fixes and issues noticed after a sprint is done, regardless of which sprint introduced the original code. Do not use a sprint tag for these.
- Keep the subject line under 72 characters.
- Use the body for the *why*, not the *what*, when the change is non-obvious.
- Always include the co-author trailer when Claude Code wrote the commit:
  ```
  Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
  ```

---

## PR rules

- PR title must follow the same format: `[s{N}] type: description`
- PR description should reference the ticket number(s) it closes (e.g. `Closes S201`)
- One sprint per PR where possible — don't mix sprint work
- All CI checks (lint, typecheck, test) must pass before merge

---

## Notes & known limitations

- **Session timebox** (30-day / 90-day inactivity) requires Supabase Pro plan — skipped for dev/alpha. Sessions currently never expire.
- **v1 inbox model:** shared address (`drop@dropnote.com`), user identified by `from` email. Per-user token routing (`drop+[token]@dropnote.com`) is v2 — `users.drop_token` already in schema to support migration.
- **Vercel preview URLs** are protected by Vercel auth on Hobby plan — expected behavior, not a bug.
- **Port conflict:** if port 3000 is taken, Next.js falls back to 3001. Check the terminal output.
- **Supabase Auth email rate limit** — controls how many magic link emails can be sent per hour across the entire project. This is a Supabase platform-level setting, **not** per-tier. It applies equally to all users (free, pro, power). The limit must be kept in sync in **three places**:
  1. `supabase/config.toml` → `[auth.rate_limit]` → `email_sent` (local dev)
  2. Supabase Dashboard → Authentication → Rate Limits → "Rate limit for sending emails" (production — **must be updated manually**, cannot be set via CLI or migration on the free Supabase plan)
  3. `packages/shared/src/ratelimit.ts` → `AUTH_EMAIL_RATE_LIMIT_PER_HOUR` (used in user-facing error messages in login + register forms)

  Current value: **30 emails/hour**. If you change it, update all three.
