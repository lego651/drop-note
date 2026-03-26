# drop-note — Sprint Plan (v1)

> Produced by: PM Review + Tech Lead Review
> Solo developer + AI agents. 6 sprints × 1 week = 6 weeks to v1.
> Story points: 1=trivial, 2=half day, 3=full day, 5=1-2 days, 8=3-4 days

---

## Critical Path

```
Schema + RLS (S1) → ingest route + from-email user lookup (S2) → SendGrid Inbound Parse webhook (S2)
→ BullMQ worker + AI processing (S2) → item DB writes (S2)
→ tier enforcement (S3) → Stripe webhooks (S3)
→ item list/card/timeline UI (S4) → item detail UI (S4)
→ Realtime subscription (S5) → admin panel (S5)
→ E2E tests (S6) → production deploy (S6)
```

**Highest-risk item:** The SendGrid webhook → `/api/ingest` → BullMQ bridge. Validate end-to-end on Day 1 of Sprint 2 using SendGrid's test payload before writing any AI code.

---

## Architecture Decisions (Tech Lead Resolved)

| Decision | Choice | Rationale |
|---|---|---|
| Monorepo | pnpm workspaces + Turborepo | `apps/web`, `apps/worker`, `packages/shared` |
| Email Inbound | SendGrid Inbound Parse → POST `/api/ingest` → BullMQ | SendGrid parses email and delivers structured data; no raw MIME parsing needed |
| Inbound user lookup | Match `from` address to `users.email`. Unknown sender → silent discard | Shared inbox (`drop@dropnote.com`) for v1. Per-user token routing = v2. `users.drop_token uuid unique` kept in schema for easy migration. |
| BullMQ worker hosting | Railway (SaaS) / Docker container (self-hosted) | Can't run persistent process on Vercel serverless |
| AI provider | OpenAI GPT-4o-mini (SaaS, fixed). `.env` configurable for self-hosted (OpenAI, Anthropic, Gemini). Provider abstraction layer + docs in Sprint 6. | No per-user model selection in v1 |
| Tag deduplication | Case-insensitive exact string match (no embeddings) | Simple, fast, implementable in a day |
| Soft/hard delete | `deleted_at timestamptz` + RLS `WHERE deleted_at IS NULL` | Enforce soft vs hard in API layer by tier |
| Stripe timing | Sprint 3 (not 2) — pipeline must exist before enforcement | Hard dependency chain |
| Registration gate | Atomic CTE: `INSERT ... WHERE (SELECT COUNT(*) FROM users) < 50` | Prevents race condition |
| Test infra | Vitest + c8 (Sprint 1), Playwright scaffold (Sprint 1), E2E expanded Sprint 6 | Don't bolt tests on at the end |

---

## Required Schema Fields (Sprint 1 — Do Not Skip)

```
items:         status enum (pending|processing|done|failed), error_message, deleted_at, pinned
users:         tier enum (free|pro|power), drop_token uuid unique, stripe_customer_id, is_admin
               ↳ drop_token kept for v2 per-user address migration; not used for routing in v1
site_settings: registration_mode (open|invite), open_slots int
block_list:    email, ip, created_at
invite_codes:  code, used_by, used_at, created_by
usage_log:     user_id, action_type, month (for save action counting)
```

---

## Sprint 1 — Foundation & Schema
**Goal:** Monorepo, database schema, auth, CI pipeline, and initial Vercel deployment.
**Deliverable:** Magic link login works. User sees their assigned drop address on dashboard. CI green.

| # | Task | Points | Notes |
|---|---|---|---|
| 1.1 | Initialize pnpm monorepo + Turborepo: `apps/web`, `apps/worker`, `packages/shared` | 2 | Base `tsconfig`, ESLint, Prettier |
| 1.2 | GitHub Actions CI: lint, typecheck, Vitest unit tests on every PR | 2 | Cache pnpm store, fail fast |
| 1.3 | Scaffold Next.js 14 app (`apps/web`): TypeScript, shadcn/ui, Tailwind, `next-themes` | 2 | App Router. Dark/light/system theme wired up |
| 1.4 | Supabase project + initial schema migration (all tables including required fields above) | 3 | Write SQL migration files — not GUI clicks |
| 1.5 | RLS policies: users can only read/write their own items and tags | 3 | Cover items, tags, item_tags. Use `auth.uid()` |
| 1.6 | Supabase Auth: magic link flow (sign-in page, email template, callback route) | 3 | 30-day session, 90-day remember-device. Test full round-trip |
| 1.7 | Post-signup Postgres trigger: generate `drop_token` (uuidv4), write to `users` table | 2 | Kept for v2 migration readiness. Function + trigger on `auth.users` insert |
| 1.8 | Dashboard shell: auth layout, sidebar nav, empty state onboarding panel with shared drop address (`drop@dropnote.com`) + copy button | 3 | "Send yourself a test email" CTA. Address is the same for all users in v1. |
| 1.9 | Configure Vitest + c8 coverage. Scaffold Playwright with one smoke test | 1 | Coverage gate enabled from Sprint 4 onward |
| 1.10 | Vercel project setup: link repo, env vars, confirm PR preview deploys | 2 | Supabase env vars in Vercel |
| 1.11 | Unit tests: drop_token generator, auth helpers (shared package) | 2 | Establish patterns early |

**Sprint 1 Total: 25 points**

---

## Sprint 2 — Email Ingestion & AI Pipeline
**Goal:** Full email-to-item pipeline working end-to-end.
**Deliverable:** Forward a real email to your drop address → item appears in DB with AI summary and tags within 30 seconds.

| # | Task | Points | Notes |
|---|---|---|---|
| 2.1 | SendGrid Inbound Parse setup: configure MX records, SendGrid domain authentication, inbound parse webhook URL pointing to `/api/ingest`. Verify test payload delivery. | 2 | SendGrid free tier covers 100 emails/day — sufficient for 50 alpha users. Use SendGrid's "Send Test" feature to validate on Day 1. |
| 2.2 | `/api/ingest` Next.js route: parse SendGrid multipart POST, look up user by `from` email (`users.email`), discard unknowns silently, check rate limits (Redis), enqueue BullMQ job, return 200 | 3 | Rate limit: 5/hr free, 20/hr paid. Redis `INCR` with TTL. Validate SendGrid webhook signature (shared secret in header). |
| 2.3 | `apps/worker` scaffold: BullMQ + Redis setup, job processor skeleton, connect to Upstash/Railway Redis | 2 | Job payload types in `packages/shared`. Retry: 3x exponential backoff |
| 2.4 | Email parsing: extract subject, sender, body text, attachments from SendGrid's structured POST fields (`text`, `html`, `attachment-info`, base64 attachment fields) | 2 | SendGrid pre-parses the MIME — no raw MIME library needed. Item counting: 1 body + N attachments. Filter .zip/.exe silently. Total payload ≤ 20MB (SendGrid limit). |
| 2.5 | File upload to Supabase Storage: per-user path, enforce size limits by tier (10/25/50MB) | 3 | Reject oversized attachments, log to item error_message |
| 2.6 | OpenAI GPT-4o-mini: summarize email body, extract tag suggestions | 3 | Prompt in `packages/shared/prompts.ts`. Cap input at 50k chars |
| 2.7 | OpenAI Vision API: image description for image/* attachments | 2 | Only run on image MIME types |
| 2.8 | PDF text extraction: `pdf-parse`, cap at 50k chars, then summarize | 2 | Run in worker process (not serverless) |
| 2.9 | Item + tag persistence: write to DB with status transitions, tag case-insensitive dedup (upsert) | 3 | `pending → processing → done/failed`. Postgres upsert for tags |
| 2.10 | Welcome email on first sign-in: send via Resend with drop address | 1 | Trigger in auth callback |
| 2.11 | Deploy worker to Railway: Dockerfile, env vars, verify end-to-end with real email | 2 | Smoke test: forward email, confirm DB row appears |
| 2.12 | Unit tests: SendGrid payload parser, from-email user lookup, tag deduplication, item counter, file size enforcement, rate limit logic | 3 | Pure functions → easy to test, high value |

**Sprint 2 Total: 29 points** *(was 30; task 2.1 reduced 3→2, task 2.4 reduced 3→2; net -2. Task 2.2 unchanged at 3.)*

---

## Sprint 3 — Payments & Tier Enforcement
**Goal:** Stripe live, tier limits enforced end-to-end, users can upgrade/downgrade.
**Deliverable:** Free user hits cap → gets rejection email → upgrades via Stripe → next email accepted.

| # | Task | Points | Notes |
|---|---|---|---|
| 3.1 | Stripe product + price setup: Pro $9.99/mo, Power $49.99/mo | 1 | Store price IDs in env vars |
| 3.2 | Stripe customer creation (lazy, on first checkout attempt) | 2 | Store `stripe_customer_id` on users table |
| 3.3 | Checkout session API route: create Stripe Checkout, redirect | 2 | `client_reference_id = user_id` |
| 3.4 | Stripe webhook `/api/webhooks/stripe`: handle `checkout.session.completed`, `subscription.updated`, `subscription.deleted` | 5 | Verify signature. Update `users.tier`. This is the critical path for tier enforcement |
| 3.5 | Billing portal API route: Stripe Customer Portal ("Manage Subscription" in Settings) | 1 | One API call to Stripe |
| 3.6 | Item cap enforcement in `/api/ingest`: count active items vs tier limit before enqueuing | 3 | `COUNT(*) WHERE deleted_at IS NULL`. Reject whole email if over cap |
| 3.7 | Cap exceeded notification email: explain rejection, include upgrade link | 1 | Reuse Resend email helper |
| 3.8 | Monthly save action limit (free: 30/month): Redis `INCR user:{id}:saves:{YYYY-MM}` + TTL | 3 | Check before enqueue. Hard cap: reject and notify |
| 3.9 | Downgrade banner: dashboard shows persistent banner if `item_count > tier_limit` | 2 | Query on dashboard load. Block new email ingest for that user |
| 3.10 | Admin tier override: PATCH endpoint to manually set `users.tier` | 1 | Protected by `is_admin` check |
| 3.11 | Pricing page `/pricing`: tier comparison table + upgrade CTAs | 2 | shadcn Table. Links to checkout session |
| 3.12 | Unit tests: cap enforcement, webhook event handlers, save action counter | 3 | Mock Stripe SDK. Test all webhook event types |

**Sprint 3 Total: 26 points**

---

## Sprint 4 — Dashboard & Item Management UI
**Goal:** Full item browsing, filtering, search, and management UI.
**Deliverable:** Browse items in List/Card/Timeline views, filter by tag/date, search keywords, open detail, edit summary/tags/notes, pin, bulk delete.

| # | Task | Points | Notes |
|---|---|---|---|
| 4.1 | Items list page: paginated list view, item cards (subject, summary preview, tags, date, status) | 5 | Show "Processing…" for pending. Error state card for failed. Infinite scroll or pagination. Default view. |
| 4.1b | Card/grid view: visual grid layout of item cards, responsive column count | 3 | Shares item card component with list view. View state persisted to localStorage. |
| 4.1c | Timeline view: items grouped by date (day/month), vertical timeline spine component | 5 | Build timeline grouping and spine in-house (no shadcn component). Reuse item card component. |
| 4.1d | View switcher: toolbar toggle (List / Card / Timeline), persisted to localStorage | 1 | |
| 4.2 | Item detail panel: full view with subject, sender, date, AI summary (editable), tags (editable), user notes, attachments | 5 | Inline edit. Save on blur. Tag add/remove. Prev/next navigation |
| 4.3 | Tag filter sidebar: list all user tags with item count, click to filter | 2 | "All" resets filter. Active tag highlighted |
| 4.4 | Date filter: year → month accordion in sidebar | 2 | Group by `created_at`. Month click filters list |
| 4.5 | Keyword search: Postgres FTS on summary + tags + notes. `tsvector` generated column + GIN index | 3 | Debounced input, 2-char minimum. `/api/items/search` route |
| 4.6 | Pin/favorite: toggle on item card, pinned items sort to top | 1 | `items.pinned`. Single PATCH |
| 4.7 | Bulk operations: checkbox multi-select, bulk delete, bulk re-tag | 3 | Select-all within current filter. Confirmation modal for bulk delete |
| 4.8 | Soft delete + trash view (paid users): 30-day recovery, restore single item, auto-purge via Supabase scheduled function | 2 | Trash in sidebar. Items in trash excluded from search and cap count |
| 4.9 | Hard delete (free users): immediate with confirmation modal | 1 | Check `users.tier` in delete handler |
| 4.10 | Attachments display: signed URL download links (1hr expiry), inline image preview | 2 | Supabase Storage signed URLs |
| 4.11 | API unit + integration tests: item CRUD routes, RLS enforcement, search, soft/hard delete | 3 | Test with real Supabase test instance or mocked client |

**Sprint 4 Total: 38 points** *(was 29; +9 for three-view dashboard: 4.1b=3, 4.1c=5, 4.1d=1)*
> **PM note:** This is a significant sprint load for a solo developer. Consider timebox on Timeline view (4.1c) if Sprint 4 runs long — List and Card views are higher-value for most users.

---

## Sprint 5 — Real-time, Admin & Polish
**Goal:** Real-time updates, admin panel, abuse prevention, account management, and mobile-ready UI.
**Deliverable:** Full working app. Real-time processing status. Admin can manage users, blocks, and invite codes. Mobile responsive.

| # | Task | Points | Notes |
|---|---|---|---|
| 5.1 | Supabase Realtime: subscribe to `items` filtered by `user_id`. Handle INSERT (new item) + UPDATE (status change) | 3 | Animate status transitions: skeleton → processing → done/error |
| 5.2 | Processing status UX: skeleton card → "Processing…" → final card, error state with message | 2 | Smooth transition, no page reload |
| 5.3 | Invite code system: `site_settings.registration_mode`, atomic 50-user gate, invite code table + validation at registration | 3 | CTE atomic check. Registration page shows code input when mode = `invite` |
| 5.4 | Admin panel layout + user list (`/admin`): protected by `is_admin`, list users with tier/item count/join date | 3 | Server-side admin check. Not just auth |
| 5.5 | Admin block list UI: add/remove email + IP, display current list. Check block list in `/api/ingest` | 2 | |
| 5.6 | Auto-block after 10 spam attempts: Redis counter per sender, trigger DB block on threshold | 2 | `INCR sender:{email}:attempts` 24hr TTL |
| 5.7 | Admin invite code UI: generate codes, list used/unused, revoke | 1 | |
| 5.8 | Admin system stats: user count, items today, queue depth, AI error rate | 2 | BullMQ queue metrics + Supabase counts |
| 5.9 | Sentry integration: `@sentry/nextjs` on web, `@sentry/node` on worker | 2 | DSN in env vars. Errors from all surfaces captured |
| 5.10 | Account deletion (Settings): hard delete all data + cancel Stripe subscription + delete auth user | 2 | Cascade via FK or explicit cleanup |
| 5.11 | Settings page: drop address, subscription status, "Manage Subscription" → Stripe portal, delete account | 2 | |
| 5.12 | GDPR cookie banner: consent banner on first visit, respect system | 1 | Simple banner, no complex consent management for v1 |
| 5.13 | Mobile responsiveness pass: sidebar → drawer on mobile, item cards at 375px/768px | 2 | shadcn Sheet for mobile sidebar |
| 5.14 | Error boundaries + 404/500 pages: `error.tsx`, `not-found.tsx`, Sentry capture | 1 | |

**Sprint 5 Total: 28 points**

---

## Sprint 6 — Testing, OSS & Launch
**Goal:** 60% coverage, E2E suite green, Docker Compose working, open source ready, production deployed.
**Deliverable:** CI fully green, Playwright E2E covering all critical flows, public GitHub repo with CONTRIBUTING.md, beta-ready production deployment.

| # | Task | Points | Notes |
|---|---|---|---|
| 6.1 | Coverage audit: identify gaps, write targeted unit tests to reach 60% statement coverage | 3 | Focus: ingest validation, tier enforcement, tag dedup, webhook handling |
| 6.2 | Playwright E2E: sign-up → shared drop address displayed → mock SendGrid ingest POST → item appears → edit → delete | 5 | Mock ingest via `page.route()` intercepting `/api/ingest`. Simulate SendGrid multipart payload. Full critical path. |
| 6.3 | Playwright E2E: Stripe upgrade flow (test mode + test card → tier change verified in DB) | 3 | `STRIPE_TEST_MODE=true`. Check webhook fires correctly |
| 6.4 | Playwright E2E: admin smoke test (login as admin, view users, add block entry) | 2 | Seed test admin user in fixture |
| 6.5 | CI hardening: coverage gate (<60% fails CI), Playwright against Vercel preview URL | 3 | `playwright test --base-url $VERCEL_PREVIEW_URL`. Required to merge |
| 6.6 | Docker Compose: `web`, `worker`, `redis` services + `.env.example` with all required vars | 3 | Test `docker compose up` from scratch. Verify worker processes a job |
| 6.7 | CONTRIBUTING.md: local dev setup, architecture overview, PR process, coding standards | 2 | Include: monorepo structure, how to run tests, local email mock mode |
| 6.8 | README: project overview, self-hosted quickstart, SaaS link, architecture diagram, license badge | 2 | Audience: developers discovering repo |
| 6.9 | Apply Vercel OSS program | 1 | vercel.com/oss application |
| 6.10 | Security pass: audit all API routes (auth guard, rate limit, input validation, Stripe sig verification) | 2 | Walk every `/api/` route manually |
| 6.11 | DB performance pass: indexes on `drop_token`, `items(user_id, created_at)`, FTS GIN index. `EXPLAIN ANALYZE` on top 3 queries | 2 | |
| 6.12 | Production launch checklist: env vars verified, Stripe live mode, SendGrid MX records confirmed, Sentry alerts, domain | 1 | Written checklist in repo. Run through manually before beta |
| 6.13 | AI provider abstraction layer: `packages/shared/ai-provider.ts` wraps OpenAI/Anthropic/Gemini behind a common interface. Reads `AI_PROVIDER`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY` from `.env`. Document in CONTRIBUTING.md and self-hosted setup guide. SaaS always uses OpenAI — this is self-hosted config only. | 3 | No consumer-facing UI. Provider selection is purely an operator concern via `.env`. |
| 6.14 | Per-user address migration prep: document the DB migration path from shared inbox (`from`-email lookup) to per-user token routing (`drop+[token]@dropnote.com`). Verify `users.drop_token` index exists. Write migration SQL stub. Confirm SendGrid catch-all wildcard routing will support it when activated. | 2 | "Prepare for v2" task — nothing shipped to users. Goal: next developer can activate per-user routing in ≤ 1 day of work. |

**Sprint 6 Total: 34 points** *(was 29; +5 for tasks 6.13 and 6.14)*

---

## Summary

| Sprint | Theme | Points | End Deliverable |
|---|---|---|---|
| 1 | Foundation & Schema | 25 | Auth working, shared drop address shown, CI green, deployed |
| 2 | Email Ingestion & AI Pipeline | 29 | Real email → item in DB with AI summary and tags (via SendGrid) |
| 3 | Payments & Tier Enforcement | 26 | Free cap enforced, Stripe upgrade flow end-to-end |
| 4 | Dashboard & Item Management | 38 | Full browse (List/Card/Timeline)/filter/search/edit/delete UI |
| 5 | Real-time, Admin & Polish | 28 | Real-time updates, admin panel, mobile-ready |
| 6 | Testing, OSS & Launch | 34 | 60% coverage, E2E green, Docker Compose, AI provider abstraction, v2 migration prep, public repo |
| **Total** | | **180 points** | **v1 shipped** |

---

## V2 Roadmap (confirmed out of scope)

- Per-user unique inbound address (`drop+[token]@dropnote.com`) — DB schema and migration SQL stub prepared in Sprint 6
- SPF/DKIM spoofing validation
- OAuth login (Google, GitHub)
- Multiple emails per account
- Browser extension + mobile share sheet
- AI correction pipeline (user feedback → better tagging)
- Semantic tag matching (embeddings)
- Fixed category taxonomy
- Semantic / vector search
- Search result keyword highlighting
- Search indexing of original email body
- Data export (GDPR Article 20)
- Email notifications (processing done, cap warning)
- Team / shared spaces
- Annual billing
- CAPTCHA on registration
- Virus / malware scanning
- Kafka queue (if scale demands)
- Separate staging environment
- User impersonation in admin
- Bulk restore from trash
- Per-user AI provider selection (consumer-facing UI; `.env` self-hosted config ships in v1 Sprint 6)
