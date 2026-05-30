# S0 Code Review — Cross-Sprint Audit (Latest 7 Commits)

**Reviewer:** Tech Lead / Code Auditor
**Date:** 2026-03-27
**Scope:** The 7 most recent commits (`fc66a36` through `58106ce`), spanning `[s2]` YouTube URL detection/video cards, compact list view, rate-limit fix, sidebar mobile fix, and all files touched by those changes.
**Verdict:** The YouTube detection feature is well-conceived — oEmbed for zero-API-key metadata, shared URL utilities, graceful fallbacks. The sidebar mobile fix correctly hoists responsibility. The list view layout change is clean. However, there are **three duplicate YouTube ID regex patterns** across the codebase instead of using the shared package. `VideoModal` is a hand-rolled modal that ignores the `Dialog` component added in the same commit, missing focus trapping and accessibility. The worker DB layer silently swallows Supabase errors. `next/image` is bypassed with `unoptimized` instead of configuring `remotePatterns`. The detail page fires 5+ sequential queries that should be parallelized. `source_type` is an untyped `string` instead of a union. The new `url.ts` utility has zero tests despite being a pure-function gold mine for unit testing. Several of these are low-effort, high-impact fixes.

---

## Severity Legend

| Level | Meaning |
|-------|---------|
| **P0 — Critical** | Will cause data loss, silent failures, or runtime crashes in production. Fix immediately. |
| **P1 — High** | Incorrect behavior or significant performance/security issue. Fix before launch. |
| **P2 — Medium** | Best-practice violation or latent bug. Fix this sprint or next. |
| **P3 — Low** | Cleanup / DX improvement. Schedule when convenient. |

---

## S0-R001 · P1 · YouTube ID regex duplicated in three places

**What's wrong:**
The same YouTube video-ID extraction logic exists in three independent implementations:

1. `packages/shared/src/url.ts` — `YOUTUBE_PATTERNS` array (5 regex patterns) + `extractYouTubeId()`
2. `apps/web/components/ItemCard.tsx` line 15 — `YOUTUBE_ID_RE` (single combined regex)
3. `apps/web/app/(dashboard)/items/[id]/page.tsx` line 127 — inline regex in an IIFE

Each uses a slightly different regex flavor. The shared package already exports `extractYouTubeId` — the other two should use it.

**Risk:** If a new YouTube URL format needs support (e.g., `youtube.com/v/ID`), you'd need to update three files. Worse, they can silently disagree — the shared version might match a URL that the ItemCard version doesn't, leading to a card that shows a thumbnail but can't open the modal.

**Files:**
- `packages/shared/src/url.ts` (canonical)
- `apps/web/components/ItemCard.tsx`
- `apps/web/app/(dashboard)/items/[id]/page.tsx`

**Actionable steps:**
1. Import `extractYouTubeId` from `@drop-note/shared` in `ItemCard.tsx`. Replace the `YOUTUBE_ID_RE` const and the `.match()` call on line 50 with `extractYouTubeId(item.source_url)`.
2. In `items/[id]/page.tsx`, import `extractYouTubeId` from `@drop-note/shared`. Replace the inline IIFE (lines 125–148) with a computed `videoId` variable before the JSX return.
3. Delete the two local regex definitions.

**Acceptance:**
- Only `packages/shared/src/url.ts` contains YouTube URL parsing logic.
- `grep -r 'YOUTUBE_ID_RE\|youtu\.be.*11' apps/` returns zero matches outside imports.
- YouTube cards and detail page embeds still work for `youtube.com/watch`, `youtu.be`, `/shorts/`, `/live/`, and `/embed/` URLs.

---

## S0-R002 · P1 · VideoModal hand-rolls what Dialog already provides — missing accessibility

**What's wrong:**
`VideoModal.tsx` is a fully custom modal (63 lines) that manually implements:
- Escape-to-close via `useEffect` + `keydown` listener
- Body scroll lock via `document.body.style.overflow = 'hidden'`
- Backdrop click-to-close via `onClick` on the overlay div

Meanwhile, the same commit (`ab25880`) added `components/ui/dialog.tsx` — a properly accessible Radix Dialog with:
- Focus trapping (Tab stays within the modal)
- `role="dialog"` and `aria-modal="true"`
- Scroll lock
- Escape handling
- Animated enter/exit transitions
- `DialogTitle` and `DialogDescription` for screen readers

`VideoModal` has **none** of the following:
- No `role="dialog"` or `aria-modal`
- No focus trap — users can Tab into background content
- No `aria-labelledby` connecting the title to the dialog
- Body scroll lock uses direct DOM mutation, which can conflict if multiple modals are stacked

**Files:** `apps/web/components/VideoModal.tsx`, `apps/web/components/ui/dialog.tsx`

**Actionable steps:**
1. Rewrite `VideoModal` to use `Dialog`, `DialogContent`, `DialogTitle` (visually hidden if desired) from `@/components/ui/dialog`.
2. The Dialog controls open/close state, Escape handling, focus trapping, scroll lock, and overlay click-to-close — all the manual code can be deleted.
3. Pass `open` and `onOpenChange` to `<Dialog>` instead of conditionally rendering the modal.

**Acceptance:**
- Opening the video modal traps focus within it (Tab does not reach background content).
- Screen readers announce "Video" or the video title when the modal opens.
- Escape closes the modal, clicking outside closes the modal — same behavior as before, now via Radix.
- The `useEffect` hooks for keydown and body overflow are removed.

---

## S0-R003 · P1 · Worker DB functions silently swallow Supabase errors

**What's wrong:**
In `apps/worker/src/lib/db.ts`, `setItemProcessing()` (line 4–9) and `setItemDone()` (line 11–33) call `supabaseAdmin.from('items').update(...)` but **never check the returned `error`**. If the update fails (network timeout, RLS conflict, constraint violation), the function returns successfully and the pipeline continues as if the item was updated.

Example — `setItemProcessing`:
```ts
export async function setItemProcessing(itemId: string): Promise<void> {
  await supabaseAdmin
    .from('items')
    .update({ status: 'processing' })
    .eq('id', itemId)
  // ← error is silently ignored
}
```

Compare with `createAttachmentItem` (line 43–62), which correctly checks `if (error || !data) throw new Error(...)`.

**Result:** If `setItemDone` fails (e.g., the item was deleted between `setItemProcessing` and `setItemDone`), the pipeline reports success but the item stays in `processing` status forever. The user sees a perpetual loading skeleton.

**Files:** `apps/worker/src/lib/db.ts`

**Actionable steps:**
1. Destructure `{ error }` from every Supabase call in `setItemProcessing`, `setItemDone`, and `setItemFailed`.
2. If `error` is truthy, throw an `Error` with the message. BullMQ will handle retries.
3. Consider adding `.select('id').single()` to `setItemProcessing` and `setItemDone` to also detect "zero rows matched" (item was deleted), and throw if `data` is null.

**Acceptance:**
- A failing `setItemProcessing` or `setItemDone` call throws an error that BullMQ sees.
- The job enters the retry queue instead of silently completing.
- Worker logs show the Supabase error message.

---

## S0-R004 · P2 · `next/image` bypassed with `unoptimized` — no `remotePatterns` configured

**What's wrong:**
`ItemCard.tsx` line 138 uses `<Image unoptimized>` for YouTube thumbnails. This completely bypasses Vercel's image optimization pipeline (no WebP conversion, no responsive resizing, no CDN caching). The root cause is that `next.config.mjs` has no `images.remotePatterns` configuration, so Next.js would reject external image URLs.

**Files:**
- `apps/web/next.config.mjs`
- `apps/web/components/ItemCard.tsx`

**Actionable steps:**
1. Add `images.remotePatterns` to `next.config.mjs`:
   ```js
   const nextConfig = {
     output: 'standalone',
     images: {
       remotePatterns: [
         { protocol: 'https', hostname: 'img.youtube.com' },
         { protocol: 'https', hostname: 'i.ytimg.com' },
       ],
     },
     // ...
   }
   ```
2. Remove `unoptimized` from the `<Image>` component in `ItemCard.tsx`.
3. Set meaningful `sizes` attribute based on actual layout widths (e.g., `(max-width: 640px) 112px, 144px` for list view, `(max-width: 768px) 100vw, 33vw` for grid view).

**Acceptance:**
- YouTube thumbnails load via `/_next/image?url=...&w=256&q=75` (Vercel optimization).
- Network tab shows WebP format and appropriate dimensions.
- No `unoptimized` prop anywhere in the codebase.

---

## S0-R005 · P1 · `source_type` is untyped `string` — no compile-time safety

**What's wrong:**
The `source_type` column is defined as `text` in the migration and used as `string | null` throughout:
- Worker `email.ts` line 44: `let sourceType: string | null = null`
- Worker `db.ts` line 17: `sourceType?: string | null`
- Web `items.ts` line 14: `source_type: string | null`

The migration comment documents three valid values (`email | youtube | url`) but TypeScript doesn't enforce this. A typo like `sourceType = 'Youtube'` or `sourceType = 'video'` would silently corrupt data and break the frontend's `item.source_type === 'youtube'` checks.

**Files:**
- `packages/shared/src/database.types.ts` (generated, but the type definition is weak)
- `apps/worker/src/processors/email.ts`
- `apps/worker/src/lib/db.ts`
- `apps/web/lib/items.ts`

**Actionable steps:**
1. Define a union type in `packages/shared/src/`:
   ```ts
   export type SourceType = 'email' | 'youtube' | 'url'
   ```
2. Use it in `db.ts` params: `sourceType?: SourceType | null`.
3. Use it in the email processor: `let sourceType: SourceType | null = null`.
4. Use it in the web `ItemSummary` type: `source_type: SourceType | null`.
5. Consider adding a Postgres `CHECK` constraint in a follow-up migration:
   ```sql
   ALTER TABLE items ADD CONSTRAINT items_source_type_check
     CHECK (source_type IN ('email', 'youtube', 'url'));
   ```

**Acceptance:**
- Assigning `sourceType = 'typo'` causes a TypeScript error in the worker.
- All three consumers use the same union type from the shared package.

---

## S0-R006 · P2 · No unit tests for `packages/shared/src/url.ts`

**What's wrong:**
The new `url.ts` module exports 4 functions (`extractSingleUrl`, `extractYouTubeId`, `getYouTubeThumbnailUrl`, `fetchYouTubeTitle`) with zero tests. These are pure functions with well-defined edge cases — exactly the kind of code that benefits most from unit tests.

Known edge cases that should be tested:
- `extractSingleUrl` with trailing punctuation: `"Check this: https://example.com."`
- `extractSingleUrl` with text longer than 60 chars around the URL
- `extractYouTubeId` with each of the 5 URL patterns
- `extractYouTubeId` with query params after the video ID (`?v=ID&list=...`)
- `extractYouTubeId` with non-YouTube URLs (should return `null`)
- `getYouTubeThumbnailUrl` output format
- `fetchYouTubeTitle` with a mocked fetch (success + failure)

**Files:** `packages/shared/src/url.ts`, `packages/shared/src/__tests__/` (new file needed)

**Actionable steps:**
1. Create `packages/shared/src/__tests__/url.test.ts`.
2. Write tests for `extractSingleUrl`: empty string, URL-only text, URL with short intro, URL with long paragraph (> 60 chars non-URL text), trailing punctuation.
3. Write tests for `extractYouTubeId`: all 5 patterns, non-YouTube URL, malformed URLs.
4. Write tests for `fetchYouTubeTitle`: mock `fetch` to return success and error responses.

**Acceptance:**
- `pnpm test` includes url.test.ts in the run.
- All 5 YouTube URL patterns have at least one test case each.
- `extractSingleUrl` edge cases (punctuation, long text) are covered.

---

## S0-R007 · P2 · Item detail page fires 5+ sequential Supabase queries

**What's wrong:**
`apps/web/app/(dashboard)/items/[id]/page.tsx` makes these queries sequentially:
1. `getUser()` (line 23)
2. Fetch item with tags (line 26)
3. Fetch all user tags (line 37)
4. Fetch previous item (line 44)
5. Fetch next item (line 55)
6. Fetch attachments (line 76) — conditional
7. Sign attachment URLs (line 87) — parallel via `Promise.all`

Queries 3, 4, and 5 are independent of each other (they all just need `user.id` and `item.created_at`). They could run in parallel, saving 2 round trips. Queries 2 through 5 could potentially all run in parallel after auth.

**Impact:** Each Supabase query is a network round trip. At ~50ms per query (typical Supabase latency on Vercel), this is ~300ms of serial waiting that could be ~100ms.

**Files:** `apps/web/app/(dashboard)/items/[id]/page.tsx`

**Actionable steps:**
1. After `getUser()` and the item fetch (which is needed for `created_at`), parallelize the remaining independent queries:
   ```ts
   const [{ data: userTags }, { data: prev }, { data: next }] = await Promise.all([
     supabase.from('tags').select('id, name').eq('user_id', user.id).order('name'),
     supabase.from('items').select('id').eq('user_id', user.id)...lt('created_at', item.created_at)...,
     supabase.from('items').select('id').eq('user_id', user.id)...gt('created_at', item.created_at)...,
   ])
   ```
2. If attachments exist, the signed URL generation is already parallelized — good.

**Acceptance:**
- Detail page load time is measurably faster (verify via Vercel Analytics or browser DevTools).
- Behavior is unchanged — same data, same rendering.

---

## S0-R008 · P2 · `generateMetadata` fetches item without `user_id` scope

**What's wrong:**
In `items/[id]/page.tsx` lines 9–18, `generateMetadata` queries:
```ts
const { data } = await supabase
  .from('items')
  .select('subject')
  .eq('id', params.id)
  .single()
```

This doesn't filter by `user_id`. While RLS should prevent cross-user data access (since the server client carries the user's auth cookie), this is inconsistent with the page function (line 29–30) which explicitly adds `.eq('user_id', user.id)`.

If RLS is ever relaxed or the metadata function runs without a valid session (e.g., during ISR/build), this could leak item subjects in `<title>` tags.

**Files:** `apps/web/app/(dashboard)/items/[id]/page.tsx`

**Actionable steps:**
1. Add `getUser()` and `.eq('user_id', user.id)` to the metadata fetch, mirroring the page function.
2. If auth fails, return a generic title like `{ title: 'Item — drop-note' }`.

**Acceptance:**
- Visiting `/items/{other-users-item-id}` shows generic title, not the other user's item subject.
- Metadata for the user's own items still shows the correct subject.

---

## S0-R009 · P2 · Login form creates Supabase client at module scope

**What's wrong:**
`apps/web/app/(auth)/login/login-form.tsx` line 8:
```ts
const supabase = createClient()
```

This creates a single Supabase browser client instance at module evaluation time. It persists across React re-renders, route navigations, and even across users if the tab is shared. The `@supabase/ssr` docs recommend creating the client inside the component or using a provider pattern, because the client holds a reference to the auth session.

While this "works" for a login form (there's no active session yet), it sets a bad precedent — if other components copy this pattern, stale sessions and cross-user data leaks become possible.

**Files:** `apps/web/app/(auth)/login/login-form.tsx`

**Actionable steps:**
1. Move `const supabase = createClient()` inside the `handleSubmit` function, or call it at the top of the component body.
2. Audit other client components for the same pattern.

**Acceptance:**
- `createClient()` is not called at the top level of any module (outside a function body).
- Login flow still works: entering email → sending magic link → redirect.

---

## S0-R010 · P2 · Thumbnail button is non-functional for non-YouTube items

**What's wrong:**
In `ItemCard.tsx` lines 116–147, the thumbnail renders as a `<button>` for all items with `thumbnail_url`. But the `onClick` handler (line 129) only does something when `youtubeId` is truthy:
```ts
onClick={(e) => {
  e.preventDefault()
  e.stopPropagation()
  if (youtubeId) setVideoOpen(true)
}}
```

For items with `source_type: 'url'` and a thumbnail but no YouTube ID, clicking the thumbnail button:
- Prevents the default `<Link>` navigation (via `stopPropagation`)
- Does nothing else

The user clicks a button-shaped element with a cursor pointer and nothing happens. The card's `<Link>` navigation is also blocked.

**Files:** `apps/web/components/ItemCard.tsx`

**Actionable steps:**
1. For non-YouTube items with a thumbnail, either:
   - **Option A:** Don't render it as a `<button>` — use a plain `<div>` so the parent `<Link>` handles navigation.
   - **Option B:** Navigate to the source URL on click (`window.open(item.source_url, '_blank')`).
2. Only render the play icon overlay for YouTube items (already partially done, but the entire `<button>` wrapper is unnecessary for non-video items).

**Acceptance:**
- Clicking a non-YouTube thumbnail navigates to the item detail page (not a dead click).
- YouTube thumbnails still open the video modal.

---

## S0-R011 · P3 · `ItemCard.tsx` is growing too large — decomposition needed

**What's wrong:**
`ItemCard.tsx` is 221 lines and handles 8 concerns:
1. Card layout (grid vs list)
2. Bulk selection checkbox
3. Pin toggle button
4. Delete button
5. YouTube video detection + regex
6. Thumbnail rendering + click handling
7. Video modal state management
8. Status rendering (processing skeleton, failed badge, done summary)
9. Tag rendering with overflow count
10. Relative time formatting

This violates single-responsibility and makes the component hard to test, review, and modify. Adding a new source type (e.g., Twitter/X embeds) would further bloat it.

**Files:** `apps/web/components/ItemCard.tsx`

**Actionable steps:**
1. Extract `ItemThumbnail` — handles thumbnail rendering, play overlay, and click action (modal vs navigate).
2. Extract `ItemStatusBadge` — handles the processing/failed/done display logic.
3. Extract `ItemTagList` — handles tag rendering with overflow.
4. Move YouTube ID extraction to use the shared utility (see S0-R001).
5. Keep `ItemCard` as the layout orchestrator that composes these sub-components.

**Acceptance:**
- `ItemCard.tsx` is under 100 lines.
- Each extracted component is independently testable.
- Visual output is unchanged.

---

## S0-R012 · P3 · Detail page YouTube embed uses inline IIFE in JSX

**What's wrong:**
`items/[id]/page.tsx` lines 125–148 contain an immediately-invoked function expression inside JSX:
```tsx
{(() => {
  const videoIdMatch = item.source_url.match(...)
  const videoId = videoIdMatch?.[1]
  return videoId ? <iframe ... /> : <a ... />
})()}
```

Inline IIFEs in JSX are an anti-pattern — they're hard to read, can't be tested independently, and signal that logic should be extracted.

**Files:** `apps/web/app/(dashboard)/items/[id]/page.tsx`

**Actionable steps:**
1. Compute `videoId` before the JSX return using `extractYouTubeId` from the shared package (see S0-R001).
2. Use a simple conditional in the JSX:
   ```tsx
   {videoId ? <iframe ... /> : <a ... />}
   ```
3. Alternatively, extract a `<YouTubeEmbed videoId={videoId} title={title} />` component that's reusable between the detail page and the modal.

**Acceptance:**
- No IIFEs in JSX anywhere in the codebase.
- YouTube embed on the detail page still works.

---

## S0-R013 · P3 · `searchParams` wrapped in `Promise.resolve` unnecessarily

**What's wrong:**
`apps/web/app/(dashboard)/items/page.tsx` line 28:
```ts
const params = await Promise.resolve(searchParams ?? {})
```

`searchParams` is a synchronous plain object in Next.js 14 App Router page components. Wrapping it in `Promise.resolve` does nothing — it's a no-op `await`. This likely started as a workaround for a TypeScript quirk or a copy-paste from a pattern used elsewhere, but it's misleading because it suggests `searchParams` is asynchronous.

**Files:** `apps/web/app/(dashboard)/items/page.tsx`

**Actionable steps:**
1. Replace with: `const params = searchParams ?? {}`
2. Remove the `await`.

**Acceptance:**
- Items page renders identically.
- No `Promise.resolve` wrapping synchronous values anywhere in page components.

---

## S0-R014 · P3 · Worker Supabase client created at module top level with `!` assertions

**What's wrong:**
`apps/worker/src/lib/supabase.ts`:
```ts
export const supabaseAdmin = createClient<Database>(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)
```

This eagerly creates the client when the module is imported and uses non-null assertions (`!`) for env vars. If an env var is missing, the error occurs at import time with a cryptic Supabase error rather than a clear message. The web app uses the lazy Proxy pattern in `lib/supabase/admin.ts` for exactly this reason.

**Files:** `apps/worker/src/lib/supabase.ts`

**Actionable steps:**
1. Use the same lazy singleton pattern as the web app:
   ```ts
   let _client: SupabaseClient<Database> | null = null

   function getClient(): SupabaseClient<Database> {
     if (!_client) {
       const url = process.env.SUPABASE_URL
       const key = process.env.SUPABASE_SERVICE_ROLE_KEY
       if (!url || !key) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
       _client = createClient<Database>(url, key, { auth: { persistSession: false } })
     }
     return _client
   }
   ```
2. Export via Proxy or a getter, consistent with the web app pattern.

**Acceptance:**
- Starting the worker without `SUPABASE_URL` throws `"Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"` instead of a Supabase internal error.
- Worker behavior is unchanged when env vars are present.

---

## S0-R015 · P3 · `extractSingleUrl` remainder check uses fragile string replace

**What's wrong:**
`packages/shared/src/url.ts` line 24:
```ts
const remainder = trimmed.replace(cleaned, '').trim()
```

`String.prototype.replace(string, string)` only replaces the **first** occurrence. If `cleaned` appears twice in the text (e.g., someone pastes the same URL twice), the remainder calculation is wrong — it only removes one copy, leaving the other URL in the "remainder" text, which could exceed the 60-char threshold and incorrectly reject the input.

More importantly, the intent is "text minus the URL" — using `indexOf` + `slice` would be semantically clearer and correct:

**Files:** `packages/shared/src/url.ts`

**Actionable steps:**
1. Replace the remainder calculation with:
   ```ts
   const idx = trimmed.indexOf(cleaned)
   const before = trimmed.slice(0, idx).trim()
   const after = trimmed.slice(idx + cleaned.length).trim()
   const remainderLength = before.length + after.length
   if (remainderLength > 60) return null
   ```
2. Add test cases for double-URL text in the new url.test.ts (see S0-R006).

**Acceptance:**
- `extractSingleUrl("https://x.com https://x.com")` returns a predictable result.
- Text with > 60 chars around the URL correctly returns `null`.

---

## S0-R016 · P2 · Non-null assertion `detectedUrl!` in email processor

**What's wrong:**
`apps/worker/src/processors/email.ts` line 55:
```ts
const videoTitle = await fetchYouTubeTitle(detectedUrl!)
```

`detectedUrl` is `string | null`. The code reaches this point only if `youtubeId` is truthy, which requires `detectedUrl` to be truthy (line 42: `const youtubeId = detectedUrl ? extractYouTubeId(detectedUrl) : null`). So `detectedUrl` is provably non-null here, but TypeScript can't narrow through the intermediate variable.

Using `!` is against the project's code conventions ("No `as any` outside tests" — similar spirit applies to `!` assertions).

**Files:** `apps/worker/src/processors/email.ts`

**Actionable steps:**
1. Restructure the conditional to make narrowing explicit:
   ```ts
   if (detectedUrl && youtubeId) {
     sourceType = 'youtube'
     sourceUrl = detectedUrl
     thumbnailUrl = getYouTubeThumbnailUrl(youtubeId)
     const videoTitle = await fetchYouTubeTitle(detectedUrl)
     // ...
   }
   ```
2. This eliminates the `!` assertion entirely while preserving the logic.

**Acceptance:**
- Zero `!` assertions in non-test production code for values that can be narrowed.
- Email processor behavior unchanged.

---

## Summary Table

| Ticket | Severity | Category | Effort |
|--------|----------|----------|--------|
| S0-R001 | P1 | DRY / Maintainability | ~15 min |
| S0-R002 | P1 | Accessibility / Architecture | ~30 min |
| S0-R003 | P1 | Reliability / Data integrity | ~15 min |
| S0-R004 | P2 | Performance / Best practice | ~10 min |
| S0-R005 | P1 | Type safety | ~15 min |
| S0-R006 | P2 | Test coverage | ~45 min |
| S0-R007 | P2 | Performance | ~15 min |
| S0-R008 | P2 | Security | ~10 min |
| S0-R009 | P2 | Best practice | ~5 min |
| S0-R010 | P2 | UX / Correctness | ~10 min |
| S0-R011 | P3 | Maintainability | ~45 min |
| S0-R012 | P3 | Code quality | ~10 min |
| S0-R013 | P3 | Code quality | ~2 min |
| S0-R014 | P3 | DX / Error handling | ~10 min |
| S0-R015 | P3 | Correctness | ~10 min |
| S0-R016 | P2 | Type safety / Convention | ~5 min |

**Recommended priority order:**
1. S0-R003 (silent DB errors — data integrity risk)
2. S0-R001 + S0-R012 (deduplicate YouTube regex — do together)
3. S0-R005 (SourceType union — prevents future data corruption)
4. S0-R002 (VideoModal → Dialog — accessibility)
5. S0-R004 (remotePatterns — easy performance win)
6. S0-R016 (non-null assertion — quick fix)
7. S0-R008 (metadata scope — security hardening)
8. S0-R006 (url.ts tests — confidence for all URL-related tickets)
9. S0-R010 (thumbnail click dead zone)
10. Everything else
