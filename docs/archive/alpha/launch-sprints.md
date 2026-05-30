# drop-note Launch Sprints

Breakdown of the weekend launch plan into actionable tickets.
Reference: `docs/weekend-launch-plan.md`

**Tech-lead reviewed April 10, 2026.** Key findings integrated below. See Appendix for full review.

---

## Sprint L1: Repo Hygiene & Open-Source Readiness (Saturday AM, Weekend 1)

**Goal:** Make the repo safe and professional for public visibility.

| # | Ticket | Description | Est |
|---|--------|-------------|-----|
| L1.1 | Gitignore internal files | Add `.claude/`, `findings.md`, `progress.md`, `task_plan.md` to `.gitignore`. Remove any tracked versions from git history if already committed. | S |
| L1.2 | Sanitize or gitignore CLAUDE.md | Review `CLAUDE.md` — if it contains internal project context not suitable for public, add to `.gitignore`. If useful for contributors, sanitize. | S |
| L1.3 | Replace TODO-ORG with lego651 | Find all instances of `TODO-ORG` in README.md, CONTRIBUTING.md, badges, clone URLs. Replace with `lego651`. Verify badge URLs resolve. | S |
| L1.4 | Remove personal emails from docs | Replace `jasonusca@gmail.com` and `legogao651@gmail.com` in `docs/launch-checklist.md`, `docs/v1-scope.md`, `docs/architecture/email-pipeline.md` with `your-email@example.com`. | S |
| L1.5 | Sanitize docs/next-plan.md | Remove personal strategy notes, competitor cost breakdowns, "4 other active projects" references, revenue projections. Keep competitive analysis if generalized. Either sanitize or move to a private location and gitignore. | S |
| L1.6 | Update Privacy Policy data controller | In `/apps/web/app/privacy/page.tsx` (or wherever the privacy policy lives), replace "the operator of this service" with "Jason Gao". | S |
| L1.7 | Update Terms GitHub URL | Terms reference `github.com/drop-note/drop-note` — update to `github.com/lego651/drop-note`. | S |
| L1.8 | Complete worker .env.example | Expand `apps/worker/.env.example` to include all vars from the root `.env.example` that the worker needs: `AI_PROVIDER`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `RESEND_*`, `SENDGRID_*`. Add comments matching root format. | S |
| L1.9 | Add GitHub issue templates | Create `.github/ISSUE_TEMPLATE/bug_report.yml`, `feature_request.yml`, `platform_request.yml` (for "Request a Platform" voting). Add `.github/PULL_REQUEST_TEMPLATE.md`. | M |
| L1.10 | Add root package.json metadata | Add `repository`, `homepage`, `bugs` fields to root `package.json` pointing to `github.com/lego651/drop-note`. | S |

**Size key:** S = <30 min, M = 30-60 min, L = 1-2 hrs, XL = 2+ hrs

---

## Sprint L2: Code Hardening & Feature Gating (Saturday PM, Weekend 1)

**Goal:** Fix critical bugs, disable Stripe, implement free-tier limits.

**Tech-lead findings:**
- L2.1 and L2.2 are **already done** — `packages/shared/src/ai-provider.ts` has `response.ok` checks and `AbortSignal.timeout(30_000)` on all providers. Closed.
- L2.3 is narrower than described — BullMQ retries exist, but non-retryable errors (401) burn all retry attempts. Fix is in `apps/worker/src/processors/email.ts` ~line 73.
- L2.4 order matters: **must be done before L2.5**. The Stripe Proxy singleton is safe on import, but three route handlers will crash when calling Stripe methods with no key. Fix the routes, not the singleton.
- L2.6 has a **hidden second cap**: `SAVE_ACTIONS_FREE_LIMIT = 18` in `packages/shared/src/tier.ts` line 18. Must decide on this too.

| # | Ticket | Description | Est |
|---|--------|-------------|-----|
| ~~L2.1~~ | ~~AI error handling — response.ok~~ | **ALREADY DONE.** `packages/shared/src/ai-provider.ts` has `response.ok` checks on all providers. | - |
| ~~L2.2~~ | ~~AI error handling — timeout~~ | **ALREADY DONE.** `AbortSignal.timeout(30_000)` on all fetch calls in `ai-provider.ts`. | - |
| L2.3 | AI retry — non-retryable short-circuit | In `apps/worker/src/processors/email.ts` ~line 73: check `(err as any).retryable === false` before rethrowing. A 401 (bad API key) should immediately mark the item failed, not burn all 3 BullMQ retries. | M |
| L2.4 | Stripe route null-checks (DO FIRST) | Add early return to three routes when `STRIPE_SECRET_KEY` is missing: `apps/web/app/api/stripe/checkout/route.ts`, `apps/web/app/api/stripe/portal/route.ts`, `apps/web/app/api/webhooks/stripe/route.ts` (critical — line 32 calls `stripe.webhooks.constructEvent` immediately). Return `{ error: 'Payments not configured' }` with status 503. The singleton in `lib/stripe.ts` is already safe — don't change it. | L |
| L2.5 | Disable Stripe upgrade UI | Hide or replace the upgrade/pricing buttons in the dashboard. Show "Coming soon" or remove the pricing page link from navigation. Ensure no dead links remain. **Must be done after L2.4.** | M |
| L2.6 | Raise free-tier item limit to 50 | In `packages/shared/src/tier.ts`: change `TIER_ITEM_LIMITS.free` from 20 to 50 (line 5). | S |
| L2.6b | Raise or remove SAVE_ACTIONS_FREE_LIMIT | **Hidden second cap.** `SAVE_ACTIONS_FREE_LIMIT = 18` in `packages/shared/src/tier.ts` line 18 is a separate monthly save-action counter. An email with multiple attachments consumes multiple save actions. Raise to 50 or remove for launch — a user hitting 18 save actions before 50 items is confusing. Requires shared package rebuild. | M |
| L2.7 | Add limit warning banner (40/50) | When a user has 40+ items (of 50), show a non-intrusive banner on the dashboard: "You've used 40 of 50 free saves. Want more? Email us at [contact email]." Dismiss-able, but reappears on next session. | M |
| L2.8 | Add limit reached banner (50/50) | When a user hits 50 items, show a persistent banner: "You've reached the free limit. Email us at [contact email] to discuss upgrading." Prevent further saves via the ingest API (return 403 with clear error message). | M |
| L2.9 | Add Supported Platforms page | Create a new page or section on the landing/dashboard showing the supported platforms table (Email, YouTube, Any URL as Basic, PDF, Image, Text). For "Not yet" platforms, each row links to its GitHub issue (platform_request template). Include a header explaining how to request new platforms. | L |

---

## Sprint L3: Onboarding, Analytics & README (Sunday, Weekend 1)

**Goal:** Build new-user experience, instrument analytics, rewrite README.

**Tech-lead findings:**
- The dashboard renders via `apps/web/app/(dashboard)/items/page.tsx` → `ItemsPageClient.tsx`. No empty state exists.
- `DROP_ADDRESS` env var exists but is NOT exposed to the client. Need a new `NEXT_PUBLIC_DROP_ADDRESS` env var so onboarding UI can display it. This is a prerequisite for L3.1 and L3.2.
- L3.9 (GHCR CI): pin pnpm version in workflow (copy pattern from ci.yml `pnpm/action-setup@v4`).
- Missing: PostHog env vars not added to web `.env.example`.

| # | Ticket | Description | Est |
|---|--------|-------------|-----|
| L3.0 | Add NEXT_PUBLIC_DROP_ADDRESS env var | Create `NEXT_PUBLIC_DROP_ADDRESS` env var. Add to `.env.example` (web). Set in Vercel env vars. Use placeholder value until domain is live. This unblocks L3.1 and L3.2. | S |
| L3.1 | New-user welcome modal | On first login (no items saved), show a welcome modal: "Welcome to drop-note! Forward any email to `[NEXT_PUBLIC_DROP_ADDRESS]` and it'll appear here. Try it now — send yourself a test email." Include a "Got it" dismiss button. Store dismiss state in localStorage. Modify `ItemsPageClient.tsx`. | L |
| L3.2 | Empty dashboard state | In `ItemsPageClient.tsx`, when `items.length === 0` and welcome modal is dismissed, show a helpful empty state: prominently display the drop email address, 3-step quick start guide, and a "Did your item arrive?" helper ("Usually arrives within 2 minutes. Nothing? Check FAQ"). | L |
| L3.3 | "Did your item arrive?" helper | On the empty state, after the user has been shown the drop address, add a helper: "Sent your first email? It usually arrives within 2 minutes. Nothing yet? Check our FAQ." Link to a simple troubleshooting section (check spam, verify address, try different email provider). | M |
| L3.4 | Install and configure PostHog | Install `posthog-js`. Create a PostHog provider component. Add `NEXT_PUBLIC_POSTHOG_KEY` and `NEXT_PUBLIC_POSTHOG_HOST` to **web app's** `.env.example` (not just root). Configure cookieless mode (no GDPR banner needed). Wrap the app with the provider. | M |
| L3.5 | Instrument PostHog events | Add tracking calls for the full event taxonomy: `user_signed_up`, `item_saved` (with `source_type` property), `item_opened`, `dashboard_viewed`, `session_returned`, `email_forwarding_first`, `item_searched`, `item_pinned`, `item_deleted`, `limit_warning_shown`, `limit_reached`, `view_mode_changed`, `self_host_docs_viewed`. | L |
| L3.6 | Dashboard screenshot for README | Take a clean screenshot of the dashboard with 5-8 sample items (mix of email, YouTube, URL, PDF). Save to `docs/images/dashboard.png`. Ensure it looks good at README width (~800px). | S |
| L3.7 | Record demo GIF/video | Record a 30-60 second screen recording: send an email → watch it appear on the dashboard → show the AI summary and tags. Convert to GIF or upload to YouTube. | M |
| L3.8 | Rewrite README | Lead with Omnivore angle: "Omnivore shut down. drop-note is the open-source alternative." Add dashboard screenshot, demo video/GIF, Supported Platforms table, Self-Hosted vs Hosted section, correct badges (license, CI, deploy). Remove link to `docs/next-plan.md`. Keep architecture diagram and tech stack table. | XL |
| L3.9 | Add GHCR to CI workflow | Add a GitHub Actions job to `.github/workflows/ci.yml` (or a new `release.yml`) that builds and pushes Docker images to `ghcr.io/lego651/drop-note-web` and `ghcr.io/lego651/drop-note-worker` on push to main. Tag with `latest` and git SHA. | L |
| L3.10 | Update docker-compose for GHCR | Update `docker-compose.yml` to pull from `ghcr.io/lego651/drop-note-web:latest` and `ghcr.io/lego651/drop-note-worker:latest` instead of building locally. Keep `docker-compose.dev.yml` (or a build override) for local development. | M |

---

## Sprint L4: Infrastructure & Email Pipeline (Can start Weekend 1, finish Weekend 2)

**Goal:** Domain, DNS, SendGrid, end-to-end email verification.

**Tech-lead findings:**
- L4.2 is purely ops — the ingest route at `apps/web/app/api/ingest/route.ts` is already a fully-implemented SendGrid inbound parse handler (auth via `?key=` query param, multipart parsing, attachment handling, BullMQ enqueue). No code changes needed.
- CI E2E tests require Stripe secrets. When repo goes public, first community PR will see failing CI. Need a ticket to handle this.

| # | Ticket | Description | Est |
|---|--------|-------------|-----|
| L4.1 | Configure domain DNS on Vercel | After Jason buys domain: add custom domain to Vercel project. Configure DNS records (A/CNAME). Verify SSL provisioning. Update `APP_URL` env var on Vercel. | M |
| L4.2 | Configure SendGrid inbound parse (ops only) | **No code changes needed** — ingest route already exists and is fully implemented. Ops tasks: set up SendGrid Inbound Parse in their dashboard, add MX records to domain DNS, configure webhook URL to `https://[domain]/api/ingest?key=[CRON_SECRET]`, verify MX propagation. | L |
| L4.3 | Set up drop email address | Determine the drop address format (e.g., `drop@domain`). Configure in SendGrid. Update `DROP_ADDRESS` env var in Vercel and `.env.example`. Update all references in code, README, onboarding modal, empty state. | M |
| L4.4 | Email deliverability test — Gmail | Send a test email from Gmail to the drop address. Verify it arrives, gets processed by AI, and appears on the dashboard. Document any issues. | M |
| L4.5 | Email deliverability test — Outlook | Same test from Outlook/Hotmail. Verify processing. Document any formatting differences. | S |
| L4.6 | Email deliverability test — ProtonMail | Same test from ProtonMail. Verify processing. Note: ProtonMail may encrypt content differently. | S |
| L4.7 | Email deliverability test — content types | Test each supported content type end-to-end: (a) plain text email, (b) HTML email, (c) email with YouTube URL, (d) email with generic URL, (e) email with PDF attachment, (f) email with image attachment, (g) email with text attachment. Verify each produces correct source_type and AI summary. | L |
| L4.8 | Set up Google Search Console | Add and verify domain in Google Search Console. Submit sitemap if one exists. This is for tracking organic traffic post-launch. | S |
| L4.9 | Verify Docker Compose from clean clone | On a separate machine or fresh directory: `git clone`, copy `.env.example` to `.env`, fill in required vars, run `docker compose up`. Verify web app loads, worker processes, Redis connects. Document any issues. | L |
| L4.10 | Remove Make.com dev workaround | If Make.com Gmail polling is still configured as a dev workaround, remove or disable it. The production path should be SendGrid only. Clean up any references. | S |
| L4.11 | Configure CI secrets for public repo | E2E tests in CI require `STRIPE_TEST_SECRET_KEY`, `STRIPE_TEST_WEBHOOK_SECRET`, and E2E user credentials as GitHub repo secrets. When repo goes public, community PRs will see failing E2E without these. Options: (a) configure the secrets so E2E passes, (b) skip E2E on external PRs (`if: github.event.pull_request.head.repo.full_name == github.repository`), or (c) remove Stripe dependency from E2E for now. Recommend option (b). | M |

---

## Sprint L5: Launch Content & Go-Live (Weekend 2)

**Goal:** Write all launch content, final checks, launch, monitor.

| # | Ticket | Description | Est |
|---|--------|-------------|-----|
| L5.1 | Community seeding — Omnivore threads | Find 3-5 active threads where ex-Omnivore users are asking for alternatives (Reddit, GitHub Omnivore repo discussions). Post helpful, non-promotional comments. Build presence before launch day. | M |
| L5.2 | Community seeding — r/selfhosted | Find 2-3 active threads in r/selfhosted about read-later, bookmarking, or note-saving tools. Post helpful comments. Don't self-promote yet. | S |
| L5.3 | Write r/selfhosted launch post | Write the full post using the founder-story template from the launch plan. Lead with "Omnivore shut down..." story. Include platforms table, self-hosting instructions, links. | L |
| L5.4 | Write HN Show HN submission | Title: "Show HN: I rebuilt Omnivore as an open-source self-hosted tool after it shut down". Write concise body text (HN prefers brevity). | M |
| L5.5 | Write Twitter launch thread | 5-7 tweet thread: problem → what I built → demo GIF → Omnivore angle → self-hosting → GitHub link → ask for feedback. | M |
| L5.6 | Write SEO blog post | Title: "Open-Source Omnivore Alternative — Self-Hostable Read-Later with AI". 600 words. Include target keyword phrase, GitHub link, demo screenshot. Publish as a page on the drop-note site (or dev.to / hashnode if no blog setup). | L |
| L5.7 | Final smoke test — full flow | Complete end-to-end test: sign up as new user → see onboarding → send email → verify arrival → check AI summary → search → pin → check PostHog events firing. On both desktop and mobile. | L |
| L5.8 | Verify hotfix deploy process | Push a trivial change (comment or whitespace), verify Vercel auto-deploys within 2-3 minutes. Confirm you can ship emergency fixes on launch day. | S |
| L5.9 | Make repo public + launch | Make GitHub repo public. Submit HN Show HN at ~10am EST. Post to r/selfhosted. Post in Omnivore community threads. Post Twitter thread. | M |
| L5.10 | Launch day monitoring | Block full day. Monitor: PostHog real-time dashboard, GitHub issues/stars, Reddit comments, HN comments. Respond to everything within 2 hours. Ship hotfixes if bugs found. | XL |
| L5.11 | Post-launch day 2-3 posts | Post to r/DataHoarder (day 2). Post to lobste.rs (day 3). Post to IndieHackers (day 4-5). Publish SEO blog post if not done yet. | M |
| L5.12 | Write IndieHackers post | "I shipped my first open-source product — here's what I learned." Retrospective format: what went well, what surprised me, metrics so far. | M |

---

## Sprint Summary

| Sprint | Focus | Tickets | Weekend |
|--------|-------|---------|---------|
| **L1** | Repo hygiene & open-source readiness | 10 | Weekend 1 (Sat AM) |
| **L2** | Code hardening & feature gating | 8 active (2 closed — already done) | Weekend 1 (Sat PM) |
| **L3** | Onboarding, analytics & README | 11 | Weekend 1 (Sun) |
| **L4** | Infrastructure & email pipeline | 11 | Weekend 1 (Sun) + Weekend 2 |
| **L5** | Launch content & go-live | 12 | Weekend 2 |

**Total: 52 active tickets across 5 sprints. 2 tickets closed (AI error handling already implemented).**

**Critical path:**
- L4.1-L4.3 (domain/DNS/email) blocks L5.3-L5.9 (launch posts need live URL)
- L3.0 (`NEXT_PUBLIC_DROP_ADDRESS`) blocks L3.1-L3.2 (onboarding needs the address). Can use placeholder until domain is live.
- **L2.4 must be done BEFORE L2.5** (Stripe route null-checks before hiding UI)

**Parallel work:** L1 and L2 have no domain dependency — start immediately. L3.4-L3.5 (PostHog) and L3.8 (README) can use placeholder domain, update when live.

**Dependency graph:**
```
L1 (repo hygiene) ──────────────────────────────> L5.9 (make repo public)
L2.4 (Stripe null-checks) ──> L2.5 (Stripe UI)
L2.6 + L2.6b (limits) ──> L2.7/L2.8 (banners)
L3.0 (drop address env) ──> L3.1/L3.2 (onboarding)
L4.1 (domain DNS) ──> L4.2 (SendGrid MX) ──> L4.3 (drop address) ──> L4.4-L4.7 (tests)
L3.8 (README) + L4.7 (content type tests) + L5.1-L5.2 (seeding) ──> L5.9 (launch)
```

---

## Appendix: Tech-Lead Review Summary (April 10, 2026)

**Tickets closed (already implemented):**
- L2.1 (AI response.ok) — `packages/shared/src/ai-provider.ts` has checks on all providers
- L2.2 (AI timeout) — `AbortSignal.timeout(30_000)` on all fetch calls

**Tickets with corrected scope:**
- L2.3 — Narrower: fix is only in `apps/worker/src/processors/email.ts` ~line 73 (check `.retryable` flag)
- L2.4 — Fix three route handlers, not the singleton. Webhook route (`line 32`) is the critical one.
- L2.6 — Hidden second cap: `SAVE_ACTIONS_FREE_LIMIT = 18` needs to be raised too (added L2.6b)
- L4.2 — Ops only, no code changes. Ingest route is fully implemented.

**Missing tickets added:**
- L2.6b — Raise `SAVE_ACTIONS_FREE_LIMIT` (hidden second cap)
- L3.0 — Add `NEXT_PUBLIC_DROP_ADDRESS` env var (blocks onboarding)
- L4.11 — Configure CI secrets for external PRs

**Dependency correction:**
- L2.4 must be done BEFORE L2.5 (null-check routes before hiding UI)

**Key files identified:**
- AI provider: `packages/shared/src/ai-provider.ts`
- Worker retry logic: `apps/worker/src/processors/email.ts` ~line 73
- Stripe singleton: `apps/web/lib/stripe.ts` (safe, don't modify)
- Stripe routes: `apps/web/app/api/stripe/checkout/route.ts`, `portal/route.ts`, `webhooks/stripe/route.ts`
- Tier limits: `packages/shared/src/tier.ts` (lines 5 and 18)
- Dashboard component: `apps/web/components/items/ItemsPageClient.tsx`
- Ingest route: `apps/web/app/api/ingest/route.ts` (fully implemented)

---

*Sprints created April 10, 2026. Tech-lead reviewed and approved with corrections above.*
