# Login page redesign spec

Queued by Jason 2026-05-28 — to be executed by Jose after homepage redesign lands on main.

Mockup reference image: `/Users/lego/.claude/image-cache/9c8cb383-ce75-4dc2-a2c0-98452c800e47/6.png`

## Layout

Centered vertical column on a clean white background. No top nav, no footer — single-purpose page.

### Top — Brand block (above the card)
- Envelope icon + "drop-note" wordmark, centered horizontally, sitting together as one unit (icon to the left of the wordmark, small gap).
- Wordmark in same sans-serif weight as nav (medium / 500).
- Below: small muted-gray tagline "Your personal content inbox" — centered, smaller font.

### Middle — Sign-in card
A bordered card with rounded corners (`rounded-xl` or similar), `border-border`, white surface, generous internal padding (~32px top/bottom, ~28px left/right). Card max-width ~400px, centered.

Inside the card, vertically stacked:
1. Headline: "Sign in to drop-note" — medium-large, semibold, near-black, centered.
2. Subtext: "Continue with your Google account" — muted-gray, centered, small.
3. **Continue with Google button** — full-width, white background, 1px border, rounded, with the multi-color Google G logo on the left and "Continue with Google" text. Height ~52px. Hover: very light gray background.
4. Thin horizontal divider line.
5. Footnote (small, muted-gray): "Don't have an account? **Signing in creates one automatically.**" — the second clause is bolded.

### Bottom — Legal microcopy (outside the card)
- "By continuing, you agree to our [Terms of Service](/terms) and [Privacy Policy](/privacy)." — centered, muted-gray, small. Links underlined.

## Tech spec

- File to update: `apps/web/app/login/page.tsx` (or wherever the current login page lives — grep for `Continue with Google`).
- Server Component by default. Keep the OAuth handler logic intact — only swap the visual layout.
- Use existing semantic tokens (`bg-background`, `text-foreground`, `text-muted-foreground`, `border`). No raw colors.
- Use lucide-react `Mail` icon for the envelope (or reuse whatever the nav uses).
- The Google G logo should come from the existing implementation if there is one; otherwise use a small inline SVG (no external font / image).
- The card should be a `<Card>` from shadcn/ui if that's the project's pattern; otherwise plain div with `border rounded-xl bg-card`.
- Mobile: card stays max-width ~400px, padding reduces to ~24px on small screens. Brand block above stays centered. No horizontal scroll.
- Tests: render test confirming "Sign in to drop-note", "Continue with Google", legal links, and tagline all present.

## Verification

- Lint, typecheck, build, test must all pass.
- Visually compare to mockup at the path above before pushing to main.
- Push direct to main per Jason's earlier authorization for this redesign batch.

## Reporting

One-line to Jason when live: "Login page redesign live at https://dropnote.me/login — verify when you have a sec."
