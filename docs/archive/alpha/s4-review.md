# S4 Code Review — Post-Sprint Audit

**Reviewer:** Tech Lead / Code Auditor
**Date:** 2026-03-27
**Scope:** All files added or modified in Sprint 4 commits (`[s4]`), plus carryover from S1–S3 reviews
**Verdict:** Sprint 4 delivered a solid structural foundation — the view switching architecture (server-fetch → client render) is clean, the timeline/grid/list abstraction is well-separated, the `deleteItem` helper correctly branches on tier, and the FTS migration with `search_items` RPC is the right approach. The sidebar tag/date filter design with server-fetched data passed as props is textbook Next.js App Router. However, three entire ticket features (S406 pin toggle, S407 bulk operations, S409 delete button) are **dead code** — the components exist but are never wired into the page tree. Search results are silently empty due to a response parsing mismatch. Several API routes have no error handling, and the RPC functions bypass RLS via `SECURITY DEFINER` without validating the caller. The test suite for CRUD and search provides near-zero route-level confidence.

---

## Severity Legend

| Level | Meaning |
|-------|---------|
| **P0 — Critical** | Will cause data loss, silent failures, or runtime crashes in production. Fix immediately. |
| **P1 — High** | Incorrect behavior or significant performance/security issue. Fix before launch. |
| **P2 — Medium** | Best-practice violation or latent bug. Fix this sprint or next. |
| **P3 — Low** | Cleanup / DX improvement. Schedule when convenient. |

---

## S4-R001 · P0 · Search results always empty — response shape mismatch

**What's wrong:**
In `ItemsPageClient.tsx` line 82:
```ts
setSearchResults(data.items ?? [])
```

But the search API route (`/api/items/search/route.ts` line 36) returns a flat array:
```ts
return NextResponse.json(items ?? [])
```

The API returns `[{id, subject, ...}, ...]` directly — not `{ items: [...] }`. So `data.items` is always `undefined`, and `data.items ?? []` always resolves to `[]`.

**Result:** The search bar appears to work (debounce fires, URL updates to `?q=keyword`, loading state shows), but the result list is always empty. The "0 results" message displays even when the RPC found matches. Users will think search is broken or their content isn't indexed.

**File:** `apps/web/components/items/ItemsPageClient.tsx`

**Actionable steps:**
1. Change line 82 from `setSearchResults(data.items ?? [])` to `setSearchResults(Array.isArray(data) ? data : [])`.
2. Alternatively, update the search API to return `{ items: [...] }` for consistency with other endpoints, and keep the client code as-is.
3. Add a test that verifies the client correctly parses the search response shape.

**Acceptance:**
- Searching a word from an item's `ai_summary` or subject returns that item in the UI.
- Search results render `ItemCard` components with correct data.

---

## S4-R002 · P0 · BulkSelectProvider and BulkActionToolbar are never mounted — S407 is dead code

**What's wrong:**
The S407 ticket delivers `BulkSelectProvider`, `BulkActionToolbar`, and `useBulkSelect`. All three are defined and exported but **never imported or used** anywhere in the component tree:

- `BulkSelectProvider` is never rendered as a wrapper around `ItemsPageClient` or any layout
- `useBulkSelect()` is never called by `ItemCard` or any layout component
- `BulkActionToolbar` is never rendered in `ItemsPageClient`
- `ItemCard` accepts `isBulkMode`, `isSelected`, `onSelectChange` props, but they are never passed by any layout component (`ItemsListLayout`, `ItemsGridLayout`, `TimelineSpine` all render `<ItemCard item={item} />` with no bulk props)

**Result:** The entire bulk select and bulk delete/tag feature doesn't exist in the UI. Checkboxes never appear. The toolbar never renders. The API routes (`DELETE /api/items`, `POST /api/items/bulk-tag`) exist but are unreachable from the UI.

**Files:** `apps/web/components/items/ItemsPageClient.tsx`, `apps/web/components/items/ItemsListLayout.tsx`, `apps/web/components/items/ItemsGridLayout.tsx`, `apps/web/components/items/TimelineSpine.tsx`

**Actionable steps:**
1. Wrap `ItemsPageClient` content (or the dashboard layout children) in `<BulkSelectProvider>`.
2. In `ItemsPageClient`, use `useBulkSelect()` to get `selectedIds`, `toggle`, `selectAll`, `deselectAll`, `isBulkMode`.
3. Pass bulk props through to layout components, which pass them to `<ItemCard>`:
   ```tsx
   <ItemCard
     item={item}
     isBulkMode={isBulkMode}
     isSelected={selectedIds.has(item.id)}
     onSelectChange={(id, checked) => toggle(id)}
   />
   ```
4. Render `<BulkActionToolbar>` in `ItemsPageClient` when `isBulkMode` is true, passing the user's tier (requires passing tier from the server layout as a prop).
5. After bulk delete, remove deleted IDs from the displayed items list (optimistic update).

**Acceptance:**
- Hovering over an ItemCard shows a checkbox.
- Checking items shows the bulk toolbar with "N selected".
- "Select all on this page" checks all visible items.
- Bulk delete and bulk tag operations work end-to-end.

---

## S4-R003 · P0 · Pin toggle is non-functional — S406 is dead code

**What's wrong:**
In `ItemCard.tsx` lines 25-26:
```ts
onPinChange: _onPinChange,
onDelete: _onDelete,
```

Both props are destructured with `_` prefix and never used. The pin button (lines 69-79) has no `onClick` handler:
```tsx
<button type="button" aria-label={...} className="..." tabIndex={-1}>
  <Pin size={14} className={...} />
</button>
```

It's a static, non-interactive icon. Clicking it does nothing. No layout component passes `onPinChange` anyway.

**Result:** S406 acceptance criteria #1 ("Clicking pin on an unpinned item: icon flips, DB updated") fails. The pin icon displays correctly for already-pinned items but cannot be toggled.

**File:** `apps/web/components/ItemCard.tsx`

**Actionable steps:**
1. Wire `onPinChange` to the pin button's `onClick`:
   ```tsx
   <button
     type="button"
     onClick={(e) => {
       e.preventDefault()
       e.stopPropagation()
       onPinChange?.(item.id, !item.pinned)
     }}
   >
   ```
2. In each layout component, pass `onPinChange` from the parent. The handler should call `PATCH /api/items/[id]` with `{ pinned: !current }` and optimistically update the UI.
3. Add optimistic state management — flip the icon immediately, revert on API error with a toast.

**Acceptance:**
- Clicking pin on an unpinned item: icon fills, API called, DB `pinned = true`.
- Clicking again: unpins.
- Optimistic update fires before API response; reverts on error.

---

## S4-R004 · P0 · Delete button on ItemCard doesn't exist — S409 UI is dead code

**What's wrong:**
S409 specifies: "Delete button on ItemCard: kebab menu item or trash icon (visible on hover)." `ItemCard` accepts an `onDelete` prop but destructures it as `_onDelete` (unused). There is **no delete button, no kebab menu, and no trash icon** anywhere in the `ItemCard` component's render output.

The `deleteItem` helper works correctly. The `DELETE /api/items/[id]` route works correctly. But there is no UI to trigger either for individual items from the list view.

**File:** `apps/web/components/ItemCard.tsx`

**Actionable steps:**
1. Add a delete button (trash icon or kebab menu with "Delete" option) to `ItemCard`, visible on hover.
2. Wire `onDelete` prop:
   - Free user: show `AlertDialog` confirmation → "Permanently delete this item?"
   - Paid user: no confirmation, immediate soft delete → 5-second undo toast calling `POST /api/items/[id]/restore`
3. Pass `onDelete` from layout components, with the handler calling `DELETE /api/items/[id]` and optimistically removing the item from the list.

**Acceptance:**
- Hovering an ItemCard reveals a delete action.
- Free user: confirmation dialog appears; confirming removes the item from the list.
- Paid user: item immediately disappears, undo toast appears for 5 seconds.
- `DELETE /api/items/[id]` is called correctly.

---

## S4-R005 · P0 · Bulk delete response count is always the requested count — not actual deletions

**What's wrong:**
In `apps/web/app/api/items/route.ts` lines 36-39:
```ts
let deleted = 0
for (const id of ids) {
  await deleteItem(id, user.id, tier)
  deleted++
}
```

The `deleted` counter increments unconditionally after each `deleteItem()` call, regardless of whether the item existed, was owned by the user, or was actually deleted. The `deleteItem` helper's WHERE clause (`eq('user_id', userId)`) silently skips items that aren't owned by the user, but the response still claims they were deleted.

If a user submits `{ ids: ["real-id", "fake-id", "other-user-id"] }`, the response is `{ deleted: 3 }` even though only 1 item was actually deleted.

**File:** `apps/web/app/api/items/route.ts`

**Actionable steps:**
1. Modify `deleteItem` to return whether a row was actually affected:
   ```ts
   export async function deleteItem(...): Promise<{ ok: boolean; affected: boolean }>
   ```
   Use `.select()` after delete/update to check if a row was returned.
2. Only increment `deleted` when `result.affected` is true.
3. Alternatively, batch the delete into a single query with `.in('id', ids).eq('user_id', userId)` and use the returned count — this also eliminates the N+1 sequential delete loop.

**Acceptance:**
- `DELETE /api/items` with 3 IDs where only 1 is owned returns `{ deleted: 1 }`.
- `DELETE /api/items` with `{ ids: [] }` returns `{ deleted: 0 }`.

---

## S4-R006 · P1 · `SECURITY DEFINER` RPC functions bypass RLS — no caller validation

**What's wrong:**
All three new RPC functions in `20260326000005_s4_fts_index.sql` are `SECURITY DEFINER`:
- `search_items(query text, p_user_id uuid)`
- `get_tags_with_counts(p_user_id uuid)`
- `get_month_counts(p_user_id uuid)`

`SECURITY DEFINER` means the function executes with the **owner's** privileges (typically `postgres` superuser), not the calling user's. RLS policies are completely bypassed.

The functions filter by `WHERE ... user_id = p_user_id`, which provides data isolation **if the caller passes the correct user ID**. However, with the Supabase anon client, a malicious user could call:
```js
supabase.rpc('search_items', { query: 'secret', p_user_id: 'victim-uuid' })
```
Since the function runs as the owner (bypassing RLS), this returns the victim's data.

The dashboard layout passes `user.id` from the authenticated session, so normal app usage is safe. But the RPC is callable directly via the Supabase REST API with just the anon key.

**File:** `supabase/migrations/20260326000005_s4_fts_index.sql`

**Actionable steps:**
1. **Best fix:** Change all three functions to `SECURITY INVOKER` (default) and let RLS handle data isolation. Remove the `p_user_id` parameter — use `auth.uid()` inside the function instead:
   ```sql
   CREATE OR REPLACE FUNCTION search_items(query text)
   RETURNS TABLE (...) LANGUAGE sql SECURITY INVOKER AS $$
     SELECT ...
     FROM items i
     WHERE i.user_id = auth.uid()
       AND ...
   $$;
   ```
2. **Alternative (if INVOKER causes issues with the authenticated client):** Keep `SECURITY DEFINER` but add a guard:
   ```sql
   IF p_user_id != auth.uid() THEN
     RAISE EXCEPTION 'Forbidden';
   END IF;
   ```
   This requires switching to `LANGUAGE plpgsql`.
3. Update the TypeScript callers to remove the `p_user_id` parameter if using approach #1.

**Acceptance:**
- Calling `search_items` with the anon key and a different user's UUID returns empty results (or raises an error).
- Normal dashboard usage continues to work.

---

## S4-R007 · P1 · No try-catch in any S4 API routes — unhandled exceptions return 500 HTML

**What's wrong:**
None of the 7 new S4 API routes have try-catch blocks:

| Route | File | Unhandled throws? |
|-------|------|-------------------|
| `PATCH /api/items/[id]` | `[id]/route.ts` | **Yes** — `request.json()`, Supabase calls |
| `DELETE /api/items/[id]` | `[id]/route.ts` | **Yes** — Supabase calls |
| `DELETE /api/items` (bulk) | `route.ts` | **Yes** — `request.json()`, Supabase calls |
| `POST /api/items/[id]/restore` | `restore/route.ts` | **Yes** — Supabase calls |
| `POST /api/items/bulk-tag` | `bulk-tag/route.ts` | **Yes** — `request.json()`, Supabase calls |
| `DELETE /api/items/trash` | `trash/route.ts` | **Yes** — Supabase calls |
| `GET /api/items/search` | `search/route.ts` | **Yes** — Redis, Supabase RPC |

If Supabase or Redis is temporarily unreachable, or if `request.json()` fails, these routes throw unhandled exceptions → Next.js returns generic 500 HTML → the client's `res.json()` call throws → toast error message is unhelpful.

This was flagged in S3-R014. Sprint 4 added 7 more routes with the same pattern.

**Files:** All 7 S4 API route files listed above

**Actionable steps:**
1. Wrap every route handler body in try-catch:
   ```ts
   export async function PATCH(request: NextRequest, { params }: ...) {
     try {
       // ... existing logic ...
     } catch (err) {
       console.error('[items/patch] Error:', err instanceof Error ? err.message : err)
       return NextResponse.json(
         { error: 'Internal server error' },
         { status: 500 }
       )
     }
   }
   ```
2. Better: extract a shared `withErrorHandler` wrapper (as proposed in S3-R014) and apply it to all routes:
   ```ts
   export const PATCH = withErrorHandler(async (request, { params }) => { ... })
   ```

**Acceptance:**
- No route throws unhandled to the Next.js error boundary.
- All error responses are JSON, not HTML.
- Supabase being down returns `500 { error: "Internal server error" }`, not a stack trace.

---

## S4-R008 · P1 · PATCH route uses `supabaseAdmin` for all operations — bypasses RLS entirely

**What's wrong:**
In `apps/web/app/api/items/[id]/route.ts`, every Supabase operation uses `supabaseAdmin`:
- Line 30: ownership check (`supabaseAdmin.from('items').select(...)`)
- Line 46: item update (`supabaseAdmin.from('items').update(...)`)
- Lines 61-76: tag find/create (`supabaseAdmin.from('tags')...`)
- Line 81: item_tags delete/insert (`supabaseAdmin.from('item_tags')...`)
- Line 90: return updated item (`supabaseAdmin.from('items').select(...)`)

The `supabaseAdmin` client bypasses RLS. While the `.eq('user_id', user.id)` filter provides application-level isolation, if it's accidentally removed during refactoring, there's no database safety net. The tag operations on `tags` table don't even have a user_id filter for the insert — they rely on the code being correct.

The authenticated `supabase` client (already created at line 10) would enforce RLS for the items table. The admin client is only needed for cross-table operations that RLS would block (e.g., inserting into another user's scope), which doesn't apply here since the user is operating on their own data.

**Files:** `apps/web/app/api/items/[id]/route.ts`, `apps/web/app/api/items/[id]/restore/route.ts`, `apps/web/app/api/items/bulk-tag/route.ts`, `apps/web/app/api/items/trash/route.ts`, `apps/web/app/api/items/route.ts`

**Actionable steps:**
1. Use the authenticated `supabase` client for all operations where the user is operating on their own data (items, tags, item_tags).
2. Reserve `supabaseAdmin` for operations that truly need to bypass RLS (e.g., reading `users.tier` if the RLS policy doesn't expose it to the user, or the purge-trash cron).
3. This also lets you drop the manual `.eq('user_id', user.id)` filter for items queries — RLS handles it.

**Acceptance:**
- PATCH, DELETE, restore, bulk-tag, and bulk-delete routes use the authenticated client.
- Removing `.eq('user_id', ...)` still returns only the current user's data (RLS safety net).
- The purge-trash cron (no user session) continues to use `supabaseAdmin`.

---

## S4-R009 · P1 · PATCH route tag replacement is N+1 — sequential queries per tag

**What's wrong:**
In `apps/web/app/api/items/[id]/route.ts` lines 56-77, the tag replacement logic does:
```
for each tagName in tags:
  1. SELECT from tags WHERE name ILIKE tagName  → 1 query
  2. If not found: INSERT into tags              → 1 query
```

For N tags, this is N to 2N sequential DB round-trips. With 10 tags, that's up to 20 sequential queries — plus the DELETE all item_tags + INSERT new item_tags at the end.

**File:** `apps/web/app/api/items/[id]/route.ts`

**Actionable steps:**
1. Batch the tag lookup:
   ```ts
   const { data: existingTags } = await supabaseAdmin
     .from('tags')
     .select('id, name')
     .eq('user_id', user.id)
     .in('name', tags.map(t => t.trim().toLowerCase()))
   ```
   Note: this requires adjusting for case-insensitivity.
2. Identify missing tags and batch-insert them:
   ```ts
   const existingNames = new Set(existingTags.map(t => t.name.toLowerCase()))
   const newTagNames = tags.filter(t => !existingNames.has(t.toLowerCase()))
   const { data: newTags } = await supabaseAdmin
     .from('tags')
     .insert(newTagNames.map(name => ({ name, user_id: user.id })))
     .select('id')
   ```
3. This reduces the worst case from 2N+2 queries to 4 queries (lookup + insert + delete old + insert new).

**Acceptance:**
- Replacing 10 tags issues at most 4 DB queries, not 20+.
- Case-insensitive tag matching still works correctly.
- `pnpm typecheck` passes.

---

## S4-R010 · P1 · Restore route doesn't verify update affected any rows

**What's wrong:**
In `apps/web/app/api/items/[id]/restore/route.ts` lines 26-31:
```ts
await supabaseAdmin
  .from('items')
  .update({ deleted_at: null })
  .eq('id', params.id)
  .eq('user_id', user.id)

return NextResponse.json({ ok: true })
```

If the item doesn't exist, or isn't owned by the user, or isn't in trash (already has `deleted_at = null`), the UPDATE matches 0 rows. Supabase returns `{ error: null }` — no error is thrown. The response is `{ ok: true }`, misleading the caller.

The same issue applies to the "Delete forever" button in the trash view — it calls `DELETE /api/items/[id]`, and `deleteItem` doesn't verify row existence either (returns `{ ok: true }` unconditionally).

**File:** `apps/web/app/api/items/[id]/restore/route.ts`

**Actionable steps:**
1. Add `.select('id')` and check the result:
   ```ts
   const { data, error } = await supabaseAdmin
     .from('items')
     .update({ deleted_at: null })
     .eq('id', params.id)
     .eq('user_id', user.id)
     .not('deleted_at', 'is', null) // only restore items that are actually in trash
     .select('id')
     .maybeSingle()

   if (error) return NextResponse.json({ error: 'Restore failed' }, { status: 500 })
   if (!data) return NextResponse.json({ error: 'Item not found in trash' }, { status: 404 })
   return NextResponse.json({ ok: true })
   ```
2. Apply similar verification in `deleteItem` helper.

**Acceptance:**
- Restoring a non-existent item returns 404, not 200.
- Restoring an item that isn't in trash returns 404.
- Restoring a valid trashed item returns 200.

---

## S4-R011 · P1 · Search results missing `item_tags`, `sender_email`, `error_message` — ItemCard renders incomplete

**What's wrong:**
The `search_items` RPC function returns:
```sql
id, subject, ai_summary, status, pinned, created_at
```

But `ItemCard` expects `ItemSummary` which includes:
- `sender_email` — not returned by search
- `error_message` — not returned by search
- `item_tags` (with nested `tags`) — not returned by search

When search results render, `ItemCard` will:
1. Show empty tags section (no tag chips)
2. Show `undefined` for sender_email if it were displayed (not used in card, but part of the type)
3. For failed items: show fallback error text instead of the actual `error_message`

**Files:** `supabase/migrations/20260326000005_s4_fts_index.sql`, `apps/web/lib/items.ts` (ItemSummary type)

**Actionable steps:**
1. Extend the `search_items` RPC to include `sender_email` and `error_message`:
   ```sql
   RETURNS TABLE (
     id uuid, subject text, sender_email text, ai_summary text,
     status text, error_message text, pinned boolean, created_at timestamptz
   )
   ```
2. For tags in search results, either:
   a. Return tag names as a comma-separated string or JSON array from the RPC, OR
   b. After fetching search results, do a secondary query to fetch `item_tags` for the result IDs
3. Update the `ItemSummary` type or create a `SearchResult` type that documents which fields may be absent.

**Acceptance:**
- Search results show tags, error messages, and all fields that `ItemCard` renders.
- Type safety: no `undefined` field access.

---

## S4-R012 · P1 · Redis module-level initialization crashes if env vars missing

**What's wrong:**
In `apps/web/app/api/items/search/route.ts` line 5:
```ts
const redis = Redis.fromEnv()
```

This runs at module import time. `Redis.fromEnv()` reads `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` from `process.env`. If either is missing, the constructor throws — the entire module fails to import, and the search route is completely dead with no meaningful error message to the user.

**File:** `apps/web/app/api/items/search/route.ts`

**Actionable steps:**
1. Lazy-init the Redis client:
   ```ts
   import { requireEnv } from '@drop-note/shared'

   let _redis: Redis | null = null
   function getRedis(): Redis {
     if (!_redis) {
       _redis = new Redis({
         url: requireEnv('UPSTASH_REDIS_REST_URL'),
         token: requireEnv('UPSTASH_REDIS_REST_TOKEN'),
       })
     }
     return _redis
   }
   ```
2. Or import from the shared `getRedis()` factory (if created per S3-R011).
3. Wrap the rate limit check in try-catch so Redis being down doesn't kill search entirely:
   ```ts
   try {
     const redis = getRedis()
     const count = await redis.incr(key)
     ...
   } catch (err) {
     console.error('[search] Redis rate limit check failed:', err)
     // Fail open — allow the search through
   }
   ```

**Acceptance:**
- Missing Redis env vars produce a clear error message, not a module import crash.
- Redis being temporarily down doesn't prevent search from working.

---

## S4-R013 · P1 · `get_month_counts` returns `timestamptz` but client expects `YYYY-MM` string

**What's wrong:**
The `get_month_counts` RPC returns:
```sql
RETURNS TABLE (month timestamptz, item_count int)
```

But the sidebar's `MonthCount` interface expects:
```ts
interface MonthCount { month: string /* 'YYYY-MM' */ ; item_count: number }
```

When Supabase serializes `timestamptz`, it sends something like `"2026-03-01T00:00:00+00:00"`. The sidebar does `mc.month.split('-')` which gives `["2026", "03", "01T00:00:00+00:00"]`. This works by accident because only elements `[0]` and `[1]` are used — but it's fragile.

If Supabase ever changes the timestamp format (e.g., omitting the timezone offset), or if the code is refactored to use more than the first two elements, it breaks silently.

**File:** `supabase/migrations/20260326000005_s4_fts_index.sql`, `apps/web/components/layout/sidebar.tsx`

**Actionable steps:**
1. Change the RPC to return a formatted string:
   ```sql
   RETURNS TABLE (month text, item_count int)
   -- ...
   SELECT TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') as month, ...
   ```
2. Or parse the date properly on the client:
   ```ts
   const date = new Date(mc.month)
   const y = date.getUTCFullYear().toString()
   const m = (date.getUTCMonth() + 1).toString().padStart(2, '0')
   ```

**Acceptance:**
- `MonthCount.month` is reliably `"YYYY-MM"` format.
- Sidebar renders correct year/month labels.

---

## S4-R014 · P2 · `deleteItem` imports `supabaseAdmin` at module top — couples pure helpers to global state

**What's wrong:**
In `apps/web/lib/items.ts` line 2:
```ts
import { supabaseAdmin } from '@/lib/supabase/admin'
```

This file exports both `groupItemsByDate` (a pure function) and `deleteItem` (which needs a DB client). Because `supabaseAdmin` is imported at the top level, **any import from this file** requires the admin client env vars to be set.

The test file `items.test.ts` has to mock the admin module even when only testing `groupItemsByDate`:
```ts
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: {} }))
```

This is a design smell — a pure utility function shouldn't require database credentials to import.

**File:** `apps/web/lib/items.ts`

**Actionable steps:**
1. Split into two files:
   - `apps/web/lib/items.ts` — pure helpers (`groupItemsByDate`, `ItemSummary` type, `ItemGroup` type)
   - `apps/web/lib/items-db.ts` — DB-dependent helpers (`deleteItem`)
2. Or remove the default `supabaseAdmin` import and make the `client` parameter required:
   ```ts
   export async function deleteItem(
     id: string,
     userId: string,
     tier: 'free' | 'pro' | 'power',
     client: Pick<SupabaseClient, 'from'>,
   ): Promise<{ ok: boolean }>
   ```
   All callers already have access to `supabaseAdmin` and can pass it explicitly.
3. Remove the `as any` cast on line 51 — proper typing via the `Pick<>` parameter.

**Acceptance:**
- `groupItemsByDate` is importable without env vars or mocking.
- `deleteItem` tests use an explicitly passed mock client, not a module mock.
- No `eslint-disable` comment for `@typescript-eslint/no-explicit-any`.

---

## S4-R015 · P2 · Tag filter uses two-query approach with potentially large IN clause

**What's wrong:**
In `apps/web/app/(dashboard)/items/page.tsx` lines 37-41:
```ts
const { data: taggedItemIds } = await supabase
  .from('item_tags')
  .select('item_id')
  .eq('tag_id', tagId)
tagFilterIds = taggedItemIds?.map((r) => r.item_id) ?? []
```

Then line 69:
```ts
query = query.in('id', tagFilterIds)
```

If a popular tag has 500 items, `tagFilterIds` is a 500-element array. The `.in('id', [...500 UUIDs...])` generates a query with `WHERE id IN ('uuid1', 'uuid2', ..., 'uuid500')`. Postgres handles this, but it's wasteful — the DB has to parse and match against 500 literal values instead of using a subquery or join.

Additionally, the `item_tags` query doesn't filter by `user_id` — it relies on the subsequent items query having `.eq('user_id', user.id)` to filter. If an item_tags row references a tag_id that belongs to another user but happens to match, no harm done because the items query filters by user. But it's querying more data than necessary.

**File:** `apps/web/app/(dashboard)/items/page.tsx`

**Actionable steps:**
1. Use a Supabase inner join filter or an RPC with a subquery:
   ```ts
   // Option A: RPC approach
   const { data: items } = await supabase.rpc('get_items_by_tag', {
     p_tag_id: tagId,
     p_offset: offset,
     p_limit: 25,
   })
   ```
2. Or use a `.filter()` approach if Supabase JS client supports it:
   ```ts
   query = query.not('item_tags', 'is', null)
     .eq('item_tags.tag_id', tagId)
   ```
3. At minimum, add `.eq('user_id', user.id)` to the item_tags query for correctness.

**Acceptance:**
- Tag filtering works without materializing all item IDs in the application layer.
- Large tag sets don't generate excessively large IN clauses.

---

## S4-R016 · P2 · Date filter doesn't validate year/month params — invalid values crash

**What's wrong:**
In `apps/web/app/(dashboard)/items/page.tsx` lines 73-78:
```ts
if (year && month) {
  const start = new Date(parseInt(year), parseInt(month) - 1, 1)
  const end = new Date(parseInt(year), parseInt(month), 1)
  query = query
    .gte('created_at', start.toISOString())
    .lt('created_at', end.toISOString())
}
```

If a user navigates to `?year=abc&month=xyz`, `parseInt('abc')` returns `NaN`. `new Date(NaN, NaN, 1)` creates an "Invalid Date", and `.toISOString()` on an Invalid Date **throws a RangeError**: `Invalid time value`.

This is a server component — an unhandled throw renders Next.js's error page.

**File:** `apps/web/app/(dashboard)/items/page.tsx`

**Actionable steps:**
1. Validate the parsed values before constructing dates:
   ```ts
   if (year && month) {
     const y = parseInt(year)
     const m = parseInt(month)
     if (!isNaN(y) && !isNaN(m) && m >= 1 && m <= 12) {
       const start = new Date(y, m - 1, 1)
       const end = new Date(y, m, 1)
       query = query
         .gte('created_at', start.toISOString())
         .lt('created_at', end.toISOString())
     }
   }
   ```
2. Invalid params are silently ignored — the full item list is shown.

**Acceptance:**
- `?year=abc&month=xyz` doesn't crash — shows full item list.
- `?year=2026&month=13` doesn't crash — month 13 is ignored.
- Valid params still filter correctly.

---

## S4-R017 · P2 · `CRON_SECRET` uses raw `process.env` — missing secret silently rejects all purge requests

**What's wrong:**
In `apps/web/app/api/cron/purge-trash/route.ts` line 8:
```ts
const cronSecret = process.env.CRON_SECRET
```

If `CRON_SECRET` is not set, `cronSecret` is `undefined`. The check `!cronSecret` correctly rejects the request. But there's no startup error or log telling the developer the var is missing. Trash items silently accumulate forever.

**File:** `apps/web/app/api/cron/purge-trash/route.ts`

**Actionable steps:**
1. Use `requireEnv('CRON_SECRET')` to fail fast if missing:
   ```ts
   import { requireEnv } from '@drop-note/shared'
   // Lazy-loaded to avoid crashing on import for routes that don't need it
   let _cronSecret: string | null = null
   function getCronSecret() {
     if (!_cronSecret) _cronSecret = requireEnv('CRON_SECRET')
     return _cronSecret
   }
   ```
2. Or validate at runtime with a clear log:
   ```ts
   if (!cronSecret) {
     console.error('[purge-trash] CRON_SECRET is not configured — skipping purge')
     return NextResponse.json({ error: 'Not configured' }, { status: 500 })
   }
   ```

**Acceptance:**
- Missing `CRON_SECRET` produces a clear error, not silent rejection.
- `pnpm typecheck` passes.

---

## S4-R018 · P2 · `searchParams` wrapped in `Promise.resolve()` — unnecessary indirection

**What's wrong:**
In `apps/web/app/(dashboard)/items/page.tsx` line 25:
```ts
const params = await Promise.resolve(searchParams ?? {})
```

In Next.js 14, `searchParams` for page components is a plain object — no need to wrap it in `Promise.resolve()`. This adds confusion (suggesting it's async when it's not) and an unnecessary microtask tick.

**File:** `apps/web/app/(dashboard)/items/page.tsx`

**Actionable steps:**
1. Replace with a direct assignment:
   ```ts
   const params = searchParams ?? {}
   ```

**Acceptance:**
- No functional change — cleaner code.
- `pnpm typecheck` passes.

---

## S4-R019 · P2 · `ItemDetailEditor` labels lack `htmlFor` — accessibility issue

**What's wrong:**
In `apps/web/components/ItemDetailEditor.tsx`:
```tsx
<label className="text-sm font-medium">AI Summary</label>
<textarea ... />
```

The `<label>` elements are siblings to the `<textarea>` elements but are not associated via `htmlFor` + `id`. Clicking the label text does not focus the corresponding textarea. Screen readers also cannot determine the label-input relationship.

**File:** `apps/web/components/ItemDetailEditor.tsx`

**Actionable steps:**
1. Add `id` attributes to the textareas and `htmlFor` to the labels:
   ```tsx
   <label htmlFor="item-summary" className="text-sm font-medium">AI Summary</label>
   <textarea id="item-summary" ... />
   ```
2. Apply the same for the Notes label/textarea and the Tags label/input.

**Acceptance:**
- Clicking "AI Summary" label focuses the summary textarea.
- Screen readers associate labels with inputs.
- No WCAG 2.1 A violations for label association.

---

## S4-R020 · P2 · `AttachmentsSection` detects image by file extension — should use MIME type

**What's wrong:**
`AttachmentsSection.tsx` uses an `IMAGE_EXTENSIONS` set against the filename's extension:
```ts
const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico', 'avif'])
function isImage(filename: string | null): boolean {
  return IMAGE_EXTENSIONS.has(getExtension(filename))
}
```

The attachment's MIME type is available in the `items` table (the S2 ingest pipeline stores it). Relying on file extension is unreliable: a `.jpg` could be a renamed PDF, an image could have no extension, or a user could email a `.JPEG` (uppercase). The extension set also includes types not in the allowed MIME list (`svg`, `bmp`, `ico`, `avif`) which were never ingested.

**File:** `apps/web/components/AttachmentsSection.tsx`

**Actionable steps:**
1. Fetch and pass the attachment's `content_type` from the database:
   ```ts
   type Attachment = {
     id: string
     filename: string | null
     storage_path: string | null
     content_type: string | null  // MIME type from DB
     // ...
   }
   ```
2. Check MIME type instead of extension:
   ```ts
   function isImage(contentType: string | null): boolean {
     return contentType?.startsWith('image/') ?? false
   }
   ```
3. Update the detail page query to include `content_type` in the select.

**Acceptance:**
- Image detection uses MIME type, not file extension.
- An image uploaded without an extension still renders inline.
- Non-image files with image-like extensions don't get incorrectly previewed.

---

## S4-R021 · P2 · Sidebar link styling duplicated 7+ times — extract `SidebarLink`

**What's wrong:**
Every navigation link in `sidebar.tsx` uses an identical pattern:
```tsx
<Link
  href="..."
  className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground transition-colors ${
    isActive ? 'bg-accent text-accent-foreground font-medium' : 'text-muted-foreground'
  }`}
>
```

This pattern appears 7+ times (All Items, Settings, Pricing, Trash, All tags, each individual tag, each month). Changing the padding, hover color, or active style requires updating every instance.

**File:** `apps/web/components/layout/sidebar.tsx`

**Actionable steps:**
1. Extract a `SidebarLink` component:
   ```tsx
   function SidebarLink({
     href, isActive, children, className, ...props
   }: { href: string; isActive: boolean } & React.ComponentProps<typeof Link>) {
     return (
       <Link
         href={href}
         className={cn(
           'flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors',
           'hover:bg-accent hover:text-accent-foreground',
           isActive ? 'bg-accent text-accent-foreground font-medium' : 'text-muted-foreground',
           className,
         )}
         {...props}
       >
         {children}
       </Link>
     )
   }
   ```
2. Replace all 7+ link blocks with `<SidebarLink href="..." isActive={...}>`.

**Acceptance:**
- All sidebar links share a single styling source of truth.
- Changing active/hover styles requires editing one component.

---

## S4-R022 · P2 · Paid user "Delete forever" from trash calls `DELETE /api/items/[id]` — extra SELECT round-trip

**What's wrong:**
When a paid user clicks "Delete forever" on a trash item (`TrashItem.tsx` line 61), it calls `DELETE /api/items/[id]`. The `deleteItem` helper then:
1. `SELECT deleted_at FROM items WHERE id = ? AND user_id = ?` — to check if it's already in trash
2. Sees `deleted_at` is set → `DELETE FROM items WHERE id = ? AND user_id = ?`

The extra SELECT is unnecessary — we already know the item is in trash (it's displayed on the trash page). A dedicated `DELETE /api/items/[id]/forever` endpoint could skip the check and hard-delete directly.

**Files:** `apps/web/app/(dashboard)/trash/TrashItem.tsx`, `apps/web/lib/items.ts`

**Actionable steps:**
1. Add a `force` parameter to `deleteItem` or create a separate hard-delete helper:
   ```ts
   export async function hardDeleteItem(id: string, userId: string, client): Promise<{ ok: boolean }> {
     await client.from('items').delete().eq('id', id).eq('user_id', userId)
     return { ok: true }
   }
   ```
2. Or add a query parameter to `DELETE /api/items/[id]?permanent=true` to skip the soft-delete check.
3. This saves one DB round-trip per "Delete forever" action.

**Acceptance:**
- "Delete forever" from trash performs a single DELETE query, not SELECT + DELETE.
- Normal delete behavior (soft vs hard by tier) is unchanged.

---

## S4-R023 · P3 · CRUD and search test files test inline logic — not actual route handlers

**What's wrong:**
`crud.test.ts` tests things like:
```ts
it('accepted fields: ai_summary, notes, tags, pinned', () => {
  const acceptedFields = ['ai_summary', 'notes', 'tags', 'pinned']
  expect(acceptedFields).not.toContain('deleted_at')
})
```

This tests a hardcoded array, not the actual route behavior. It provides zero confidence that the route rejects `deleted_at` in the body, handles auth correctly, or returns the right status codes.

`search.test.ts` tests a standalone `shouldSearch()` function that isn't even exported from the route — it's reinvented inline in the test.

The `delete.test.ts` file is the only well-tested file, with proper mock-based testing of the `deleteItem` helper.

**Files:** `apps/web/app/api/items/__tests__/crud.test.ts`, `apps/web/app/api/items/__tests__/search.test.ts`

**Actionable steps:**
1. Replace the contract tests with actual route handler tests using mocked Supabase:
   ```ts
   it('rejects deleted_at in body', async () => {
     // Setup: mock auth, mock supabase
     const req = new NextRequest('http://localhost/api/items/123', {
       method: 'PATCH',
       body: JSON.stringify({ deleted_at: '2026-01-01', ai_summary: 'test' }),
     })
     const res = await PATCH(req, { params: { id: '123' } })
     // Verify: supabase.update() was NOT called with deleted_at
   })
   ```
2. For search, mock the Redis client and Supabase RPC:
   ```ts
   it('returns 429 when rate limited', async () => {
     mockRedis.incr.mockResolvedValue(21) // over limit
     const res = await GET(makeSearchRequest('?q=test'))
     expect(res.status).toBe(429)
   })
   ```
3. The S411 ticket acceptance criteria (#1) says "pnpm test passes with all new tests green" — the tests pass, but they don't test what the ticket specifies.

**Acceptance:**
- CRUD tests mock Supabase and test actual route handlers with real request objects.
- Search tests verify rate limiting, auth, and response shape.
- `pnpm test` passes with meaningful assertions.

---

## S4-R024 · P3 · `performSearch` callback recreated on every URL change

**What's wrong:**
In `ItemsPageClient.tsx` lines 61-89:
```ts
const performSearch = useCallback(
  async (q: string) => { ... },
  [router, searchParams],
)
```

`useSearchParams()` returns a new `ReadonlyURLSearchParams` instance on every URL change. Since `searchParams` is in the dependency array, `performSearch` is re-created on every navigation. This cascades to `handleSearchChange` (which depends on `performSearch`), causing unnecessary re-renders.

**File:** `apps/web/components/items/ItemsPageClient.tsx`

**Actionable steps:**
1. Use `searchParams.toString()` as the dependency (string comparison is stable):
   ```ts
   const searchParamsString = searchParams.toString()
   const performSearch = useCallback(
     async (q: string) => {
       const params = new URLSearchParams(searchParamsString)
       // ...
     },
     [router, searchParamsString],
   )
   ```
2. Or use a ref for searchParams to avoid re-creating the callback entirely.

**Acceptance:**
- `performSearch` identity is stable across URL changes that only affect `page` param.
- Typing in the search bar doesn't trigger unnecessary re-renders of child components.

---

## S4-R025 · P3 · Missing page metadata/title on items list and detail pages

**What's wrong:**
The trash page exports metadata:
```ts
export const metadata = { title: 'Trash — drop-note' }
```

But neither the items list page (`items/page.tsx`) nor the detail page (`items/[id]/page.tsx`) export metadata. The browser tab shows the generic "drop-note" title for all item pages. The detail page should ideally show the item's subject as the tab title.

**Files:** `apps/web/app/(dashboard)/items/page.tsx`, `apps/web/app/(dashboard)/items/[id]/page.tsx`

**Actionable steps:**
1. Add static metadata to the items list page:
   ```ts
   export const metadata = { title: 'Items — drop-note' }
   ```
2. Add dynamic metadata to the detail page using `generateMetadata`:
   ```ts
   export async function generateMetadata({ params }: { params: { id: string } }) {
     const supabase = await createClient()
     const { data } = await supabase.from('items').select('subject').eq('id', params.id).single()
     return { title: `${data?.subject ?? 'Item'} — drop-note` }
   }
   ```
   Note: This adds an extra query. For v1, a static title is acceptable.

**Acceptance:**
- Browser tab shows "Items — drop-note" on the list page.
- Browser tab shows item subject on the detail page (or "Item — drop-note" as fallback).

---

## S4-R026 · P3 · `groupItemsByDate` uses local timezone — SSR/client mismatch possible

**What's wrong:**
`groupItemsByDate` in `items.ts` uses `format(date, 'yyyy-MM-dd')` from date-fns, which operates in the runtime's local timezone. For server-side rendering, this is the server's timezone (likely UTC). For client-side re-renders, this is the user's browser timezone.

An item created at 11:30 PM UTC on January 15 would be grouped under:
- "January 15" on the server (UTC)
- "January 16" for a user in UTC+2

This mismatch between SSR and client hydration could cause a React hydration error, or items could visually jump between date groups after hydration.

**File:** `apps/web/lib/items.ts`

**Actionable steps:**
1. Use UTC-based date grouping to ensure consistency:
   ```ts
   import { formatInTimeZone } from 'date-fns-tz'
   const dateKey = formatInTimeZone(date, 'UTC', 'yyyy-MM-dd')
   ```
2. Or use `date.toISOString().slice(0, 10)` which is always UTC.
3. For v1, this is acceptable since the timeline is client-rendered (view switching happens client-side after server data is passed). Document the limitation.

**Acceptance:**
- Date grouping is consistent between SSR and client hydration.
- No React hydration warnings related to date labels.

---

## S4-R027 · P3 · Native HTML checkboxes instead of shadcn Checkbox — design inconsistency

**What's wrong:**
`ItemCard.tsx` line 52 and `BulkActionToolbar.tsx` line 119 use raw:
```tsx
<input type="checkbox" className="h-4 w-4 accent-foreground" />
```

The rest of the app uses shadcn components for form elements. Native checkboxes render with the browser's default styling, which doesn't match the shadcn design system and looks different across browsers/OS.

**Files:** `apps/web/components/ItemCard.tsx`, `apps/web/components/items/BulkActionToolbar.tsx`

**Actionable steps:**
1. Install shadcn Checkbox component: `npx shadcn@latest add checkbox`
2. Replace native checkboxes with `<Checkbox>` from `@/components/ui/checkbox`.
3. Wire the `onCheckedChange` callback.

**Acceptance:**
- Checkboxes match the app's design system.
- Consistent appearance across browsers and themes.

---

## Carryover from Previous Reviews (Not Addressed in S3 Fix or S4)

| Ticket | Issue | Originally Flagged | Status |
|--------|-------|-------------------|--------|
| S3-R001 | `usage_log` fire-and-forget write never executes — dead code | S3 review | **Unknown — not in S4 scope, verify** |
| S3-R002 | Missing UNIQUE constraint on `users.stripe_customer_id` | S3 review | **Unknown — not in S4 scope, verify** |
| S3-R003 | HTML injection in cap-exceeded email via `emailSubject` | S3 review | **Unknown — not in S4 scope, verify** |
| S3-R005 | Pricing page CTA logic for paid-to-paid upgrades | S3 review | Open |
| S3-R014 | Inconsistent error handling across routes | S3 review | **Worsened** — S4 added 7 more unhandled routes |
| S1-R013 | `block_list.type` uses CHECK instead of ENUM | S1 review | Still open |
| S1-R017 | Middleware calls `getUser()` on public pages | S1 review | Still open |
| S2-R019 | `openai.ts` hardcodes model name | S2 review | Still open |

---

## Summary by Priority

| Priority | Count | Tickets |
|----------|-------|---------|
| P0 — Critical | 5 | S4-R001, S4-R002, S4-R003, S4-R004, S4-R005 |
| P1 — High | 8 | S4-R006, S4-R007, S4-R008, S4-R009, S4-R010, S4-R011, S4-R012, S4-R013 |
| P2 — Medium | 9 | S4-R014 – S4-R022 |
| P3 — Low | 5 | S4-R023 – S4-R027 |
| Carryover | 8 | S3-R001–003, S3-R005, S3-R014, S1-R013, S1-R017, S2-R019 |
| **Total** | **35** | |

### Recommended execution order

1. **Immediate hotfix** (before any user testing): S4-R001 (search always empty), S4-R002 (bulk ops dead code), S4-R003 (pin dead code), S4-R004 (delete button missing), S4-R005 (bulk delete count wrong). These are entire ticket features that appear complete in code but don't function in the UI.
2. **This week** (before launch): S4-R006 (SECURITY DEFINER bypass), S4-R007 (no error handling), S4-R008 (admin client overuse), S4-R009 (N+1 tags), S4-R010 (restore doesn't verify), S4-R011 (search missing fields), S4-R012 (Redis crash on import), S4-R013 (month format mismatch)
3. **Sprint 5 alongside feature work**: S4-R014 through S4-R022
4. **Backlog**: S4-R023 through S4-R027, plus carryover items
