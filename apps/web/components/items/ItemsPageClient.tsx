'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Search, Copy, Check } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { ItemsListLayout } from '@/components/items/ItemsListLayout'
import { ItemsGridLayout } from '@/components/items/ItemsGridLayout'
import { TimelineSpine } from '@/components/items/TimelineSpine'
import { ViewSwitcher, VIEW_STORAGE_KEY } from '@/components/items/ViewSwitcher'
import type { ViewMode } from '@/components/items/ViewSwitcher'
import type { ItemSummary } from '@/lib/items'

interface ItemsPageClientProps {
  items: ItemSummary[]
  totalCount: number
  page: number
  initialQuery?: string
}

export function ItemsPageClient({
  items,
  totalCount,
  page,
  initialQuery = '',
}: ItemsPageClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [view, setView] = useState<ViewMode>('list')
  const [searchQuery, setSearchQuery] = useState(initialQuery)
  const [searchResults, setSearchResults] = useState<ItemSummary[] | null>(null)
  const [isSearching, setIsSearching] = useState(false)
  const [copied, setCopied] = useState(false)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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
        const params = new URLSearchParams(searchParams.toString())
        params.delete('q')
        router.replace(`/items?${params.toString()}`)
        return
      }

      setIsSearching(true)
      try {
        const params = new URLSearchParams(searchParams.toString())
        params.set('q', q)
        params.delete('page')
        router.replace(`/items?${params.toString()}`)

        const res = await fetch(`/api/items/search?q=${encodeURIComponent(q)}`)
        if (res.ok) {
          const data = await res.json()
          setSearchResults(data.items ?? [])
        }
      } finally {
        setIsSearching(false)
      }
    },
    [router, searchParams],
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

  const isSearchMode = searchQuery.length >= 2
  const displayItems = isSearchMode && searchResults !== null ? searchResults : items
  const showPagination = !isSearchMode && totalCount > 25

  async function handleCopyEmail() {
    await navigator.clipboard.writeText('drop@dropnote.com')
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function renderLayout() {
    if (view === 'card') return <ItemsGridLayout items={displayItems} />
    if (view === 'timeline') return <TimelineSpine items={displayItems} />
    return <ItemsListLayout items={displayItems} />
  }

  const isEmpty = displayItems.length === 0 && !isSearching

  return (
    <div className="p-6 space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-lg font-semibold">Items</h1>
        <div className="flex items-center gap-2">
          <ViewSwitcher activeView={view} onViewChange={handleViewChange} />
        </div>
      </div>

      {/* Search bar */}
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
        <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
          <p className="text-sm text-muted-foreground">
            No items yet. Send an email to{' '}
            <span className="font-medium text-foreground">drop@dropnote.com</span> to get
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
