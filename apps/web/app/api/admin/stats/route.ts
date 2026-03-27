import { NextResponse } from 'next/server'
import IORedis from 'ioredis'
import { Queue } from 'bullmq'
import { QUEUE_NAME } from '@drop-note/shared'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/auth/require-admin'

let _statsQueue: Queue | null = null
let _statsConnection: IORedis | null = null

function getStatsQueue(): Queue {
  if (!_statsQueue) {
    _statsConnection = new IORedis(process.env.REDIS_URL!, {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      lazyConnect: true,
      connectTimeout: 3000,
    })
    _statsQueue = new Queue(QUEUE_NAME, { connection: _statsConnection })
  }
  return _statsQueue
}

export async function GET() {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const todayISO = todayStart.toISOString()

  const [
    { count: totalUsers },
    { count: newUsersToday },
    { count: itemsIngestedToday },
    { count: failedItems },
    { count: totalActiveItems },
  ] = await Promise.all([
    supabaseAdmin.from('users').select('*', { count: 'exact', head: true }),
    supabaseAdmin
      .from('users')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', todayISO),
    supabaseAdmin
      .from('items')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', todayISO),
    supabaseAdmin
      .from('items')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'failed'),
    supabaseAdmin
      .from('items')
      .select('*', { count: 'exact', head: true })
      .is('deleted_at', null),
  ])

  // Queue metrics via BullMQ
  let queue: Record<string, number> | null = null
  let queueError: string | null = null

  try {
    const counts = await getStatsQueue().getJobCounts()
    queue = counts
  } catch (err) {
    queueError = err instanceof Error ? err.message : 'Queue unavailable'
  }

  return NextResponse.json({
    totalUsers: totalUsers ?? 0,
    newUsersToday: newUsersToday ?? 0,
    itemsIngestedToday: itemsIngestedToday ?? 0,
    failedItems: failedItems ?? 0,
    totalActiveItems: totalActiveItems ?? 0,
    queue,
    queueError,
  })
}
