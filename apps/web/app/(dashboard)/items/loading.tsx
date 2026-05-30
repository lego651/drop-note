export default function ItemsLoading() {
  return (
    <div className="mx-auto max-w-6xl px-8 py-6 space-y-5">
      {/* Title row skeleton */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="h-8 w-32 animate-pulse rounded-md bg-muted" />
          <div className="h-4 w-56 animate-pulse rounded bg-muted" />
        </div>
      </div>
      {/* Stats bar skeleton */}
      <div className="grid grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-xl bg-muted" />
        ))}
      </div>
      {/* Search bar skeleton */}
      <div className="h-11 animate-pulse rounded-full bg-muted" />
      {/* Items skeleton */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-40 animate-pulse rounded-xl bg-muted" />
        ))}
      </div>
    </div>
  )
}
