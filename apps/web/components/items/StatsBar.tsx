import { Inbox, TrendingUp, Clock, Tag } from 'lucide-react'
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
}

function StatCard({ label, value, sub, accent, Icon }: StatCardProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
          style={{ backgroundColor: `hsl(${accent} / 0.12)` }}
          aria-hidden="true"
        >
          <Icon size={16} style={{ color: `hsl(${accent})` }} />
        </span>
      </div>
      <p className="mt-5 text-[26px] font-bold leading-none text-foreground">{value}</p>
      <p className="mt-2 text-xs text-muted-foreground">{sub}</p>
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
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
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
      />
    </div>
  )
}
