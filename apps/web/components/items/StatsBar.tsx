import { Inbox, TrendingUp, Clock, Tag } from 'lucide-react'
import { STAT_CARD_ACCENT } from '@/lib/design-tokens'

interface StatsBarProps {
  totalCount: number
  thisWeekCount: number
  processingCount: number
  topTag: { name: string; count: number } | null
}

export function StatsBar({
  totalCount,
  thisWeekCount,
  processingCount,
  topTag,
}: StatsBarProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {/* Total saved */}
      <div className="relative border border-border rounded-xl bg-card p-4">
        <div className="flex items-start justify-between gap-2">
          <span className="text-sm text-muted-foreground font-medium">Total saved</span>
          <Inbox
            size={18}
            style={{ color: `hsl(${STAT_CARD_ACCENT.totalSaved})` }}
            aria-hidden="true"
            className="shrink-0 mt-0.5"
          />
        </div>
        <p className="text-3xl font-bold text-foreground mt-2">{totalCount}</p>
        <p className="text-xs text-muted-foreground mt-1">all time</p>
      </div>

      {/* This week */}
      <div className="relative border border-border rounded-xl bg-card p-4">
        <div className="flex items-start justify-between gap-2">
          <span className="text-sm text-muted-foreground font-medium">This week</span>
          <TrendingUp
            size={18}
            style={{ color: `hsl(${STAT_CARD_ACCENT.thisWeek})` }}
            aria-hidden="true"
            className="shrink-0 mt-0.5"
          />
        </div>
        <p className="text-3xl font-bold text-foreground mt-2">{thisWeekCount}</p>
        <p className="text-xs text-muted-foreground mt-1">this week</p>
      </div>

      {/* Processing */}
      <div className="relative border border-border rounded-xl bg-card p-4">
        <div className="flex items-start justify-between gap-2">
          <span className="text-sm text-muted-foreground font-medium">Processing</span>
          <Clock
            size={18}
            style={{ color: `hsl(${STAT_CARD_ACCENT.processing})` }}
            aria-hidden="true"
            className="shrink-0 mt-0.5"
          />
        </div>
        <p className="text-3xl font-bold text-foreground mt-2">{processingCount}</p>
        <p className="text-xs text-muted-foreground mt-1">arriving now</p>
      </div>

      {/* Top tag */}
      <div className="relative border border-border rounded-xl bg-card p-4">
        <div className="flex items-start justify-between gap-2">
          <span className="text-sm text-muted-foreground font-medium">Top tag</span>
          <Tag
            size={18}
            style={{ color: `hsl(${STAT_CARD_ACCENT.topTag})` }}
            aria-hidden="true"
            className="shrink-0 mt-0.5"
          />
        </div>
        <p className="text-3xl font-bold text-foreground mt-2">
          {topTag ? `#${topTag.name}` : '#—'}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          {topTag ? `${topTag.count} items` : 'no tags yet'}
        </p>
      </div>
    </div>
  )
}
