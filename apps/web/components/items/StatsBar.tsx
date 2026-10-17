import type { CSSProperties } from 'react'
import { Inbox, TrendingUp, Clock, Tag } from 'lucide-react'
import { cn } from '@/lib/utils'
import { STAT_CARD_ACCENT } from '@/lib/design-tokens'

interface StatsBarProps {
  totalCount: number
  thisWeekCount: number
  processingCount: number
  topTag: { name: string; count: number } | null
  weekDelta?: number
}

interface StatCardProps {
  label: string
  value: string
  sub: string
  accent: string // HSL channel var reference, e.g. 'var(--color-stat-total)'
  Icon: typeof Inbox
  tilt?: string
}

// Postage stamp (AIRMAIL § 6.2): the one "stamp moment" on the inbox.
function StatCard({ label, value, sub, accent, Icon, tilt }: StatCardProps) {
  return (
    <div className={cn('stamp min-w-0', tilt)}>
      <div className="stamp-in h-full p-[18px] sm:p-[22px]" style={{ '--a': accent } as CSSProperties}>
        <div className="flex items-start justify-between gap-2">
          <span className="type-label text-[11px] text-foreground">{label}</span>
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-stroke border-dashed bg-card"
            style={{ borderColor: `hsl(${accent})`, color: `hsl(${accent})` }}
            aria-hidden="true"
          >
            <Icon size={16} />
          </span>
        </div>
        <p className="type-display mt-4 truncate text-[26px] font-black leading-none text-foreground sm:text-[36px]">
          {value}
        </p>
        <p className="mt-2 font-mono text-[11px] text-muted-foreground">{sub}</p>
      </div>
    </div>
  )
}

export function StatsBar({
  totalCount,
  thisWeekCount,
  processingCount,
  topTag,
  weekDelta,
}: StatsBarProps) {
  const weekSub =
    weekDelta === undefined
      ? 'this week'
      : `${weekDelta >= 0 ? '+' : ''}${weekDelta} vs last week`

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4 md:gap-[22px]">
      <StatCard
        label="Total saved"
        value={String(totalCount)}
        sub="all time"
        accent={STAT_CARD_ACCENT.totalSaved}
        Icon={Inbox}
      />
      <StatCard
        label="This week"
        value={String(thisWeekCount)}
        sub={weekSub}
        accent={STAT_CARD_ACCENT.thisWeek}
        Icon={TrendingUp}
        tilt="-rotate-[1.2deg]"
      />
      <StatCard
        label="Processing"
        value={String(processingCount)}
        sub="arriving now"
        accent={STAT_CARD_ACCENT.processing}
        Icon={Clock}
      />
      <StatCard
        label="Top tag"
        value={topTag ? `#${topTag.name}` : '#—'}
        sub={topTag ? `${topTag.count} items` : 'no tags yet'}
        accent={STAT_CARD_ACCENT.topTag}
        Icon={Tag}
        tilt="rotate-[0.9deg]"
      />
    </div>
  )
}
