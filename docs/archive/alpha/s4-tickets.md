# Sprint 4 — Engineering Tickets

> Sprint goal: Full item browsing, filtering, search, and management UI.
> Deliverable: Browse items in List/Card/Timeline views, filter by tag/date, search keywords, open detail, edit summary/tags/notes, pin, bulk delete.
> Total: 38 points across 14 tickets.

---

## Schema migrations required this sprint

Two new columns on `public.items`:

```sql
-- supabase/migrations/<timestamp>_s4_items_notes_group_id.sql
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS group_id uuid;
CREATE INDEX IF NOT EXISTS idx_items_group_id ON public.items(group_id);
```

**`notes`** — user-authored free-text annotation per item. Not AI-generated. Nullable.

**`group_id`** — links all items (body + attachments) that arrived in the same email ingest into a group. The worker sets the same random UUID on all items it creates from a single ingest job. Nullable — existing items created before this migration have `null` and must be handled gracefully in the detail view.

Apply: `npx supabase db push --linked` then `pnpm gen:types`.

> **Note on `ai_summary`:** The actual column name on `items` is `ai_summary` (not `summary`). The UI label is "AI Summary" but all code must use `ai_summary`. Every ticket in this sprint uses this name.

---

### S401 — Items list page (list view)
**Type:** feat
**Points:** 5
**Depends on:** none (S2 pipeline already writes items to DB)

**Goal:** Give users a paginated, scannable list of their saved items as the default dashboard view. Each card shows enough context to decide whether to open the item. Processing and failed states are surfaced inline.

**Scope:**

**Route redirect:** `apps/web/app/(dashboard)/dashboard/page.tsx` currently has a placeholder comment "Item list UI — Sprint 4". Replace the placeholder with a redirect:
```ts
import { redirect } from 'next/navigation'
export default function DashboardPage() { redirect('/items') }
```
The canonical items URL is `/items` from this sprint forward.

**New route:** `apps/web/app/(dashboard)/items/page.tsx` — Server Component, auth-protected via the existing dashboard layout middleware.

**Data fetch:**
```ts
const { data: items } = await supabase
  .from('items')
  .select('id, subject, sender_email, ai_summary, status, error_message, pinned, created_at, item_tags(tags(id, name))')
  .eq('user_id', session.user.id)
  .is('deleted_at', null)
  .eq('type', 'email_body') // list view shows email bodies only; attachments appear in detail
  .order('pinned', { ascending: false })
  .order('created_at', { ascending: false })
  .range(offset, offset + 24) // 25 per page
```

**Pagination:** 25 items per page. URL param `?page=N` (default 1). `offset = (page - 1) * 25`.

**Architecture — view switching:** The items data is fetched server-side and passed as props to a `ItemsPageClient` component (`'use client'`). `ItemsPageClient` reads the view preference from `localStorage` and renders the appropriate layout component (S401b, S401c). This keeps data fetching server-side while allowing client-side view switching without re-fetching.

```ts
// page.tsx (Server Component)
export default async function ItemsPage(...) {
  const items = await fetchItems(...)
  const totalCount = await fetchItemCount(...)
  return <ItemsPageClient items={items} totalCount={totalCount} page={page} />
}
```

**`ItemCard` component** `apps/web/components/ItemCard.tsx` — used by all three view layouts (shared):
- Subject line (1 line truncated)
- `ai_summary` preview (2 lines truncated); skeleton shimmer if `status = 'processing'`
- Tags: up to 4 chips, "+N more" if over
- Date: relative (`2 days ago`) using `date-fns/formatDistanceToNow`
- Status indicator:
  - `pending` / `processing`: shimmer skeleton + "Processing…" label
  - `failed`: distinct border + `error_message` excerpt + "Failed" badge
  - `done`: normal, clickable → `/items/[id]`
- Pin toggle button (S406 — stub as non-interactive in S401, wired in S406)
- Checkbox for bulk select (S407 — stub as hidden in S401, wired in S407)

**Pagination controls:** Prev/Next links at bottom. URL-driven: `?page=N`. No infinite scroll.

**Empty state:** "No items yet. Send an email to `drop@dropnote.com` to get started." + copy button.

**`ai_summary` null handling:** While `status = 'processing'`, `ai_summary` is null — render a skeleton placeholder div for that field.

**Acceptance criteria:**
1. `/dashboard` redirects to `/items`.
2. `/items` renders a paginated list of the user's `email_body` items, excluding soft-deleted ones.
3. Pinned items appear at the top.
4. `processing` items show skeleton + "Processing…" label.
5. `failed` items show a distinct error state with `error_message`.
6. Pagination: 26+ items → page controls appear; page 2 shows correct offset items.
7. Empty state renders when user has no items.
8. `pnpm --filter @drop-note/web typecheck` passes.
9. No raw Tailwind color classes — semantic tokens only. No `dark:` variants.

**Out of scope:**
- Card/grid layout (S401b)
- Timeline layout (S401c)
- View switcher UI (S401d)
- Filtering and search (S403–S405)

---

### S401b — Card/grid view
**Type:** feat
**Points:** 3
**Depends on:** S401

**Goal:** Visual grid layout of item cards for users who prefer a denser presentation.

**Scope:**
- `ItemsGridLayout` component `apps/web/components/items/ItemsGridLayout.tsx`:
  - Wraps items in: `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4`
  - Renders `<ItemCard />` for each item — no changes to `ItemCard` itself
- `ItemsPageClient` renders `<ItemsGridLayout>` when the active view is `'card'` (S401d)
- Same pagination and empty state passed through from the server (S401)

**Acceptance criteria:**
1. Card view renders items in a responsive grid (1/2/3 columns at sm/lg breakpoints).
2. `ItemCard` component is used without modification.
3. Pagination and empty state work identically to list view.
4. `pnpm --filter @drop-note/web typecheck` passes.

---

### S401c — Timeline view
**Type:** feat
**Points:** 5
**Depends on:** S401

**Goal:** Group items chronologically by day with a visual spine, for users who think of their inbox as a feed.

**Scope:**
- `groupItemsByDate(items: Item[]): { date: Date; label: string; items: Item[] }[]` — pure function in `apps/web/lib/items.ts`:
  - Groups by calendar date of `created_at`
  - Label: "Today" / "Yesterday" / `DD Month YYYY`
  - Most-recent day first
- `TimelineSpine` component `apps/web/components/items/TimelineSpine.tsx`:
  - Vertical line + circle dot for each date group, built with Tailwind
  - Date header: `<time dateTime="YYYY-MM-DD">{label}</time>`
  - Items in the group rendered to the right of the spine using `<ItemCard />`
- `ItemsPageClient` renders `<TimelineLayout groups={...}>` when view is `'timeline'`
- Pagination: same 25/page. Date groups can span page boundaries (acceptable for v1).
- `groupItemsByDate` is a pure function — easy to unit test

**PM timebox note:** If Sprint 4 runs long, defer this ticket. S401d will ship as a List/Card-only switcher in that case (see S401d scope).

**Acceptance criteria:**
1. Items are grouped by day with visible date headers.
2. "Today" / "Yesterday" labels appear correctly.
3. Timeline spine (vertical line + dots) renders between date headers.
4. `<time>` elements have correct `datetime` attributes.
5. Pagination works — no crash when a day group spans a page boundary.
6. `pnpm --filter @drop-note/web typecheck` passes.
7. Semantic tokens only, no raw color classes.
8. `groupItemsByDate` has unit tests in `apps/web/lib/__tests__/items.test.ts`.

---

### S401d — View switcher
**Type:** feat
**Points:** 1
**Depends on:** S401, S401b (S401c is optional — see fallback)

**Goal:** Let users switch between item layouts with their preference remembered across sessions.

**Scope:**
- `ViewSwitcher` component `apps/web/components/items/ViewSwitcher.tsx` — `'use client'`
- Three toggle buttons: List, Grid, Timeline — use shadcn `ToggleGroup`
- Active view stored in `localStorage` key `drop-note:items-view` (values: `'list' | 'card' | 'timeline'`)
- Default: `'list'`
- `ItemsPageClient` reads the stored view and renders the matching layout:
  - `'list'` → `ItemsListLayout`
  - `'card'` → `ItemsGridLayout`
  - `'timeline'` → `ItemsTimelineLayout` (if S401c was implemented) OR falls back to `'list'` (if S401c was deferred)
- **Fallback if S401c is not implemented:** Remove the Timeline button from the toggle group. The switcher ships as a List/Card-only toggle. No timeline button is better than a button that does nothing.
- Switching view does not change the URL or re-fetch data — `ItemsPageClient` already has the data as props from S401.

**Acceptance criteria:**
1. Toggle buttons render in the items page toolbar.
2. Switching between List and Card views renders the correct layout.
3. Refreshing the page restores the last selected view.
4. If S401c is not implemented, Timeline button is absent (not disabled).
5. `pnpm --filter @drop-note/web typecheck` passes.

---

### S402 — Item detail panel
**Type:** feat
**Points:** 5
**Depends on:** S401

**Goal:** Full read/edit view for a single item. Summary and tags are AI-generated but user-editable. Notes are user-only. Attachment list links to sibling items from the same ingest (S410).

**Scope:**
- Route: `apps/web/app/(dashboard)/items/[id]/page.tsx` — Server Component
- Fetch the item plus its tag join:
  ```ts
  const { data: item } = await supabase
    .from('items')
    .select('*, item_tags(tags(id, name))')
    .eq('id', params.id)
    .eq('user_id', session.user.id)
    .is('deleted_at', null)
    .single()
  ```
- If not found or null: call `notFound()`
- **Display fields:**
  - Subject (read-only; fallback to filename if type is `attachment`)
  - Sender email (read-only)
  - Date received (`created_at`, formatted)
  - AI Summary (`ai_summary`) — editable inline
  - Tags — editable inline
  - Notes (`notes`) — editable textarea
  - Status badge
  - Attachments list (S410)
- **`ItemDetailEditor` component** `apps/web/components/ItemDetailEditor.tsx` — `'use client'`:
  - Summary: `<textarea>`, saves on blur via `PATCH /api/items/[id]` with `{ ai_summary: string }`
  - Notes: `<textarea>`, saves on blur with `{ notes: string }`
  - Tags: chips with "×" remove + "Add tag" type-ahead input (loaded from `user_tags` prop — all user tags fetched at page load and passed as props)
  - Tag add/remove triggers `PATCH /api/items/[id]` with `{ tags: string[] }` (full replacement list — simpler than diffs for v1)
  - Save on blur/enter — no explicit Save button
  - Optimistic update: update UI immediately, revert on API error with shadcn `toast`
- **`PATCH /api/items/[id]`** `apps/web/app/api/items/[id]/route.ts`:
  - Auth required (401)
  - Accepted fields: `ai_summary?: string`, `notes?: string`, `tags?: string[]`, `pinned?: boolean`
  - `deleted_at` is NOT accepted — restore has a dedicated endpoint (see S408)
  - Verify item ownership: `WHERE id = $id AND user_id = $userId` (belt-and-suspenders alongside RLS)
  - For `tags`: upsert each tag to `tags` table (case-insensitive, `tags_user_id_name_lower_idx` handles uniqueness), then replace `item_tags` rows (delete all existing for this item, insert new set)
  - Returns updated item JSON
- **`GET /api/users/tags`** — fetch all tag names for the current user (used for type-ahead):
  ```ts
  supabase.from('tags').select('id, name').eq('user_id', userId).order('name')
  ```
  This is called once on page load and passed to `ItemDetailEditor` as `userTags` prop.
- **Prev/next navigation (simplified for v1):** The server fetches adjacent item IDs by `created_at DESC` globally (no filter context):
  ```ts
  const { data: prev } = await supabase.from('items')
    .select('id').eq('user_id', userId).is('deleted_at', null).eq('type', 'email_body')
    .lt('created_at', item.created_at).order('created_at', { ascending: false }).limit(1).single()
  const { data: next } = await supabase.from('items')
    .select('id').eq('user_id', userId).is('deleted_at', null).eq('type', 'email_body')
    .gt('created_at', item.created_at).order('created_at', { ascending: true }).limit(1).single()
  ```
  Prev/Next buttons in the header are plain `<Link>` components.
- **Back link:** "← Back to items" → `/items?page=N` — for v1, always links back to page 1. Preserving exact page position is v2.

**Acceptance criteria:**
1. `/items/[id]` renders full item data including tags.
2. Editing `ai_summary` and blurring saves the change (verify in Supabase Studio — column is `ai_summary`).
3. Adding a tag: chip appears and `item_tags` + `tags` tables are updated.
4. Removing a tag: chip disappears and `item_tags` row is deleted.
5. Editing notes and blurring saves the change to `notes` column.
6. Prev/next navigation moves between items by `created_at` order.
7. Invalid or deleted item ID → 404.
8. `pnpm --filter @drop-note/web typecheck` passes.

**Out of scope:**
- Filter-aware prev/next (v2)
- Rich text / markdown for notes (v2)
- AI re-summarize button (v2)

---

### S403 — Tag filter sidebar
**Type:** feat
**Points:** 2
**Depends on:** S401

**Goal:** Filter the item list by tag with a single click. Counts help users understand their content.

**Scope:**

**Sidebar restructure:** The existing sidebar (`apps/web/components/layout/Sidebar.tsx`) is `'use client'` (for theme toggle and sign-out). To add server-fetched tag data, the dashboard layout (`apps/web/app/(dashboard)/layout.tsx`) will fetch tags server-side and pass them as props to the Sidebar:
```ts
// (dashboard)/layout.tsx — Server Component
const { data: tags } = await supabase
  .from('tags')
  .select('id, name, item_tags(count)')
  // equivalent to the count query below — Supabase supports this via postrest aggregate
  // use a raw query or a view if nested count is unreliable
  .eq('user_id', session.user.id)
const tagsWithCounts = ... // compute counts
return <Sidebar tags={tagsWithCounts} ... />
```
If Supabase nested count is unreliable, use a separate RPC or a direct count query:
```sql
SELECT t.id, t.name, COUNT(it.item_id)::int as item_count
FROM tags t
LEFT JOIN item_tags it ON it.tag_id = t.id
LEFT JOIN items i ON i.id = it.item_id AND i.deleted_at IS NULL
WHERE t.user_id = auth.uid()
GROUP BY t.id, t.name
ORDER BY item_count DESC
```

- `Sidebar` now accepts `tags: { id: string; name: string; item_count: number }[]` prop
- Sidebar renders a "Tags" section: "All" link (no `?tag` param) + one link per tag: `[name] (N)`
- Each tag link sets `?tag=<tag-id>` in the URL
- Active tag highlighted via `useSearchParams()` — Sidebar must use `'use client'` already; this is fine
- **Items page filter:** `items/page.tsx` reads `?tag` param. If set, adds to query:
  ```ts
  .eq('item_tags.tag_id', tagId) // via join
  // or use a subquery approach if Supabase client join filter is unreliable
  ```
- If no tags: sidebar shows "Tags will appear here as you save items."

**Acceptance criteria:**
1. Tag list renders in sidebar with item counts (excluding soft-deleted items from counts).
2. Clicking a tag updates URL to `?tag=<id>` and filters the item list.
3. Clicking "All" clears the filter.
4. Active tag is visually highlighted.
5. Sidebar restructure doesn't break existing theme toggle or sign-out.
6. `pnpm --filter @drop-note/web typecheck` passes.

**Out of scope:**
- Multi-tag filter (v2)
- Tag management from sidebar (v2)

---

### S404 — Date filter
**Type:** feat
**Points:** 2
**Depends on:** S401

**Goal:** Drill into items by year/month for time-based browsing.

**Scope:**
- Sidebar section below Tags: "By Date" heading
- Data: fetched in dashboard layout alongside tags:
  ```sql
  SELECT DATE_TRUNC('month', created_at) as month, COUNT(*)::int as item_count
  FROM public.items
  WHERE user_id = auth.uid() AND deleted_at IS NULL AND type = 'email_body'
  GROUP BY month
  ORDER BY month DESC
  ```
  Pass result as `monthCounts: { month: string; item_count: number }[]` prop to Sidebar.
- Render as shadcn `Accordion`: year items → expand to show months with counts
- Current year auto-expanded on page load
- Clicking a month sets `?year=YYYY&month=MM` URL params
- Active month highlighted via `useSearchParams()`
- Items page reads `?year` + `?month` params and adds:
  ```ts
  .gte('created_at', startOfMonth.toISOString())
  .lt('created_at', startOfNextMonth.toISOString())
  ```

**Acceptance criteria:**
1. Date accordion renders correct year/month groupings.
2. Clicking a month filters the item list.
3. Active month is highlighted.
4. Counts exclude soft-deleted and attachment items.
5. `pnpm --filter @drop-note/web typecheck` passes.

---

### S405 — Keyword search (Postgres FTS)
**Type:** feat
**Points:** 3
**Depends on:** S401

**Goal:** Find items by searching summary, subject, notes, and tag names. Postgres FTS for the item fields; a LIKE join for tag names. No external search service.

**Scope:**

**Migration** `supabase/migrations/<timestamp>_s4_fts_index.sql`:
```sql
-- Add generated tsvector column (references the actual column names: ai_summary, notes)
ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS search_vector tsvector
    GENERATED ALWAYS AS (
      to_tsvector('english',
        COALESCE(subject, '') || ' ' ||
        COALESCE(ai_summary, '') || ' ' ||
        COALESCE(notes, '')
      )
    ) STORED;

CREATE INDEX IF NOT EXISTS items_search_vector_gin
  ON public.items USING GIN (search_vector);
```
Apply: `npx supabase db push --linked` then `pnpm gen:types`.

**API route** `apps/web/app/api/items/search/route.ts` (`GET`):
- Query param `?q=<keyword>` — if length < 2: return `200 []` (no DB query; don't return 400 — the client uses 200+empty to clear results cleanly)
- Auth required (401)
- **Single combined query** to avoid two round-trips and N+1:
  ```sql
  SELECT DISTINCT i.id, i.subject, i.ai_summary, i.status, i.pinned, i.created_at
  FROM items i
  LEFT JOIN item_tags it ON it.item_id = i.id
  LEFT JOIN tags t ON t.id = it.tag_id AND t.user_id = i.user_id
  WHERE i.user_id = $userId
    AND i.deleted_at IS NULL
    AND i.type = 'email_body'
    AND (
      i.search_vector @@ websearch_to_tsquery('english', $q)
      OR LOWER(t.name) LIKE LOWER('%' || $q || '%')
    )
  ORDER BY i.created_at DESC
  LIMIT 50
  ```
  Run this via `supabase.rpc('search_items', { query: q, user_id: userId })` with a Postgres function, or via the Supabase client's `.textSearch()` + a secondary tag query merged in the application layer. The RPC approach is cleaner — define the function in the migration.
- **Input sanitization:** sanitize `q` before passing to the DB — strip leading/trailing whitespace; the `websearch_to_tsquery` function is safe against injection (unlike `to_tsquery`), but still trim the input
- Rate limit: 20 requests/minute per user (Redis `INCR` key `search:{userId}` with 60s TTL)

**Search UI** in items page header (`ItemsPageClient` — already `'use client'`):
- Debounced input (300ms)
- Fires when `q.length >= 2`
- `< 2` chars: clears results immediately (show full list)
- Shows result count: "N results for '{query}'"
- Clear (×) button returns to full list
- Loading state: skeleton list while fetching
- URL updated to `?q=keyword` — page load with `?q` pre-populates and fires search
- Search results replace the paginated list (pagination hidden during active search)

**Acceptance criteria:**
1. Searching a word from an item's `ai_summary` returns that item.
2. Searching a tag name returns items with that tag.
3. Input < 2 chars: no fetch fires, list shows all items.
4. URL updates to `?q=keyword`; loading the URL reproduces the search.
5. Clearing search returns to full paginated list.
6. FTS GIN index exists (verify in Supabase Studio or `\d items`).
7. `pnpm --filter @drop-note/web typecheck` passes.

**Out of scope:**
- Keyword highlighting (v2)
- Full email body indexing (v2)
- Semantic/vector search (v2)

---

### S406 — Pin/favorite
**Type:** feat
**Points:** 1
**Depends on:** S402 (PATCH route)

**Goal:** Keep important items at the top with one click.

**Scope:**
- Pin icon button on `ItemCard` (lucide `Pin` filled vs outline) — `'use client'` for optimistic state
- Calls `PATCH /api/items/[id]` with `{ pinned: boolean }` (already supported by S402's route)
- Optimistic update: flip icon immediately, revert on error with toast
- Pinned items sort to top via S401's `ORDER BY pinned DESC, created_at DESC`
- The pin state is passed as a prop from the server — the client toggles it optimistically

**Acceptance criteria:**
1. Clicking pin on an unpinned item: icon flips, DB updated (verify `items.pinned = true` in Supabase Studio).
2. Clicking again: unpins.
3. Optimistic update fires before API response.
4. API error reverts icon + shows toast.
5. `pnpm --filter @drop-note/web typecheck` passes.

---

### S407 — Bulk operations
**Type:** feat
**Points:** 3
**Depends on:** S401, S409 (delete helper created there)

**Goal:** Clean up or retag multiple items at once. The primary use case is bulk delete after a batch of low-value emails.

**Scope:**
- **Checkbox on `ItemCard`**: hidden by default, shown on hover or when `isBulkMode` is true. Controlled by `BulkSelectProvider` context.
- **`BulkSelectProvider`** `apps/web/components/items/BulkSelectProvider.tsx` — `'use client'`:
  - Stores `selectedIds: Set<string>` in state
  - Resets on page navigation (URL change via `useEffect` on `pathname`)
  - **Cross-page behavior:** selection resets on page navigation — this is intentional for v1. Items selected on page 1 are lost when moving to page 2. Document this in the UI as "Selection clears when changing pages."
- **Bulk action toolbar** — renders when `selectedIds.size > 0`:
  - "N selected" count
  - "Select all on this page" checkbox (selects the 25 items passed to the current page)
  - "Delete" button
  - "Add tag" button (opens a tag-name input popover → calls bulk-tag endpoint)
  - "Deselect all" button
- **`DELETE /api/items` (bulk delete)**:
  - Body: `{ ids: string[] }` — empty array returns `200 { deleted: 0 }` (no-op)
  - Auth required (401)
  - For each ID, call the shared `deleteItem` helper (created in S409) passing `users.tier`
  - Fetch `users.tier` once before the loop
  - IDs not owned by the current user are silently skipped (the `WHERE user_id = $userId` clause filters them — this is the intentional v1 behavior for bulk ops; document this decision)
  - Returns `{ deleted: number }`
- **`POST /api/items/bulk-tag`**:
  - Body: `{ ids: string[], tag: string }` — tag name (not ID)
  - Upsert tag to `tags` table (case-insensitive), then `INSERT INTO item_tags ... ON CONFLICT DO NOTHING`
  - Returns `{ tagged: number }`
- **Confirmation modal** for bulk delete: shadcn `AlertDialog`
  - Free user: "Permanently delete N items? This cannot be undone."
  - Paid user: "Move N items to trash?"
- After confirmed delete: remove deleted IDs from `ItemsPageClient` local state optimistically + toast "N items deleted"

**Acceptance criteria:**
1. Checking items shows bulk toolbar with count.
2. "Select all on page" checks current 25 items.
3. Bulk delete shows confirmation modal; confirming removes items from list.
4. Free user: items are hard-deleted (no row in DB).
5. Paid user: items are soft-deleted (`deleted_at` set, row exists).
6. Bulk tag applies tag to all selected items; tag appears on cards.
7. Unknown IDs silently skipped — no 403 thrown for bulk ops.
8. `pnpm --filter @drop-note/web typecheck` passes.

---

### S408 — Soft delete + trash view (paid users)
**Type:** feat
**Points:** 2
**Depends on:** S401, S402, S304, S409 (delete helper)

**Goal:** Give Pro/Power users a 30-day trash before permanent removal.

**Scope:**
- **Single-item delete for paid users:** uses the shared `deleteItem` helper (created in S409). When `user.tier !== 'free'`, the helper sets `deleted_at = NOW()` instead of hard-deleting. A 5-second undo toast appears: "Item moved to trash. [Undo]" — undo calls `POST /api/items/[id]/restore`.
- **`POST /api/items/[id]/restore`** `apps/web/app/api/items/[id]/restore/route.ts`:
  - Auth required (401). Paid tier required (403 if free).
  - `UPDATE items SET deleted_at = NULL WHERE id = $id AND user_id = $userId`
  - Returns `{ ok: true }`
  - Separating restore from PATCH avoids exposing `deleted_at` as a directly client-settable field.
- **Trash route** `apps/web/app/(dashboard)/trash/page.tsx` — Server Component:
  - Query: `SELECT id, subject, ai_summary, filename, deleted_at FROM items WHERE user_id = auth.uid() AND deleted_at IS NOT NULL ORDER BY deleted_at DESC`
  - Free user visiting `/trash`: show "Trash is available on Pro and Power plans. [Upgrade →](/pricing)"
  - Paid user: list of trashed items with:
    - Subject / filename
    - Date deleted
    - Days remaining before purge: `30 - EXTRACT(DAY FROM NOW() - deleted_at)::int` (shown as "X days left")
    - "Restore" button → calls `POST /api/items/[id]/restore`
    - "Delete forever" button → hard delete immediately
  - "Empty trash" button → `DELETE /api/items/trash` (bulk hard-delete all trashed items for user)
- **Sidebar "Trash" link** with count badge showing number of items in trash. Badge hidden if 0. Count fetched in dashboard layout alongside tags.
- **Auto-purge:**
  - **If project is on Supabase Pro (pg_cron available):** add migration:
    ```sql
    CREATE EXTENSION IF NOT EXISTS pg_cron;
    SELECT cron.schedule('purge-old-trash', '0 3 * * *',
      $$DELETE FROM public.items WHERE deleted_at IS NOT NULL AND deleted_at < NOW() - INTERVAL '30 days'$$
    );
    ```
    Note: `CREATE EXTENSION pg_cron` requires Supabase Pro and must be enabled in the Supabase dashboard (Extensions tab) before the migration runs. Add a comment to the migration file noting this prerequisite.
  - **If project is on Supabase free tier:** use a Vercel cron route instead:
    `apps/web/app/api/cron/purge-trash/route.ts` — scheduled in `vercel.json`:
    ```json
    { "crons": [{ "path": "/api/cron/purge-trash", "schedule": "0 3 * * *" }] }
    ```
    Protected by `Authorization: Bearer $CRON_SECRET` header check.
  - Determine which approach to use based on current Supabase plan. Implement the Vercel cron fallback as the safe default; add pg_cron as an enhancement if Pro.
- **Items excluded from cap count and search:** already handled by `deleted_at IS NULL` in all existing queries.

**Acceptance criteria:**
1. Pro user deleting an item: item disappears from `/items`, appears in `/trash`.
2. Restoring from trash: item reappears in `/items`.
3. Days remaining calculation is correct (e.g., item deleted 5 days ago shows "25 days left").
4. Auto-purge: items with `deleted_at > 30 days` are purged (verify manually by setting a past `deleted_at`).
5. Free user at `/trash` sees upgrade prompt; "Restore" API returns 403 for free user.
6. Trash items not counted in tier cap (confirmed by S306 existing logic).
7. `pnpm --filter @drop-note/web typecheck` passes.

---

### S409 — Hard delete (free users) + shared delete helper
**Type:** feat
**Points:** 1
**Depends on:** S401

**Goal:** Free users get immediate permanent delete with confirmation. Also creates the shared delete helper that S407 and S408 reuse.

**Scope:**
- **Shared delete helper** `apps/web/lib/items.ts` (exported function):
  ```ts
  export async function deleteItem(
    id: string,
    userId: string,
    tier: 'free' | 'pro' | 'power',
    supabaseAdmin: SupabaseAdminClient
  ): Promise<{ ok: boolean }>
  ```
  - Free: `DELETE FROM items WHERE id = $id AND user_id = $userId`
  - Pro/Power: `UPDATE items SET deleted_at = NOW() WHERE id = $id AND user_id = $userId`
  - `item_tags` rows are cascade-deleted automatically via the FK `ON DELETE CASCADE` (do not manually delete them)
  - Returns `{ ok: true }` on success
- **`DELETE /api/items/[id]`** `apps/web/app/api/items/[id]/route.ts` (`DELETE` method):
  - Auth required (401)
  - Fetch `users.tier` for current user
  - Call `deleteItem(id, userId, tier, supabaseAdmin)`
  - Returns `{ ok: true }`
- **Delete button on `ItemCard`**: kebab menu item or trash icon (visible on hover). `'use client'`.
  - Free user: shadcn `AlertDialog` — "Permanently delete this item? This cannot be undone." → confirm → DELETE request → optimistic removal from list + toast "Item deleted."
  - Paid user: no confirmation — immediate soft delete + 5-second undo toast (S408).

**Acceptance criteria:**
1. Free user: confirmation modal appears; confirming hard-deletes the item (no row in DB after deletion).
2. Item disappears from list immediately (optimistic removal).
3. Paid user using same delete button: soft delete (item appears in `/trash`).
4. `deleteItem` helper is importable from `apps/web/lib/items.ts`.
5. FK cascade removes `item_tags` automatically — no explicit `item_tags` delete needed.
6. `pnpm --filter @drop-note/web typecheck` passes.

---

### S410 — Attachments display
**Type:** feat
**Points:** 2
**Depends on:** S402

**Goal:** Show files that arrived with the email in the item detail view. Images preview inline; documents offer a download link.

**Scope:**

**Data model:** Attachments are stored as sibling `items` rows with `type = 'attachment'` and the same `group_id` as the `email_body` item. The detail page fetches them:
```ts
// In items/[id]/page.tsx, after fetching the main item:
let attachments: Item[] = []
if (item.group_id) {
  const { data } = await supabase
    .from('items')
    .select('id, filename, storage_path, ai_summary, created_at')
    .eq('group_id', item.group_id)
    .eq('user_id', session.user.id)
    .eq('type', 'attachment')
    .is('deleted_at', null)
  attachments = data ?? []
}
// If group_id is null (items created before this migration), attachments = []
```

**Signed URLs:** generated server-side in the Server Component for all attachments:
```ts
const signedUrls = await Promise.all(
  attachments.map(async (att) => {
    if (!att.storage_path) return { id: att.id, url: null }
    const { data } = await supabase.storage
      .from('attachments')
      .createSignedUrl(att.storage_path, 3600) // 1-hour expiry
    return { id: att.id, url: data?.signedUrl ?? null }
  })
)
```
If a signed URL fails (storage path missing or expired): show "File unavailable" with the filename.

**`AttachmentsSection` component** `apps/web/components/AttachmentsSection.tsx`:
- Rendered below Notes in the detail view
- Hidden if `attachments.length === 0`
- Per attachment:
  - Filename + file size (formatted: `utils/formatBytes`)
  - MIME type icon (image / PDF / document — use lucide icons)
  - Download link (`<a href={signedUrl} download>`)
  - For `image/*` MIME types: `<img src={signedUrl} loading="lazy" style={{ maxHeight: 300 }} alt={filename} />`
- No `'use client'` needed — signed URLs are generated server-side and passed as props

**Note on `group_id` backfill:** The S2 worker must be updated to set `group_id` on new items. Existing items created before this sprint have `group_id = null` and show no attachments in the detail view — this is acceptable. The worker update is a separate task for the worker (add it as a sub-task under S410 or a follow-up fix).

**Acceptance criteria:**
1. An item with `group_id` set shows attachment files below Notes.
2. Image attachments render inline previews (max 300px height).
3. Non-image attachments show download links.
4. Signed URLs have an expiry token (not public permanent URLs).
5. `group_id = null` items show no Attachments section (graceful fallback).
6. Missing `storage_path` shows "File unavailable" message.
7. `pnpm --filter @drop-note/web typecheck` passes.

---

### S411 — API unit + integration tests
**Type:** test
**Points:** 3
**Depends on:** S402, S405, S406, S407, S408, S409

**Goal:** Cover the highest-risk item management API paths. Delete semantics (soft vs hard), cross-user data isolation, and search are where bugs silently lose user data or expose other users' content.

**Scope:**

Test files:
- `apps/web/app/api/items/__tests__/crud.test.ts`
- `apps/web/app/api/items/__tests__/search.test.ts`
- `apps/web/app/api/items/__tests__/delete.test.ts`
- `apps/web/lib/__tests__/items.test.ts` (pure helpers)

**Pure helper tests (`apps/web/lib/items.test.ts`):**
- `groupItemsByDate` (S401c):
  - Items on the same day → one group
  - Items spanning two days → two groups, most-recent first
  - Empty array → empty array
  - Today/yesterday labels correct

**PATCH `/api/items/[id]`:**
- Valid `ai_summary` update: DB updated, returns 200 with updated item
- Valid `notes` update: DB updated
- Valid `tags` replacement: `item_tags` rows replaced
- `pinned: true`: item pinned
- `deleted_at` field in body: ignored (not accepted — verify DB column unchanged)
- Item owned by another user: 403
- Unauthenticated: 401
- Empty `{}` body: no-op, returns 200

**GET `/api/items/search`:**
- `?q=a` (1 char): returns 200 with `[]` (no DB query fires — mock to verify)
- `?q=in` (2 chars): returns 200, query fires
- `?q=invoice`: returns items matching in `ai_summary` or `subject`
- `?q=tagname`: returns items with that tag name
- Results exclude soft-deleted items
- Unauthenticated: 401

**DELETE `/api/items/[id]`:**
- Free user: item hard-deleted (row does not exist in DB after call)
- Pro user: item soft-deleted (`deleted_at` set, row still exists)
- Item owned by another user: 403
- Unauthenticated: 401

**`deleteItem` helper:**
- Free tier → hard delete called (mock DB, verify DELETE query)
- Paid tier → soft delete (verify UPDATE with `deleted_at`)
- No explicit `item_tags` delete — FK cascade handles it (do not assert a manual delete was called)

**Bulk delete `DELETE /api/items`:**
- All IDs owned by user: all deleted per tier rule
- Mixed IDs (some from another user): silently skips non-owned IDs, deletes owned ones, returns correct count
- Empty `ids`: returns `{ deleted: 0 }`
- Unauthenticated: 401

**RLS isolation test:**
- Using Supabase anon client with User A's JWT: attempt to SELECT User B's item by known ID → returns empty result set (RLS returns empty, not 403)
- This is a conceptual note: if using a mocked Supabase client, document that RLS is enforced at the DB level and trust the existing RLS migration tests. If using a real test Supabase instance, verify directly.

**Acceptance criteria:**
1. `pnpm test` passes with all new tests green.
2. Both free and paid delete semantics have explicit branch coverage in `deleteItem`.
3. `deleted_at` in PATCH body is rejected (not persisted).
4. `?q < 2` search: no DB query fires (verified by mock assertion).
5. No tests make real network calls (Supabase and Redis mocked).
6. `pnpm --filter @drop-note/web typecheck` passes.

**Out of scope:**
- E2E tests for full browse flow (Sprint 6)
- Attachment signed URL tests (add to S410 unit scope if needed)
