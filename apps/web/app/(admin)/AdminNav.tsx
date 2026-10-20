'use client'

import { Fragment } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { SheetClose } from '@/components/ui/sheet'

const NAV_ITEMS = [
  { href: '/admin/users', label: 'Users' },
  { href: '/admin/blocks', label: 'Block List' },
  { href: '/admin/invite-codes', label: 'Invite Codes' },
  { href: '/admin/stats', label: 'Stats' },
]

// Nav item (AIRMAIL § 5/§ 7): transparent outline → ink outline + small ink shadow when active.
const ROW_BASE =
  'flex min-h-11 items-center rounded-lg border-stroke border-transparent px-3 py-2 text-sm transition-colors'
const ROW_ACTIVE = 'border-ink bg-accent font-semibold text-accent-foreground shadow-ink-sm'
const ROW_INACTIVE = 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'

interface AdminNavProps {
  /** True inside AdminMobileNav's Sheet: tapping a link also closes the sheet. */
  insideSheet?: boolean
}

export function AdminNav({ insideSheet = false }: AdminNavProps) {
  const pathname = usePathname()
  return (
    <nav className="flex flex-col gap-1">
      {NAV_ITEMS.map(({ href, label }) => {
        const isActive = pathname === href || pathname.startsWith(href + '/')
        const link = (
          <Link href={href} className={cn(ROW_BASE, isActive ? ROW_ACTIVE : ROW_INACTIVE)}>
            {label}
          </Link>
        )
        return insideSheet ? (
          <SheetClose asChild key={href}>
            {link}
          </SheetClose>
        ) : (
          <Fragment key={href}>{link}</Fragment>
        )
      })}
    </nav>
  )
}
