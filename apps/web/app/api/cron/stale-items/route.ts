import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { log, withRouteLogging } from '@/lib/observability/logger'
import { getStaleCutoffIso, STALE_ITEM_ERROR_MESSAGE } from './stale-cutoff'

// GET /api/cron/stale-items
// Vercel cron job — runs daily at 04:00 UTC
async function handleGET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET

    if (!cronSecret) {
      log.warn('cron.stale_items.skipped_no_secret')
      return NextResponse.json({ skipped: true }, { status: 200 })
    }

    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Flip items stuck in pending/processing past the staleness window to a real
    // failed status. done/failed items are untouched (excluded by the status filter).
    const cutoff = getStaleCutoffIso()

    const { data, error } = await supabaseAdmin
      .from('items')
      .update({ status: 'failed', error_message: STALE_ITEM_ERROR_MESSAGE })
      .in('status', ['pending', 'processing'])
      .lt('created_at', cutoff)
      .select('id')

    if (error) {
      log.error('cron.stale_items.update_failed', error)
      return NextResponse.json({ error: 'Stale item sweep failed' }, { status: 500 })
    }

    const failed = data?.length ?? 0
    log.info('cron.stale_items.completed', { failed })
    return NextResponse.json({ failed })
  } catch (err) {
    log.error('cron.stale_items_failed', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const GET = withRouteLogging('GET /api/cron/stale-items', handleGET)
