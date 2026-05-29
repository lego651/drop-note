# Jose Brief — Phases 2–5 (s8/og-logout, s8/onboarding-copy, s8/readme-selfhost, s8/roadmap-page)

**Repo:** `lego651/drop-note` (monorepo, pnpm workspaces)
**Base branch:** `main` (currently at `06d8bdd` — PR #5 merged)
**Commit prefix:** `[s8]`

These are 4 independent workstreams. Run them in parallel across branches. Ship each as its own PR.

---

## MANDATORY PROCESS RULES

1. **TDD:** Write test file first. See red. Write implementation. See green. Every new component / route / lib function must have a corresponding `*.test.ts` or `*.test.tsx`.
2. **Verification evidence:** Attach when submitting each PR: curl screenshot or test output. UI changes need a screenshot or Playwright screenshot.
3. **No error swallowing:** No `try { ... } catch (e) { console.error(e) }` that eats errors silently. Throw up — let callers handle.
4. **TypeScript strict:** No `as any` outside tests. Narrow properly.
5. **Semantic Tailwind tokens only:** `bg-background`, `text-muted-foreground`, etc. Never raw color classes.

---

## Phase 2 — OG meta tags + logout → landing redirect

**Branch:** `s8/og-and-logout`
**PR title:** `[s8] feat: OG meta tags + logout redirect to landing`

### 2a. OG / social meta tags

**Goal:** When someone shares dropnote.me on Twitter, HN, Slack, LinkedIn — a card appears with title, description, and image.

**Files to touch:**

1. `apps/web/app/layout.tsx` — update the root `metadata` export:
   ```typescript
   export const metadata: Metadata = {
     title: 'drop-note',
     description: 'Save anything from anywhere. AI summarizes and tags it — everything lands in one searchable dashboard.',
     metadataBase: new URL('https://dropnote.me'),
     openGraph: {
       title: 'drop-note — Save anything from anywhere',
       description: 'Share from any app. Email from any device. AI summarizes and tags it automatically.',
       url: 'https://dropnote.me',
       siteName: 'drop-note',
       images: [{ url: '/og.png', width: 1200, height: 630, alt: 'drop-note' }],
       type: 'website',
     },
     twitter: {
       card: 'summary_large_image',
       title: 'drop-note — Save anything from anywhere',
       description: 'Share from any app. Email from any device. AI summarizes and tags it automatically.',
       images: ['/og.png'],
     },
   }
   ```

2. `apps/web/app/blog/open-source-omnivore-alternative/page.tsx` — add page-level metadata override:
   ```typescript
   export const metadata: Metadata = {
     title: 'Open-Source Omnivore Alternative — drop-note',
     description: 'Omnivore was shut down. drop-note is a free, self-hostable replacement built with Next.js, Supabase, and OpenAI.',
     openGraph: {
       title: 'Open-Source Omnivore Alternative — drop-note',
       description: 'Omnivore was shut down. drop-note is a free, self-hostable replacement.',
       url: 'https://dropnote.me/blog/open-source-omnivore-alternative',
       images: [{ url: '/og.png', width: 1200, height: 630, alt: 'drop-note' }],
     },
     twitter: {
       card: 'summary_large_image',
       title: 'Open-Source Omnivore Alternative — drop-note',
       description: 'Omnivore was shut down. drop-note is a free, self-hostable replacement.',
       images: ['/og.png'],
     },
   }
   ```

3. `apps/web/public/og.png` — generate a static 1200×630 OG image. Use `@vercel/og` to generate it as an `ImageResponse` at `/api/og/route.ts`, OR generate a static PNG and commit it. **Simplest path: generate a static PNG programmatically using `@vercel/og` as a one-shot script, or use a simple canvas approach.** The image should show:
   - Dark background (#0f0f0f or similar)
   - `drop-note` in large white text (top)
   - `Save anything from anywhere` as subtitle
   - `dropnote.me` at the bottom right in small gray text
   - Keep it simple — no complex graphics

   **Preferred: implement as `/api/og/route.ts` (ImageResponse) for dynamic generation, and update the og:image URL to `/api/og` in metadata.** `@vercel/og` is already a Vercel/Next.js primitive — check if `next/og` is available (it is in Next.js 13.3+). Do NOT use `npm install @vercel/og` — use `import { ImageResponse } from 'next/og'` which is built-in.

   Route file: `apps/web/app/api/og/route.ts`
   ```typescript
   import { ImageResponse } from 'next/og'
   import type { NextRequest } from 'next/server'

   export const runtime = 'edge'

   export function GET(_req: NextRequest) {
     return new ImageResponse(
       (
         <div
           style={{
             background: '#0f0f0f',
             width: '100%',
             height: '100%',
             display: 'flex',
             flexDirection: 'column',
             alignItems: 'flex-start',
             justifyContent: 'center',
             padding: '80px',
             fontFamily: 'sans-serif',
           }}
         >
           <div style={{ color: '#ffffff', fontSize: 72, fontWeight: 700, letterSpacing: -2 }}>
             drop-note
           </div>
           <div style={{ color: '#a0a0a0', fontSize: 32, marginTop: 16 }}>
             Save anything from anywhere
           </div>
           <div style={{ color: '#555555', fontSize: 20, marginTop: 'auto' }}>
             dropnote.me
           </div>
         </div>
       ),
       { width: 1200, height: 630 }
     )
   }
   ```

   Update metadata `images` to use `'/api/og'` instead of `'/og.png'`.

### 2b. Logout → landing redirect

**Problem:** `apps/web/components/layout/sidebar.tsx` line ~90:
```typescript
async function handleSignOut() {
  const supabase = createClient()
  const { error } = await supabase.auth.signOut()
  if (error) {
    setSignOutError('Sign out failed. Please try again.')
    return
  }
  router.refresh()
  router.push('/login')   // ← WRONG: dumps user at /login, not the marketing landing page
}
```

Fix: change `router.push('/login')` to `router.push('/')`. After logout, users should land on the public marketing page (`/`), which is now the landing page (PR #5). `/login` still exists but it's not the right UX destination post-logout.

Same fix applies to `apps/web/components/layout/MobileSidebar.tsx` if it has its own signOut handler — grep for `router.push('/login')` across layout components and fix all occurrences.

**Test:** Write `apps/web/components/layout/__tests__/sidebar-signout.test.tsx` — mock Supabase `auth.signOut()`, confirm that on success `router.push` is called with `'/'` not `'/login'`.

### Acceptance criteria for Phase 2:
1. `pnpm turbo lint && pnpm turbo typecheck && pnpm --filter @drop-note/web build` passes
2. `pnpm test` green — new sidebar signout test passes
3. `/api/og` returns 200 with `content-type: image/png` (curl evidence)
4. `<meta property="og:image">` present in `/` HTML (curl or test evidence)
5. Logout redirects to `/` not `/login` — confirmed in test

---

## Phase 3 — Onboarding copy alignment

**Branch:** `s8/onboarding-copy` (or piggyback on `s8/og-and-logout` if Phase 2 isn't merged yet — separate commit)
**PR title:** `[s8] feat: onboarding copy — universal capture framing`

**Context:** PR #3 (merged `af585e01`) ships the WelcomeModal and empty state. The copy currently says "Email anything to your drop address" as the primary action. Since the positioning pivot (PR #5 `dfaae40`), the hero is "Save anything from anywhere" — share sheet OR email. The onboarding copy should reflect this.

**Files to update:**

1. `apps/web/components/dashboard/WelcomeModal.tsx`
   - Step 1 label: change from `"Email anything to your drop address"` → `"Send anything to your drop address"`
   - Body text under step 1: add `"Email it directly, or use your phone's share sheet from any app."`
   - Keep the drop address display as-is (`drop@dropnote.me`)
   - Mailto CTA stays — it's still the primary path

2. `apps/web/components/items/ItemsPageClient.tsx` (empty state section)
   - Step 1 pill: `"Email it"` → `"Send it"` (or `"Share or email it"` — your judgment)
   - Step 1 description: add mention of share sheet: `"Email or share from any app to drop@dropnote.me"`
   - Keep the 3-step pill structure and the mailto CTA

**Tests:** Update the existing tests to match new copy strings. No new test files needed — just update assertions in:
- `apps/web/components/dashboard/__tests__/WelcomeModal.test.tsx`
- `apps/web/components/items/__tests__/ItemsPageClient.empty-state.test.tsx`

**Acceptance criteria:**
1. Lint/typecheck/build pass
2. All existing tests pass with updated copy assertions
3. WelcomeModal step 1 no longer says "Email anything" as the exclusive framing

---

## Phase 4 — README self-host guide

**Branch:** `s8/readme-selfhost`
**PR title:** `[s8] docs: complete self-host guide in README`

**Context:** The current `README.md` has stale content:
- Line 8: CI badge points to `TODO-ORG` — fix to `lego651`
- Line 14: mentions $9.99 Pro and $49.99 Power tiers (D1 KILLED THESE — fix to "Free hosted, always. Self-host for free.")
- Line 83: Auth row says "magic link — no passwords" — WRONG. Auth is Google OAuth only (D-decision). Fix to `Supabase Auth (Google OAuth only)`
- Line 88: Payments row says "Stripe" — Stripe is disabled. Change to `Stripe (disabled at launch — reactivated at 100 active users)`
- Self-host quickstart (lines 30-52) is too thin — needs a full Prerequisites section

**Rewrite README.md.** Preserve the structure but fix everything:

1. Fix CI badge org: `TODO-ORG` → `lego651`
2. Hero tagline: keep `"Email anything. Find it later."` OR update to match positioning pivot: `"Save anything from anywhere. Find it later."` — your call
3. Description paragraph: fix `"Free tier available. Pro ($9.99/mo) and Power ($49.99/mo) plans..."` → `"Free. Open source (AGPL-3.0). Self-hostable."`
4. Tech stack table: fix Auth row + Payments row
5. Self-host section: expand to a proper guide:

```markdown
## Self-hosting

### Prerequisites

| Service | Why | Free tier? |
|---|---|---|
| [Supabase](https://supabase.com) | Postgres database + auth + storage | Yes |
| [SendGrid](https://sendgrid.com) | Inbound Parse for email → webhook | Yes (100 emails/day) |
| [Resend](https://resend.com) | Outbound transactional email | Yes (3,000/mo) |
| [OpenAI](https://platform.openai.com) | GPT-4o-mini summarization + tagging | Pay-per-use (~$0.01/100 items) |
| [Vercel](https://vercel.com) | Hosting the Next.js dashboard | Yes (Hobby plan) |

### Deploy in 10 minutes

**1. Clone and install**
\`\`\`bash
git clone https://github.com/lego651/drop-note.git
cd drop-note
pnpm install
\`\`\`

**2. Create a Supabase project**

Go to [supabase.com](https://supabase.com), create a new project, and copy:
- Project URL → `NEXT_PUBLIC_SUPABASE_URL`
- Anon key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Service role key → `SUPABASE_SERVICE_ROLE_KEY`

**3. Apply the database schema**
\`\`\`bash
npx supabase link --project-ref <your-project-ref>
npx supabase db push --linked
\`\`\`

**4. Configure Google OAuth**

In [Google Cloud Console](https://console.cloud.google.com):
- Create an OAuth 2.0 Client ID (Web Application)
- Add `https://<your-domain>/auth/callback` as an authorized redirect URI

In Supabase Dashboard → Authentication → Providers → Google:
- Paste your Client ID and Client Secret

**5. Configure SendGrid Inbound Parse**

- Add your domain's MX record: `MX @ → mx.sendgrid.net` (priority 10)
- In SendGrid Dashboard → Inbound Parse: set Host = your domain, URL = `https://<your-domain>/api/ingest?key=<SENDGRID_WEBHOOK_SECRET>`
- Set `SENDGRID_WEBHOOK_SECRET` env var (any random string)

**6. Configure Resend (outbound email)**

- Create a [Resend](https://resend.com) account and add your domain
- Copy the API key → `RESEND_API_KEY`
- Set `RESEND_FROM_EMAIL` = `hello@<your-domain>`

**7. Set environment variables**

Copy `apps/web/.env.example` to `apps/web/.env.local` and fill in all values:

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key |
| `OPENAI_API_KEY` | OpenAI API key (GPT-4o-mini) |
| `RESEND_API_KEY` | Resend API key |
| `RESEND_FROM_EMAIL` | From address (e.g. `hello@yourdomain.com`) |
| `SENDGRID_WEBHOOK_SECRET` | Random secret for webhook auth |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis URL (rate limiting) |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis token |
| `CRON_SECRET` | Random secret for cron job auth |
| `NEXT_PUBLIC_APP_URL` | Your deployment URL |

**8. Deploy to Vercel**
\`\`\`bash
vercel --prod
\`\`\`

Or connect your GitHub repo to Vercel for automatic deploys.

### Self-host vs hosted

| | Self-hosted | Hosted (dropnote.me) |
|---|---|---|
| Cost | Your infra costs | Free |
| Data location | Your Supabase | Supabase (US) |
| Updates | Manual pull + redeploy | Automatic |
| Item limit | Configurable | 50 items (free tier) |
| License | AGPL-3.0 | AGPL-3.0 |
```

**No new tests needed** — this is docs-only (README.md). Just make sure `pnpm turbo lint && pnpm turbo typecheck` still pass (no code changed).

**Acceptance criteria:**
1. Lint/typecheck pass (no code changed — docs only)
2. CI badge URL uses `lego651` not `TODO-ORG`
3. No mention of $9.99 Pro or $49.99 Power tiers
4. Auth row says "Google OAuth only"
5. Self-host section has Prerequisites table + step-by-step guide

---

## Phase 5 — Public `/roadmap` page

**Branch:** `s8/roadmap-page`
**PR title:** `[s8] feat: public /roadmap page`

**Goal:** A static, public page at `/roadmap` showing what's shipped, what's next, and what's deferred. No auth required. Server Component, no client JS. Add a "Roadmap" link to the landing page footer and the root layout footer.

**Page location:** `apps/web/app/roadmap/page.tsx`

**Content (implement as static JSX — no markdown parser needed):**

```tsx
// apps/web/app/roadmap/page.tsx
import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Roadmap — drop-note',
  description: 'What we\'ve shipped, what\'s next, and what\'s deferred for drop-note.',
}

export default function RoadmapPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <div className="mb-8">
        <Link href="/" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
          ← Back to drop-note
        </Link>
      </div>

      <h1 className="text-3xl font-bold tracking-tight mb-2">Roadmap</h1>
      <p className="text-muted-foreground mb-12">
        drop-note is open source (AGPL-3.0). This is what we've built, what's coming, and what we've intentionally left out.
      </p>

      {/* SHIPPED */}
      <section className="mb-12">
        <h2 className="text-xl font-semibold mb-4">Shipped</h2>
        <div className="space-y-2">
          {[
            { label: 'Email → AI pipeline (summarize + auto-tag)', detail: 'Send anything to drop@dropnote.me' },
            { label: 'YouTube URL detection + thumbnail preview', detail: 'Paste a YouTube link, get the transcript summarized' },
            { label: 'PDF extraction + image description', detail: 'Attach a PDF, get AI-extracted text + summary' },
            { label: 'Dashboard: list, card, and timeline views', detail: 'Three ways to browse your saved items' },
            { label: 'Full-text search + tag filtering', detail: 'Find anything instantly' },
            { label: 'Bulk operations (tag, delete, restore)', detail: 'Manage multiple items at once' },
            { label: 'Google OAuth login', detail: 'One-click sign-in, no passwords' },
            { label: 'Pin + delete + restore', detail: 'Organize and manage items' },
            { label: 'Weekly digest email', detail: 'Monday morning summary of last week\'s saves' },
            { label: 'Onboarding modal + empty state', detail: 'New user experience on first visit' },
            { label: 'Rate limiting + abuse protection', detail: 'Per-user and per-IP limits via Upstash Redis' },
            { label: 'Admin panel', detail: 'User management, blocklist, invite codes, stats' },
            { label: 'Docker self-host stack', detail: 'docker compose up and you\'re running' },
            { label: 'AGPL-3.0 open source', detail: 'Full source on GitHub' },
            { label: 'Sentry error monitoring', detail: 'Production error tracking' },
            { label: 'Legal pages (Terms, Privacy, AUP)', detail: 'GDPR-aware, Jason Gao as data controller' },
            { label: 'SEO blog: Open-Source Omnivore Alternative', detail: 'Targets the post-Omnivore search intent' },
            { label: 'Public landing page + free pricing', detail: 'No paid tiers at launch' },
            { label: 'OG meta tags + social share cards', detail: 'Looks good when shared on HN, Twitter, Slack' },
          ].map(({ label, detail }) => (
            <div key={label} className="flex items-start gap-3 py-2 border-b border-border last:border-0">
              <span className="text-green-600 font-bold mt-0.5">✓</span>
              <div>
                <div className="text-sm font-medium text-foreground">{label}</div>
                <div className="text-xs text-muted-foreground">{detail}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* NEXT */}
      <section className="mb-12">
        <h2 className="text-xl font-semibold mb-4">Coming next</h2>
        <div className="space-y-2">
          {[
            { label: 'Mobile-responsive polish', detail: 'Dashboard works on phone, just needs love' },
            { label: 'Per-user email routing (v2)', detail: 'drop+[token]@dropnote.me — already in schema, shipping at scale' },
            { label: 'Hosted tier ($4.99/mo)', detail: 'Only when 100 active hosted users — Plausible model' },
            { label: 'Async AI queue (QStash)', detail: 'Switch from sync to async when p95 latency climbs' },
          ].map(({ label, detail }) => (
            <div key={label} className="flex items-start gap-3 py-2 border-b border-border last:border-0">
              <span className="text-blue-500 font-bold mt-0.5">→</span>
              <div>
                <div className="text-sm font-medium text-foreground">{label}</div>
                <div className="text-xs text-muted-foreground">{detail}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* DEFERRED */}
      <section className="mb-12">
        <h2 className="text-xl font-semibold mb-4">Intentionally deferred</h2>
        <div className="space-y-2">
          {[
            { label: 'Browser extension', detail: 'Email-first IS the wedge. Extension is complexity for marginal gain.' },
            { label: 'Mobile app', detail: 'Use your phone\'s native share sheet → email. No app needed.' },
            { label: 'Readwise-competitive features', detail: 'Head-to-head is unwinnable. Self-host is our moat.' },
            { label: 'Product Hunt launch', detail: 'Deferred 60 days post-launch. HN and r/selfhosted first.' },
          ].map(({ label, detail }) => (
            <div key={label} className="flex items-start gap-3 py-2 border-b border-border last:border-0">
              <span className="text-muted-foreground font-bold mt-0.5">—</span>
              <div>
                <div className="text-sm font-medium text-foreground">{label}</div>
                <div className="text-xs text-muted-foreground">{detail}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Footer CTA */}
      <div className="border border-border rounded-lg p-6 text-center">
        <p className="text-sm text-muted-foreground mb-4">
          drop-note is AGPL-3.0. Read the code, run your own instance, or use the free hosted version.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <a
            href="https://github.com/lego651/drop-note"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium underline underline-offset-4 hover:text-muted-foreground transition-colors"
          >
            View on GitHub
          </a>
          <Link
            href="/login"
            className="text-sm font-medium underline underline-offset-4 hover:text-muted-foreground transition-colors"
          >
            Get started free
          </Link>
        </div>
      </div>
    </div>
  )
}
```

**Nav links to add:**

1. `apps/web/components/marketing/LandingPage.tsx` footer (lines ~134–154): add `<Link href="/roadmap" className="hover:text-foreground transition-colors">Roadmap</Link>` alongside Terms/Privacy/AUP/GitHub.

2. `apps/web/app/layout.tsx` global footer (lines ~26–32): add `<Link href="/roadmap" className="hover:text-foreground transition-colors">Roadmap</Link>` alongside Privacy/Terms/AUP.

**Test:** `apps/web/app/__tests__/roadmap.test.tsx` — test that the page renders with expected headings:
```typescript
import { render, screen } from '@testing-library/react'
import RoadmapPage from '../roadmap/page'

describe('RoadmapPage', () => {
  it('renders the page heading', () => {
    render(<RoadmapPage />)
    expect(screen.getByRole('heading', { name: /roadmap/i, level: 1 })).toBeInTheDocument()
  })
  it('renders shipped section', () => {
    render(<RoadmapPage />)
    expect(screen.getByRole('heading', { name: /shipped/i })).toBeInTheDocument()
  })
  it('renders coming next section', () => {
    render(<RoadmapPage />)
    expect(screen.getByRole('heading', { name: /coming next/i })).toBeInTheDocument()
  })
})
```

**Acceptance criteria:**
1. `GET /roadmap` returns 200 (curl evidence)
2. Page renders with "Shipped", "Coming next", "Intentionally deferred" sections
3. "Roadmap" link appears in LandingPage footer and root layout footer
4. Tests pass
5. Lint/typecheck/build pass — no regressions

---

## PR ordering and parallelism

- **Phase 2 (og-and-logout)** and **Phase 4 (readme-selfhost)** can start immediately on separate branches from `main`.
- **Phase 3 (onboarding-copy)** depends on Phase 2 being merged OR can go on its own branch from `main` targeting the same files — just be careful of conflicts with WelcomeModal.tsx and ItemsPageClient.tsx. Safest: branch from `s8/og-and-logout` if Phase 2 hasn't merged.
- **Phase 5 (roadmap-page)** is fully independent — start from `main`.
- Each PR: standard commit hygiene, co-author trailer `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>`, PR title prefixed `[s8] feat:` or `[s8] docs:`.
- Monitor CI yourself. If any check fails, investigate + fix before pinging Mic.

---

## What NOT to touch

- Do NOT re-enable Stripe (D7 — null-checked, stays disabled until 100 active users)
- Do NOT add BullMQ, Railway, apps/worker
- Do NOT change /api/ingest behavior
- Do NOT add new npm packages without checking project first
- Do NOT touch supabase migrations
- Do NOT change Google OAuth setup
