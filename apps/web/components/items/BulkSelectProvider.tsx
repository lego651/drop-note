'use client'

import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { usePathname } from 'next/navigation'

interface BulkSelectContextType {
  selectedIds: Set<string>
  isBulkMode: boolean
  toggle: (id: string) => void
  selectAll: (ids: string[]) => void
  deselectIds: (ids: string[]) => void
  deselectAll: () => void
  enterSelectMode: () => void
  exitSelectMode: () => void
}

const BulkSelectContext = createContext<BulkSelectContextType | null>(null)

export function BulkSelectProvider({ children }: { children: React.ReactNode }) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  // Explicit entry point (DRO-213) — lets a user show checkboxes with 0
  // selected. Without this, isBulkMode could only ever become true after
  // something was already selected, but nothing could call toggle() while
  // checkboxes were hidden, so selection could never start.
  const [selectMode, setSelectMode] = useState(false)
  const pathname = usePathname()

  // Reset on page navigation
  useEffect(() => {
    setSelectedIds(new Set())
    setSelectMode(false)
  }, [pathname])

  const toggle = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const enterSelectMode = useCallback(() => {
    setSelectMode(true)
  }, [])

  const exitSelectMode = useCallback(() => {
    setSelectMode(false)
    setSelectedIds(new Set())
  }, [])

  // Merges into the existing cross-category selection (DRO-194) rather than
  // replacing it, so checking "select all" on one category page doesn't drop
  // picks already made on another category page.
  const selectAll = useCallback((ids: string[]) => {
    setSelectedIds(prev => new Set([...prev, ...ids]))
  }, [])

  const deselectIds = useCallback((ids: string[]) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      ids.forEach(id => next.delete(id))
      return next
    })
  }, [])

  const deselectAll = useCallback(() => {
    setSelectedIds(new Set())
  }, [])

  return (
    <BulkSelectContext.Provider value={{
      selectedIds,
      isBulkMode: selectMode || selectedIds.size > 0,
      toggle,
      selectAll,
      deselectIds,
      deselectAll,
      enterSelectMode,
      exitSelectMode,
    }}>
      {children}
    </BulkSelectContext.Provider>
  )
}

export function useBulkSelect() {
  const ctx = useContext(BulkSelectContext)
  if (!ctx) throw new Error('useBulkSelect must be used within BulkSelectProvider')
  return ctx
}
