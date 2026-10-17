# drop-note UI Style Guide

> The single source of truth for how drop-note's UI is built. **All new UI code must follow this.**
> Goal: one cohesive product + theming that changes in **one place**.
> Source of truth for values: `apps/web/app/globals.css` (`:root` + `.dark`) and `apps/web/tailwind.config.ts`.
>
> **Visual direction: Airmail** (board decision 2026-10-16). See [`docs/design/AIRMAIL.md`](design/AIRMAIL.md) for how things should look.

---

## 0. The one hard rule

**Anything theme-able is a token, never a hardcoded value.**

- ❌ `className="bg-pink-500 text-[#1a1a1a]"` — raw Tailwind color / hex
- ❌ `style={{ color: '#e11d48' }}`
- ✅ `className="bg-card text-foreground"` — semantic Tailwind token
- ✅ `style={{ color: 'hsl(var(--color-pin))' }}` — CSS var
- ✅ tag/source colors via the helpers in `lib/design-tokens.ts`

If a color you need doesn't have a token, **add a token to `globals.css` (light + dark) first**, then use it. Never inline a hex.

Light (Airmail) and dark (Night Mail) are both first-class. Check every UI change in both themes. Token values are copied from `docs/design/airmail/tokens-{light,dark}.css`.

---

## 1. Color tokens (defined in `globals.css`, all HSL channels)

Use as Tailwind tokens (`bg-x`, `text-x`) where wired in `tailwind.config.ts`, or inline as `hsl(var(--x))` / `hsl(var(--x) / 0.12)` for tints.

### Surfaces
| Token | Value (light) | Use |
|---|---|---|
| `--background` | white | app base, sidebar, top nav |
| `--card` | white | every card/panel/input surface (`bg-card`) |
| `--content-bg` | `#EEF1F9` | dashboard content canvas — `bg-canvas bg-dot-grid` (on `<main>`) |
| `--muted` / `--muted-foreground` | pale blue-grey / `#485270` | subtle fills, secondary text |
| `--border` | `#CDD3E4` | hairlines **inside** a container only |
| `--foreground` | navy `#0F1938` | text only — never outlines |
| `--ink` | navy (light) / cream (dark) | outlines — Tailwind `border-ink` |
| `--primary` | cobalt `#1A40D5` | the main action + current selection |

### Accents
| Token | Hue | Use |
|---|---|---|
| `--color-pin` | airmail red `#E61927` | pinned state (card outline color), pin badge, stripe |
| `--destructive` | red `#D11A26` | delete / danger / failed |
| `--color-success` / `--color-status-done` | green | success, "Active" badge, done |
| `--color-status-processing` | amber | processing/pending |
| `--color-status-failed` | red | failed |
| `--destructive-text` | red (lighter in dark) | **text** on a card — `--destructive` itself is 3.54:1 as text on a dark card, below AA. Use `text-destructive-text` for error copy, delete-action labels, danger headings |
| `--link` | cobalt (light) / lighter cobalt (dark) | inline link text — dark `--primary` as small text on a card is 3.43:1, below AA |
| `--overlay` | navy, both themes | dialog/sheet scrim — `bg-[hsl(var(--overlay)/0.72)]`, replaces `bg-black/80` |
| `--color-chart-1..4` | aliases of `--primary` / `--color-status-done` / `--color-tag-purple` / `--color-tag-teal` | chart series colors, decoupled from tag/status/source meaning so changing one doesn't silently recolor a chart |

### Palettes (cycled by hash via helpers)
- **Tags** — `--color-tag-{blue,purple,pink,green,yellow,orange,teal,indigo}`
- **Source dots** — `--color-source-{email,youtube,article,note,default}`
- **Stat cards** — `--color-stat-{total(ink),week(green),processing(amber),tag(red)}`
- **Hero wash** — `--hero-gradient-{rose,violet}` (very subtle radial only). **Deprecated** (restyle audit K-5): § 5 forbids gradients outside `--stripe`; kept until the landing hero wash is removed (backlog)

### Helpers — `apps/web/lib/design-tokens.ts`
| Helper | Returns | Use |
|---|---|---|
| `colorForTag(name)` | `'var(--color-tag-…)'` | deterministic tag color as a CSS var string |
| `colorForTagHsl(name)` | `'var(--color-tag-…)'` (theme-aware channels) | when you need `hsl(${x} / 0.08)` tints or inline avatars/placeholders |
| `SOURCE_DOT[type]` | `'hsl(var(--color-source-…))'` | source dot fill |
| `STATUS_DOT[status]` / `STAT_CARD_ACCENT[key]` | var refs | status dots / stat icons |
| `TAG_PALETTE` | array of tag var strings | — |

**Changing the theme = edit `globals.css` only.** Don't touch components.

---

## 2. Component conventions (match these exactly)

### Airmail utilities (from `tailwind.config.ts` + `globals.css`)
| Class | What |
|---|---|
| `border-stroke` / `border-b-stroke` … | the one 1.5px outline width — pair with `border-ink` |
| `shadow-ink-sm/md/lg/hover` | hard offset shadows (nav/chip, controls, cards, hover) — never write a box-shadow by hand |
| `lift` | card hover: −2px lift + `shadow-ink-hover`, reduced-motion safe |
| `type-display` | Archivo 125% display cut — H1, big numbers (≥ 22px only) |
| `type-label` | mono uppercase section label — sidebar groups, stat labels only |
| `font-mono` | metadata: dates, counts, domains, read time |
| `bg-dot-grid`, `stripe-top`, `stripe-mini`, `stamp` + `stamp-in` | the postal motifs (AIRMAIL § 6) |

`cn()` (`lib/utils.ts`) knows these classes — always merge classes through it.

### Cards / panels
- `rounded-xl border-stroke border-ink bg-card shadow-ink-lg`, clickable cards add `lift`.
- **Pinned** item: outline turns pin red — `style={{ borderColor: 'hsl(var(--color-pin))' }}`.
- Failed: `style={{ borderColor: 'hsl(var(--destructive))' }}`.

### Dashboard layout
- `<main>` content canvas = `bg-canvas bg-dot-grid`; sidebar + top nav stay `bg-background` with an ink edge and the airmail stripe on top.
- Top nav height `h-16` (matches sidebar logo header). Inbox content wrapper: `mx-auto max-w-6xl px-8 py-6 space-y-5`.

### Tag pills (inside cards)
- `#`-prefixed `rounded-full text-[11px] font-semibold`, tinted: `bg = hsl(${hsl} / 0.08)`, `border = hsl(${hsl} / 0.45)`, `text = hsl(${hsl})` via `colorForTagHsl`.
- The **filter bar** chips (`TagFilterBar`): `text-sm` pill with `border-stroke border-ink`, `#` in the tag color, mono count; active = `bg-primary text-primary-foreground shadow-ink-sm`.

### Controls
- Buttons/inputs come from `components/ui` and already carry the ink outline + `shadow-ink-md` (10px radius). Sort, Filters and the view switch use them; active/selected = `bg-primary text-primary-foreground`.
- Native `<select>` elements use `components/ui/native-select.tsx` (`NativeSelect`), not a hand-rolled `className`. Same recipe as `Input`.
- Icon-in-circle pattern (stat cards): `h-9 w-9 rounded-full border-stroke border-dashed bg-card`, border + icon in `hsl(${accent})` (a postmark).

### Media / placeholders
- Thumbnails `object-cover`, closed off by an ink edge (`border-b-stroke border-ink` in cards); never dimmed. Play badge = `bg-primary text-primary-foreground` circle with a `--badge-ring` ring. No-image placeholder = tinted square (`hsl(${colorForTagHsl(subject)} / 0.12)`) + `FileText` icon in the same hue.

### Loading & mutations
- Navigation that re-renders the server page (sort / filter / tag via `router.push`) must be wrapped in `useTransition`; show pending (dim/disable controls) + a skeleton. Route-level `loading.tsx` covers hard loads.
- Data mutations (pin, toggles) are **optimistic**: update local state immediately, fire the request, roll back on error. No "click → wait 2s → UI changes".

### Toggles, dialogs, avatars
- Switches: `components/ui/switch.tsx`. Destructive confirms: shadcn `AlertDialog`. Avatars: initials on `hsl(${colorForTagHsl(email)} / …)`.

---

## 3. Sizing / typography

- Radius: cards/dialogs `rounded-xl` (12px), controls `rounded-[10px]`, nav items `rounded-lg`, pills `rounded-full`.
- Prefer the Tailwind spacing scale; arbitrary values (`h-[104px]`, `text-[15px]`) are allowed only for deliberate one-offs that match an approved design — colors are **never** arbitrary.
- Type (Archivo / JetBrains Mono / Noto Sans SC via `next/font`): page H1 `type-display text-[32px] sm:text-[42px]`; panel headings `text-base font-semibold`; card titles `text-[15px] font-semibold`; body `text-sm`; meta `font-mono text-[11px] text-muted-foreground`; section labels `type-label`.

---

## 4. Conventions that aren't visual (still required)

- Server Components by default; `'use client'` only for state/handlers/browser APIs.
- No `as any` outside tests; cast Supabase rows to narrow unions at the query boundary.
- No raw Tailwind color classes; no `dark:` variants in components (theme lives in `globals.css`).
- Every feature/bugfix runs green: `pnpm turbo lint typecheck && pnpm --filter @drop-note/web build && pnpm test`.

---

## 5. Checklist before any UI PR

- [ ] Zero hardcoded hex / raw Tailwind colors — everything via tokens or `lib/design-tokens.ts` helpers.
- [ ] New color? Added to `globals.css` (light **and** dark), wired in `tailwind.config.ts` if used as a class.
- [ ] Cards = `rounded-xl border-stroke border-ink bg-card shadow-ink-lg`; pinned uses `--color-pin`; canvas = `bg-canvas bg-dot-grid`.
- [ ] Outlines use `border-ink` (never `border-foreground`); no hand-written box-shadows.
- [ ] Checked in light **and** dark, and with a long Chinese title.
- [ ] Sort/filter/tag changes show loading (`useTransition` + skeleton); mutations are optimistic.
- [ ] Lint + typecheck + build + tests all green.

> Maintained by `drop-mic`. Code work (`techlead-jose`) follows this guide on every task. When the design evolves, update this doc + `globals.css` in the same PR.
