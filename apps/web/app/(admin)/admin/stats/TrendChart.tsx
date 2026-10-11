interface TrendPoint {
  date: string
  count: number
}

function formatShortDate(dateStr?: string): string {
  if (!dateStr) return ''
  const [, month, day] = dateStr.split('-')
  return `${month}/${day}`
}

export function TrendChart({ title, data }: { title: string; data: TrendPoint[] }) {
  const max = Math.max(1, ...data.map((point) => point.count))

  return (
    <div className="rounded-md border border-border p-4 space-y-3">
      <p className="text-sm font-medium">{title}</p>
      <div className="flex items-end gap-1.5 h-24">
        {data.map((point) => (
          <div
            key={point.date}
            className="flex-1 h-full flex flex-col items-center justify-end"
            title={`${point.date}: ${point.count}`}
          >
            <div
              className="w-full rounded-t-sm"
              style={{
                height: `${Math.max(4, (point.count / max) * 100)}%`,
                backgroundColor: 'hsl(var(--color-tag-blue))',
              }}
            />
          </div>
        ))}
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>{formatShortDate(data[0]?.date)}</span>
        <span>{formatShortDate(data[data.length - 1]?.date)}</span>
      </div>
    </div>
  )
}
