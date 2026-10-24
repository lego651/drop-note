'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { SheetHeader, SheetTitle } from '@/components/ui/sheet'

export interface ItemSearchResult {
  id: string
  subject: string | null
}

interface ItemSearchPickerProps {
  title: string
  excludeIds: string[]
  onSelect: (item: ItemSearchResult) => void
  onCancel: () => void
}

/**
 * Lightweight picker for the Mood Sheet's review screen (DRO-301) — Swap and
 * "+ Add another save" both reuse this. No dedicated item-search picker
 * existed yet, so this wraps the existing GET /api/items/search?q= endpoint
 * (same one ItemsPageClient's inbox search already calls) with its own
 * debounce rather than a new API.
 */
export function ItemSearchPicker({ title, excludeIds, onSelect, onCancel }: ItemSearchPickerProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ItemSearchResult[] | null>(null)
  const [isSearching, setIsSearching] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const q = e.target.value
    setQuery(q)
    if (debounceRef.current) clearTimeout(debounceRef.current)

    const trimmed = q.trim()
    if (trimmed.length < 2) {
      setResults(null)
      setIsSearching(false)
      return
    }

    setIsSearching(true)
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/items/search?q=${encodeURIComponent(trimmed)}`)
        if (res.ok) {
          const data = await res.json()
          setResults(Array.isArray(data) ? data : [])
        }
      } finally {
        setIsSearching(false)
      }
    }, 300)
  }

  const excluded = new Set(excludeIds)
  const visibleResults = (results ?? []).filter((item) => !excluded.has(item.id))

  return (
    <>
      <SheetHeader>
        <SheetTitle>{title}</SheetTitle>
      </SheetHeader>

      <div className="flex items-center gap-2">
        <Input
          value={query}
          onChange={handleChange}
          placeholder="Search your saves…"
          enterKeyHint="search"
          type="search"
          // The native WebKit search-clear icon duplicates our own Cancel
          // control right next to it — suppress it (DRO-305 design review).
          className="h-11 [&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-decoration]:appearance-none"
          autoFocus
          aria-label="Search your saves"
        />
        <Button type="button" variant="ghost" className="h-11 shrink-0" onClick={onCancel}>
          Cancel
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
        {isSearching && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 size={14} className="animate-spin" />
            Searching…
          </p>
        )}
        {!isSearching && results !== null && visibleResults.length === 0 && (
          <p className="text-sm text-muted-foreground">No matching saves.</p>
        )}
        {visibleResults.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item)}
            className="flex min-h-11 items-center rounded-[10px] border-stroke border-ink bg-card px-3 py-2 text-left text-sm font-medium shadow-ink-sm transition-colors hover:bg-muted"
          >
            <span className="truncate">{item.subject ?? 'Untitled save'}</span>
          </button>
        ))}
      </div>
    </>
  )
}
