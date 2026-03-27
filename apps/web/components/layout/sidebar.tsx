'use client'

import Link from 'next/link'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useState, Suspense } from 'react'
import { cn } from '@/lib/utils'
import {
  Inbox,
  Settings,
  LogOut,
  Sun,
  Moon,
  Monitor,
  CreditCard,
  Trash2,
  Tag,
  CalendarDays,
} from 'lucide-react'
import { useTheme } from 'next-themes'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'

interface TagWithCount {
  id: string
  name: string
  item_count: number
}

interface MonthCount {
  month: string // 'YYYY-MM'
  item_count: number
}

export interface SidebarProps {
  userEmail: string
  tags?: TagWithCount[]
  monthCounts?: MonthCount[]
  trashCount?: number
}

function SidebarLink({
  href,
  isActive,
  children,
}: {
  href: string
  isActive: boolean
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      className={cn(
        'flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors',
        'hover:bg-accent hover:text-accent-foreground',
        isActive
          ? 'bg-accent text-accent-foreground font-medium'
          : 'text-muted-foreground',
      )}
    >
      {children}
    </Link>
  )
}

// Inner component that uses useSearchParams (requires Suspense boundary)
function SidebarNav({
  userEmail,
  tags = [],
  monthCounts = [],
  trashCount = 0,
}: SidebarProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { theme, setTheme } = useTheme()
  const [signOutError, setSignOutError] = useState<string | null>(null)

  async function handleSignOut() {
    const supabase = createClient()
    const { error } = await supabase.auth.signOut()
    if (error) {
      setSignOutError('Sign out failed. Please try again.')
      return
    }
    router.refresh()
    router.push('/login')
  }

  function cycleTheme() {
    if (theme === 'light') setTheme('dark')
    else if (theme === 'dark') setTheme('system')
    else setTheme('light')
  }

  const ThemeIcon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Monitor

  const activeTag = searchParams.get('tag')
  const activeYear = searchParams.get('year')
  const activeMonth = searchParams.get('month')

  const isItemsRoot =
    pathname === '/items' && !activeTag && !activeYear && !activeMonth

  // Group months by year for the Accordion
  const monthsByYear = monthCounts.reduce<Record<string, MonthCount[]>>(
    (acc, mc) => {
      const [year] = mc.month.split('-')
      if (!acc[year]) acc[year] = []
      acc[year].push(mc)
      return acc
    },
    {},
  )
  const years = Object.keys(monthsByYear).sort((a, b) => Number(b) - Number(a))
  const currentYear = new Date().getFullYear().toString()

  const MONTH_NAMES = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ]

  return (
    <aside className="flex flex-col w-60 h-screen border-r border-border bg-background shrink-0">
      {/* Logo */}
      <div className="h-14 flex items-center px-4 border-b border-border">
        <span className="text-sm font-semibold tracking-tight">drop-note</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 overflow-y-auto space-y-4">
        {/* Primary links */}
        <div className="space-y-0.5">
          <SidebarLink href="/items" isActive={isItemsRoot}>
            <Inbox size={16} />
            All Items
          </SidebarLink>
          <SidebarLink href="/dashboard/settings" isActive={pathname === '/dashboard/settings'}>
            <Settings size={16} />
            Settings
          </SidebarLink>
          <SidebarLink href="/pricing" isActive={pathname === '/pricing'}>
            <CreditCard size={16} />
            Pricing
          </SidebarLink>
          <SidebarLink href="/trash" isActive={pathname === '/trash'}>
            <Trash2 size={16} />
            <span className="flex-1">Trash</span>
            {trashCount > 0 && (
              <Badge variant="secondary" className="text-xs py-0 px-1.5 ml-auto">
                {trashCount}
              </Badge>
            )}
          </SidebarLink>
        </div>

        {/* Tags section */}
        <div>
          <div className="flex items-center gap-1.5 px-3 mb-1">
            <Tag size={13} className="text-muted-foreground" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Tags
            </span>
          </div>
          <div className="space-y-0.5">
            <Link
              href="/items"
              className={cn(
                'flex items-center gap-2 rounded-md px-3 py-1 text-sm transition-colors',
                'hover:bg-accent hover:text-accent-foreground',
                pathname === '/items' && !activeTag
                  ? 'bg-accent text-accent-foreground font-medium'
                  : 'text-muted-foreground',
              )}
            >
              All
            </Link>
            {tags.length === 0 ? (
              <p className="px-3 py-1 text-xs text-muted-foreground">
                Tags will appear here as you save items.
              </p>
            ) : (
              tags.map((tag) => (
                <Link
                  key={tag.id}
                  href={`/items?tag=${tag.id}`}
                  className={cn(
                    'flex items-center justify-between gap-2 rounded-md px-3 py-1 text-sm transition-colors',
                    'hover:bg-accent hover:text-accent-foreground',
                    activeTag === tag.id
                      ? 'bg-accent text-accent-foreground font-medium'
                      : 'text-muted-foreground',
                  )}
                >
                  <span className="truncate">{tag.name}</span>
                  <span className="shrink-0 text-xs opacity-60">
                    {tag.item_count}
                  </span>
                </Link>
              ))
            )}
          </div>
        </div>

        {/* By Date section */}
        {years.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 px-3 mb-1">
              <CalendarDays size={13} className="text-muted-foreground" />
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                By Date
              </span>
            </div>
            <Accordion
              type="multiple"
              defaultValue={[currentYear]}
              className="w-full"
            >
              {years.map((year) => (
                <AccordionItem key={year} value={year} className="border-none">
                  <AccordionTrigger className="px-3 py-1 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground rounded-md hover:no-underline">
                    {year}
                  </AccordionTrigger>
                  <AccordionContent className="pb-1">
                    <div className="space-y-0.5 pl-2">
                      {monthsByYear[year]
                        .sort((a, b) => b.month.localeCompare(a.month))
                        .map((mc) => {
                          const [y, m] = mc.month.split('-')
                          const monthIdx = parseInt(m) - 1
                          const monthLabel = MONTH_NAMES[monthIdx] ?? m
                          const isActive = activeYear === y && activeMonth === m
                          return (
                            <Link
                              key={mc.month}
                              href={`/items?year=${y}&month=${m}`}
                              className={cn(
                                'flex items-center justify-between gap-2 rounded-md px-3 py-1 text-sm transition-colors',
                                'hover:bg-accent hover:text-accent-foreground',
                                isActive
                                  ? 'bg-accent text-accent-foreground font-medium'
                                  : 'text-muted-foreground',
                              )}
                            >
                              <span>{monthLabel}</span>
                              <span className="shrink-0 text-xs opacity-60">
                                {mc.item_count}
                              </span>
                            </Link>
                          )
                        })}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        )}
      </nav>

      {/* Footer */}
      <div className="px-3 py-3 border-t border-border space-y-1">
        <p className="px-2 text-xs text-muted-foreground truncate">{userEmail}</p>
        {signOutError && (
          <p className="px-2 text-xs text-destructive">{signOutError}</p>
        )}
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={cycleTheme}
            aria-label="Toggle theme"
          >
            <ThemeIcon size={14} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="flex-1 justify-start gap-2 h-8 px-2 text-xs text-muted-foreground"
            onClick={handleSignOut}
          >
            <LogOut size={14} />
            Sign out
          </Button>
        </div>
      </div>
    </aside>
  )
}

export function Sidebar(props: SidebarProps) {
  return (
    <Suspense
      fallback={
        <aside className="flex flex-col w-60 h-screen border-r border-border bg-background shrink-0">
          <div className="h-14 flex items-center px-4 border-b border-border">
            <span className="text-sm font-semibold tracking-tight">drop-note</span>
          </div>
        </aside>
      }
    >
      <SidebarNav {...props} />
    </Suspense>
  )
}
