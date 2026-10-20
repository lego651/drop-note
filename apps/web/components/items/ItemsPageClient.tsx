'use client'

import { useState, useEffect, useCallback, useRef, useTransition } from 'react'
import { useRealtimeItems } from '@/hooks/useRealtimeItems'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Search, Copy, Check, Mail, X, ListChecks } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { ItemsListLayout } from '@/components/items/ItemsListLayout'
import { ItemsGridLayout } from '@/components/items/ItemsGridLayout'
import { CompactListLayout } from '@/components/items/CompactListLayout'
import { ViewSwitcher, VIEW_STORAGE_KEY } from '@/components/items/ViewSwitcher'
import { useBulkSelect } from '@/components/items/BulkSelectProvider'
import { BulkActionToolbar } from '@/components/items/BulkActionToolbar'
import { WelcomeModal } from '@/components/dashboard/WelcomeModal'
import { EnvelopeEntryBanner } from '@/components/envelopes/EnvelopeEntryBanner'
import { EnvelopeMakePlanFab } from '@/components/envelopes/EnvelopeMakePlanFab'
import { EnvelopeTray } from '@/components/envelopes/EnvelopeTray'
import { StatsBar } from '@/components/items/StatsBar'
import { ItemsPageHeader } from '@/components/items/ItemsPageHeader'
import { SortDropdown } from '@/components/items/SortDropdown'
import { FiltersButton, SOURCE_LABELS } from '@/components/items/FiltersButton'
import { FolderOpen } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ViewMode } from '@/components/items/ViewSwitcher'
import type { SortOption } from '@/components/items/SortDropdown'
import type { SourceFilter } from '@/components/items/FiltersButton'
import type { ItemSummary } from '@/lib/items'
import type { CategoryLite } from '@/lib/category-display'
import type { BadgeCategory } from '@/components/categories/CategoryBadge'
import type { Tier } from '@drop-note/shared'

interface StatsBarData {
  thisWeekCount: number
  processingCount: number
  topCategory: { name: string; count: number } | null
  weekDelta?: number
}

interface ItemsPageClientProps {
  items: ItemSummary[]
  totalCount: number
  page: number
  initialQuery?: string
  activeTagName?: string
  categories?: CategoryLite[]
  activeCategoryId?: string
  activeCategoryName?: string
  activeSort?: SortOption
  activeSource?: SourceFilter
  userTier?: Tier
  userId: string
  userEmail?: string
  userName?: string
  statsData?: StatsBarData
  avatarUrl?: string | null
  userInitials?: string
  avatarColor?: string
}

// Selection lives in BulkSelectProvider above the dashboard layout (DRO-194)
// so a pick survives switching categories — this component only consumes it.
export function ItemsPageClient({
  items,
  totalCount,
  page,
  initialQuery = '',
  categories = [],
  activeCategoryId,
  activeCategoryName,
  activeSort = 'newest',
  activeSource = 'all',
  userTier = 'free',
  userId,
  userEmail,
  userName,
  statsData,
  avatarUrl = null,
  userInitials = 'U',
  avatarColor = '215 16% 55%',
}: ItemsPageClientProps) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const searchParams = useSearchParams()
  const searchParamsStr = searchParams.toString()

  const { isBulkMode, selectedIds, toggle, selectAll, deselectIds, deselectAll, enterSelectMode, enterSelectModeFromDeepLink, exitSelectMode } = useBulkSelect()

  // Whether the full entry banner (not its strip/step-bar states) currently
  // holds the viewport — the floating "Make a plan" FAB stays hidden while
  // this is true, so there's never a second competing cobalt CTA (DRO-227).
  // Defaults to true so the FAB doesn't flash in before the observer attaches.
  const [bannerOccupiesCta, setBannerOccupiesCta] = useState(true)
  const handleFullCardInViewChange = useCallback((inView: boolean) => setBannerOccupiesCta(inView), [])

  const [view, setView] = useState<ViewMode>('card')
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

  // Realtime payloads are raw `items` table rows (category_id, no joined `category`).
  // Resolve the badge's category from the categories list the page already has so a
  // card doesn't lose its badge on every realtime UPDATE/INSERT.
  const resolveCategory = useCallback(
    (categoryId: string | null | undefined): BadgeCategory | null => {
      if (!categoryId) return null
      const found = categories.find((c) => c.id === categoryId)
      return found
        ? { id: found.id, name: found.name, position: found.position, is_other: found.is_other }
        : null
    },
    [categories],
  )

  // Apply realtime updates to optimistic items
  useEffect(() => {
    if (updatedItems.length === 0) return
    setOptimisticItems(prev => prev.map(item => {
      const updated = updatedItems.find(u => u.id === item.id)
      if (!updated) return item
      return { ...updated, category: resolveCategory(updated.category_id) }
    }))
    clearUpdatedItems()
  }, [updatedItems, clearUpdatedItems, resolveCategory])

  // Prepend new items (dedup)
  useEffect(() => {
    if (newItems.length === 0) return
    setOptimisticItems(prev => {
      const existingIds = new Set(prev.map(i => i.id))
      const truly_new = newItems
        .filter(n => !existingIds.has(n.id))
        .map(n => ({ ...n, category: resolveCategory(n.category_id) }))
      if (truly_new.length === 0) return prev
      return [...truly_new, ...prev]
    })
    clearNewItems()
  }, [newItems, clearNewItems, resolveCategory])

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

  // ?pick=1 (from the /envelopes empty state, DRO-227) drops the user straight
  // into pick mode instead of just landing on the inbox. Goes through the
  // dedicated deep-link entry point (not enterSelectMode) so the provider can
  // tell this apart from an unrelated earlier click when its own navigation
  // effect runs in this same commit, right after this one. Strips the param
  // via replace (no new history entry) so a refresh or Back doesn't re-enter
  // pick mode.
  useEffect(() => {
    if (searchParams.get('pick') !== '1') return
    enterSelectModeFromDeepLink()
    const params = new URLSearchParams(searchParamsStr)
    params.delete('pick')
    router.replace(`/items${params.toString() ? `?${params.toString()}` : ''}`)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Esc exits selection mode (DRO-213)
  useEffect(() => {
    if (!isBulkMode) return
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && !e.defaultPrevented) exitSelectMode()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isBulkMode, exitSelectMode])

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
    // 1. Optimistic update — immediate visual feedback
    setOptimisticItems(prev => prev.map(item =>
      item.id === id ? { ...item, pinned } : item,
    ))

    // 2. Background PATCH
    try {
      const res = await fetch(`/api/items/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pinned }),
      })
      if (!res.ok) throw new Error(`PATCH failed: ${res.status}`)
    } catch (err) {
      // 3. Roll back on failure
      setOptimisticItems(prev => prev.map(item =>
        item.id === id ? { ...item, pinned: !pinned } : item,
      ))
      console.error('[pin] Failed to update pin state:', err instanceof Error ? err.message : err)
    }
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

  // Shared by the single-item picker (optimistic) and bulk move (after the server confirms):
  // patch the item's badge/lock locally, and drop it from the list if a category filter is
  // active and it no longer matches.
  const applyCategoryMove = useCallback(
    (itemId: string, category: BadgeCategory, locked: boolean) => {
      setOptimisticItems((prev) => {
        if (activeCategoryId && activeCategoryId !== category.id) {
          return prev.filter((item) => item.id !== itemId)
        }
        return prev.map((item) =>
          item.id === itemId ? { ...item, category, category_locked: locked } : item,
        )
      })
    },
    [activeCategoryId],
  )

  const handleCategoryMoved = useCallback(
    (itemId: string, category: BadgeCategory, locked: boolean) => {
      applyCategoryMove(itemId, category, locked)
    },
    [applyCategoryMove],
  )

  const handleBulkMoved = useCallback(
    (ids: string[], category: BadgeCategory) => {
      ids.forEach((id) => applyCategoryMove(id, category, true))
      deselectAll()
      startTransition(() => router.refresh())
    },
    [applyCategoryMove, deselectAll, router],
  )

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
    categories,
    onSelectChange: toggle,
    onPinChange: handlePinChange,
    onDelete: handleDelete,
    onCategoryMoved: handleCategoryMoved,
  }

  function renderLayout() {
    if (view === 'card') return <ItemsGridLayout items={displayItems} {...bulkProps} />
    if (view === 'timeline') return <CompactListLayout items={displayItems} {...bulkProps} />
    return <ItemsListLayout items={displayItems} {...bulkProps} />
  }

  const isEmpty = displayItems.length === 0 && !isSearching
  // The floating "Make a plan" FAB and the pick-mode tray are both fixed
  // bottom-right (DRO-227) — reserve room (height + the home-indicator safe
  // area, DRO-244) so neither covers the last row or the pagination controls.
  const showFab = !isBulkMode && !bannerOccupiesCta
  const reserveFabSpace = isBulkMode || showFab

  return (
    <div>
      <ItemsPageHeader
        avatarUrl={avatarUrl}
        userInitials={userInitials}
        avatarColor={avatarColor}
        userEmail={userEmail}
        userName={userName}
      />
      <div
        className={cn(
          'mx-auto max-w-6xl px-3 sm:px-6 lg:px-8 py-6 space-y-5',
          isBulkMode
            ? 'pb-[calc(184px_+_env(safe-area-inset-bottom))] sm:pb-[calc(200px_+_env(safe-area-inset-bottom))] max-[390px]:pb-[calc(220px_+_env(safe-area-inset-bottom))]'
            : reserveFabSpace && 'pb-[calc(112px_+_env(safe-area-inset-bottom))] sm:pb-[calc(96px_+_env(safe-area-inset-bottom))]',
        )}
      >
      <WelcomeModal />
      {/* Page title row */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="type-display text-[32px] leading-none text-foreground sm:text-[42px]">
            Your <span className="text-primary">inbox</span>
          </h1>
          <p className="mt-2 text-[15px] text-foreground">Everything you&apos;ve saved, organized by AI</p>
        </div>
        {/* Postmark (AIRMAIL § 6.3) — passive, so dashed */}
        <span className="hidden shrink-0 rounded-full border-stroke border-dashed border-ink/55 bg-card px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.06em] text-foreground sm:inline-block">
          Updated just now
        </span>
      </div>

      {/* Stats cards */}
      <StatsBar
        totalCount={totalCount}
        thisWeekCount={statsData?.thisWeekCount ?? 0}
        processingCount={statsData?.processingCount ?? 0}
        topCategory={statsData?.topCategory ?? null}
        weekDelta={statsData?.weekDelta}
      />

      {/* Envelopes entry (DRO-227) */}
      <EnvelopeEntryBanner onFullCardInViewChange={handleFullCardInViewChange} />

      {/* Search bar + Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search
            size={18}
            className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
          />
          <Input
            type="search"
            placeholder="Search items, summaries, keywords…"
            value={searchQuery}
            onChange={handleSearchChange}
            className="h-11 pl-11 pr-4 text-sm"
            aria-label="Search items"
          />
        </div>
        <FiltersButton activeSource={activeSource} />
      </div>

      {/* Active source filter chip — visible indicator of what's filtered */}
      {activeSource !== 'all' && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Filtered:</span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-foreground/10 px-3 py-1 text-xs font-medium text-foreground">
            {SOURCE_LABELS[activeSource]}
            <button
              type="button"
              onClick={() => {
                const params = new URLSearchParams(searchParams.toString())
                params.delete('source')
                params.delete('page')
                router.push(`/items${params.toString() ? `?${params.toString()}` : ''}`)
              }}
              className="ml-0.5 rounded-full hover:bg-foreground/10 p-0.5"
              aria-label="Clear source filter"
            >
              <X size={11} />
            </button>
          </span>
        </div>
      )}

      {/* Sticky so Tag/Move/Delete stay reachable while scrolling, alongside the fixed envelope tray. */}
      {isBulkMode && (
        <div className="sticky top-0 z-20 -mx-1 bg-canvas px-1 py-1">
          <BulkActionToolbar
            selectedIds={selectedIds}
            allPageIds={allPageIds}
            userTier={userTier}
            categories={categories}
            onDeleted={handleBulkDeleted}
            onTagged={handleBulkTagged}
            onMoved={handleBulkMoved}
            onSelectAll={selectAll}
            onDeselectPage={() => deselectIds(allPageIds)}
            onDeselectAll={deselectAll}
          />
        </div>
      )}

      {/* List header: item count (left) + sort + view controls (right) */}
      {!isEmpty && (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 pt-1">
          <p className="flex min-w-0 items-baseline gap-2 text-muted-foreground">
            {isSearching ? (
              'Searching…'
            ) : isSearchMode && searchResults !== null ? (
              <>
                <span className="type-display text-[22px] leading-none text-foreground">{searchResults.length}</span>
                <span className="type-label text-[12px] text-foreground">result{searchResults.length === 1 ? '' : 's'}</span>
              </>
            ) : activeCategoryId && activeCategoryName ? (
              <>
                <span className="type-display text-[22px] leading-none text-foreground">{displayItems.length}</span>
                <span className="type-label truncate text-[12px] text-foreground" style={{ maxWidth: '20ch' }} title={activeCategoryName}>
                  items in &ldquo;{activeCategoryName}&rdquo;
                </span>
              </>
            ) : (
              <>
                <span className="type-display text-[22px] leading-none text-foreground">{displayItems.length}</span>
                <span className="type-label whitespace-nowrap text-[12px] text-foreground">saved items</span>
              </>
            )}
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              variant="ghost"
              className={cn(
                'h-11 w-11 justify-center gap-2 px-0 text-sm font-semibold sm:h-10 sm:w-auto sm:px-5',
                isBulkMode && 'border-stroke border-ink bg-accent text-accent-foreground shadow-ink-sm hover:bg-accent hover:text-accent-foreground',
              )}
              aria-pressed={isBulkMode}
              aria-label={isBulkMode ? 'Cancel selection' : 'Edit items'}
              title={isBulkMode ? 'Cancel selection' : 'Edit items'}
              onClick={() => (isBulkMode ? exitSelectMode() : enterSelectMode())}
            >
              {isBulkMode ? (
                <>
                  <X size={15} />
                  <span className="hidden sm:inline">Cancel</span>
                </>
              ) : (
                <>
                  <ListChecks size={15} className="text-muted-foreground" />
                  <span className="hidden sm:inline">Edit items</span>
                </>
              )}
            </Button>
            <SortDropdown activeSort={activeSort} />
            <ViewSwitcher activeView={view} onViewChange={handleViewChange} />
          </div>
        </div>
      )}

      {/* Empty filtered-by-category state */}
      {isEmpty && !isSearchMode && activeCategoryId && activeCategoryName && (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <span className="flex h-9 w-9 items-center justify-center rounded-full border-stroke border-dashed border-ink">
            <FolderOpen size={16} className="text-muted-foreground" aria-hidden="true" />
          </span>
          <p className="text-sm text-foreground">Nothing in &ldquo;{activeCategoryName}&rdquo; yet.</p>
          <p className="text-sm text-muted-foreground">New items that fit will be filed here automatically.</p>
          <Button variant="link" size="sm" asChild>
            <Link href="/items">View all items</Link>
          </Button>
        </div>
      )}

      {/* Empty state */}
      {isEmpty && !isSearchMode && !(activeCategoryId && activeCategoryName) && (
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
              className="flex-1 rounded-[10px] border-stroke border-ink bg-card px-3 py-1.5 font-mono text-sm text-foreground"
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

      {/* Search loading — skeleton placeholder while a query is in flight */}
      {isSearching && (
        <div
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
          aria-busy="true"
          aria-label="Searching items"
        >
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-40 animate-pulse rounded-xl border-stroke border-ink bg-muted shadow-ink-lg" />
          ))}
        </div>
      )}

      {/* Items layout */}
      {!isSearching && !isEmpty && renderLayout()}

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

      {/* Floating envelopes entry (DRO-227) — tray while picking, otherwise the FAB once the banner is out of view */}
      {isBulkMode ? <EnvelopeTray /> : showFab && <EnvelopeMakePlanFab onClick={enterSelectMode} />}
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
