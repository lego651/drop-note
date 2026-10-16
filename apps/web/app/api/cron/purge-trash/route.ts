import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { log, withRouteLogging } from '@/lib/observability/logger'

// GET /api/cron/purge-trash
// Vercel cron job — runs daily at 03:00 UTC
async function handleGET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET

    if (!cronSecret) {
      log.warn('cron.purge_trash.skipped_no_secret')
      return NextResponse.json({ skipped: true }, { status: 200 })
    }

    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Delete items soft-deleted more than 30 days ago
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

    const { data, error } = await supabaseAdmin
      .from('items')
      .delete()
      .not('deleted_at', 'is', null)
      .lt('deleted_at', cutoff)
      .select('id')

    if (error) {
      log.error('cron.purge_trash.delete_failed', error)
      return NextResponse.json({ error: 'Purge failed' }, { status: 500 })
    }

    const purged = data?.length ?? 0
    log.info('cron.purge_trash.completed', { purged })
    return NextResponse.json({ purged })
  } catch (err) {
    log.error('cron.purge_trash_failed', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const GET = withRouteLogging('GET /api/cron/purge-trash', handleGET)
