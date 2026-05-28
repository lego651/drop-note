# Jose Brief — Task I: Public Landing Page + Pricing Page Fix

**Repo:** `lego651/drop-note` (monorepo, pnpm workspaces)
**Base branch:** `main`
**New branch:** `s8/landing-page`
**Commit prefix:** `[s8]`
**Priority:** High — this is the last major gap before public launch. Every HN/r/selfhosted visitor currently hits the root URL and gets dumped to a Google OAuth login prompt with zero context.

---

## Context

drop-note is live at `https://dropnote.me`. AGPL-3.0 open-source email-to-dashboard content saver. The positioning is "Omnivore replacement" — the self-hosted crowd who lost Omnivore when ElevenLabs acquired and shut it down.

**Two problems to fix in this PR:**

### Problem 1 — No public landing page

`apps/web/app/page.tsx` currently redirects ALL visitors (logged-out) to `/login`. There is zero marketing page. No hero, no value prop, no explanation of what drop-note is. Anyone who finds us via a blog post, HN link, or r/selfhosted thread hits the root URL and sees a Google OAuth prompt with no context.

Fix: make `app/page.tsx` a real public landing page for logged-out users. Logged-in users still redirect to `/items` (the dashboard).

### Problem 2 — Pricing page shows killed tiers

`apps/web/app/pricing/page.tsx` still shows $9.99/mo Pro and $49.99/mo Power tiers. These were killed by D1 (2026-04-02) — drop-note launches 100% free. The pricing page is actively misleading and would cause trust issues if anyone visits it.

Fix: update pricing page to show only the free tier, with a note about the open-source self-host option.

---

## MANDATORY PROCESS RULES

1. **TDD:** Write test file(s) FIRST. See them fail. Write implementation. See them pass. Every new component needs a corresponding `*.test.tsx`.
2. **Verification evidence:** Attach browser screenshot(s) of the landing page rendering (desktop width). Confirm `pnpm test` passes with new test files.
3. **No error swallowing:** Don't use `try { ... } catch (e) { console.error(e) }`. Let errors throw.

---

## What to Build

### 1. Landing page — `apps/web/app/page.tsx`

**Current behavior:** redirects all logged-out visitors to `/login`.

**New behavior:**
- If user is logged in → redirect to `/items` (same as before, but use `/items` not `/dashboard` — check what the actual dashboard route is in the codebase)
- If user is logged out → render a public marketing page (new component below)

**Architecture note:** `app/page.tsx` is currently a Server Component (correct). Keep it as a Server Component. The auth check (Supabase `getUser()`) already happens there. Add the landing page render for the logged-out branch.

---

**Create `apps/web/components/marketing/LandingPage.tsx`** — a Server Component.

Design intent: clean, minimal, text-forward. This is for a technical audience (self-hosters, OSS readers). No animations, no heavy imagery. Fast to load, easy to scan on mobile.

**Structure (top to bottom):**

```
[ Nav bar ]
  Logo: "drop-note"
  Links: GitHub (https://github.com/lego651/drop-note), Blog (/blog/open-source-omnivore-alternative)
  CTA: "Get started free" → /login

[ Hero ]
  Heading (h1): "The open-source Omnivore alternative"
  Subheading: "Email anything to drop@dropnote.me. AI summarizes and tags it. Find it in your dashboard."
  Two CTAs:
    Primary: "Get started free" → /login  (Google OAuth, no credit card)
    Secondary: "Self-host on GitHub" → https://github.com/lego651/drop-note (opens new tab)

[ How it works — 3 steps ]
  Step 1: "Email it" — Forward articles, paste links, send PDFs to drop@dropnote.me
  Step 2: "AI processes it" — GPT-4o-mini summarizes and auto-tags every item
  Step 3: "Find it later" — Search, filter, and browse your personal knowledge base

[ Self-host callout ]
  AGPL-3.0 badge
  Headline: "Fully open source. Self-hostable."
  Body: "Run your own instance with Docker. Your data, your server. No lock-in."
  CTA: "View on GitHub" → https://github.com/lego651/drop-note

[ Footer ]
  Links: /terms, /privacy, /aup, GitHub
  Text: "AGPL-3.0 · Built by Jason Gao"
```

**Styling rules (strict):**
- Use semantic Tailwind tokens (`bg-background`, `text-foreground`, `text-muted-foreground`, `border`) — NEVER raw color classes
- Use existing shadcn `Button` component for CTAs — already in `components/ui/button.tsx`
- No `dark:` variants in the component — only in `globals.css`
- Server Component — no `'use client'`
- Mobile-responsive: hero text should stack cleanly on small screens
- No external images, no CDN assets

**Write test: `apps/web/components/marketing/__tests__/LandingPage.test.tsx`**
- Verify hero heading renders ("The open-source Omnivore alternative")
- Verify "Get started free" link points to `/login`
- Verify GitHub link renders with correct URL
- Verify the 3 steps render with correct labels

---

### 2. Update `app/page.tsx`

Replace the current "always redirect to /login" logic with:

```tsx
// Pseudocode — Jose writes the actual TypeScript
const user = await getUser()
if (user) redirect('/items')  // or whatever the actual dashboard route is
return <LandingPage />
```

Check `apps/web/app/(dashboard)/` to find the correct logged-in redirect target.

**Write test: `apps/web/app/__tests__/RootPage.test.tsx`** (or update existing if one exists)
- Test: when user is logged in, renders redirect to dashboard
- Test: when user is logged out, renders LandingPage component (not a redirect)

---

### 3. Update `apps/web/app/pricing/page.tsx`

**Current:** Shows 3 tiers (Free $0 / Pro $9.99 / Power $49.99) with Stripe upgrade buttons.

**New:** Show only the free tier. Remove Pro and Power cards entirely (they are D1-killed). The Stripe code can stay in the file (it's already null-checked via the `UpgradeButton` component) — just don't render the paid tier cards.

**Updated pricing page content:**

```
Heading: "Simple, free pricing"
Subheading: "drop-note is free to use. No credit card required."

Single tier card:
  Name: "Free"
  Price: "$0 / forever"
  Features:
    - 50 items stored
    - Unlimited saves per month
    - AI summaries and auto-tagging
    - Full text search
    - Weekly digest email
    - Email ingest via drop@dropnote.me

Self-host note (below the card):
  "Want more? Self-host drop-note for free with Docker.
  AGPL-3.0 open source — no limits on your own instance."
  Link: "View on GitHub →"
```

**Remove:** `UpgradeButton` and `ManageSubscriptionButton` imports and renders. Those are Stripe components and have no place on a free-only pricing page. The `PRO_PRICE_ID` / `POWER_PRICE_ID` env var reads at the top of the file can also be removed.

**Update test:** Check if a test exists for pricing page. If yes, update assertions. If no, add `apps/web/app/pricing/__tests__/pricing.test.tsx` with:
- Verify "Free" tier renders
- Verify no "$9.99" text appears anywhere on the page
- Verify no "$49.99" text appears anywhere on the page
- Verify GitHub self-host link renders

---

## What NOT to Touch

- Do NOT change `/api/ingest`, auth flow, or any dashboard route
- Do NOT add new npm packages without confirming they're not already in the project
- Do NOT re-enable Stripe — the null-check stays, no Stripe buttons on the new pages
- Do NOT touch `lib/stripe.ts` or any Stripe-adjacent code
- Do NOT add `'use client'` to `LandingPage.tsx` — it has no client interactions
- Do NOT add any external fonts, CDN assets, or image files

---

## Acceptance Criteria

1. `pnpm turbo lint && pnpm turbo typecheck && pnpm --filter @drop-note/web build` — zero errors
2. `pnpm test` — all new test files green
3. Logged-out visitors to `https://dropnote.me` see the landing page (not a login redirect) — browser screenshot attached
4. Logged-in users hitting `https://dropnote.me` still redirect to the dashboard — verified in test
5. `/pricing` shows only the free tier — no $9.99 or $49.99 text anywhere on the page — verified in test
6. Landing page renders correctly on mobile width (375px) — screenshot attached
7. "Self-host on GitHub" link on both the landing page and pricing page points to `https://github.com/lego651/drop-note`
8. Commits prefixed `[s8]`, subject under 72 chars, co-author trailer:
   ```
   Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
   ```

---

## Constraints

- TypeScript strict mode — no `as any` except in test files
- shadcn `Button` is already in the project — use it for CTAs, do NOT run `npx shadcn add`
- `next/link` for internal links, `<a target="_blank" rel="noopener noreferrer">` for external (GitHub)
- Check `apps/web/app/(dashboard)/` to confirm the correct logged-in redirect path before writing `page.tsx`

---

## Verification Evidence Required

Before submitting the PR, attach:
1. Screenshot: landing page at desktop width (1280px+) — hero + steps visible
2. Screenshot: landing page at mobile width (375px) — hero readable, no overflow
3. Screenshot: `/pricing` page — only free tier visible, no Pro/Power cards
4. `pnpm test` output showing new test files pass

---

## Branch and PR

Branch: `s8/landing-page`
PR title format: `[s8] feat: public landing page + pricing page D1 fix`
PR closes: Task I (public landing page)
