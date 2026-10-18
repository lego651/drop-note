'use client'

import { usePathname, useSearchParams } from 'next/navigation'
import { useState, useEffect, Suspense } from 'react'
import { cn } from '@/lib/utils'
import { CategoryNav } from '@/components/layout/CategoryNav'
import type { CategoryWithCount } from '@/components/layout/CategoryNav'
import { SectionLabel, ROW_BASE, ROW_INACTIVE, ROW_ACTIVE, COUNT, NavLink } from '@/components/layout/sidebar-ui'
import {
  Inbox,
  Pin,
  Archive,
  Settings,
  ChevronLeft,
  ChevronRight,
  Mail,
} from 'lucide-react'

interface MonthCount {
  month: string // 'YYYY-MM'
  item_count: number
}

export interface SidebarProps {
  userEmail: string
  categories?: CategoryWithCount[]
  categoriesError?: boolean
  monthCounts?: MonthCount[]
  trashCount?: number
  archiveCount?: number
  totalCount?: number
  pinnedCount?: number
  collapsed?: boolean
  onToggleCollapse?: () => void
  /** True inside MobileSidebar's Sheet: menus flip side/align and links close the sheet. */
  insideSheet?: boolean
}

// Inner component that uses useSearchParams (requires Suspense boundary)
export function SidebarNav({
  categories = [],
  categoriesError = false,
  archiveCount = 0,
  totalCount = 0,
  pinnedCount = 0,
  collapsed = false,
  onToggleCollapse,
  insideSheet = false,
}: SidebarProps) {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const activeCategoryId = searchParams.get('category')
  const activeSort = searchParams.get('sort')

  const isItemsRoot =
    pathname === '/items' && !activeCategoryId && activeSort !== 'pinned'
  const isPinned = pathname === '/items' && activeSort === 'pinned'

  const navItems = [
    { href: '/items', label: 'All Items', Icon: Inbox, count: totalCount, active: isItemsRoot },
    { href: '/items?sort=pinned', label: 'Pinned', Icon: Pin, count: pinnedCount, active: isPinned },
    { href: '/archive', label: 'Archive', Icon: Archive, count: archiveCount, active: pathname === '/archive' },
  ]

  return (
    <div className="flex h-full flex-col">
      {/* Logo */}
      {/* h-14 + the 8px stripe on <aside> = 64px, aligned with the h-16 page header */}
      <div className="flex h-14 items-center gap-2.5 border-b-stroke border-ink px-4">
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
          style={{ boxShadow: '0 0 0 2px hsl(var(--card)), 0 0 0 3.5px hsl(var(--ink))' }}
        >
          <Mail size={15} />
        </span>
        {!collapsed && (
          <span className="font-display text-[17px] font-extrabold tracking-tight [font-stretch:125%]">
            drop-note
          </span>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4 [scrollbar-width:thin]">
        {/* Navigation section */}
        <div className="space-y-0.5">
          {!collapsed && <SectionLabel>Navigation</SectionLabel>}
          {navItems.map(({ href, label, Icon, count, active }) => (
            <NavLink
              key={label}
              insideSheet={insideSheet}
              href={href}
              title={collapsed ? label : undefined}
              className={cn(
                ROW_BASE,
                active ? ROW_ACTIVE : ROW_INACTIVE,
                collapsed && 'justify-center px-0',
              )}
            >
              <Icon size={17} className="shrink-0" />
              {!collapsed && <span className="flex-1 truncate">{label}</span>}
              {!collapsed && count > 0 && (
                <span className={cn(COUNT, active && 'border-ink text-foreground')}>{count}</span>
              )}
            </NavLink>
          ))}
        </div>

        {/* Categories section (A+: replaces the old Tags section; keywords are never listed here) */}
        <CategoryNav
          categories={categories}
          categoriesError={categoriesError}
          activeCategoryId={activeCategoryId}
          collapsed={collapsed}
          insideSheet={insideSheet}
        />
      </nav>

      {/* Footer */}
      <div className="space-y-0.5 border-t-stroke border-ink px-3 py-3">
        <NavLink
          insideSheet={insideSheet}
          href="/settings"
          title={collapsed ? 'Settings' : undefined}
          className={cn(
            ROW_BASE,
            pathname === '/settings' ? ROW_ACTIVE : ROW_INACTIVE,
            collapsed && 'justify-center px-0',
          )}
        >
          <Settings size={17} className="shrink-0" />
          {!collapsed && 'Settings'}
        </NavLink>
        {onToggleCollapse && (
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className={cn(
              ROW_BASE,
              ROW_INACTIVE,
              'w-full',
              collapsed && 'justify-center px-0',
            )}
          >
            {collapsed ? (
              <ChevronRight size={17} className="shrink-0" />
            ) : (
              <ChevronLeft size={17} className="shrink-0" />
            )}
            {!collapsed && 'Collapse'}
          </button>
        )}
      </div>
    </div>
  )
}

const COLLAPSE_KEY = 'drop-note:sidebar-collapsed'

export function Sidebar(props: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === '1')
    } catch {
      // localStorage unavailable
    }
  }, [])

  function toggleCollapse() {
    setCollapsed((prev) => {
      const next = !prev
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0')
      } catch {
        // localStorage unavailable
      }
      return next
    })
  }

  return (
    <Suspense
      fallback={
        <aside className="stripe-top hidden h-screen w-64 shrink-0 flex-col border-r-stroke border-ink md:flex" />
      }
    >
      <aside
        className={cn(
          'stripe-top hidden h-screen shrink-0 flex-col border-r-stroke border-ink transition-[width] duration-200 md:flex',
          collapsed ? 'w-[72px]' : 'w-64',
        )}
      >
        <SidebarNav {...props} collapsed={collapsed} onToggleCollapse={toggleCollapse} />
      </aside>
    </Suspense>
  )
}
