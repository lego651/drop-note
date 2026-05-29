'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRealtimeItems } from '@/hooks/useRealtimeItems'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Search, Copy, Check, Mail } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { ItemsListLayout } from '@/components/items/ItemsListLayout'
import { ItemsGridLayout } from '@/components/items/ItemsGridLayout'
import { TimelineSpine } from '@/components/items/TimelineSpine'
import { ViewSwitcher, VIEW_STORAGE_KEY } from '@/components/items/ViewSwitcher'
import { BulkSelectProvider, useBulkSelect } from '@/components/items/BulkSelectProvider'
import { BulkActionToolbar } from '@/components/items/BulkActionToolbar'
import { WelcomeModal } from '@/components/dashboard/WelcomeModal'
import { StatsBar } from '@/components/items/StatsBar'
import { ItemsPageHeader } from '@/components/items/ItemsPageHeader'
import { TagFilterBar } from '@/components/items/TagFilterBar'
import type { ViewMode } from '@/components/items/ViewSwitcher'
import type { ItemSummary } from '@/lib/items'
import type { Tier } from '@drop-note/shared'

interface StatsBarData {
  thisWeekCount: number
  processingCount: number
  topTag: { name: string; count: number } | null
}

interface ItemsPageClientProps {
  items: ItemSummary[]
  totalCount: number
  page: number
  initialQuery?: string
  activeTagName?: string
  activeTagId?: string
  tags?: { id: string; name: string; count: number }[]
  userTier?: Tier
  userId: string
  statsData?: StatsBarData
  avatarUrl?: string | null
  userInitials?: string
  avatarColor?: string
}

export function ItemsPageClient(props: ItemsPageClientProps) {
  return (
    <BulkSelectProvider>
      <ItemsPageClientInner {...props} />
    </BulkSelectProvider>
  )
}

function ItemsPageClientInner({
  items,
  totalCount,
  page,
  initialQuery = '',
  activeTagId,
  tags = [],
  userTier = 'free',
  userId,
  statsData,
  avatarUrl = null,
  userInitials = 'U',
  avatarColor = '215 16% 55%',
}: ItemsPageClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const searchParamsStr = searchParams.toString()

  const { isBulkMode, selectedIds, toggle, selectAll, deselectAll } = useBulkSelect()

  const [view, setView] = useState<ViewMode>('list')
  const [searchQuery, setSearchQuery] = useState(initialQuery)
  const [searchResults, setSearchResults] = useState<ItemSummary[] | null>(null)
  const [isSearching, setIsSearching] = useState(false)
  const [copied, setCopied] = useState(false)
  const [optimisticItems, setOptimisticItems] = useState<ItemSummary[]>(items)

  const { newItems, updatedItems, clearNewItems, clearUpdatedItems } = useRealtimeItems(userId)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Keep optimistic items in sync when server props change
  useEffect(() => {
    setOptimisticItems(items)
  }, [items])

  // Apply realtime updates to optimistic items
  useEffect(() => {
    if (updatedItems.length === 0) return
    setOptimisticItems(prev => prev.map(item => {
      const updated = updatedItems.find(u => u.id === item.id)
      return updated ?? item
    }))
    clearUpdatedItems()
  }, [updatedItems, clearUpdatedItems])

  // Prepend new items (dedup)
  useEffect(() => {
    if (newItems.length === 0) return
    setOptimisticItems(prev => {
      const existingIds = new Set(prev.map(i => i.id))
      const truly_new = newItems.filter(n => !existingIds.has(n.id))
      if (truly_new.length === 0) return prev
      return [...truly_new, ...prev]
    })
    clearNewItems()
  }, [newItems, clearNewItems])

  // Read view preference from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(VIEW_STORAGE_KEY)
      if (stored === 'list' || stored === 'card' || stored === 'timeline') {
        setView(stored)
      }
    } catch {
      // localStorage unavailable
    }
  }, [])

  const handleViewChange = useCallback((newView: ViewMode) => {
    setView(newView)
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, newView)
    } catch {
      // localStorage unavailable
    }
  }, [])

  const performSearch = useCallback(
    async (q: string) => {
      if (q.length < 2) {
        setSearchResults(null)
        setIsSearching(false)
        const params = new URLSearchParams(searchParamsStr)
        params.delete('q')
        router.replace(`/items?${params.toString()}`)
        return
      }

      setIsSearching(true)
      try {
        const params = new URLSearchParams(searchParamsStr)
        params.set('q', q)
        params.delete('page')
        router.replace(`/items?${params.toString()}`)

        const res = await fetch(`/api/items/search?q=${encodeURIComponent(q)}`)
        if (res.ok) {
          const data = await res.json()
          setSearchResults(Array.isArray(data) ? data : [])
        }
      } finally {
        setIsSearching(false)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [router, searchParamsStr],
  )

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const q = e.target.value
      setSearchQuery(q)

      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        performSearch(q)
      }, 300)
    },
    [performSearch],
  )

  // Run initial search if ?q param is set
  useEffect(() => {
    if (initialQuery && initialQuery.length >= 2) {
      performSearch(initialQuery)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handlePinChange = useCallback(async (id: string, pinned: boolean) => {
    await fetch(`/api/items/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pinned }),
    })
    setOptimisticItems(prev => prev.map(item =>
      item.id === id ? { ...item, pinned } : item,
    ))
  }, [])

  const handleDelete = useCallback(async (id: string) => {
    const confirmed = window.confirm('Delete this item?')
    if (!confirmed) return
    await fetch(`/api/items/${id}`, { method: 'DELETE' })
    setOptimisticItems(prev => prev.filter(item => item.id !== id))
  }, [])

  const handleBulkDeleted = useCallback((deletedIds: string[]) => {
    const deletedSet = new Set(deletedIds)
    setOptimisticItems(prev => prev.filter(item => !deletedSet.has(item.id)))
    deselectAll()
  }, [deselectAll])

  const handleBulkTagged = useCallback(() => {
    // Tags are applied server-side; no optimistic update needed for tag display
  }, [])

  const isSearchMode = searchQuery.length >= 2
  const displayItems = isSearchMode && searchResults !== null ? searchResults : optimisticItems
  const showPagination = !isSearchMode && totalCount > 25

  async function handleCopyEmail() {
    await navigator.clipboard.writeText('drop@dropnote.me')
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const allPageIds = displayItems.map(item => item.id)

  const bulkProps = {
    isBulkMode,
    selectedIds,
    onSelectChange: toggle,
    onPinChange: handlePinChange,
    onDelete: handleDelete,
  }

  function renderLayout() {
    if (view === 'card') return <ItemsGridLayout items={displayItems} {...bulkProps} />
    if (view === 'timeline') return <TimelineSpine items={displayItems} {...bulkProps} />
    return <ItemsListLayout items={displayItems} {...bulkProps} />
  }

  const isEmpty = displayItems.length === 0 && !isSearching

  return (
    <div>
      <ItemsPageHeader
        avatarUrl={avatarUrl}
        userInitials={userInitials}
        avatarColor={avatarColor}
      />
      <div className="p-6 space-y-4">
      <WelcomeModal />
      {/* Page title row */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Your inbox</h1>
          <p className="text-sm text-muted-foreground">Everything you&apos;ve saved, organized by AI</p>
        </div>
        <div className="flex items-center gap-2 pt-1">
          <span className="text-xs text-muted-foreground shrink-0">Updated just now</span>
          <ViewSwitcher activeView={view} onViewChange={handleViewChange} />
        </div>
      </div>

      {/* Stats cards */}
      <StatsBar
        totalCount={totalCount}
        thisWeekCount={statsData?.thisWeekCount ?? 0}
        processingCount={statsData?.processingCount ?? 0}
        topTag={statsData?.topTag ?? null}
      />

      {/* Tag filter bar */}
      {tags.length > 0 && (
        <TagFilterBar tags={tags} totalCount={totalCount} activeTagId={activeTagId} />
      )}

      {/* Search bar */}
      <div className="flex items-center gap-2">
        <div className="relative max-w-sm">
          <Search
            size={15}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
          />
          <Input
            type="search"
            placeholder="Search items…"
            value={searchQuery}
            onChange={handleSearchChange}
            className="pl-8 h-8 text-sm"
            aria-label="Search items"
          />
        </div>
      </div>

      {/* Bulk action toolbar */}
      {isBulkMode && (
        <BulkActionToolbar
          selectedIds={selectedIds}
          allPageIds={allPageIds}
          userTier={userTier}
          onDeleted={handleBulkDeleted}
          onTagged={handleBulkTagged}
          onSelectAll={selectAll}
          onDeselectAll={deselectAll}
        />
      )}

      {/* Search result count */}
      {isSearchMode && !isSearching && searchResults !== null && (
        <p className="text-xs text-muted-foreground">
          {searchResults.length === 0
            ? 'No results found.'
            : `${searchResults.length} result${searchResults.length === 1 ? '' : 's'}`}
        </p>
      )}

      {/* Empty state */}
      {isEmpty && !isSearchMode && (
        <div className="flex flex-col items-center gap-4 py-16 text-center">
          {/* Steps */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[10px] font-medium text-foreground">
                1
              </span>
              Send it
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

      {/* Empty search state */}
      {isEmpty && isSearchMode && (
        <p className="py-10 text-center text-sm text-muted-foreground">
          No results for &ldquo;{searchQuery}&rdquo;.
        </p>
      )}

      {/* Items layout */}
      {!isEmpty && renderLayout()}

      {/* Pagination */}
      {showPagination && (
        <nav
          className="flex items-center justify-between pt-2"
          aria-label="Items pagination"
        >
          <Button variant="outline" size="sm" asChild disabled={page <= 1}>
            <Link
              href={buildPageHref(searchParams, page - 1)}
              aria-disabled={page <= 1}
              tabIndex={page <= 1 ? -1 : 0}
            >
              Previous
            </Link>
          </Button>
          <p className="text-xs text-muted-foreground">
            Page {page} of {Math.ceil(totalCount / 25)}
          </p>
          <Button
            variant="outline"
            size="sm"
            asChild
            disabled={page * 25 >= totalCount}
          >
            <Link
              href={buildPageHref(searchParams, page + 1)}
              aria-disabled={page * 25 >= totalCount}
              tabIndex={page * 25 >= totalCount ? -1 : 0}
            >
              Next
            </Link>
          </Button>
        </nav>
      )}
      </div>{/* end p-6 */}
    </div>
  )
}

function buildPageHref(
  searchParams: ReturnType<typeof useSearchParams>,
  targetPage: number,
): string {
  const params = new URLSearchParams(searchParams.toString())
  if (targetPage <= 1) {
    params.delete('page')
  } else {
    params.set('page', String(targetPage))
  }
  const qs = params.toString()
  return `/items${qs ? `?${qs}` : ''}`
}
