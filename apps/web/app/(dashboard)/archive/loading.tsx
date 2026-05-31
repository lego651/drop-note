export default function ArchiveLoading() {
  return (
    <div className="p-6 max-w-4xl">
      {/* Header skeleton (icon + title + subtitle) */}
      <div className="flex items-center gap-3 mb-6">
        <div className="h-5 w-5 animate-pulse rounded bg-muted" />
        <div className="space-y-2">
          <div className="h-6 w-28 animate-pulse rounded-md bg-muted" />
          <div className="h-4 w-72 max-w-full animate-pulse rounded bg-muted" />
        </div>
      </div>

      {/* Item row skeletons */}
      <ul className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <li
            key={i}
            className="flex items-start justify-between gap-3 rounded-lg border border-border bg-card p-3"
          >
            <div className="flex items-start gap-2 min-w-0 flex-1">
              <span className="w-1.5 h-1.5 rounded-full shrink-0 mt-1.5 animate-pulse bg-muted" />
              <div className="min-w-0 space-y-1.5">
                <div className="h-4 w-48 max-w-full animate-pulse rounded bg-muted" />
                <div className="h-3 w-64 max-w-full animate-pulse rounded bg-muted" />
                <div className="h-3 w-24 animate-pulse rounded bg-muted" />
              </div>
            </div>
            <div className="h-7 w-24 shrink-0 animate-pulse rounded-md bg-muted" />
          </li>
        ))}
      </ul>
    </div>
  )
}
