'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { useState, useEffect, Suspense } from 'react'
import { cn } from '@/lib/utils'
import {
  Inbox,
  Pin,
  Archive,
  Hash,
  Settings,
  ChevronLeft,
  ChevronRight,
  Mail,
} from 'lucide-react'

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
  archiveCount?: number
  totalCount?: number
  pinnedCount?: number
  collapsed?: boolean
  onToggleCollapse?: () => void
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </p>
  )
}

const ROW_BASE =
  'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors'
const ROW_INACTIVE =
  'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
const ROW_ACTIVE = 'bg-muted font-medium text-foreground'

// Inner component that uses useSearchParams (requires Suspense boundary)
export function SidebarNav({
  tags = [],
  archiveCount = 0,
  totalCount = 0,
  pinnedCount = 0,
  collapsed = false,
  onToggleCollapse,
}: SidebarProps) {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const activeTag = searchParams.get('tag')
  const activeSort = searchParams.get('sort')

  const isItemsRoot =
    pathname === '/items' && !activeTag && activeSort !== 'pinned'
  const isPinned = pathname === '/items' && activeSort === 'pinned'

  const navItems = [
    { href: '/items', label: 'All Items', Icon: Inbox, count: totalCount, active: isItemsRoot },
    { href: '/items?sort=pinned', label: 'Pinned', Icon: Pin, count: pinnedCount, active: isPinned },
    { href: '/archive', label: 'Archive', Icon: Archive, count: archiveCount, active: pathname === '/archive' },
  ]

  return (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div className="flex h-16 items-center gap-2.5 border-b border-border px-4">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-foreground text-background">
          <Mail size={15} />
        </span>
        {!collapsed && (
          <span className="text-sm font-semibold tracking-tight">drop-note</span>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
        {/* Navigation section */}
        <div className="space-y-0.5">
          {!collapsed && <SectionLabel>Navigation</SectionLabel>}
          {navItems.map(({ href, label, Icon, count, active }) => (
            <Link
              key={label}
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
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {count}
                </span>
              )}
            </Link>
          ))}
        </div>

        {/* Tags section */}
        {tags.length > 0 && (
          <div className="space-y-0.5">
            {!collapsed && <SectionLabel>Tags</SectionLabel>}
            {tags.map((tag) => {
              const active = activeTag === tag.id
              return (
                <Link
                  key={tag.id}
                  href={`/items?tag=${tag.id}`}
                  title={collapsed ? tag.name : undefined}
                  className={cn(
                    ROW_BASE,
                    'py-1.5',
                    active ? ROW_ACTIVE : ROW_INACTIVE,
                    collapsed && 'justify-center px-0',
                  )}
                >
                  <Hash size={15} className="shrink-0 text-muted-foreground" />
                  {!collapsed && <span className="flex-1 truncate">{tag.name}</span>}
                  {!collapsed && (
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {tag.item_count}
                    </span>
                  )}
                </Link>
              )
            })}
          </div>
        )}
      </nav>

      {/* Footer */}
      <div className="space-y-0.5 border-t border-border px-3 py-3">
        <Link
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
        </Link>
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
        <aside className="hidden h-screen w-60 shrink-0 flex-col border-r border-border bg-background md:flex" />
      }
    >
      <aside
        className={cn(
          'hidden h-screen shrink-0 flex-col border-r border-border bg-background transition-[width] duration-200 md:flex',
          collapsed ? 'w-[72px]' : 'w-60',
        )}
      >
        <SidebarNav {...props} collapsed={collapsed} onToggleCollapse={toggleCollapse} />
      </aside>
    </Suspense>
  )
}
