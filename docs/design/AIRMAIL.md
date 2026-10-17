# Airmail: drop-note's design system

> **Status:** adopted by the board 2026-10-16. Light = Airmail (DRO-69), dark = **Night Mail** (DRO-70, § 12).
> Applied to app code by the theme PR (§ 13). If something in the app disagrees with this doc, the doc is the
> **target**.
>
> **How this relates to `docs/STYLE_GUIDE.md`:** STYLE_GUIDE is the *code* rulebook (tokens only,
> helpers, loading states, checklist). AIRMAIL is the *visual* rulebook: what things look like and why.
> Both apply to every UI change. When they disagree, this doc wins on looks and STYLE_GUIDE wins on code.
>
> Reference: `docs/design/airmail/inbox-mockup.html` (open in a browser; add `#dark` to the URL for
> Night Mail), `light-inbox-*.png`, `dark-inbox-*.png`, `tokens-light.css`, `tokens-dark.css`.

---

## 1. The idea in one sentence

**drop-note is something you mail things to, so the UI looks like a well-run mailroom.** It uses cobalt
and navy ink on white paper (cream ink on navy paper at night), confident outlines, hard printed shadows, and a few postal motifs (airmail stripe,
postage stamp, postmark) used sparingly.

## 2. Principles (use these to decide anything this doc doesn't cover)

1. **Ink defines structure.** Containers and controls a user can act on get a 1.5px ink outline.
   Grey hairlines are only for dividers *inside* a container.
2. **Shadows are printed, never blurred.** Elevation is a hard offset shadow in `--shadow-color`. No soft or
   blurred `box-shadow` anywhere.
3. **Postal motifs are seasoning.** At most **one** "stamp moment" per screen (the stat row on the inbox).
   Stripes appear only in chrome (sidebar top, mobile top bar) and as small accents. Never fill an area
   with them.
4. **Color means something.** Cobalt = action / active state. Airmail red = pin, YouTube and attention.
   Tag and source colors identify content. Nothing is colored "for decoration".
5. **Chinese is a first-class language.** Every font stack ends in a CJK face. Every layout is checked with
   long Chinese titles and tags.
6. **Readable beats clever.** Every text/background pair meets WCAG AA (4.5:1, or 3:1 for large text and icons).

---

## 3. Tokens

All values are HSL channels in `apps/web/app/globals.css`. The complete blocks are
`docs/design/airmail/tokens-light.css` (`:root`) and `tokens-dark.css` (`.dark`). Both use the same names
in the same order. A token that exists in one block must exist in the other.

### 3.1 Core colors (light)

| Token | Hex | Use |
|---|---|---|
| `--background` | `#FFFFFF` | Sidebar, top bar, popovers |
| `--content-bg` | `#EEF1F9` | Page canvas (with the dot grid, § 6.4) |
| `--card` | `#FFFFFF` | Cards, inputs, chips, secondary buttons |
| `--foreground` | `#0F1938` | Text only. In light it has the same value as `--ink`, but **never** use it for outlines or shadows (§ 3.2) |
| `--muted-foreground` | `#485270` | Secondary text, meta |
| `--border` | `#CDD3E4` | Hairline dividers inside containers only |
| `--input` | `#0F1938` | Input/control outlines (= ink) |
| `--primary` | `#1A40D5` | Cobalt: primary buttons, active chip, active view toggle, play badge, links |
| `--accent` / `--accent-foreground` | `#E2E7FE` / `#1431A3` | Hover and selected backgrounds |
| `--color-pin` | `#E61927` | Airmail red: pin, YouTube mark, the red stripe band |
| `--destructive` | `#D11A26` | Delete and errors only |
| `--radius` | `0.625rem` | Base radius (10px) |

Tag palette (deepened so 11px chip text passes AA): blue `#1549C1`, purple `#6C32AE`, pink `#B41D5F`,
green `#176D45`, yellow `#955604`, orange `#BB3B0C`, teal `#0C6A79`, indigo `#3F36C9`.

### 3.2 New tokens this system adds

| Token | Light value | Why |
|---|---|---|
| `--ink` | `226 58% 14%` | Outline color. Equal to `--foreground` **only in light**; dark uses cream |
| `--stroke` | `1.5px` | The one outline width |
| `--shadow-color` | `226 58% 14%` | Hard-shadow color. Equal to `--ink` in both themes today, but kept separate so a theme can split them |
| `--shadow-sm` | `2px 2px 0 hsl(var(--shadow-color))` | Active nav item, active chip |
| `--shadow-md` | `3px 3px 0 hsl(var(--shadow-color))` | Controls: search, buttons, sort, segmented control |
| `--shadow-lg` | `4px 4px 0 hsl(var(--shadow-color))` | Cards, dialogs |
| `--shadow-hover` | `6px 6px 0 hsl(var(--shadow-color))` | Card hover (paired with a −2px lift) |
| `--shadow-stamp` | `drop-shadow(3px 3px 0 hsl(var(--shadow-color)))` | Stat stamps. A `filter`, because `box-shadow` ignores the perforated mask |
| `--stripe` | the big airmail gradient (§ 6.1) | Sidebar top edge, mobile top bar |
| `--stripe-mini` | the small airmail gradient (§ 6.1) | 30×7px mark on card date rows |
| `--stripe-gap` | `0 0% 100%` | The light bands between red and cobalt. Dark uses cream, so the stripe never reads as hazard tape |
| `--badge-ring` | `0 0% 100%` | 2.5px ring around the play badge |
| `--grid-alpha` | `.10` | Dot-grid opacity on the canvas (dark: `.09`) |
| `--font-sans` / `--font-display` / `--font-mono` | see § 4 | Wired via `next/font/google` |

Wire the shadows as Tailwind `boxShadow: { 'ink-sm': 'var(--shadow-sm)', … }` and use `shadow-ink-lg`
in components. **Never type an offset shadow by hand.**

---

## 4. Typography

| Family | Font | Fallback (mandatory) | Use |
|---|---|---|---|
| Sans (UI + body) | **Archivo**, normal width | `"Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif` | Everything by default |
| Display | **Archivo, 125% width**, weight 800–900 | `"Noto Sans SC", "PingFang SC", sans-serif` | Page titles, big numbers, wordmark |
| Mono | **JetBrains Mono** | `"Noto Sans SC", ui-monospace, monospace` | Metadata only: counts, dates, source + read time, small section labels |

### Scale

| Role | Size / weight | Notes |
|---|---|---|
| Page title (H1) | 42px / 800, width 125%, tracking −0.025em | 32px under 640px |
| Section title (H2) | 22px / 800, width 125% | |
| Big number (stat) | 36px / 900, width 125% | 28px on mobile |
| Card title | 15.5px / 700 | Clamp 2 lines |
| Body / UI | 14px / 400–600 | Line height 1.45 |
| Summary | 12.5px / 400, muted | Clamp 2 lines |
| Meta (mono) | 11px / 400–500 | `youtube.com · 1 min read`, dates |
| Section label (mono) | 10.5–11px / 700, uppercase, tracking 0.08–0.14em | Sidebar group names and stat labels **only** |

**Rules:**
- The wide display cut is for text **≥ 22px**. Never set body text wide.
- Mono is for data, not sentences. If it has a verb, it isn't mono.
- Uppercase is only for the mono section labels. Never uppercase a heading, a button or Chinese text.
- One weight jump per element. Don't bold part of a title.

---

## 5. Shape & elevation

| Element | Radius | Outline | Shadow |
|---|---|---|---|
| Card | 12px | `--stroke` ink | `--shadow-lg`; hover `--shadow-hover` + `translate(-2px,-2px)` |
| Control (search, button, sort, segmented) | 10px | `--stroke` ink | `--shadow-md` |
| Nav item | 8px | transparent → ink when active | active: `--shadow-sm` |
| Filter chip | pill | `--stroke` ink | active: `--shadow-sm` |
| Tag pill (in cards) | pill | 1px of the tag color at 45% | none |
| Stat stamp | 0 (perforated mask) | inner frame in its accent | `--shadow-stamp` |
| Dialog / popover | 12px | `--stroke` ink | `--shadow-lg` |
| Media (thumbnail) | inherits card | bottom edge `--stroke` ink | none |

**Rules:**
- Exactly one outline width (`--stroke`). Hairlines (`1px --border`) only *inside* a container.
- Shadows only go **down-right**, only in `--shadow-color`, only from the 5 `--shadow-*` tokens.
- No gradients except `--stripe`, and the tag/accent tints (`hsl(var(--x) / .08)`).
- Pressed state: the shadow shrinks one step and the element moves 1px down-right ("pressed into paper").

---

## 6. Signature motifs: where they're allowed

| Motif | Looks like | Allowed in | Never in |
|---|---|---|---|
| **6.1 Airmail stripe** | `--stripe`: `repeating-linear-gradient(-45deg, pin 0 12px, stripe-gap 12px 18px, primary 18px 30px, stripe-gap 30px 36px)`. `--stripe-mini` is the same at 4/6/10/12px | Top edge of sidebar (8px) and mobile top bar (5px). Mini 30×7px mark at the right end of a card's date row. | Buttons, backgrounds, text, more than 1 large stripe per screen |
| **6.2 Postage stamp** | Perforated edge (CSS mask), inner accent frame, 7% accent tint, optional ±1° tilt on alternate stamps | Stat cards (inbox), "milestone" moments (e.g. first item saved) | Lists, forms, anything clickable that isn't a summary |
| **6.3 Postmark** | Dashed 1.5px outline, mono uppercase text | "Updated just now" pill, stat icon circles, the dashed divider above card dates | Primary actions (dashed = passive/informational) |
| **6.4 Dot grid** | `radial-gradient(hsl(var(--ink) / var(--grid-alpha)) 1px, …)` every 20px | Page canvas only | Cards, sidebar, dialogs |

Budget per screen: **1 stamp group, 1 big stripe, any number of mini marks and postmarks.**

---

## 7. Components

**Card (item).** `--card` fill, ink outline, 12px, `shadow-ink-lg`. Thumbnail on top with an ink bottom edge.
Body padding 16px, gap 8px: title (2 lines) → mono meta (source icon + domain · read time) → summary
(2 lines, muted) → tag pills (one row, fades out on the right) → dashed postmark divider → mono uppercase
date (`OCT 16, 2026`) with the mini stripe on the right.

**Play badge.** 46px `--primary` circle, triangle in `--primary-foreground`, 2.5px `--badge-ring` ring.
Centered on the thumbnail. Never dim the thumbnail behind it.

**Buttons.**
- Primary: `--primary` fill, `--primary-foreground` text, ink outline, `shadow-ink-md`.
- Secondary: `--card` fill, `--foreground` text, ink outline, `shadow-ink-md`.
- Ghost (inline/tertiary): no outline or shadow. Accent background on hover.
- Destructive: `--destructive` fill. Only in confirm dialogs.
- Height 44px (36px compact). Icon-only buttons are square, with an `aria-label`.

**Inputs / search.** 44px, `--card` fill, ink outline, 10px radius, `shadow-ink-md`. Placeholder muted.
Focus: 2px cobalt ring, offset 2px (outline stays ink).

**Filter chips (above the grid).** Pill, ink outline, 600 weight, `#` in the tag's color, mono count.
Active = cobalt fill + `shadow-ink-sm`. The row scrolls horizontally on mobile.

**Tag pills (inside cards).** Pill, 11px/600, tag color text on an 8% tint with a 1px 45% outline.
Colors always come from `colorForTag()`, never chosen by hand.

**Sidebar.** `--background` fill, ink right edge, airmail stripe on top, wordmark in the display cut. Group labels are
mono uppercase. Nav item active = ink outline + `shadow-ink-sm` + mono count pill. Tag links show `#` in
the tag color.

**Stat stamps.** 4 across (2×2 on mobile). Each has an accent: total = ink, week = green,
processing = yellow, top tag = red. Mono uppercase label, big display number, mono sub-line, dashed
postmark icon circle.

**Segmented control (view toggle).** Ink outline, `shadow-ink-md`. Selected segment is `--primary` with
`--primary-foreground` icons.

**Empty / loading states.** Follow STYLE_GUIDE § 2 for behavior. Visually, skeletons use `--muted`
blocks with the card's outline and shadow (so layout doesn't jump). Empty states can use **one** postmark
illustration and one sentence.

---

## 8. Color usage

- **Cobalt (`--primary`)** is for the one main action and the current selection. If everything is cobalt,
  nothing is.
- **Airmail red (`--color-pin`)** is for pin, YouTube and the stripe. Errors use `--destructive`, not pin red.
- **Tints** are always `hsl(var(--x) / .08)` with a `/ .45` outline. Never put a tint behind body text.
- **New colors:** add a token in light + dark first (STYLE_GUIDE § 0), then check contrast (§ 10).

## 9. Motion

- Card hover: lift −2px plus the bigger shadow, 150ms ease-out. Buttons: press-in on `:active`.
- No entrance animations, no parallax, no animated stripes.
- Respect `prefers-reduced-motion`: drop the lift and keep the shadow change
  (`@media (prefers-reduced-motion: reduce) { transform: none; transition: none }`).

## 10. Accessibility (hard requirements)

- Text contrast ≥ 4.5:1 (≥ 3:1 for ≥ 18px bold and for icons). Both palettes pass everywhere; the measured
  values are in the DRO-69 (light) and DRO-70 (dark) READMEs.
- Tag pill text is measured against the 8% tint **composited over the card**, not the bare card. That is
  the pair that fails first when a tag color changes.
- Focus is always visible: a 2px `--ring` with offset, never removed.
- Hit targets ≥ 36px (44px for primary controls on mobile).
- Never use color as the only signal (status also uses an icon or text).
- Tilted stamps never hold interactive elements.

## 11. Do / Don't

| ✅ Do | ❌ Don't |
|---|---|
| Use `shadow-ink-lg` on cards | Write `box-shadow: 4px 4px 0 #0F1938` by hand |
| Use `--ink` for outlines, `--shadow-color` for shadows | Use `--foreground` for outlines (it breaks dark mode) |
| Write `--card` / `--background` | Write "white" or `#fff` in a component |
| Use one stamp group per screen | Make every panel a stamp |
| Use mono for dates, counts, domains | Use mono for titles, summaries or buttons |
| Use the display cut for H1 and big numbers | Set paragraphs wide or uppercase |
| Get tag colors from `colorForTag()` | Pick tag colors by hand |
| Use `--border` hairlines inside a card | Mix 1px and 2px outlines on containers |
| Test with a long Chinese title | Assume Latin-length text |

## 12. Dark theme

**Night Mail** (adopted 2026-10-16, DRO-70): an overnight mail train. Navy envelopes, addressed in cream ink.
It is light Airmail inverted: "dark ink on light paper" becomes "light ink on dark paper". § 2–11 apply
unchanged; only token values differ. The complete block is `tokens-dark.css`.

| Role | Token | Hex |
|---|---|---|
| Canvas | `--content-bg` | `#0A0E1C` |
| Sidebar / top bar | `--background` | `#101528` |
| Card / inputs | `--card` | `#151B30` |
| Text | `--foreground` | `#F4ECDC` |
| Muted text | `--muted-foreground` | `#C3BAAC` |
| Ink (outlines) **and** shadow | `--ink` = `--shadow-color` | `#E3D7BF` |
| Hairline | `--border` | `#2F3750` |
| Cobalt | `--primary` / `--primary-foreground` | `#4161F1` / `#FFFFFF` |
| Airmail red | `--color-pin` | `#F34954` |
| Stripe gap, badge ring | `--stripe-gap`, `--badge-ring` | cream |
| Focus ring | `--ring` | `#708AFF` |
| Destructive | `--destructive` | `#DE212E` |

Tags (blue, purple, pink, green, yellow, orange, teal, indigo): `#80ACFA` `#C9A3F5` `#F490BB` `#6CD09E`
`#F4BE52` `#F9966C` `#51CDD6` `#A29FF9`.

**Rules specific to dark:**
- Ink is a little dimmer than the text cream, so outlines are confident without glaring.
- Don't dim thumbnails. Every thumbnail is closed in by ink on all four sides, so a black video frame never
  bleeds into the card.
- If the cream shadows feel loud in the real app, lower **only** `--shadow-color` to about `40 30% 62%`.
  Don't touch `--ink`.

## 13. Adoption checklist (the theme PR)

1. Paste `tokens-light.css` (`:root`) and `tokens-dark.css` (`.dark`) into `globals.css`.
2. Fonts via `next/font/google` (Archivo with the width axis, JetBrains Mono, Noto Sans SC subset),
   exposed as `--font-*` and `tailwind.config.ts` `fontFamily`.
3. `tailwind.config.ts`: `boxShadow.ink-*`, `borderWidth.stroke`.
4. **Fix first:** `lib/design-tokens.ts` `TAG_PALETTE_HSL` hardcodes tag colors. Make `colorForTagHsl()`
   return `var(--color-tag-*)` so tags follow the theme.
5. Restyle components per § 7 (cards, controls, chips, sidebar, stats, play badge, dates).
6. Update `docs/STYLE_GUIDE.md` § 1–3 values to match, and link this doc.
7. Screenshots at 1440px and 390px, light and dark, attached to the PR report.

**Every later UI change:** use tokens, never hex; outlines from `--ink`, shadows from `shadow-ink-*`; check the
change in light **and** dark and with a long Chinese title; new color = a token in both blocks plus a contrast check.
