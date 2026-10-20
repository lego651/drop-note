'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import type { TrendPoint } from '@/lib/admin/stats'
import { TrendChart } from './TrendChart'

interface StatsData {
  totalUsers: number
  newUsersToday: number
  itemsIngestedToday: number
  failedItems: number
  totalActiveItems: number
  itemsSavedTotal: number
  itemsSavedTrend: TrendPoint[]
  signupsTrend: TrendPoint[]
  dauProxy: number
  wauProxy: number
  queue: {
    waiting: number
    active: number
    completed: number
    failed: number
    delayed: number
  } | null
  queueError: string | null
}

export function StatsClient() {
  const [stats, setStats] = useState<StatsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function fetchStats() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/admin/stats')
      if (!res.ok) throw new Error('Failed to fetch stats')
      const data = await res.json()
      setStats(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load stats')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchStats()
  }, [])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h1 className="type-display text-[32px] sm:text-[42px]">System Stats</h1>
        <Button size="sm" variant="outline" className="h-11 sm:h-9" onClick={fetchStats} disabled={loading}>
          {loading ? 'Loading\u2026' : 'Refresh'}
        </Button>
      </div>

      {error && (
        <p className="text-sm text-destructive-text">{error}</p>
      )}

      {loading && !stats && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="rounded-xl border-stroke border-ink bg-card shadow-ink-lg p-4 space-y-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-7 w-14" />
            </div>
          ))}
        </div>
      )}

      {stats && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {[
              { label: 'Total Users', value: stats.totalUsers },
              { label: 'New Users Today', value: stats.newUsersToday },
              { label: 'Items Today', value: stats.itemsIngestedToday },
              { label: 'Failed Items', value: stats.failedItems },
              { label: 'Active Items', value: stats.totalActiveItems },
              { label: 'Items Saved (Total)', value: stats.itemsSavedTotal },
              { label: 'DAU (proxy)', value: stats.dauProxy },
              { label: 'WAU (proxy)', value: stats.wauProxy },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-xl border-stroke border-ink bg-card shadow-ink-lg p-4">
                <p className="type-label text-muted-foreground">{label}</p>
                <p className="type-display text-[28px] sm:text-[36px] font-black tabular-nums mt-1">{value}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <TrendChart title="Items Saved (Last 7 Days)" data={stats.itemsSavedTrend} />
            <TrendChart title="Signups (Last 14 Days)" data={stats.signupsTrend} />
          </div>

          <div className="rounded-xl border-stroke border-ink bg-card shadow-ink-lg p-4 space-y-2">
            <p className="text-sm font-medium">Queue Depth</p>
            {stats.queueError ? (
              <p className="text-sm text-muted-foreground">
                Queue unavailable: {stats.queueError}
              </p>
            ) : stats.queue ? (
              <div className="flex flex-wrap gap-4">
                {Object.entries(stats.queue).map(([key, val]) => (
                  <div key={key} className="text-sm">
                    <span className="text-muted-foreground capitalize">{key}: </span>
                    <span className="font-medium tabular-nums">{val}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  )
}
