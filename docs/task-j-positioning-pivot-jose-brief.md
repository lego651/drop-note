# Task J — Positioning Pivot: Strip Omnivore EVERYWHERE

**Repo:** `lego651/drop-note` (monorepo, pnpm workspaces)
**Branch:** `s8/items-redesign-p1` (current working branch — push directly here)
**Commit prefix:** `[s8]`

---

## Context

Jason has issued a final positioning override (2026-05-29). The ruling:

> "strip Omnivore from ALL copy/blog/landing/SEO"

This OVERRIDES the earlier plan that kept Omnivore in blog OG/SEO tags for search equity.
The new standing rule (saved to memory): no Omnivore in any user-facing copy, meta tags,
OG tags, SEO surfaces, or test assertions. Zero tolerance — no "for SEO purposes" exceptions.

The new positioning is: **"Save anything from anywhere."**
Universal capture. Every platform. Every device. Email as the interface.

This is a surgical copy/framing change only. No new routes, no schema changes, no new
npm packages. The blog URL slug stays (the URL `/blog/open-source-omnivore-alternative`
is NOT user-facing copy — it is a path string; the concern is the visible text users
read and search engines index as canonical copy).

---

## Grep requirement (ACCEPTANCE GATE)

After all changes, run:

```bash
grep -ri "omnivore" apps/ --include="*.tsx" --include="*.ts" | grep -v ".next/"
```

**Expected result: zero lines.** If any match remains in a user-facing copy field,
meta tag title/description, OG tag, twitter card tag, or test assertion — the task
is not done. The only acceptable remaining hits would be inside the URL path string
`/blog/open-source-omnivore-alternative` which appears in `href` attributes, `sitemap.ts`,
and `blog/page.tsx` redirect — those are path strings, not copy, and are acceptable.

---

## Files to change

### 1. `apps/web/app/blog/open-source-omnivore-alternative/page.tsx`

**Metadata block (lines 4–20):** Replace entirely:

```ts
export const metadata: Metadata = {
  title: 'Save Anything From Anywhere — drop-note',
  description:
    'Email it, forward it, share it. drop-note is your universal inbox: AI summarizes and tags everything, free, open-source (AGPL), self-hostable.',
  openGraph: {
    title: 'Save Anything From Anywhere — drop-note',
    description:
      'Email it, forward it, share it. drop-note is your universal inbox — AI summarizes and tags everything.',
    url: 'https://dropnote.me/blog/open-source-omnivore-alternative',
    images: [{ url: '/api/og', width: 1200, height: 630, alt: 'drop-note' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Save Anything From Anywhere — drop-note',
    description:
      'Email it, forward it, share it. drop-note is your universal inbox — AI summarizes and tags everything.',
    images: ['/api/og'],
  },
}
```

**Body — remove "If you used Omnivore" section entirely (lines 112–124):**

Delete this entire `<section>` block:

```tsx
<section>
  <h2 className="text-xl font-semibold mb-3">If you used Omnivore</h2>
  <p className="mb-4">
    Omnivore was acquired by ElevenLabs in late 2024 and shut down. If you were
    a user, drop-note covers the email-ingestion and self-hostable parts of what
    Omnivore offered, with AI summarization added.
  </p>
  <p>
    It is not a one-to-one replacement — there is no browser extension or mobile
    app right now — but it fills the open-source, email-first, self-hostable
    slot that Omnivore left.
  </p>
</section>
```

Everything else in the page body stays as-is. The URL, breadcrumb, h1, and all
other sections are already correct.

---

### 2. `apps/web/app/blog/__tests__/blog-post.test.tsx`

The current test file has assertions that check for "Omnivore" text. Update them:

**Test description (line 8):** Update from:
```ts
describe('Blog post page — open-source-omnivore-alternative', () => {
```
To:
```ts
describe('Blog post page — save-anything-from-anywhere', () => {
```

**"contains the word Omnivore" test (line 16–22):** This test currently asserts
`getAllByText(/Omnivore/i)` returns matches. Since we are removing all Omnivore
copy from the page, this test must change. Replace it with a test that confirms
the page no longer contains the word "Omnivore":

```ts
it('does NOT contain the word "Omnivore" in user-facing copy', () => {
  render(<BlogPostPage />)
  const allText = document.body.textContent ?? ''
  expect(allText.toLowerCase()).not.toContain('omnivore')
})
```

**Any other assertions referencing `/omnivore/i` or specific Omnivore phrases:**
Update to reference the new heading "Save Anything From Anywhere" or remove if
they were exclusively testing the removed section.

The import on line 5 (`import BlogPostPage from '../open-source-omnivore-alternative/page'`)
stays as-is — the file path is unchanged.

---

### 3. `apps/web/app/roadmap/page.tsx`

**Lines 61–63:** The roadmap currently shows:
```ts
{
  label: 'SEO blog: Open-Source Omnivore Alternative',
  detail: 'Targets the post-Omnivore search intent',
},
```

Replace with:
```ts
{
  label: 'SEO blog: Save Anything From Anywhere',
  detail: 'Universal capture positioning — email as the interface',
},
```

---

## Files to NOT change (confirmed)

| File | Why it stays |
|---|---|
| `apps/web/app/sitemap.ts` | URL path string `/blog/open-source-omnivore-alternative` — not user-facing copy |
| `apps/web/app/blog/page.tsx` | Redirect target is a URL path string — not copy |
| `apps/web/components/landing/LandingNav.tsx` | `href` only — path string, link text just says "Blog" |
| `apps/web/components/landing/LandingFooter.tsx` | `href` only — path string, not copy |
| `apps/web/components/landing/__tests__/LandingNav.test.tsx` | href assertion is testing the path string, not copy |
| `apps/web/components/marketing/__tests__/LandingPage.test.tsx` | href assertion is testing the path string, not copy |
| Any file under `docs/` | Mic manages those |
| Auth flow, ingest route, cron, Stripe, schema | Out of scope |

---

## MANDATORY PROCESS RULES (non-negotiable)

1. **TDD:** Update test files FIRST. Run `pnpm test` — see failures from old assertions.
   Then make the copy changes. Run `pnpm test` again — see green.
2. **Verification:** After all changes, run:
   ```bash
   pnpm turbo lint && pnpm turbo typecheck && pnpm --filter @drop-note/web build
   ```
   All three must pass with zero errors.
3. **Grep gate:** Run the grep command above. Zero Omnivore hits in copy/meta/test assertions.
   Confirm the result in your report.

---

## Acceptance criteria

1. `pnpm turbo lint && pnpm turbo typecheck && pnpm --filter @drop-note/web build` passes
   with zero errors.
2. `pnpm test` passes — all tests green with updated assertions.
3. `grep -ri "omnivore" apps/ --include="*.tsx" --include="*.ts" | grep -v ".next/"` returns
   **zero lines** that contain Omnivore in copy, meta tags, OG tags, twitter card tags, or
   test assertions. (Path string occurrences in `href` and `redirect()` are acceptable.)
4. Blog post page metadata title = "Save Anything From Anywhere — drop-note"
5. Blog post page OG title = "Save Anything From Anywhere — drop-note"
6. Blog post page twitter title = "Save Anything From Anywhere — drop-note"
7. "If you used Omnivore" section removed from blog post body
8. Blog post test does NOT assert `/omnivore/i` text presence — instead asserts absence
9. Roadmap label and detail updated to universal-capture framing
10. Commit(s) on current branch, prefix `[s8]`, subject under 72 chars, co-author trailer:
    ```
    Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
    ```

---

## What NOT to touch

- Do NOT change the blog post URL, sitemap entry, or blog/page.tsx redirect
- Do NOT change the landing page hero (already reads "Save anything from anywhere")
- Do NOT re-add BullMQ, Railway, or apps/worker
- Do NOT touch Stripe, auth flow, or any ingest/cron route
- Do NOT add any new npm package
- Do NOT create any new `.md` report files — put findings in the commit message body
