export default function TrashLoading() {
  return (
    <div className="p-6 max-w-4xl">
      {/* Header skeleton (title + subtitle + actions) */}
      <div className="flex items-center justify-between mb-6">
        <div className="space-y-2">
          <div className="h-6 w-24 animate-pulse rounded-md bg-muted" />
          <div className="h-4 w-64 max-w-full animate-pulse rounded bg-muted" />
        </div>
        <div className="h-8 w-28 animate-pulse rounded-md bg-muted" />
      </div>

      {/* Trash item row skeletons */}
      <ul className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <li
            key={i}
            className="flex items-start justify-between gap-3 rounded-lg border border-border bg-card p-3"
          >
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="h-4 w-48 max-w-full animate-pulse rounded bg-muted" />
              <div className="h-3 w-32 animate-pulse rounded bg-muted" />
            </div>
            <div className="flex shrink-0 gap-1.5">
              <div className="h-7 w-20 animate-pulse rounded-md bg-muted" />
              <div className="h-7 w-20 animate-pulse rounded-md bg-muted" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
