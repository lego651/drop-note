# drop-note — V1 Product Scope (Final)

> Reviewed by: Product Manager + Tech Lead
> Status: Approved for Sprint Planning

## What is drop-note?
A content-saving tool where registered users email anything they find interesting (text, links, files, images) to their personal drop email address. An AI pipeline processes and tags each item. Users browse, search, and manage their saved content via a clean web dashboard.

Open source (AGPL). Revenue model: free tier with limits + paid SaaS tiers. Self-hosted option available.

---

## Target User
General consumers. Anyone who wants to save interesting content without friction — just forward/email it and it's organized automatically.

---

## Core User Flow
1. User registers on the web dashboard
2. User sees the shared inbound address (`drop@dropnote.com`) in the onboarding panel and receives it via welcome email
3. User emails/forwards any content to `drop@dropnote.com` from their registered email address
4. SendGrid Inbound Parse receives the email, POSTs structured data (from, subject, text, html, attachments) to `/api/ingest` on the Next.js app
5. API looks up the user by matching the `from` address against registered users. Unrecognized senders are silently discarded.
6. API checks rate limits, enqueues BullMQ job
7. BullMQ worker (separate Node.js service) processes: AI summary, image description, PDF extraction, tag suggestion
8. Item appears in dashboard in real time (Supabase Realtime subscription)

**Note:** Emails from unregistered addresses are silently discarded. No auto-reply needed.

**v1 inbox model:** Shared address (`drop@dropnote.com`), user identified by `from` email. Per-user unique token addresses (`drop+[token]@dropnote.com`) are a v2 migration target — the DB schema (`users.drop_token uuid unique`) is designed to support this transition without a redesign.

---

## Item Counting Rules
- 1 email body = 1 item
- Each file attachment = 1 additional item
- Links inside email body = treated as text, not separate items
- Example: 1 email + 2 attachments = 3 items total
- Unsupported file types (.zip, .exe): silently dropped, documented in user agreement
- Cap exceeded: entire email rejected (no partial processing), user notified via email

---

## Content Processing (AI Pipeline)
- Email body: extract subject + text, generate AI summary (GPT-4o-mini)
- Images: OpenAI Vision API description to enable image search
- PDFs / docs: extract text capped at 50,000 characters, then summarize
- YouTube / links in body: save raw text link + title and URL metadata only
- File size limits:
  - Free: 10MB per attachment
  - Pro: 25MB per attachment
  - Power: 50MB per attachment
- AI failure: retry 3x with exponential backoff (BullMQ built-in). On total failure: mark item `failed`, surface error in item card.
- SaaS AI provider: OpenAI GPT-4o-mini (internal, users don't choose)
- Self-hosted: configurable via `.env` (OpenAI, Anthropic, Gemini supported, documented)

---

## Tagging System (v1)
- Tags only — no separate category system (categories = v2)
- AI auto-suggests tag names as plain strings
- Deduplication: case-insensitive exact string match — reuse existing tag if match found
- Users can add, edit, delete tags on any item

---

## Tier & Limits

| Tier | Max Stored Items | Max Save Actions/Month | Attachment Size | Price |
|---|---|---|---|---|
| Free | 20 | 30 | 10MB | $0 |
| Pro | 100 | Unlimited | 25MB | $9.99/mo |
| Power | 500 | Unlimited | 50MB | $49.99/mo |

- Monthly billing only (annual billing = v2)
- No free trial of paid tier
- Cancel anytime; access continues until billing period ends
- **Save action**: one item processed by AI pipeline = one action. Deletions do not count.
- Free monthly cap hit: entire email rejected, notification email sent to user
- On downgrade: persistent dashboard banner, uploads blocked until `item_count < free cap`
- **Deletion:**
  - Paid (Pro/Power): soft-delete, 30-day trash recovery. Trashed items don't count against cap. Auto-purge at 30 days. Single-item restore only.
  - Free: hard delete immediately
- Trash view: dedicated sidebar entry. Items in trash are not searchable.

---

## Auth
- Magic link login (no password). Email → click link → logged in.
- Session: 30 days. Remember device: 90 days from last login.
- v1: one email address per account
- Account deletion (self-serve in Settings): hard-deletes all items, files (Supabase Storage), AI outputs, user record. Cancels Stripe subscription. Confirmation email sent. Fulfills GDPR Article 17.

---

## Dashboard & UI

**Stack:** Next.js 14 (App Router) + TypeScript + shadcn/ui + Tailwind
**Style:** Notion-inspired — clean, minimal, high information density
**Theme:** Light / Dark / System — user toggle in nav. Persisted.

### Views (v1)
Three views, toggled via a toolbar switcher. All views share the same filter and sort state.
- **List view** — dense, sortable by date or tag (default view)
- **Card/grid view** — visual grid layout, useful for image-heavy content
- **Timeline view** — items grouped and displayed chronologically by date, with a vertical timeline spine

### Empty State & Onboarding
Full-width panel when 0 items:
1. Drop email address in a large, one-click copyable input
2. "Send yourself a test email" CTA (opens mail client pre-populated)
3. 3-step visual: "Email it → AI tags it → Find it here"

Collapses to persistent mini element in sidebar once user has 1+ items.

### Filtering & Navigation
- All items / filter by tag / filter by date (year → month)
- Prev / next navigation on item detail view

### Search
- Keyword search on: AI summary + tags + user notes
- Postgres FTS (`tsvector` generated column + GIN index)
- Items in trash excluded

### Real-time Updates
- Supabase Realtime subscription on `items` filtered by `user_id`
- New items show skeleton → "Processing…" → final card
- Failed items show error state in card

### Item Detail View
- Email subject, sender, date (user local timezone), AI summary (editable), tags (editable inline), attachments (signed URL links, image preview), user notes (editable, searchable)
- Overwrite only — no edit history

### Additional
- Pin/favorite: pinned items appear at top of list view
- Bulk operations: multi-select → bulk delete or re-tag
- All dates: UTC in DB, displayed in user local timezone

---

## Email Ingestion & Abuse Prevention
- SendGrid Inbound Parse: MX records on domain point to SendGrid. SendGrid parses incoming email and POSTs structured data (from, subject, text, html, attachments) to `/api/ingest`.
- User lookup: match `from` address against `users.email`. Unrecognized senders: silently discard (no reply).
- SaaS cost: free tier covers up to 100 emails/day (sufficient for 50 alpha users). Essentials plan at $19.95/month if needed.
- Self-hosted alternative: any inbound parse webhook provider (Mailgun, Postmark, Cloudflare Email Workers) can be substituted. All options documented. The `/api/ingest` webhook interface is provider-agnostic.
- Attachment delivery: SendGrid sends attachments as base64-encoded fields in the multipart POST. Total payload limit is 20MB — consistent with the 10MB per-attachment free tier limit.
- Block list: email sender addresses + IP addresses, admin-managed CRUD
- Auto-block after 10 spam attempts (Redis counter, 24hr TTL)
- Rate limits: 5 emails/hour (free), 20 emails/hour (Pro/Power). Excess queued, not rejected.

---

## Invite Code System
- First 50 registrations: open (atomic Postgres CTE check)
- After 50: invite code required for all tiers
- Admin generates and revokes codes via admin panel

---

## Admin Panel
- Protected route in same Next.js app (`/admin`, `is_admin` flag on user)
- User list (email, tier, join date, item count, save actions this month)
- Block list management (add/remove email + IP)
- Invite code generation and management
- System stats (items ingested today, AI errors, queue depth)
- Internal monitoring dashboard (API health, error rates)
- Sentry for error monitoring (free tier)
- Admin can manually override `users.tier` for testing

---

## Payments
- Stripe monthly subscriptions
- `users.tier` field is enforcement source of truth, updated by Stripe webhooks
- Stripe Customer Portal for plan changes + cancellation
- Refund policy: no refunds, cancel anytime, access through end of billing cycle
- Build in Sprint 3

---

## Tech Stack

| Layer | Choice |
|---|---|
| Frontend | Next.js 14 + TypeScript + shadcn/ui |
| Database | Supabase (Postgres) |
| File Storage | Supabase Storage |
| Auth | Supabase Auth (magic link) |
| Email Inbound | SendGrid Inbound Parse (MX records on domain, structured webhook POST to `/api/ingest`) |
| Queue | BullMQ + Redis (Upstash/Railway for SaaS) |
| AI Provider | OpenAI GPT-4o-mini (SaaS); `.env` configurable (self-hosted) |
| Email Sending | Resend |
| Payments | Stripe |
| Error Monitoring | Sentry |
| Deployment | Vercel (web app) + Railway (BullMQ worker) |
| Self-hosted | Docker Compose: `web` + `worker` + `redis` |
| Monorepo | pnpm workspaces + Turborepo |

---

## Open Source
- License: AGPL
- GitHub: public repo from v1 launch
- CI: GitHub Actions — lint, typecheck, Vitest unit tests, Playwright E2E, PR preview deploy
- Coverage gate: 60% statement coverage (enforced from Sprint 4 onward)
- CONTRIBUTING.md: Sprint 6
- Public roadmap: GitHub Projects board
- i18n: English only v1, extensible
- Self-hosted email ingest: configure any inbound parse webhook provider via `.env` (SendGrid, Mailgun, Postmark, or Cloudflare Email Workers all documented). No single provider is required — the `/api/ingest` webhook interface is provider-agnostic.

---

## Testing
- Vitest + c8 coverage configured Sprint 1. Tests written per sprint.
- Target: 60% statement coverage
- Playwright scaffolded Sprint 1, expanded Sprint 6
- Sprint 6 E2E critical paths: register → shared drop address displayed → mock ingest (simulated SendGrid POST) → item appears → search → upgrade → admin

---

## Self-Hosted Setup
- Docker Compose + single `.env` file
- Services: Next.js app, BullMQ worker, Redis
- External dependencies: inbound email provider (SendGrid recommended; Mailgun, Postmark, or Cloudflare Email Workers also documented), Supabase cloud or self-hosted, OpenAI API key (or Anthropic/Gemini via `.env`)
- Targeted at technical users

---

## Legal & Compliance
- Terms of Service: AI draft, founder reviews
- Privacy Policy: AI draft, founder reviews (must reflect 30-day erasure SLA)
- GDPR: cookie banner, right to erasure via self-serve account deletion, data export = v2
- Malicious file scanning: v2
- Unsupported file types and size limits documented in user agreement

---

## V2 Roadmap
- Per-user unique inbound address (`drop+[token]@dropnote.com`) replacing shared inbox — DB schema already supports this migration
- SPF/DKIM spoofing validation
- OAuth login (Google, GitHub)
- Multiple emails per account
- Browser extension + mobile share sheet
- AI correction pipeline
- Semantic tag matching (embeddings)
- Fixed category taxonomy
- Semantic / vector search + keyword highlighting
- Search on original email body
- Data export (GDPR Article 20)
- Email notifications
- Team / shared spaces
- Annual billing
- CAPTCHA on registration
- Virus / malware scanning
- Kafka (if scale demands)
- Separate staging environment
- User impersonation in admin
- Bulk restore from trash
- Per-user AI provider selection (consumer-facing UI — self-hosted `.env` config is v1)
