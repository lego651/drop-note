import { Skeleton } from '@/components/ui/skeleton'

export default function AdminLoading() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-5 w-20" />
      </div>
      <div className="overflow-hidden rounded-xl border-stroke border-ink bg-card shadow-ink-lg">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="border-b border-border p-3 last:border-b-0">
            <Skeleton className="h-4 w-full" />
          </div>
        ))}
      </div>
    </div>
  )
}
