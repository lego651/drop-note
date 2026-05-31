export default function ItemDetailLoading() {
  return (
    <div className="max-w-3xl mx-auto p-6">
      {/* Header skeleton (back link + prev/next nav) */}
      <div className="flex items-center justify-between mb-6">
        <div className="h-4 w-28 animate-pulse rounded bg-muted" />
        <div className="flex gap-2">
          <div className="h-4 w-20 animate-pulse rounded bg-muted" />
          <div className="h-4 w-16 animate-pulse rounded bg-muted" />
        </div>
      </div>

      {/* Read-only metadata skeleton (title + sender + date) */}
      <div className="mb-6 space-y-2">
        <div className="h-6 w-3/4 animate-pulse rounded-md bg-muted" />
        <div className="h-4 w-48 animate-pulse rounded bg-muted" />
        <div className="h-4 w-40 animate-pulse rounded bg-muted" />
      </div>

      {/* Editable fields skeleton (summary + notes + tags) */}
      <div className="space-y-6">
        <div className="space-y-2">
          <div className="h-4 w-24 animate-pulse rounded bg-muted" />
          <div className="h-24 w-full animate-pulse rounded-lg bg-muted" />
        </div>
        <div className="space-y-2">
          <div className="h-4 w-20 animate-pulse rounded bg-muted" />
          <div className="h-24 w-full animate-pulse rounded-lg bg-muted" />
        </div>
        <div className="space-y-2">
          <div className="h-4 w-16 animate-pulse rounded bg-muted" />
          <div className="flex gap-2">
            <div className="h-6 w-16 animate-pulse rounded-full bg-muted" />
            <div className="h-6 w-20 animate-pulse rounded-full bg-muted" />
            <div className="h-6 w-14 animate-pulse rounded-full bg-muted" />
          </div>
        </div>
      </div>
    </div>
  )
}
