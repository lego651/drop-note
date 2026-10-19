'use client'

import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { usePathname } from 'next/navigation'

interface BulkSelectContextType {
  selectedIds: Set<string>
  isBulkMode: boolean
  toggle: (id: string) => void
  selectAll: (ids: string[]) => void
  deselectIds: (ids: string[]) => void
  deselectAll: () => void
  enterSelectMode: () => void
  enterSelectModeFromDeepLink: () => void
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
  // Only resets on an actual navigation, not on first mount — otherwise this
  // effect runs in the same commit as (and after) a child's own mount effect
  // and silently undoes it, e.g. the items page entering pick mode for a
  // ?pick=1 deep link (DRO-227).
  const previousPathname = useRef(pathname)
  // On a client-side navigation (not a hard load), this effect and the new
  // page's mount effect fire in the same commit, child first. If the child
  // called enterSelectModeFromDeepLink() to honor its own deep link (e.g.
  // ?pick=1), it stamps the pathname it fired for here, so this effect can
  // tell "a deep link just claimed this exact navigation" apart from "select
  // mode happens to still be on from an earlier, unrelated click" — stamped
  // for the wrong (stale) pathname is treated as not consumed.
  const deepLinkPathname = useRef<string | null>(null)

  // Reset on page navigation
  useEffect(() => {
    if (previousPathname.current === pathname) {
      deepLinkPathname.current = null
      return
    }
    previousPathname.current = pathname
    setSelectedIds(new Set())
    const consumedByDeepLink = deepLinkPathname.current === pathname
    deepLinkPathname.current = null
    if (!consumedByDeepLink) setSelectMode(false)
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

  const enterSelectModeFromDeepLink = useCallback(() => {
    deepLinkPathname.current = pathname
    setSelectMode(true)
  }, [pathname])

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
      enterSelectModeFromDeepLink,
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
