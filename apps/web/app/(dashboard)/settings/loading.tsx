export default function SettingsLoading() {
  return (
    <div className="p-6 space-y-6">
      {/* Page header */}
      <div className="space-y-2">
        <div className="h-8 w-32 animate-pulse rounded-md bg-muted" />
        <div className="h-4 w-80 max-w-full animate-pulse rounded bg-muted" />
      </div>

      {/* Layout: left nav + right panel */}
      <div className="flex flex-col md:flex-row gap-6">
        {/* Tab nav skeleton */}
        <div className="flex md:flex-col gap-2 w-full md:w-48 md:shrink-0">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-9 flex-1 md:flex-none animate-pulse rounded-lg bg-muted" />
          ))}
        </div>

        {/* Right panel skeleton */}
        <div className="flex-1 min-w-0 space-y-4">
          <div className="h-6 w-40 animate-pulse rounded bg-muted" />
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-2xl bg-muted" />
          ))}
        </div>
      </div>
    </div>
  )
}
