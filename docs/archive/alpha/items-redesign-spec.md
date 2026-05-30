# Items Page Redesign Spec

**Created:** 2026-05-28  
**Owner:** Mic  
**Engineer:** techlead-jose  
**Status:** LOCKED — execute in phases P1 → P3 → P2 → P5 → P4

---

## Locked Decisions

All 12 open questions resolved by Mic per Jason's full-authority directive (2026-05-28).

| # | Question | Decision |
|---|---|---|
| B7 | Color dot semantic | Source type: email=blue, youtube=red, article=green, note=purple |
| B3 | Tag colors | Hash-based from palette (zero schema cost) |
| B3.b | Video duration badge | Placeholder "—:——" (no YouTube Data API key at launch) |
| B1 | Archive | New `archived_at timestamptz` column (parallel to `deleted_at`) |
| B2 | OG image extraction | Placeholder grey box for articles without thumbnail_url (c) |
| B6 | Favicon source | `https://www.google.com/s2/favicons?domain={domain}&sz=32` + letter fallback |
| B5 | Tag filter | Single-select (keep current ?tag= URL pattern) |
| B11 | User avatar | Google profile photo + initials monogram fallback |
| B4 | Notification bell | Decorative only at launch — no backend wired |
| B9 | Brand text | Keep "drop-note" hyphen everywhere |
| B12 | PR strategy | Phased — one branch + PR per phase |
| B14 | Mobile | Defer polish — don't break mobile but no pixel-perfect mobile work per phase |

---

## Design Token System

Single source of truth: `apps/web/lib/design-tokens.ts` + CSS variables in `apps/web/app/globals.css`.

**Principle:** Every color in this redesign references a CSS variable. Changing one variable updates everywhere. No hardcoded hex or Tailwind color classes in components.

### Token file: `apps/web/lib/design-tokens.ts`

```typescript
// Tag color palette — hash(tag.name) % length gives the index
export const TAG_PALETTE = [
  'var(--color-tag-blue)',
  'var(--color-tag-purple)',
  'var(--color-tag-pink)',
  'var(--color-tag-green)',
  'var(--color-tag-yellow)',
  'var(--color-tag-orange)',
  'var(--color-tag-teal)',
  'var(--color-tag-indigo)',
] as const

export function colorForTag(name: string): string {
  const hash = [...name].reduce((a, c) => a + c.charCodeAt(0), 0)
  return TAG_PALETTE[hash % TAG_PALETTE.length]
}

// Source type dot colors
export const SOURCE_DOT: Record<string, string> = {
  email: 'var(--color-source-email)',
  youtube: 'var(--color-source-youtube)',
  article: 'var(--color-source-article)',
  note: 'var(--color-source-note)',
  default: 'var(--color-source-default)',
}

// Status dot colors (AI processing status)
export const STATUS_DOT: Record<string, string> = {
  done: 'var(--color-status-done)',
  processing: 'var(--color-status-processing)',
  pending: 'var(--color-status-processing)',
  failed: 'var(--color-status-failed)',
}

// Stat card accent colors (for the 4 header stat cards)
export const STAT_CARD_ACCENT = {
  totalSaved: 'var(--color-stat-total)',
  thisWeek: 'var(--color-stat-week)',
  processing: 'var(--color-stat-processing)',
  topTag: 'var(--color-stat-tag)',
} as const
```

### CSS variables to add to `globals.css` `:root` block

```css
/* Tag palette */
--color-tag-blue: 214 89% 52%;
--color-tag-purple: 270 60% 55%;
--color-tag-pink: 330 70% 55%;
--color-tag-green: 142 55% 42%;
--color-tag-yellow: 45 90% 45%;
--color-tag-orange: 25 85% 50%;
--color-tag-teal: 180 55% 40%;
--color-tag-indigo: 245 65% 52%;

/* Source type dots */
--color-source-email: 214 89% 52%;
--color-source-youtube: 0 85% 52%;
--color-source-article: 142 55% 42%;
--color-source-note: 270 60% 55%;
--color-source-default: 215 16% 55%;

/* Status dots */
--color-status-done: 142 71% 45%;
--color-status-processing: 45 90% 45%;
--color-status-failed: 0 84% 60%;

/* Stat card accents */
--color-stat-total: 214 89% 52%;
--color-stat-week: 142 55% 42%;
--color-stat-processing: 45 90% 45%;
--color-stat-tag: 270 60% 55%;
```

Dark mode equivalents go in the `.dark` block (same variable names, adjusted brightness).

---

## Phase Plan

Execution order: **P1 → P3 → P2 → P5 → P4** (highest visual impact first, migration-dependent Archive last).

---

## P1 — Header + Stats Cards + Page Title

**Branch:** `s8/items-redesign-p1`  
**Impact:** Immediately visible. Stats cards replace bare "Items" heading. User avatar + bell in header.

### What to build

#### 1. Stats Cards row (new component: `components/items/StatsBar.tsx`)

4 cards in a responsive grid (2x2 on mobile, 4x1 on desktop):

| Card | Label | Value | Subtext | Accent icon color |
|---|---|---|---|---|
| Total Saved | "Total saved" | `totalCount` | "all time" | `--color-stat-total` (blue) |
| This Week | "This week" | `thisWeekCount` | "+N vs last week" | `--color-stat-week` (green) |
| Processing | "Processing" | `processingCount` | "arriving now" | `--color-stat-processing` (yellow) |
| Top Tag | "Top tag" | `#tagname` | "N items" | `--color-stat-tag` (purple) |

Stats data comes from new props added to `ItemsPageClient`:
```typescript
interface StatsData {
  totalCount: number
  thisWeekCount: number
  processingCount: number
  topTag: { name: string; count: number } | null
}
```

These are passed down from the server component (`items/page.tsx`) which already queries Supabase for all items. Add the aggregation queries there:
- `thisWeekCount`: count items created >= 7 days ago
- `processingCount`: count items where status IN ('pending', 'processing')
- `topTag`: from the existing `get_tags_with_counts` RPC result (already fetched in layout), pass as prop via layout → page prop drilling OR add a new query in `items/page.tsx` directly

Card anatomy (each card):
```
[icon top-right, accent color]  [label text-muted-foreground text-sm]
[big number font-bold text-3xl]
[subtext text-xs text-muted-foreground]
```

Border: `border border-border rounded-xl bg-card p-4`. No box-shadow. Clean.

#### 2. Page header row

Replace the current bare `<h1>Items</h1>` section with:

```
[left]  "Your inbox"  (h1, font-bold text-2xl)
        "Everything you've saved, organized by AI"  (p, text-sm text-muted-foreground)

[right] "Updated just now"  (text-xs text-muted-foreground, shows relative time since last item created_at)
```

#### 3. Top header bar (new component: `components/items/ItemsPageHeader.tsx`)

A fixed or sticky top bar within the items page (inside the main scroll area, NOT the sidebar):
```
[left]  "drop-note" wordmark  (text-sm font-semibold)
[right] Bell icon (decorative, no onClick handler — just visual)
        Avatar: Google profile photo (next/image, 32x32 rounded-full) with initials fallback
```

Avatar implementation:
- Get `user.user_metadata.avatar_url` from Supabase auth session (already available in server component)
- Pass `avatarUrl: string | null` and `userInitials: string` as props
- Initials = first letter of email local part, uppercased. If email is "jason@..." → "J". Two-char if space in display name: "Jason Gao" → "JG"
- Avatar color (for initials bg): `colorForTag(email)` from design-tokens — gives consistent color per user

Pass `avatarUrl` and `userInitials` from `items/page.tsx` down to `ItemsPageClient` → `ItemsPageHeader`.

Add `www.google.com` and `lh3.googleusercontent.com` to `next.config.js` `images.remotePatterns` if not already present.

#### 4. Design tokens file (new: `apps/web/lib/design-tokens.ts`)

Write the full token file as specified above. This is P1's foundation — all subsequent phases import from it.

#### 5. CSS variable additions in `globals.css`

Add all 19 new CSS variables (tag palette, source dots, status dots, stat card accents) to both `:root` and `.dark` blocks.

### Files to create/modify in P1

| File | Action |
|---|---|
| `apps/web/lib/design-tokens.ts` | CREATE — full token file |
| `apps/web/app/globals.css` | MODIFY — add 19 CSS variables to :root + .dark |
| `apps/web/components/items/StatsBar.tsx` | CREATE |
| `apps/web/components/items/ItemsPageHeader.tsx` | CREATE |
| `apps/web/components/items/ItemsPageClient.tsx` | MODIFY — add header + stats, new props |
| `apps/web/app/(dashboard)/items/page.tsx` | MODIFY — add stats queries, pass new props |
| `apps/web/next.config.js` (or `.ts`) | MODIFY — add Google image domains if missing |
| `apps/web/lib/__tests__/design-tokens.test.ts` | CREATE — TDD: colorForTag hash is deterministic, handles empty string, SOURCE_DOT has all source types |
| `apps/web/components/items/__tests__/StatsBar.test.tsx` | CREATE — TDD: renders all 4 cards, handles null topTag, shows correct labels |
| `apps/web/components/items/__tests__/ItemsPageHeader.test.tsx` | CREATE — TDD: shows avatar img when avatarUrl present, shows initials fallback when null, bell icon present |

### What NOT to touch in P1

- Do NOT change ItemCard layout or content
- Do NOT change ItemsListLayout / ItemsGridLayout / TimelineSpine
- Do NOT change the search bar
- Do NOT change the tag filter bar (that's P2)
- Do NOT add the sort dropdown (that's P5)
- Do NOT add Archive nav item (that's P4, needs migration)
- Do NOT change sidebar

### Acceptance criteria — P1

1. `pnpm turbo lint && pnpm turbo typecheck && pnpm --filter @drop-note/web build` — zero errors
2. `pnpm test` — all new test files green
3. Stats cards render with correct labels and accent colors matching design-tokens vars
4. User avatar shows Google photo (or initials monogram) in top-right header
5. Bell icon present and decorative (no JS handler, no console error on click)
6. Page title changed to "Your inbox" with subtitle
7. `design-tokens.ts` `colorForTag("same input")` returns same value on repeated calls (deterministic hash)
8. No hardcoded hex color values in any new component — all colors via CSS vars or semantic Tailwind tokens
9. Commits prefixed `[s8]`, under 72 chars, co-author trailer: `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>`

---

## P3 — Item Cards (source dot + favicon + read-time + colored tag pills)

**Branch:** `s8/items-redesign-p3`  
**Depends on:** P1 (design-tokens.ts must be merged)

### What to build

#### 1. Source dot in `ItemCard.tsx`

Left of the item title: a 6px filled circle. Color from `SOURCE_DOT[item.source_type ?? 'default']`.

```tsx
<span
  className="w-1.5 h-1.5 rounded-full shrink-0 mt-1"
  style={{ backgroundColor: SOURCE_DOT[item.source_type ?? 'default'] }}
  aria-hidden="true"
/>
```

#### 2. Favicon/avatar left column (list view)

In list view (`isListView=true`), show a 24x24 favicon or letter avatar left of title:
- If `item.source_url` exists: use `https://www.google.com/s2/favicons?domain={domain}&sz=32` via next/image
- Fallback: letter avatar (first letter of domain, bg color = `colorForTag(domain)`)
- For email source type with no URL: show envelope icon 16px, color `--color-source-email`

New component: `components/ItemFavicon.tsx`

#### 3. Read time badge

If `item.ai_summary` exists, estimate read time: `Math.max(1, Math.round(wordCount / 200))` min.
Show as: `⏱ {N} min read` in `text-xs text-muted-foreground` next to the domain.

Only show for `status === 'done'` items.

#### 4. Colored tag pills

Update `TagRow.tsx`: instead of uniform `bg-secondary`, use `colorForTag(tag.name)` for background (with 15% opacity), and the full color for the text/border:

```tsx
<span
  key={tag.id}
  className="shrink-0 rounded-md text-xs py-0 px-1.5 leading-5 font-medium"
  style={{
    backgroundColor: `hsl(${colorForTag(tag.name)} / 0.12)`,
    color: `hsl(${colorForTag(tag.name)})`,
    border: `1px solid hsl(${colorForTag(tag.name)} / 0.3)`,
  }}
>
  {tag.name}
</span>
```

Note: the CSS var values are in HSL format (e.g., `214 89% 52%`) so this interpolation works.

#### 5. Grid card: video duration overlay

For YouTube items in grid view with a thumbnail: overlay a duration badge in bottom-right of thumbnail. Show `—:——` as placeholder. Style: `bg-black/80 text-white text-xs px-1 rounded`.

#### 6. Grid card: article placeholder

For non-YouTube items with no `thumbnail_url` in grid view: show a grey placeholder box (same dimensions as thumbnail area) with the favicon centered inside it.

### Files to modify in P3

| File | Action |
|---|---|
| `apps/web/components/ItemCard.tsx` | MODIFY — source dot, read-time, grid placeholder |
| `apps/web/components/TagRow.tsx` | MODIFY — colored pills using colorForTag |
| `apps/web/components/ItemFavicon.tsx` | CREATE |
| `apps/web/components/__tests__/ItemCard.test.tsx` | MODIFY — add source dot tests, read-time tests |
| `apps/web/components/__tests__/TagRow.test.tsx` | CREATE or MODIFY — colored pills test |
| `apps/web/components/__tests__/ItemFavicon.test.tsx` | CREATE — letter fallback, favicon img rendered |

### Acceptance criteria — P3

1. Build/lint/typecheck clean
2. Source dot present on every item row (list + grid)
3. Tag pills show distinct colors (not all uniform grey) — test: same tag name always same color
4. Favicon/letter avatar shows in list view left column
5. Read time shows for done items only
6. Video duration placeholder shows on YouTube grid cards
7. No hardcoded colors

---

## P2 — Tag Filter Bar

**Branch:** `s8/items-redesign-p2`  
**Depends on:** P1

### What to build

Replace the current active-tag pill (shown only when a tag is active) with a scrollable horizontal tag filter bar showing ALL tags.

New component: `components/items/TagFilterBar.tsx`

```
[All  247]  [# ai  38]  [# research  31]  [# tools  27]  ...  (horizontally scrollable)
```

- "All" pill: always first, active state = filled (dark bg, white text), count = totalCount
- Tag pills: `#tagname  count` format, active = filled, inactive = ghost (border only)
- Clicking a tag: navigate to `?tag={id}` (single-select, consistent with current sidebar behavior)
- Clicking "All" or active tag: navigate to `/items` (clear filter)
- Horizontal scroll: `overflow-x-auto no-scrollbar flex gap-2`
- Tags passed as prop: `tags: { id: string; name: string; count: number }[]`
- Tags come from `layout.tsx` → currently passed to Sidebar. Need to also pass to `ItemsPageClient` via `items/page.tsx`.

Note: layout already fetches `get_tags_with_counts`. The items page server component needs to receive tags. Either pass via layout slot or re-query in page. Preferred: pass from layout via a shared server context pattern or just re-query in page (simple, acceptable for V1).

### Files in P2

| File | Action |
|---|---|
| `apps/web/components/items/TagFilterBar.tsx` | CREATE |
| `apps/web/components/items/ItemsPageClient.tsx` | MODIFY — add TagFilterBar, new `tags` prop |
| `apps/web/app/(dashboard)/items/page.tsx` | MODIFY — add tags query, pass to client |
| `apps/web/components/items/__tests__/TagFilterBar.test.tsx` | CREATE — renders All pill + tag pills, active state, count display |

### Acceptance criteria — P2

1. Build/lint/typecheck clean
2. TagFilterBar renders above search bar
3. Clicking a tag pill navigates to correct ?tag= URL
4. Active tag pill shows filled state
5. "All" pill shows total count
6. Horizontal scroll works, no scrollbar visible

---

## P5 — Sort Dropdown UI Polish

**Branch:** `s8/items-redesign-p5`  
**Depends on:** P1

### What to build

Replace current sort UI (if any) or add a Popover-based sort dropdown:

Options: "Newest", "Oldest", "Pinned first"  
Current default: newest (ORDER BY pinned DESC, created_at DESC already in query)

New component: `components/items/SortDropdown.tsx` using shadcn `Popover` + `Button`.

URL param: `?sort=newest|oldest|pinned` — add to items/page.tsx query.

### Files in P5

| File | Action |
|---|---|
| `apps/web/components/items/SortDropdown.tsx` | CREATE |
| `apps/web/components/items/ItemsPageClient.tsx` | MODIFY — wire sort param |
| `apps/web/app/(dashboard)/items/page.tsx` | MODIFY — handle sort param in query |
| `apps/web/components/items/__tests__/SortDropdown.test.tsx` | CREATE |

---

## P4 — Archive + Sidebar Update

**Branch:** `s8/items-redesign-p4`  
**Depends on:** P1, needs DB migration

### What to build

1. Migration: `ALTER TABLE items ADD COLUMN archived_at timestamptz DEFAULT NULL`
2. New route: `/archive` page (similar to `/trash`) showing archived items
3. Archive action: PATCH `/api/items/{id}` with `{ archived: true }` → sets `archived_at = now()`
4. Sidebar: Add "Archive" nav link below "Pinned" (with item count)
5. Filter items page to exclude archived items (add `.is('archived_at', null)` to existing queries)
6. Tag dot in sidebar: small colored dot per tag using `colorForTag(tag.name)`

### Files in P4

Migration + route + sidebar update. Full brief TBD when P1-P3 are done.

---

## Mockup Reference

| View | Path |
|---|---|
| Grid view top | `/Users/lego/.claude/image-cache/9c8cb383-ce75-4dc2-a2c0-98452c800e47/8.png` |
| Grid view scrolled | `/Users/lego/.claude/image-cache/9c8cb383-ce75-4dc2-a2c0-98452c800e47/9.png` |
| List view top | `/Users/lego/.claude/image-cache/9c8cb383-ce75-4dc2-a2c0-98452c800e47/10.png` |
| List view scrolled | `/Users/lego/.claude/image-cache/9c8cb383-ce75-4dc2-a2c0-98452c800e47/11.png` |
| Compact view | `/Users/lego/.claude/image-cache/9c8cb383-ce75-4dc2-a2c0-98452c800e47/12.png` |
| Sort dropdown | `/Users/lego/.claude/image-cache/9c8cb383-ce75-4dc2-a2c0-98452c800e47/13.png` |
