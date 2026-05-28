# Task F — Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix silent email errors in `lib/email.ts`, add a first-visit welcome modal, and upgrade the empty state in `ItemsPageClient` — all TDD.

**Architecture:** Three independent changes landing in one branch (`s8/onboarding`). Task 1 is a pure server-side lib fix. Task 2 is a new client component with localStorage gate. Task 3 is an inline UI upgrade inside an existing component. No new packages needed.

**Tech Stack:** Vitest + @testing-library/react (jsdom), shadcn Dialog (already installed at `components/ui/dialog.tsx`), Radix UI primitives, Tailwind semantic tokens, Next.js App Router.

---

## Pre-flight (run once before any task)

```bash
cd /Users/lego/@Lego651/drop-note
git checkout main && git pull
git checkout -b s8/onboarding
```

---

## Task 1 — Fix `lib/email.ts` + update cron response shape

**Files:**
- Modify: `apps/web/lib/email.ts`
- Modify: `apps/web/app/api/cron/digest/route.ts`
- Create: `apps/web/lib/__tests__/email.test.ts`

### Context you need to know

`sendWeeklyDigestEmail` wraps `resend.emails.send` in a try/catch that swallows errors — that's why yesterday's Resend 403s were invisible. The fix is to remove the try/catch entirely; the cron already uses `Promise.allSettled`, so rejections will surface in the `rejected` branch and increment `skipped` — but we want them counted as `failed`, not `skipped`.

`sendWelcomeEmail` is called at `app/auth/callback/route.ts` line 71 as `void sendWelcomeEmail(user.email)` — fire-and-forget intentionally. Removing the try/catch from the function body is safe because `void` already discards the rejection in that call site. No change needed at the call site.

The cron `route.ts` currently counts `Promise.allSettled` rejections as `skipped` (line 110). After the email fix, a Resend error will be a rejection. We need a `failed` counter so ops can see real delivery failures vs. intentional skips.

---

- [ ] **Step 1.1: Write the failing test file**

Create `apps/web/lib/__tests__/email.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock Resend before importing the module under test
const mockSend = vi.fn()
vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: { send: mockSend },
  })),
}))

import { sendWeeklyDigestEmail, sendWelcomeEmail } from '../email'

const digestArgs = {
  to: 'user@example.com',
  weekItems: [{ id: '1', subject: 'Hello', source_type: 'email', created_at: '2026-01-01T00:00:00Z' }],
  resurfaceItems: [],
}

describe('sendWeeklyDigestEmail', () => {
  beforeEach(() => {
    mockSend.mockReset()
  })

  it('propagates Resend errors — does NOT swallow them', async () => {
    mockSend.mockRejectedValueOnce(new Error('Resend 403'))
    await expect(sendWeeklyDigestEmail(digestArgs)).rejects.toThrow('Resend 403')
  })

  it('resolves cleanly when Resend succeeds', async () => {
    mockSend.mockResolvedValueOnce({ data: { id: 'msg_1' }, error: null })
    await expect(sendWeeklyDigestEmail(digestArgs)).resolves.toBeUndefined()
  })
})

describe('sendWelcomeEmail', () => {
  beforeEach(() => {
    mockSend.mockReset()
  })

  it('propagates Resend errors — does NOT swallow them', async () => {
    mockSend.mockRejectedValueOnce(new Error('Resend 403'))
    await expect(sendWelcomeEmail('user@example.com')).rejects.toThrow('Resend 403')
  })

  it('resolves cleanly when Resend succeeds', async () => {
    mockSend.mockResolvedValueOnce({ data: { id: 'msg_2' }, error: null })
    await expect(sendWelcomeEmail('user@example.com')).resolves.toBeUndefined()
  })
})
```

- [ ] **Step 1.2: Run test — confirm the two "propagates" cases FAIL**

```bash
cd /Users/lego/@Lego651/drop-note
pnpm test apps/web/lib/__tests__/email.test.ts 2>&1 | tail -30
```

Expected: 2 failures — `sendWeeklyDigestEmail` and `sendWelcomeEmail` rejection tests fail because the current code swallows errors (the promise resolves instead of rejecting).

- [ ] **Step 1.3: Fix `apps/web/lib/email.ts`**

Remove try/catch from `sendWeeklyDigestEmail` (lines 69–79). Remove try/catch from `sendWelcomeEmail` (lines 84–103). The resulting functions just `await resend.emails.send(...)` directly.

Final `apps/web/lib/email.ts`:

```typescript
import { Resend } from 'resend'

interface DigestItem {
  id: string
  subject: string | null
  source_type: string | null
  created_at: string
}

export async function sendWeeklyDigestEmail({
  to,
  weekItems,
  resurfaceItems,
}: {
  to: string
  weekItems: DigestItem[]
  resurfaceItems: DigestItem[]
}): Promise<void> {
  const resend = new Resend(process.env.RESEND_API_KEY)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://dropnote.me'
  const count = weekItems.length
  const subject = `Your drop-note week — ${count} save${count === 1 ? '' : 's'} this week`

  const itemRow = (item: DigestItem) => {
    const title = item.subject ?? '(no subject)'
    const badge = item.source_type
      ? `<span style="display:inline-block;padding:1px 6px;background:#f0f0f0;border-radius:4px;font-size:11px;color:#666;margin-left:6px;">${item.source_type}</span>`
      : ''
    return `<li style="margin:6px 0;">${title}${badge}</li>`
  }

  const weekSection = `
    <h2 style="font-size:16px;font-weight:600;margin:24px 0 8px;">This week's saves</h2>
    <ul style="padding-left:20px;margin:0;">
      ${weekItems.map(itemRow).join('\n      ')}
    </ul>
    <p style="margin:12px 0;"><a href="${appUrl}/dashboard" style="color:#0070f3;">View all in dashboard →</a></p>
  `

  const resurfaceSection =
    resurfaceItems.length > 0
      ? `
    <h2 style="font-size:16px;font-weight:600;margin:24px 0 8px;">From the vault</h2>
    <ul style="padding-left:20px;margin:0;">
      ${resurfaceItems
        .map(
          (item) =>
            `<li style="margin:6px 0;">${item.subject ?? '(no subject)'} <a href="${appUrl}/dashboard" style="color:#0070f3;font-size:13px;">Re-read →</a></li>`
        )
        .join('\n      ')}
    </ul>
  `
      : ''

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:600px;margin:0 auto;color:#1a1a1a;line-height:1.6;">
      <p style="margin-bottom:4px;">Hi,</p>
      <p style="margin-top:0;">Here's your drop-note weekly digest.</p>
      ${weekSection}
      ${resurfaceSection}
      <hr style="border:none;border-top:1px solid #eee;margin:24px 0;" />
      <p style="font-size:13px;color:#888;">
        You're receiving this because you have weekly digest enabled.
        Manage in settings: <a href="${appUrl}/settings" style="color:#0070f3;">${appUrl}/settings</a>
      </p>
    </div>
  `.trim()

  await resend.emails.send({
    from: process.env.RESEND_FROM_ADDRESS ?? 'drop-note <hello@dropnote.me>',
    to,
    subject,
    html,
  })
}

export async function sendWelcomeEmail(toEmail: string): Promise<void> {
  const resend = new Resend(process.env.RESEND_API_KEY)
  await resend.emails.send({
    from: process.env.RESEND_FROM_ADDRESS ?? 'drop-note <hello@dropnote.me>',
    to: toEmail,
    subject: 'Welcome to drop-note — your drop address is ready',
    html: `
      <p>Hi,</p>
      <p>Welcome to <strong>drop-note</strong>! Your drop address is ready to use.</p>
      <p style="font-size: 20px; font-weight: bold; padding: 16px; background: #f5f5f5; border-radius: 8px;">
        drop@dropnote.me
      </p>
      <p>Forward any email to that address and it will appear in your dashboard with an AI-generated summary and tags.</p>
      <p><a href="${process.env.NEXT_PUBLIC_APP_URL ?? 'https://dropnote.me'}/dashboard">Open your dashboard →</a></p>
      <p>Happy saving,<br>The drop-note team</p>
    `,
  })
}
```

- [ ] **Step 1.4: Run test — confirm all 4 cases PASS**

```bash
cd /Users/lego/@Lego651/drop-note
pnpm test apps/web/lib/__tests__/email.test.ts 2>&1 | tail -20
```

Expected: 4 passing.

- [ ] **Step 1.5: Update cron `route.ts` — add `failed` counter**

In `apps/web/app/api/cron/digest/route.ts`, change the three variables and the results loop:

Find this block (lines 40–42):
```typescript
    let processed = 0
    let skipped = 0
```
Replace with:
```typescript
    let processed = 0
    let skipped = 0
    let failed = 0
```

Find this block (lines 102–112):
```typescript
    for (const result of results) {
      if (result.status === 'fulfilled') {
        if (result.value.sent) {
          processed++
        } else {
          skipped++
        }
      } else {
        skipped++
        console.error('[cron/digest] User digest failed:', result.reason)
      }
    }
```
Replace with:
```typescript
    for (const result of results) {
      if (result.status === 'fulfilled') {
        if (result.value.sent) {
          processed++
        } else {
          skipped++
        }
      } else {
        failed++
        console.error('[cron/digest] User digest failed:', result.reason)
      }
    }
```

Find (line 115):
```typescript
    return NextResponse.json({ ok: true, processed, skipped })
```
Replace with:
```typescript
    return NextResponse.json({ ok: true, processed, skipped, failed })
```

- [ ] **Step 1.6: Run full test suite + typecheck**

```bash
cd /Users/lego/@Lego651/drop-note
pnpm test 2>&1 | tail -20
pnpm turbo typecheck 2>&1 | tail -20
```

Expected: all green.

- [ ] **Step 1.7: Commit**

```bash
cd /Users/lego/@Lego651/drop-note
git add apps/web/lib/__tests__/email.test.ts apps/web/lib/email.ts apps/web/app/api/cron/digest/route.ts
git commit -m "$(cat <<'EOF'
[s8] fix: remove silent error swallowing in email lib

sendWeeklyDigestEmail and sendWelcomeEmail no longer catch Resend
errors. Cron allSettled now surfaces delivery failures as `failed`
instead of `skipped`.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2 — WelcomeModal component

**Files:**
- Create: `apps/web/components/dashboard/WelcomeModal.tsx`
- Create: `apps/web/components/dashboard/__tests__/WelcomeModal.test.tsx`
- Modify: `apps/web/components/items/ItemsPageClient.tsx`

### Context you need to know

- shadcn `Dialog` is already at `apps/web/components/ui/dialog.tsx`. It exports: `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription`, `DialogFooter`, `DialogClose`.
- `Dialog` from Radix (which shadcn wraps) accepts `open` and `onOpenChange` props. When `onOpenChange` fires with `false` (user presses Escape or clicks outside), we treat it as a dismiss.
- `OnboardingPanel` at `apps/web/components/dashboard/onboarding-panel.tsx` shows the exact numbered-pill pattern and drop-address monospace box to match.
- localStorage key: `drop-note:welcomed`. Absent = show modal. Set to any truthy string = hide.
- In jsdom tests, `navigator.clipboard` is undefined. Mock it via `vi.stubGlobal`.
- Radix Dialog renders into a portal. `@testing-library/react` + jsdom handles this correctly when using `screen.getByText` / `screen.queryByText`.

---

- [ ] **Step 2.1: Write the failing test file**

Create `apps/web/components/dashboard/__tests__/WelcomeModal.test.tsx`:

```typescript
/** @vitest-environment jsdom */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { WelcomeModal } from '../WelcomeModal'

// Radix Dialog uses matchMedia — stub it for jsdom
beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })

  // Stub clipboard
  vi.stubGlobal('navigator', {
    ...global.navigator,
    clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
  })

  localStorage.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('WelcomeModal', () => {
  it('shows modal when localStorage key is absent', () => {
    render(<WelcomeModal />)
    expect(screen.getByText('Welcome to drop-note')).toBeInTheDocument()
  })

  it('does not show modal when localStorage key is already set', () => {
    localStorage.setItem('drop-note:welcomed', 'true')
    render(<WelcomeModal />)
    expect(screen.queryByText('Welcome to drop-note')).not.toBeInTheDocument()
  })

  it('dismisses modal and sets localStorage key when "Got it" is clicked', async () => {
    render(<WelcomeModal />)
    expect(screen.getByText('Welcome to drop-note')).toBeInTheDocument()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Got it' }))
    })

    expect(screen.queryByText('Welcome to drop-note')).not.toBeInTheDocument()
    expect(localStorage.getItem('drop-note:welcomed')).toBe('true')
  })
})
```

- [ ] **Step 2.2: Run test — confirm all 3 cases FAIL**

```bash
cd /Users/lego/@Lego651/drop-note
pnpm test apps/web/components/dashboard/__tests__/WelcomeModal.test.tsx 2>&1 | tail -20
```

Expected: 3 failures — component file does not exist yet.

- [ ] **Step 2.3: Implement `WelcomeModal.tsx`**

Create `apps/web/components/dashboard/WelcomeModal.tsx`:

```typescript
'use client'

import { useState, useEffect } from 'react'
import { Mail, Copy, CheckCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'

const WELCOMED_KEY = 'drop-note:welcomed'
const DROP_ADDRESS = process.env.NEXT_PUBLIC_DROP_ADDRESS ?? 'drop@dropnote.me'

export function WelcomeModal() {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    try {
      if (!localStorage.getItem(WELCOMED_KEY)) {
        setOpen(true)
      }
    } catch {
      // localStorage unavailable — skip modal
    }
  }, [])

  function dismiss() {
    try {
      localStorage.setItem(WELCOMED_KEY, 'true')
    } catch {
      // localStorage unavailable
    }
    setOpen(false)
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(DROP_ADDRESS)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) dismiss() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Welcome to drop-note</DialogTitle>
          <DialogDescription>
            Email anything to your drop address. AI tags it. Find it here.
          </DialogDescription>
        </DialogHeader>

        {/* Steps */}
        <div className="flex items-center justify-center gap-3 py-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[10px] font-medium text-foreground">
              1
            </span>
            Email anything to your drop address
          </span>
          <span className="text-border">→</span>
          <span className="flex items-center gap-1.5">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[10px] font-medium text-foreground">
              2
            </span>
            AI summarizes and tags it
          </span>
          <span className="text-border">→</span>
          <span className="flex items-center gap-1.5">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[10px] font-medium text-foreground">
              3
            </span>
            Find it in your dashboard
          </span>
        </div>

        {/* Drop address box */}
        <div className="flex items-center gap-2">
          <input
            readOnly
            value={DROP_ADDRESS}
            className="flex-1 rounded-md border border-border bg-background px-3 py-2 font-mono text-sm text-foreground"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopy}
            aria-label="Copy drop address"
            className="shrink-0 gap-1.5"
          >
            {copied ? <CheckCheck size={14} /> : <Copy size={14} />}
            {copied ? 'Copied!' : 'Copy'}
          </Button>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="default" className="gap-2" asChild>
            <a href={`mailto:${DROP_ADDRESS}?subject=Test drop`}>
              <Mail size={14} />
              Send yourself a test email
            </a>
          </Button>
          <Button variant="outline" onClick={dismiss}>
            Got it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2.4: Run test — confirm all 3 cases PASS**

```bash
cd /Users/lego/@Lego651/drop-note
pnpm test apps/web/components/dashboard/__tests__/WelcomeModal.test.tsx 2>&1 | tail -20
```

Expected: 3 passing.

- [ ] **Step 2.5: Mount `<WelcomeModal />` in `ItemsPageClient`**

In `apps/web/components/items/ItemsPageClient.tsx`:

Add import at top (with other component imports):
```typescript
import { WelcomeModal } from '@/components/dashboard/WelcomeModal'
```

Inside `ItemsPageClientInner`'s return, add `<WelcomeModal />` as the first child inside the outermost `<div className="p-6 space-y-4">`:

Find:
```typescript
  return (
    <div className="p-6 space-y-4">
      {/* Header row */}
```
Replace with:
```typescript
  return (
    <div className="p-6 space-y-4">
      <WelcomeModal />
      {/* Header row */}
```

- [ ] **Step 2.6: Run full test suite + typecheck**

```bash
cd /Users/lego/@Lego651/drop-note
pnpm test 2>&1 | tail -20
pnpm turbo typecheck 2>&1 | tail -20
```

Expected: all green.

- [ ] **Step 2.7: Commit**

```bash
cd /Users/lego/@Lego651/drop-note
git add apps/web/components/dashboard/__tests__/WelcomeModal.test.tsx apps/web/components/dashboard/WelcomeModal.tsx apps/web/components/items/ItemsPageClient.tsx
git commit -m "$(cat <<'EOF'
[s8] feat: add WelcomeModal shown once per browser on first visit

localStorage key drop-note:welcomed gates display. Dismiss via button,
Escape, or click-outside. Mounted inside ItemsPageClientInner.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3 — Upgrade empty state in `ItemsPageClient`

**Files:**
- Modify: `apps/web/components/items/ItemsPageClient.tsx`
- Create: `apps/web/components/items/__tests__/ItemsPageClient.empty-state.test.tsx`

### Context you need to know

- The current empty state is at lines 281–302 of `ItemsPageClient.tsx`. It's a minimal flex column with a text line and copy button.
- We upgrade it to match `OnboardingPanel`'s numbered-pill + address box + mailto CTA pattern, but more compact (no min-height wrapper, no border-dashed box — it sits inline in the items list).
- The test renders `ItemsPageClient` with `items={[]}`. This component uses `useRouter`, `useSearchParams`, and `useRealtimeItems`. We must mock all three. Look at `apps/web/components/__tests__/ItemCard.test.tsx` for the `next/link` mock pattern; apply the same for `next/navigation`.
- `useRealtimeItems` is a custom hook at `@/hooks/useRealtimeItems`. Mock the whole module.
- The component also calls `localStorage.getItem(VIEW_STORAGE_KEY)` on mount — jsdom localStorage is fine for this.
- `BulkSelectProvider` wraps the component internally — no need to provide it externally since `ItemsPageClient` renders it itself.

---

- [ ] **Step 3.1: Write the failing test file**

Create `apps/web/components/items/__tests__/ItemsPageClient.empty-state.test.tsx`:

```typescript
/** @vitest-environment jsdom */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'

// Mock Next.js navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))

// Mock Next.js Link
vi.mock('next/link', () => ({
  default: function MockLink({ children, href, ...props }: { children: ReactNode; href: string }) {
    return <a href={href} {...props}>{children}</a>
  },
}))

// Mock realtime hook
vi.mock('@/hooks/useRealtimeItems', () => ({
  useRealtimeItems: () => ({
    newItems: [],
    updatedItems: [],
    clearNewItems: vi.fn(),
    clearUpdatedItems: vi.fn(),
  }),
}))

// Mock clipboard
beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })

  vi.stubGlobal('navigator', {
    ...global.navigator,
    clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
  })

  // Ensure welcomed key is set so WelcomeModal doesn't render on top
  localStorage.setItem('drop-note:welcomed', 'true')
})

import { ItemsPageClient } from '../ItemsPageClient'

const defaultProps = {
  items: [],
  totalCount: 0,
  page: 1,
  initialQuery: '',
  userTier: 'free' as const,
  userId: 'user-123',
}

describe('ItemsPageClient empty state', () => {
  it('shows the drop address when items list is empty', () => {
    render(<ItemsPageClient {...defaultProps} />)
    expect(screen.getByText('drop@dropnote.me')).toBeInTheDocument()
  })

  it('shows the 3-step pill labels when items list is empty', () => {
    render(<ItemsPageClient {...defaultProps} />)
    expect(screen.getByText('Email it')).toBeInTheDocument()
    expect(screen.getByText('AI tags it')).toBeInTheDocument()
    expect(screen.getByText('Find it here')).toBeInTheDocument()
  })
})
```

- [ ] **Step 3.2: Run test — confirm both cases FAIL**

```bash
cd /Users/lego/@Lego651/drop-note
pnpm test apps/web/components/items/__tests__/ItemsPageClient.empty-state.test.tsx 2>&1 | tail -20
```

Expected: 2 failures — the current empty state doesn't have pill labels or the address as a standalone visible element.

- [ ] **Step 3.3: Replace the empty state block in `ItemsPageClient.tsx`**

Find the current empty state block (lines 280–303):

```typescript
      {/* Empty state */}
      {isEmpty && !isSearchMode && (
        <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
          <p className="text-sm text-muted-foreground">
            No items yet. Send an email to{' '}
            <span className="font-medium text-foreground">drop@dropnote.me</span> to get
            started.
          </p>
          <Button variant="outline" size="sm" onClick={handleCopyEmail} className="gap-1.5">
            {copied ? (
              <>
                <Check size={13} />
                Copied!
              </>
            ) : (
              <>
                <Copy size={13} />
                Copy address
              </>
            )}
          </Button>
        </div>
      )}
```

Replace with:

```typescript
      {/* Empty state */}
      {isEmpty && !isSearchMode && (
        <div className="flex flex-col items-center gap-4 py-16 text-center">
          {/* Steps */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[10px] font-medium text-foreground">
                1
              </span>
              Email it
            </span>
            <span className="text-border">→</span>
            <span className="flex items-center gap-1.5">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[10px] font-medium text-foreground">
                2
              </span>
              AI tags it
            </span>
            <span className="text-border">→</span>
            <span className="flex items-center gap-1.5">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[10px] font-medium text-foreground">
                3
              </span>
              Find it here
            </span>
          </div>

          {/* Drop address */}
          <div className="flex items-center gap-2 w-full max-w-xs">
            <input
              readOnly
              value="drop@dropnote.me"
              className="flex-1 rounded-md border border-border bg-background px-3 py-1.5 font-mono text-sm text-foreground"
            />
            <Button variant="outline" size="sm" onClick={handleCopyEmail} className="shrink-0 gap-1.5">
              {copied ? (
                <>
                  <Check size={13} />
                  Copied!
                </>
              ) : (
                <>
                  <Copy size={13} />
                  Copy
                </>
              )}
            </Button>
          </div>

          {/* CTA */}
          <Button variant="default" size="sm" className="gap-2" asChild>
            <a href="mailto:drop@dropnote.me?subject=Test drop">
              <Mail size={13} />
              Send yourself a test email
            </a>
          </Button>
        </div>
      )}
```

Add `Mail` to the lucide-react import at the top of the file. The current import is:
```typescript
import { Search, Copy, Check, X } from 'lucide-react'
```
Replace with:
```typescript
import { Search, Copy, Check, X, Mail } from 'lucide-react'
```

- [ ] **Step 3.4: Run test — confirm both cases PASS**

```bash
cd /Users/lego/@Lego651/drop-note
pnpm test apps/web/components/items/__tests__/ItemsPageClient.empty-state.test.tsx 2>&1 | tail -20
```

Expected: 2 passing.

- [ ] **Step 3.5: Run full test suite + lint + typecheck + build**

```bash
cd /Users/lego/@Lego651/drop-note
pnpm test 2>&1 | tail -30
pnpm turbo lint 2>&1 | tail -20
pnpm turbo typecheck 2>&1 | tail -20
pnpm --filter @drop-note/web build 2>&1 | tail -20
```

Expected: all green.

- [ ] **Step 3.6: Commit**

```bash
cd /Users/lego/@Lego651/drop-note
git add apps/web/components/items/__tests__/ItemsPageClient.empty-state.test.tsx apps/web/components/items/ItemsPageClient.tsx
git commit -m "$(cat <<'EOF'
[s8] feat: upgrade empty state with 3-step pills and drop address CTA

Matches OnboardingPanel visual pattern — numbered pills, monospace
address box, send-test-email mailto button. Compact inline variant.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4 — Browser verification + screenshots

**Files:**
- Create dir: `docs/verification/task-f/`

- [ ] **Step 4.1: Start dev server**

```bash
cd /Users/lego/@Lego651/drop-note
pnpm --filter @drop-note/web dev &
# Wait for "Ready" message
```

- [ ] **Step 4.2: Clear localStorage and screenshot welcome modal**

Open browser to `http://localhost:3000/items`. Ensure `drop-note:welcomed` is not set in localStorage.

Using agent-browser:
```bash
agent-browser open http://localhost:3000/items
agent-browser eval 'localStorage.removeItem("drop-note:welcomed"); location.reload();'
agent-browser wait --load networkidle
agent-browser screenshot docs/verification/task-f/01-welcome-modal.png
```

Assert: screenshot shows "Welcome to drop-note" dialog.

- [ ] **Step 4.3: Dismiss modal and screenshot empty state**

```bash
agent-browser eval 'localStorage.setItem("drop-note:welcomed","true"); location.reload();'
agent-browser wait --load networkidle
agent-browser screenshot docs/verification/task-f/02-empty-state.png
```

Assert: screenshot shows 3-step pills and drop address. No modal.

- [ ] **Step 4.4: Close browser and stop dev server**

```bash
agent-browser close
# Kill background dev server
kill %1 2>/dev/null || true
```

- [ ] **Step 4.5: Commit screenshots**

```bash
cd /Users/lego/@Lego651/drop-note
git add docs/verification/task-f/
git commit -m "$(cat <<'EOF'
[s8] docs: add browser verification screenshots for task F

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Final verification checklist

Run all of these before declaring done:

```bash
cd /Users/lego/@Lego651/drop-note
pnpm test 2>&1 | tail -30                                    # must: all passing
pnpm turbo lint 2>&1 | tail -20                              # must: no errors
pnpm turbo typecheck 2>&1 | tail -20                         # must: no errors
pnpm --filter @drop-note/web build 2>&1 | tail -20           # must: build succeeded
git log --oneline -5                                         # must: 4 [s8] commits
ls docs/verification/task-f/                                 # must: 2 PNGs
```

---

## Self-review against spec

| Spec requirement | Covered by |
|---|---|
| Remove try/catch from `sendWeeklyDigestEmail` | Task 1.3 |
| Remove try/catch from `sendWelcomeEmail` | Task 1.3 |
| Cron caller — `failed` counter vs `skipped` | Task 1.5 |
| Test: rejection propagates (email lib) | Task 1.1 tests 1 + 3 |
| Test: clean resolve (email lib) | Task 1.1 tests 2 + 4 |
| TDD red→green evidence for email | Steps 1.2 → 1.4 |
| `WelcomeModal.tsx` — localStorage gate | Task 2.3 |
| WelcomeModal — shadcn Dialog | Task 2.3 |
| WelcomeModal — 3 steps, drop address, mailto CTA, "Got it" | Task 2.3 |
| WelcomeModal — Escape + click-outside dismiss | Task 2.3 (Radix default) |
| Test: modal shown / hidden / dismiss+localStorage | Task 2.1 |
| TDD red→green evidence for WelcomeModal | Steps 2.2 → 2.4 |
| Mount `<WelcomeModal />` in `ItemsPageClient` | Task 2.5 |
| Empty state — 3 pills, address box, mailto CTA | Task 3.3 |
| Test: drop address visible, 3 pill labels visible | Task 3.1 |
| TDD red→green evidence for empty state | Steps 3.2 → 3.4 |
| Browser screenshots (modal + empty state) | Task 4 |
| `[s8]` prefix on all commits | All commit steps |
| Co-author trailer | All commit steps |
| `OnboardingPanel` NOT deleted | Not touched anywhere |
| No new packages added | No `pnpm add` in plan |
