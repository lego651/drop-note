export default function SettingsLoading() {
  return (
    <div className="p-6 space-y-6">
      {/* Page header skeleton */}
      <div className="space-y-2">
        <div className="h-7 w-32 animate-pulse rounded-md bg-muted" />
        <div className="h-4 w-80 max-w-full animate-pulse rounded bg-muted" />
      </div>

      {/* Layout: left nav + right panel */}
      <div className="flex gap-6">
        {/* Left tab nav skeleton (5 tabs) */}
        <nav className="flex flex-col gap-0.5 w-48 shrink-0" aria-hidden="true">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-9 w-full animate-pulse rounded-lg bg-muted" />
          ))}
        </nav>

        {/* Right content panel skeleton */}
        <div className="flex-1 min-w-0 space-y-4">
          <div className="space-y-2">
            <div className="h-5 w-40 animate-pulse rounded bg-muted" />
            <div className="h-4 w-64 max-w-full animate-pulse rounded bg-muted" />
          </div>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-2xl bg-muted" />
          ))}
        </div>
      </div>
    </div>
  )
}
