# drop-note — Claude Code Project Guide

## What this project is

drop-note is an email-to-dashboard content saver. Users email anything to `drop@dropnote.me` from their registered address. An AI pipeline summarizes and tags each item. Users browse, search, and manage everything from a clean web dashboard.

- **License:** Proprietary / private. (Was AGPL-3.0 during alpha — open-source + self-host positioning was killed 2026-05-30; repo is going private.)
- **Model:** Free hosted (`dropnote.me`) only — no self-host, no open-source. **Paid tiers are disabled** — the $9.99/$49.99 Pro/Power tiers were killed; a single $4.99/mo hosted tier is reactivated only at 100 active users. Don't reintroduce pricing or open-source/self-host copy.
- **Status:** **Alpha complete (2026-05-30).** All planned functionality shipped (S0–S8). Now in **beta** — inviting a small group of friends to test for stability. **Not prod-ready yet**; production hardening begins once beta is stable.

---

## Monorepo structure

```
drop-note/
├── apps/
│   └── web/          # Next.js 14 dashboard — deployed to Vercel
├── packages/
│   └── shared/       # Shared TypeScript types, helpers, AI prompts
├── supabase/
│   └── migrations/   # SQL migration files — applied via supabase db push
├── e2e/              # Playwright end-to-end tests
└── docs/             # Living references only (style guide, OAuth setup, architecture).
                      # Alpha planning/tickets/reviews are frozen in docs/archive/alpha/ — see § Docs.
```

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | Next.js 14 (App Router) + TypeScript + shadcn/ui + Tailwind |
| Database | Supabase (Postgres + RLS) |
| Auth | Supabase Auth (Google OAuth only) |
| File Storage | Supabase Storage |
| Email Inbound | SendGrid Inbound Parse → `/api/ingest` |
| Queue | None — AI runs synchronously in `/api/ingest` (D11); Upstash Redis for rate limiting |
| AI | OpenAI GPT-4o-mini; provider/model configurable via `AI_PROVIDER` / `AI_MODEL` env |
| Email Sending | Resend |
| Payments | Stripe (Sprint 3) |
| Error Monitoring | Sentry (Sprint 5) |
| Deployment | Vercel |
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

Migrations live in `supabase/migrations/`. **Apply via the Supabase MCP `apply_migration` tool** (project_id `fywrywzmksxqggvwfstn`) — it authenticates with a Personal Access Token, so **no DB password is ever needed**. The `npx supabase db push --linked` CLI path is NOT usable here (the CLI cannot obtain the DB password). Never ask Jason for a DB password.

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
pnpm gen:types                        # regenerate Supabase TypeScript types (run after every migration)
# Apply migrations: use Supabase MCP apply_migration (project_id fywrywzmksxqggvwfstn) — NOT the CLI, no DB password
# Check status:     use Supabase MCP list_migrations / execute_sql against information_schema
```

> **Before pushing to Vercel:** run `pnpm turbo lint && pnpm turbo typecheck && pnpm --filter @drop-note/web build` locally. Vercel runs all three and a build failure blocks the deployment.

> **IMPORTANT:** Every time the database schema changes (new migration applied), run `pnpm gen:types` to regenerate `packages/shared/src/database.types.ts`. All three Supabase client factories (`client.ts`, `server.ts`, `middleware.ts`) are typed with `Database` — stale types will cause TypeScript errors or silently wrong column names across the entire app.

---

## Code conventions

- **UI style guide (read before any UI work):** [`docs/STYLE_GUIDE.md`](docs/STYLE_GUIDE.md) — token-driven styling, card/pill/loading/optimistic conventions, full color-token list. All new UI must follow it. Theme changes happen in `globals.css` only.
- **No passwords** — Google OAuth only (no magic links)
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
- **Supabase query results vs. narrow app types** — Supabase generates DB types where every `text` column is `string`. App-level union types (e.g. `SourceType`, `Tier`, status enums) are narrower than `string` and are never auto-inferred from query results. Whenever a Supabase query feeds into a component or function that expects a narrow union type, cast the relevant fields explicitly at the query boundary (e.g. `source_type: row.source_type as SourceType | null`). Do not suppress this with `as any` — cast the specific field.
- **`/api/ingest` structured log** — every code path emits a JSON log line for p95 monitoring. Field names are stable; do not rename them:
  ```json
  { "event": "ingest.completed", "userId": "...", "itemId": "...", "status": "done|pending|failed|error",
    "total_handling_ms": 1234, "ai_processing_ms": 890, "text_length": 500, "html_length": 1200, "attachment_count": 0 }
  ```
- **ESLint config** — `apps/web/.eslintrc.json` extends `next/core-web-vitals`. Do not remove it. Inline `eslint-disable` comments for `@next/next/*` and `react-hooks/*` rules only work when the config loads those plugins.

---

## Sprint overview — alpha complete

All planned sprints (S0–S8) shipped. **Alpha is closed as of 2026-05-30.**

| Sprint | Theme | Status |
|---|---|---|
| S0–S1 | Foundation, schema, auth | ✅ Complete |
| S2 | Email ingestion & AI pipeline (synchronous, D11) | ✅ Complete |
| S3 | Payments scaffolding & tier enforcement | ✅ Complete (paid tiers disabled) |
| S4 | Dashboard & item management UI | ✅ Complete |
| S5 | Real-time, admin & polish | ✅ Complete |
| S6 | Testing, OSS & launch prep | ✅ Complete |
| S7–S8 | Relaunch, positioning pivot, full UI redesign | ✅ Complete |

**Now: beta.** No new feature sprints planned — the goal is stability via friend testing, then production hardening. Resist scope creep.

Historical ticket breakdowns and sprint reviews are frozen in `docs/archive/alpha/` (see § Docs).

---

## Docs

`docs/` holds **living references only**:

| File | Purpose |
|---|---|
| `docs/STYLE_GUIDE.md` | UI styling standard — read before any UI work |
| `docs/google-oauth-setup.md` | One-time Google OAuth + Supabase setup runbook |
| `docs/architecture/email-pipeline.md` | Current email → ingest → AI → DB data flow |
| `docs/.mic-state.md` | drop-mic agent's persistent working memory |

`docs/archive/alpha/` holds **frozen alpha history** — sprint plans, tickets, reviews, redesign specs, Jose briefs, launch checklists, and shipped-task reports. **Do not edit or reference these for current work** — they are a point-in-time snapshot. Read them only when investigating *why* a past decision was made. Nothing in the archive is kept up to date by design.

---

## Commit message rules

**Every commit must be prefixed with either a sprint tag or `[bug]`.**

Format: `[s{N}] type: description` or `[bug] type: description`

```
[s1] feat: add Google OAuth login flow
[s2] feat: /api/ingest route with SendGrid payload parsing
[s6] feat: add batch delete support
[bug] fix: sidebar blank on mobile
[bug] fix: OAuth redirect URI mismatch
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
- **v1 inbox model:** shared address (`drop@dropnote.me`), user identified by `from` email. Per-user token routing (`drop+[token]@dropnote.me`) is v2 — `users.drop_token` already in schema to support migration.
- **Vercel preview URLs** are protected by Vercel auth on Hobby plan — expected behavior, not a bug.
- **Port conflict:** if port 3000 is taken, Next.js falls back to 3001. Check the terminal output.
- **Auth:** Google OAuth only. One-time Supabase + Google Cloud setup required — see `docs/google-oauth-setup.md`.
