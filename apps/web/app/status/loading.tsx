import { Skeleton } from '@/components/ui/skeleton'

export default function StatusLoading() {
  return (
    <main className="min-h-screen bg-canvas">
      <div className="mx-auto max-w-5xl px-4 py-8 space-y-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-2">
            <Skeleton className="h-9 w-56" />
            <Skeleton className="h-4 w-72" />
          </div>
          <Skeleton className="h-10 w-40 rounded-[10px]" />
        </div>

        <Skeleton className="h-16 w-full rounded-xl" />

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Skeleton className="h-40 rounded-xl" />
          <Skeleton className="h-40 rounded-xl" />
        </div>

        <div className="overflow-hidden rounded-xl border-stroke border-ink bg-card shadow-ink-lg">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="border-b border-border p-3 last:border-b-0">
              <Skeleton className="h-4 w-full" />
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}
