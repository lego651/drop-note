import { OverCapBanner } from '@/components/OverCapBanner'
import type { Tier } from '@drop-note/shared'

interface DashboardMainProps {
  children: React.ReactNode
  isOverCap: boolean
  itemCount: number
  tier: Tier
}

export function DashboardMain({ children, isOverCap, itemCount, tier }: DashboardMainProps) {
  return (
    <main id="main" className="flex-1 min-w-0 overflow-y-auto bg-canvas bg-dot-grid">
      {isOverCap && <OverCapBanner itemCount={itemCount} tier={tier} />}
      {children}
    </main>
  )
}
