import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

async function requireAdmin() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabaseAdmin
    .from('users')
    .select('is_admin')
    .eq('id', user.id)
    .single()

  if (!profile?.is_admin) return null
  return user
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
    const IORedis = (await import('ioredis')).default
    const { Queue } = await import('bullmq')
    const { QUEUE_NAME } = await import('@drop-note/shared')

    const connection = new IORedis(process.env.REDIS_URL!, {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      lazyConnect: true,
      connectTimeout: 3000,
    })

    try {
      await connection.connect()
      const q = new Queue(QUEUE_NAME, { connection })
      const counts = await q.getJobCounts()
      queue = counts
      await q.close()
    } finally {
      await connection.quit().catch(() => {})
    }
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
