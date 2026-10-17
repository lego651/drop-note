// Shared row/label primitives for the sidebar — used by both SidebarNav (nav items,
// Settings) and CategoryNav (Categories section), kept in their own module so the two
// don't need to import from each other.

import Link from 'next/link'
import { SheetClose } from '@/components/ui/sheet'

/**
 * Wraps a Link with SheetClose when rendered inside the mobile Sheet, so a tap both
 * navigates and closes the sheet; a no-op wrapper on desktop.
 */
export function NavLink({
  insideSheet,
  ...props
}: { insideSheet: boolean } & React.ComponentProps<typeof Link>) {
  if (insideSheet) {
    return (
      <SheetClose asChild>
        <Link {...props} />
      </SheetClose>
    )
  }
  return <Link {...props} />
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="type-label px-3 pb-1.5 text-foreground">{children}</p>
}

// Nav items (AIRMAIL § 7): transparent outline → ink outline + small ink shadow when active.
export const ROW_BASE =
  'flex items-center gap-3 rounded-lg border-stroke border-transparent px-3 py-2 text-sm transition-colors'
export const ROW_INACTIVE = 'text-foreground/80 hover:bg-muted hover:text-foreground'
export const ROW_ACTIVE = 'border-ink bg-accent font-semibold text-accent-foreground shadow-ink-sm'
export const COUNT =
  'shrink-0 rounded-full border border-border bg-card px-1.5 font-mono text-[11px] tabular-nums text-muted-foreground'
