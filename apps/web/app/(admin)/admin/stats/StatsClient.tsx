'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'

interface StatsData {
  totalUsers: number
  newUsersToday: number
  itemsIngestedToday: number
  failedItems: number
  totalActiveItems: number
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
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">System Stats</h1>
        <Button size="sm" variant="outline" onClick={fetchStats} disabled={loading}>
          {loading ? 'Loading\u2026' : 'Refresh'}
        </Button>
      </div>

      {error && (
        <p className="text-sm text-destructive">{error}</p>
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
            ].map(({ label, value }) => (
              <div key={label} className="rounded-md border border-border p-4">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-2xl font-semibold mt-1">{value}</p>
              </div>
            ))}
          </div>

          <div className="rounded-md border border-border p-4 space-y-2">
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
                    <span className="font-medium">{val}</span>
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
