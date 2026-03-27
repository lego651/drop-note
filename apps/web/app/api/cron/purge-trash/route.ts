import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

// GET /api/cron/purge-trash
// Vercel cron job — runs daily at 03:00 UTC
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET

    if (!cronSecret) {
      console.error('[purge-trash] CRON_SECRET env var is not configured — cron will never run')
      return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 })
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
      console.error('[purge-trash] Error:', error.message)
      return NextResponse.json({ error: 'Purge failed' }, { status: 500 })
    }

    const purged = data?.length ?? 0
    console.log(`[purge-trash] Purged ${purged} items`)
    return NextResponse.json({ purged })
  } catch (err) {
    console.error('[GET /api/cron/purge-trash]', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
