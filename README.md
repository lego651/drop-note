# drop-note — Roadmap & Progress

> **Private repo.** This README is the project's living roadmap and progress tracker — not public docs, not marketing. For engineering conventions see [`CLAUDE.md`](CLAUDE.md); for frozen alpha history see [`docs/archive/alpha/`](docs/archive/alpha/).

**Save anything from anywhere. Find it later.** Email anything to `drop@dropnote.me` → AI summarizes + tags → browse/search/manage from a clean dashboard.

---

## Phase

```
Alpha  ✅ COMPLETE  (closed 2026-05-30)  — all planned functionality shipped, S0–S8
Beta   🔜 PLANNING                        — friend testing for stability; not prod-ready
Prod   ⬜ NOT STARTED                      — hardening begins once beta is stable
```

| Phase | Status | Goal |
|---|---|---|
| **Alpha** | ✅ **Done** | Build the full product end-to-end |
| **Beta** | 🔜 Planning | Stability + real-user feedback from a small invited group |
| **Prod** | ⬜ Later | Production hardening, then open the doors |

---

## Alpha — what shipped ✅

Everything below is **done and live at [dropnote.me](https://dropnote.me)**.

### 1. Foundation & infra ✅
- pnpm + Turborepo monorepo (`apps/web`, `packages/shared`)
- Supabase: 8 tables, RLS on all, `on_auth_user_created` trigger, **20 migrations**
- Vercel deploy + CI gates (lint / typecheck / unit / e2e), **33 test files**
- Env config across Production / Preview / Development scopes

### 2. Auth ✅
- Google OAuth only (no passwords, no magic links)
- Supabase Auth + SSR middleware session handling
- `/login`, `/register`, `/auth/callback`, registration modes (open / invite)

### 3. Email ingestion & AI pipeline ✅
- SendGrid Inbound Parse → `/api/ingest`
- **Synchronous** AI processing inside the route (D11 — no worker/queue)
- OpenAI GPT-4o-mini summarize + auto-tag; provider configurable via `AI_PROVIDER` env
- Retry + error handling; structured per-request logging (`total_handling_ms` / `ai_processing_ms`)

### 4. Dashboard & item management ✅
- Items list, detail (`/items/[id]`), full-text search, tags + bulk-tag
- Pin, archive (`/archive`), soft-delete + trash (`/trash`) + restore, notes
- Optimistic updates throughout (pin/filter/archive)

### 5. Digest & outbound email ✅
- Resend transactional email
- Vercel Cron: weekly digest (Mon 09:00 UTC) + trash purge (daily 03:00 UTC)
- Verified domain (`dropnote.me`) — DKIM / SPF / MX live

### 6. Payments scaffolding ✅ (disabled)
- Stripe checkout / portal / webhook routes built, null-checked, **dormant**
- Tier enforcement + `usage_log` monthly cap plumbing in place
- Paid tiers killed (D1) — reactivate single $4.99/mo hosted tier only at 100+ active users

### 7. Admin & abuse controls ✅
- Admin panel: users + tier, block list, invite codes, stats, site settings
- Upstash Redis rate limiting / abuse / save-limit counters
- Account self-delete (`/api/account/delete`)

### 8. UI redesign, brand & content ✅
- Token-driven design system → [`docs/STYLE_GUIDE.md`](docs/STYLE_GUIDE.md)
- Redesigned landing, login, items, settings (5-tab); onboarding (welcome modal + empty state)
- Real-time dashboard updates via Supabase Realtime
- Legal: `/privacy`, `/terms`, `/aup`; `/roadmap`, blog, OG image route
- Positioning pivot → "save anything from anywhere"

---

## Beta — planning 🔜

> To be fleshed out. Goal: invite a small group of friends, watch for stability issues, fix what breaks. **No new features unless beta feedback demands it.**

| Area | Idea | Status |
|---|---|---|
| Invite friends | Hand out access to ~5–10 testers | ⬜ TBD |
| Stability watch | Monitor `/api/ingest` p95, Vercel runtime errors, Sentry | ⬜ TBD |
| Feedback loop | Lightweight channel to collect bugs / friction | ⬜ TBD |
| Deliverability | Confirm digest + ingest render across Gmail / Outlook / ProtonMail | ⬜ TBD |
| _…_ | _to plan together_ | ⬜ |

---

## Stack (snapshot)

| Layer | Choice |
|---|---|
| Frontend | Next.js 14 App Router + TypeScript + shadcn/ui + Tailwind |
| DB / Auth / Storage | Supabase (Postgres + RLS, Google OAuth) |
| Email in / out | SendGrid Inbound Parse / Resend |
| AI | OpenAI GPT-4o-mini (synchronous in `/api/ingest`) |
| Queue | None — sync AI; Upstash Redis for rate limiting |
| Payments | Stripe (dormant) |
| Deploy | Vercel (auto-deploy on push to `main`) |

---

## Where things live

| | |
|---|---|
| Engineering conventions, schema, commands | [`CLAUDE.md`](CLAUDE.md) (+ [`apps/web/CLAUDE.md`](apps/web/CLAUDE.md)) |
| UI styling standard | [`docs/STYLE_GUIDE.md`](docs/STYLE_GUIDE.md) |
| OAuth / Supabase setup | [`docs/google-oauth-setup.md`](docs/google-oauth-setup.md) |
| Email pipeline architecture | [`docs/architecture/email-pipeline.md`](docs/architecture/email-pipeline.md) |
| Frozen alpha history | [`docs/archive/alpha/`](docs/archive/alpha/) — read-only, never maintained |
