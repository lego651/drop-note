# Task G — Jose Brief: SEO Blog Route

**Date:** 2026-05-28
**Branch:** `s8/blog-seo`
**Commit prefix:** `[s8]`
**Dispatched by:** Mic (drop-note PM)

---

## Context

drop-note is live at `https://dropnote.me`. We are targeting the post-Omnivore self-hosted community (D2). The blog post content ("Open-Source Omnivore Alternative") is already drafted at `docs/task-g-blog-content.md`. Your job is to wire up the `/blog/` route in the Next.js app to host it, update the sitemap, and make sure it passes CI.

No new npm packages. No CMS. Static content only. This is a single-post blog — not a blog system.

---

## MANDATORY PROCESS RULES (same as always)

1. **TDD:** Write the test file first. See it fail. Write implementation. See it pass.
2. **Verification evidence:** Attach `pnpm turbo lint && pnpm turbo typecheck && pnpm --filter @drop-note/web build` output showing zero errors. Attach a `curl https://dropnote.me/blog/open-source-omnivore-alternative` screenshot or local `curl localhost:3000/blog/open-source-omnivore-alternative` showing 200 + page title in the HTML.
3. **No error swallowing.**

---

## What to build

### 1. Blog post page — static, no JS needed

**File:** `apps/web/app/blog/open-source-omnivore-alternative/page.tsx`

This is a Server Component (no `'use client'`). Static page. No Supabase queries. No auth.

Content source: read `docs/task-g-blog-content.md`. Render the content as a styled page using the existing layout patterns from `apps/web/app/privacy/page.tsx` (same `max-w-3xl mx-auto px-4 py-16` container, same semantic Tailwind tokens).

Metadata:
```typescript
export const metadata: Metadata = {
  title: 'The Best Open-Source Omnivore Alternative in 2026 — drop-note',
  description: 'Omnivore shut down. drop-note is the AGPL self-hostable replacement — email anything, AI organizes it. Free to self-host, free to use hosted.',
}
```

Structure the page as:
- `<h1>` — main heading from the blog content
- `<p>` lead — the hook paragraph
- `<h2>` sections matching the content outline
- `<ul>` bullet lists where applicable
- A prominent CTA at the bottom: "Try drop-note free" button linking to `/login`, and "Self-host it" linking to the GitHub repo `https://github.com/lego651/drop-note`

Use semantic Tailwind tokens only: `bg-background`, `text-foreground`, `text-muted-foreground`, `border-border`. Never raw color classes.

### 2. Blog index page (optional, simple)

**File:** `apps/web/app/blog/page.tsx`

Simple redirect to the single post, or a minimal list page with one entry. Whichever is simpler. If you redirect, use `redirect('/blog/open-source-omnivore-alternative')`. If you make a list, keep it minimal — one article card, title + date + description.

### 3. Update sitemap

**File:** `apps/web/app/sitemap.ts`

Add the blog post URL:
```typescript
{
  url: `${baseUrl}/blog/open-source-omnivore-alternative`,
  lastModified: new Date('2026-05-28'),
  changeFrequency: 'monthly' as const,
  priority: 0.9,
}
```

Also add the root `/login` entry priority 0.8 (already there). Add blog index `/blog` at priority 0.7.

### 4. Update `robots.ts`

Check `apps/web/app/robots.ts`. Make sure `/blog/` is allowed (not blocked). If the file disallows all paths or is missing an allow for `/blog/`, fix it.

### 5. Test

**File:** `apps/web/app/blog/__tests__/blog-post.test.tsx`

Using Vitest + React Testing Library (already in project).

Test:
- Blog post page renders `h1` with expected heading text
- Page contains the word "Omnivore" (validates content loaded)
- Page contains a link to `/login`
- Page contains a link to the GitHub repo
- Sitemap function includes the blog post URL

---

## What NOT to touch

- Do NOT add a CMS, MDX, or any new npm package
- Do NOT add authentication to the blog route (it must be public)
- Do NOT change the root layout or existing navigation
- Do NOT touch `/api/ingest`, Stripe, auth, or anything outside the `app/blog/` directory and `sitemap.ts` / `robots.ts`

---

## Acceptance criteria

1. `pnpm turbo lint && pnpm turbo typecheck && pnpm --filter @drop-note/web build` — zero errors
2. `pnpm test` — new test file passes, all 163+ existing tests still green
3. `curl http://localhost:3000/blog/open-source-omnivore-alternative` — 200 response, `<h1>` visible in HTML
4. `curl http://localhost:3000/sitemap.xml` — blog post URL present
5. Commit(s) prefixed `[s8]`, subject under 72 chars, co-author trailer:
   ```
   Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
   ```

---

## Content

Read the full blog post text from: `docs/task-g-blog-content.md`

Do not paraphrase or shorten the content. Render it as-is, using the headings and sections in that file as your page structure.
