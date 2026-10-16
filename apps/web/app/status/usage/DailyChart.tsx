import { niceMax } from '@/lib/usage/stats'

export interface ChartPoint {
  day: string
  value: number
  /** Tooltip text for this day. */
  label: string
}

/** Server-rendered daily bar chart (no chart library): one bar per day, oldest left. */
export function DailyChart({ title, points, color, total }: {
  title: string
  points: ChartPoint[]
  color: string
  /** Headline number shown next to the title. */
  total: string
}) {
  const max = niceMax(Math.max(0, ...points.map((p) => p.value)))
  return (
    <section className="min-w-0 rounded-xl border border-border bg-card p-5">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-medium">{title}</h3>
        <span className="text-sm text-muted-foreground">{total}</span>
      </div>
      <div className="flex gap-2">
        <div className="flex h-40 flex-col justify-between text-right text-xs text-muted-foreground" aria-hidden>
          <span>{max}</span>
          <span>{Number.isInteger(max / 2) ? max / 2 : ''}</span>
          <span>0</span>
        </div>
        <div
          className="flex h-40 min-w-0 flex-1 items-end gap-px border-b border-l border-border"
          role="img"
          aria-label={`${title}, daily, ${points[0]?.day} to ${points[points.length - 1]?.day}`}
        >
          {points.map((p) => (
            <div key={p.day} className="flex h-full min-w-0 flex-1 items-end" title={p.label}>
              <div
                className="w-full rounded-t-[1px]"
                style={{
                  height: p.value === 0 ? '1px' : `${Math.max(2, (p.value / max) * 100)}%`,
                  background: p.value === 0 ? 'hsl(var(--muted-foreground) / 0.2)' : color,
                }}
              />
            </div>
          ))}
        </div>
      </div>
      <div className="mt-1 flex justify-between pl-6 text-xs text-muted-foreground">
        <span>{points[0]?.day}</span>
        <span>Today (partial)</span>
      </div>
    </section>
  )
}
