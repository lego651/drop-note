'use client'

import Link from 'next/link'
import { usePathname, useSearchParams, useRouter } from 'next/navigation'
import { useState, useEffect, Suspense } from 'react'
import { cn } from '@/lib/utils'
import {
  Inbox,
  Pin,
  Archive,
  Folder,
  FolderPlus,
  Pencil,
  Trash2,
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

interface FolderWithCount {
  id: string
  name: string
  position: number
  item_count: number
}

interface MonthCount {
  month: string // 'YYYY-MM'
  item_count: number
}

export interface SidebarProps {
  userEmail: string
  tags?: TagWithCount[]
  folders?: FolderWithCount[]
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
  folders = [],
  archiveCount = 0,
  totalCount = 0,
  pinnedCount = 0,
  collapsed = false,
  onToggleCollapse,
}: SidebarProps) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const router = useRouter()

  const activeFolder = searchParams.get('folder')
  const activeSort = searchParams.get('sort')

  const [dragOverId, setDragOverId] = useState<string | null>(null)

  async function handleCreateFolder() {
    const name = window.prompt('New folder name')?.trim()
    if (!name) return
    const res = await fetch('/api/folders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    if (res.ok) router.refresh()
    else {
      const e = await res.json().catch(() => ({}))
      window.alert(e.error ?? 'Could not create folder')
    }
  }

  async function handleRenameFolder(id: string, current: string) {
    const name = window.prompt('Rename folder', current)?.trim()
    if (!name || name === current) return
    const res = await fetch(`/api/folders/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    if (res.ok) router.refresh()
    else {
      const e = await res.json().catch(() => ({}))
      window.alert(e.error ?? 'Could not rename folder')
    }
  }

  async function handleDeleteFolder(id: string, name: string) {
    if (!window.confirm(`Delete folder "${name}"? Items stay saved — they're just removed from this folder.`)) return
    const res = await fetch(`/api/folders/${id}`, { method: 'DELETE' })
    if (res.ok) router.refresh()
  }

  async function handleDrop(e: React.DragEvent, folderId: string) {
    e.preventDefault()
    setDragOverId(null)
    const itemId = e.dataTransfer.getData('text/plain')
    if (!itemId) return
    await fetch(`/api/items/${itemId}/folders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folderId }),
    })
    router.refresh()
  }

  const isItemsRoot =
    pathname === '/items' && !activeFolder && activeSort !== 'pinned'
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

        {/* Folders section */}
        {!collapsed && (
          <div className="space-y-0.5">
            <div className="flex items-center justify-between pr-1">
              <SectionLabel>Folders</SectionLabel>
              <button
                type="button"
                onClick={handleCreateFolder}
                aria-label="New folder"
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                <FolderPlus size={14} />
              </button>
            </div>
            {folders.map((folder) => {
              const active = activeFolder === folder.id
              const isDropTarget = dragOverId === folder.id
              return (
                <div
                  key={folder.id}
                  onDragOver={(e) => {
                    e.preventDefault()
                    setDragOverId(folder.id)
                  }}
                  onDragLeave={() => setDragOverId((cur) => (cur === folder.id ? null : cur))}
                  onDrop={(e) => handleDrop(e, folder.id)}
                  className={cn(
                    ROW_BASE,
                    'group/folder py-1.5',
                    active ? ROW_ACTIVE : ROW_INACTIVE,
                    isDropTarget && 'bg-accent ring-2 ring-ring',
                  )}
                >
                  <Link
                    href={`/items?folder=${folder.id}`}
                    className="flex min-w-0 flex-1 items-center gap-3"
                  >
                    <Folder size={15} className="shrink-0 text-muted-foreground" />
                    <span className="flex-1 truncate">{folder.name}</span>
                  </Link>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground group-hover/folder:hidden">
                    {folder.item_count}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRenameFolder(folder.id, folder.name)}
                    aria-label={`Rename ${folder.name}`}
                    className="hidden text-muted-foreground hover:text-foreground group-hover/folder:block"
                  >
                    <Pencil size={12} />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteFolder(folder.id, folder.name)}
                    aria-label={`Delete ${folder.name}`}
                    className="hidden text-muted-foreground hover:text-destructive group-hover/folder:block"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              )
            })}
            {folders.length === 0 && (
              <p className="px-3 py-1 text-xs text-muted-foreground">No folders yet</p>
            )}
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
