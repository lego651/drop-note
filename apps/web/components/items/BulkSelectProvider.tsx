'use client'

import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { usePathname } from 'next/navigation'

interface BulkSelectContextType {
  selectedIds: Set<string>
  isBulkMode: boolean
  toggle: (id: string) => void
  selectAll: (ids: string[]) => void
  deselectAll: () => void
}

const BulkSelectContext = createContext<BulkSelectContextType | null>(null)

export function BulkSelectProvider({ children }: { children: React.ReactNode }) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const pathname = usePathname()

  // Reset on page navigation
  useEffect(() => {
    setSelectedIds(new Set())
  }, [pathname])

  const toggle = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const selectAll = useCallback((ids: string[]) => {
    setSelectedIds(new Set(ids))
  }, [])

  const deselectAll = useCallback(() => {
    setSelectedIds(new Set())
  }, [])

  return (
    <BulkSelectContext.Provider value={{
      selectedIds,
      isBulkMode: selectedIds.size > 0,
      toggle,
      selectAll,
      deselectAll,
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
