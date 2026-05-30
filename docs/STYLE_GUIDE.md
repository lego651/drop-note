# drop-note UI Style Guide

> The single source of truth for how drop-note's UI is built. **All new UI code must follow this.**
> Goal: one cohesive product + theming that changes in **one place**.
> Source of truth for values: `apps/web/app/globals.css` (`:root` + `.dark`) and `apps/web/tailwind.config.ts`.

---

## 0. The one hard rule

**Anything theme-able is a token, never a hardcoded value.**

- ❌ `className="bg-pink-500 text-[#1a1a1a]"` — raw Tailwind color / hex
- ❌ `style={{ color: '#e11d48' }}`
- ✅ `className="bg-card text-foreground"` — semantic Tailwind token
- ✅ `style={{ color: 'hsl(var(--color-pin))' }}` — CSS var
- ✅ tag/source colors via the helpers in `lib/design-tokens.ts`

If a color you need doesn't have a token, **add a token to `globals.css` (light + dark) first**, then use it. Never inline a hex.

Light theme is the product default. Dark tokens exist in `.dark` but component-level dark polish is out of scope unless a task says otherwise — still, never hardcode a color that would break theming.

---

## 1. Color tokens (defined in `globals.css`, all HSL channels)

Use as Tailwind tokens (`bg-x`, `text-x`) where wired in `tailwind.config.ts`, or inline as `hsl(var(--x))` / `hsl(var(--x) / 0.12)` for tints.

### Surfaces
| Token | Value (light) | Use |
|---|---|---|
| `--background` | `0 0% 100%` white | app base, sidebar, top nav |
| `--card` | `0 0% 100%` white | every card/panel surface (`bg-card`) |
| `--content-bg` | `0 0% 96.9%` = **#f7f7f7** | dashboard content canvas — Tailwind `bg-canvas` (on `<main>`) |
| `--muted` / `--muted-foreground` | light gray / `215 16% 47%` | subtle fills, secondary text |
| `--border` | `214 32% 91%` | hairlines, dividers |
| `--foreground` | near-black | primary text |

### Accents
| Token | Hue | Use |
|---|---|---|
| `--color-pin` | rose `346 77% 60%` | pinned state (ring / left accent), pin badge |
| `--destructive` | red `0 84% 60%` | delete / danger / failed |
| `--color-success` / `--color-status-done` | green | success, "Active" badge, done |
| `--color-status-processing` | amber | processing/pending |
| `--color-status-failed` | red | failed |

### Palettes (cycled by hash via helpers)
- **Tags** — `--color-tag-{blue,purple,pink,green,yellow,orange,teal,indigo}`
- **Source dots** — `--color-source-{email,youtube,article,note,default}`
- **Stat cards** — `--color-stat-{total(gray),week(green),processing(amber),tag(violet)}`
- **Hero wash** — `--hero-gradient-{rose,violet}` (very subtle radial only)

### Helpers — `apps/web/lib/design-tokens.ts`
| Helper | Returns | Use |
|---|---|---|
| `colorForTag(name)` | `'var(--color-tag-…)'` | deterministic tag color as a CSS var string |
| `colorForTagHsl(name)` | `'214 89% 52%'` (raw channels) | when you need `hsl(${x} / 0.12)` tints or inline avatars/placeholders |
| `SOURCE_DOT[type]` | `'hsl(var(--color-source-…))'` | source dot fill |
| `STATUS_DOT[status]` / `STAT_CARD_ACCENT[key]` | var refs | status dots / stat icons |
| `TAG_PALETTE` | array of tag var strings | — |

**Changing the theme = edit `globals.css` only.** Don't touch components.

---

## 2. Component conventions (match these exactly)

### Cards / panels
- `rounded-2xl bg-card shadow-sm` — **no border** (white-on-canvas + soft shadow separates them).
- Hover (clickable): `transition-shadow hover:shadow-md`.
- **Pinned** item: rose accent, never a gray border —
  - grid/list card: `style={{ boxShadow: '0 0 0 2px hsl(var(--color-pin))' }}` (ring)
  - compact row: `style={{ boxShadow: 'inset 2px 0 0 0 hsl(var(--color-pin)), 0 1px 2px rgb(0 0 0 / 0.04)' }}` (narrow left accent)
- Failed: `boxShadow: '0 0 0 1px hsl(var(--destructive))'`.

### Dashboard layout
- `<main>` content canvas = `bg-canvas`; sidebar + top nav stay `bg-background` (white).
- Top nav height `h-16` (matches sidebar logo header). Inbox content wrapper: `mx-auto max-w-6xl px-8 py-6 space-y-5`.

### Tag pills (inside cards)
- `#`-prefixed, **no border**, ~`text-[11px]`, tinted: `bg = hsl(${hsl} / 0.12)`, `text = hsl(${hsl})` via `colorForTagHsl`.
- The **filter bar** pills (`TagFilterBar`) are the exception: larger `text-sm` rounded-full, active = `bg-foreground text-background`, inactive = `bg-card` + `border-border`.

### Controls
- Sort = rounded-full pill (`SortDropdown`); view switch = segmented control, active = `bg-foreground text-background` (`ViewSwitcher`); filters = rounded-full pill, active = filled `bg-foreground` + label + `X` clear (`FiltersButton`).
- Icon-in-circle pattern (stat cards, settings, features): `flex h-9 w-9 items-center justify-center rounded-full` with `bg = hsl(${accent} / 0.12)`, icon `color = hsl(${accent})`.

### Media / placeholders
- Thumbnails `object-cover`, `rounded-xl`/`rounded-2xl`; no-image placeholder = tinted square (`hsl(${colorForTagHsl(subject)} / 0.12)`) + `FileText` icon in the same hue.

### Loading & mutations
- Navigation that re-renders the server page (sort / filter / tag via `router.push`) must be wrapped in `useTransition`; show pending (dim/disable controls) + a skeleton. Route-level `loading.tsx` covers hard loads.
- Data mutations (pin, toggles) are **optimistic**: update local state immediately, fire the request, roll back on error. No "click → wait 2s → UI changes".

### Toggles, dialogs, avatars
- Switches: `components/ui/switch.tsx`. Destructive confirms: shadcn `AlertDialog`. Avatars: initials on `hsl(${colorForTagHsl(email)} / …)`.

---

## 3. Sizing / typography

- Radius: cards `rounded-2xl` (16px), media/inner `rounded-xl` (12px), pills `rounded-full`, small chips `rounded-md`.
- Prefer the Tailwind spacing scale; arbitrary values (`h-[104px]`, `text-[15px]`) are allowed only for deliberate one-offs that match an approved design — colors are **never** arbitrary.
- Type: page H1 `text-2xl/3xl font-bold`; panel headings `text-base font-semibold`; card titles `text-[15px] font-semibold`; body/meta `text-sm`/`text-xs text-muted-foreground`; eyebrow labels `text-[11px] uppercase tracking-wider text-muted-foreground`.

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
- [ ] Cards = `rounded-2xl bg-card shadow-sm`; pinned uses `--color-pin`; canvas = `bg-canvas`.
- [ ] Sort/filter/tag changes show loading (`useTransition` + skeleton); mutations are optimistic.
- [ ] Lint + typecheck + build + tests all green.

> Maintained by `drop-mic`. Code work (`techlead-jose`) follows this guide on every task. When the design evolves, update this doc + `globals.css` in the same PR.
