export default function EnvelopesLoading() {
  return (
    <div className="mx-auto max-w-3xl px-3 sm:px-6 lg:px-8 py-6 space-y-5">
      <div className="space-y-2">
        <div className="h-7 w-40 animate-pulse rounded-md bg-muted" />
        <div className="h-4 w-80 max-w-full animate-pulse rounded bg-muted" />
      </div>

      <div className="space-y-2.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="h-20 animate-pulse rounded-xl border-stroke border-ink bg-muted shadow-ink-lg"
          />
        ))}
      </div>
    </div>
  )
}
