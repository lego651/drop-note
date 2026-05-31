export default function AdminLoading() {
  return (
    <div className="space-y-6">
      {/* Title + count skeleton */}
      <div className="space-y-2">
        <div className="h-6 w-40 animate-pulse rounded-md bg-muted" />
        <div className="h-4 w-28 animate-pulse rounded bg-muted" />
      </div>

      {/* Table skeleton: header row + data rows */}
      <div className="rounded-lg border border-border overflow-hidden">
        <div className="h-10 border-b border-border bg-muted/50 animate-pulse" />
        {Array.from({ length: 10 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 border-b border-border px-4 py-3 last:border-b-0"
          >
            <div className="h-4 flex-1 animate-pulse rounded bg-muted" />
            <div className="h-4 w-16 animate-pulse rounded bg-muted" />
            <div className="h-4 w-12 animate-pulse rounded bg-muted" />
            <div className="h-4 w-24 animate-pulse rounded bg-muted" />
            <div className="h-4 w-16 animate-pulse rounded bg-muted" />
          </div>
        ))}
      </div>
    </div>
  )
}
