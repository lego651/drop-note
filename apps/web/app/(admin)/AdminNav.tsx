'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV_ITEMS = [
  { href: '/admin/users', label: 'Users' },
  { href: '/admin/blocks', label: 'Block List' },
  { href: '/admin/invite-codes', label: 'Invite Codes' },
  { href: '/admin/stats', label: 'Stats' },
]

export function AdminNav() {
  const pathname = usePathname()
  return (
    <nav className="flex flex-col gap-1">
      {NAV_ITEMS.map(({ href, label }) => {
        const isActive = pathname === href || pathname.startsWith(href + '/')
        return (
          <Link
            key={href}
            href={href}
            className={`flex items-center rounded-md px-3 py-1.5 text-sm transition-colors ${
              isActive
                ? 'bg-accent text-accent-foreground font-medium'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
            }`}
          >
            {label}
          </Link>
        )
      })}
    </nav>
  )
}
