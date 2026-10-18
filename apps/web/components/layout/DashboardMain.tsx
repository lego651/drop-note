'use client'

import { useBulkSelect } from '@/components/items/BulkSelectProvider'
import { OverCapBanner } from '@/components/OverCapBanner'
import { cn } from '@/lib/utils'
import type { Tier } from '@drop-note/shared'

interface DashboardMainProps {
  children: React.ReactNode
  isOverCap: boolean
  itemCount: number
  tier: Tier
}

export function DashboardMain({ children, isOverCap, itemCount, tier }: DashboardMainProps) {
  const { isBulkMode } = useBulkSelect()

  return (
    <main
      id="main"
      className={cn(
        'flex-1 min-w-0 overflow-y-auto bg-canvas bg-dot-grid',
        // Reserve room below the fixed EnvelopeTray (DRO-194) so it doesn't cover
        // pagination/the last row — the tray wraps to 2 lines on mobile.
        isBulkMode && 'pb-28 sm:pb-20',
      )}
    >
      {isOverCap && <OverCapBanner itemCount={itemCount} tier={tier} />}
      {children}
    </main>
  )
}
