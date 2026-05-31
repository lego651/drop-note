export default function ItemDetailLoading() {
  return (
    <div className="max-w-3xl mx-auto p-6">
      {/* Header: back link + prev/next nav */}
      <div className="flex items-center justify-between mb-6">
        <div className="h-4 w-28 animate-pulse rounded bg-muted" />
        <div className="flex gap-2">
          <div className="h-4 w-16 animate-pulse rounded bg-muted" />
          <div className="h-4 w-12 animate-pulse rounded bg-muted" />
        </div>
      </div>

      {/* Title + metadata */}
      <div className="mb-6 space-y-2">
        <div className="h-7 w-2/3 animate-pulse rounded-md bg-muted" />
        <div className="h-4 w-40 animate-pulse rounded bg-muted" />
        <div className="h-4 w-52 animate-pulse rounded bg-muted" />
      </div>

      {/* Summary / body blocks */}
      <div className="space-y-3">
        <div className="h-4 w-24 animate-pulse rounded bg-muted" />
        <div className="h-3 w-full animate-pulse rounded bg-muted" />
        <div className="h-3 w-full animate-pulse rounded bg-muted" />
        <div className="h-3 w-3/4 animate-pulse rounded bg-muted" />
      </div>
    </div>
  )
}
