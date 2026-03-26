# drop-note — UI Design Guide

> Stack: Next.js 14 + shadcn/ui (New York style) + Tailwind CSS + next-themes
> Aesthetic: Notion-inspired — clean, minimal, high information density. No gradients, no heavy shadows. Let content breathe.

---

## Color Tokens

All colors use HSL CSS variables so light/dark switching is a single class toggle on `<html>`.

### Semantic Tokens

| Token | Light | Dark | Usage |
|---|---|---|---|
| `--background` | `0 0% 100%` | `222.2 84% 4.9%` | Page background |
| `--foreground` | `222.2 84% 4.9%` | `210 40% 98%` | Primary text |
| `--card` | `0 0% 100%` | `222.2 84% 4.9%` | Card/panel background |
| `--card-foreground` | `222.2 84% 4.9%` | `210 40% 98%` | Text on cards |
| `--muted` | `210 40% 96.1%` | `217.2 32.6% 17.5%` | Subtle backgrounds, tags |
| `--muted-foreground` | `215.4 16.3% 46.9%` | `215 20.2% 65.1%` | Secondary/helper text |
| `--primary` | `222.2 47.4% 11.2%` | `210 40% 98%` | CTAs, active states |
| `--primary-foreground` | `210 40% 98%` | `222.2 47.4% 11.2%` | Text on primary |
| `--border` | `214.3 31.8% 91.4%` | `217.2 32.6% 17.5%` | Dividers, input borders |
| `--destructive` | `0 84.2% 60.2%` | `0 62.8% 30.6%` | Delete, error states |
| `--ring` | `222.2 84% 4.9%` | `212.7 26.8% 83.9%` | Focus rings |

### Usage in Tailwind

```tsx
// ✅ Always use semantic tokens — never raw colors
className="bg-background text-foreground"
className="bg-muted text-muted-foreground"
className="border-border"
className="bg-primary text-primary-foreground"

// ❌ Avoid
className="bg-white dark:bg-gray-900"  // bypasses token system
className="text-gray-500"             // not semantic
```

---

## Typography

**Font:** System font stack (no custom font in v1 — keeps bundle lean).

```css
font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
```

### Scale

| Name | Class | Size | Weight | Usage |
|---|---|---|---|---|
| Page title | `text-2xl font-semibold` | 24px / 600 | Dashboard page headings |
| Section heading | `text-lg font-medium` | 18px / 500 | Sidebar sections, panel headers |
| Body | `text-sm` | 14px / 400 | Item content, descriptions |
| Caption | `text-xs text-muted-foreground` | 12px / 400 | Dates, metadata, tag counts |
| Label | `text-xs font-medium uppercase tracking-wide text-muted-foreground` | 12px / 500 | Form labels, sidebar nav labels |

### Rules
- No `text-base` (16px) in the app — 14px is the reading size. Notion-density.
- Headings: `font-semibold`, not `font-bold`. Bold is reserved for emphasis only.
- Don't use `leading-*` unless fixing a specific overflow issue.

---

## Spacing & Layout

**Base unit:** 4px (Tailwind default — `p-1 = 4px`).

### Layout Grid

```
┌─────────────────────────────────────────────────────┐
│  Sidebar (240px fixed)  │  Main content (flex-1)    │
│                         │                           │
│  Logo                   │  Page header (h-14)       │
│  ─────────────          │  ─────────────────────── │
│  Nav links              │  Content area             │
│                         │  (overflow-y-auto)        │
│  ─────────────          │                           │
│  User + sign out        │                           │
└─────────────────────────────────────────────────────┘
```

- Sidebar: `w-60` (240px), full height, `border-r border-border`
- Main: `flex-1 min-w-0` — always needs `min-w-0` to prevent flex overflow
- Page header: `h-14 flex items-center px-6 border-b border-border`
- Content padding: `p-6`
- Card gap: `gap-3` in list view, `gap-4` in grid view

### Component Spacing Conventions

| Context | Class |
|---|---|
| Sidebar nav item padding | `px-3 py-1.5` |
| Card internal padding | `p-4` |
| Input height | `h-9` (matches shadcn default) |
| Button height | `h-9` default, `h-8` sm, `h-10` lg |
| Section gap inside card | `space-y-2` |
| Tag gap | `gap-1.5` |

---

## Component Patterns

### Item Card (List View)

```
┌──────────────────────────────────────────────────────┐
│ [icon]  Subject line                      Date  [pin]│
│         AI summary preview (2 lines max)             │
│         [tag] [tag] [tag]                            │
└──────────────────────────────────────────────────────┘
```

- Container: `rounded-lg border border-border bg-card p-4 hover:bg-accent/50 transition-colors cursor-pointer`
- Subject: `text-sm font-medium truncate`
- Summary: `text-xs text-muted-foreground line-clamp-2 mt-1`
- Tags: `flex flex-wrap gap-1.5 mt-2`
- Date: `text-xs text-muted-foreground tabular-nums`
- Pinned indicator: lucide `Pin` icon, `text-primary`, size 14

**Status states:**
- `pending` / `processing`: show `Skeleton` animation over summary area
- `failed`: replace summary with `text-destructive text-xs` + error message

### Tag Badge

```tsx
<span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
  {name}
</span>
```

- Never use colored tags in v1 (categories = v2)
- Max display: 4 tags on card, `+N more` overflow label

### Sidebar Nav Item

```tsx
// Active
<Link className="flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium bg-accent text-accent-foreground">

// Inactive
<Link className="flex items-center gap-2 rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors">
```

### Empty State / Onboarding Panel

- Full width, `rounded-xl border border-dashed border-border bg-muted/30 p-10 text-center`
- Drop address: `font-mono text-sm bg-background border border-border rounded-md px-4 py-2`
- CTA button: `variant="default"` (filled primary)

### Modals / Dialogs

- Use shadcn `Dialog` — never custom modals
- Destructive actions: `Button variant="destructive"` inside dialog footer
- Always require explicit confirm for deletes (no undo for free tier hard delete)

---

## Iconography

Library: `lucide-react` (already installed).

| Icon | Usage |
|---|---|
| `Inbox` | All items nav |
| `Tag` | Tags filter |
| `Calendar` | Date filter |
| `Pin` | Pinned item indicator |
| `Trash2` | Delete / trash view |
| `Search` | Search input |
| `Settings` | Settings nav |
| `Sun` / `Moon` / `Monitor` | Theme toggle |
| `Copy` | Copy to clipboard |
| `CheckCheck` | Copied confirmation |
| `Mail` | Email / send CTA |
| `LogOut` | Sign out |
| `Shield` | Admin panel |

**Size conventions:**
- Nav icons: `size={16}` (`w-4 h-4`)
- Card action icons: `size={14}`
- Empty state icons: `size={40}` with `text-muted-foreground`
- Never use raw `className="w-5 h-5"` — use the `size` prop

---

## Dark / Light Mode

- ThemeProvider: `attribute="class"`, `defaultTheme="system"`, `enableSystem`
- Toggle component cycles: `light → dark → system`
- Storage key: default (`theme`) — no customization needed
- `suppressHydrationWarning` on `<html>` prevents SSR mismatch flash

**Never use `dark:` Tailwind variants directly in components.** All color decisions go through CSS variables. `dark:` is only allowed in `globals.css` for the token definitions.

---

## Interaction & Motion

- Transitions: `transition-colors duration-150` for hover states. Nothing longer.
- No entrance animations in v1 (except Realtime skeleton → card, Sprint 5).
- Focus rings: let shadcn/Radix handle — don't override `focus-visible:*`.
- Loading states: shadcn `Skeleton` component with `animate-pulse`.

---

## Accessibility Baseline

- All interactive elements must be keyboard-reachable.
- `aria-label` required on icon-only buttons (copy, pin, delete).
- Color contrast: semantic token pairs meet WCAG AA by design (Slate scale).
- Don't suppress focus outlines — they are styled via `--ring`.
