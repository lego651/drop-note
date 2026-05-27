import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { sendWeeklyDigestEmail } from '@/lib/email'

// GET /api/cron/digest
// Vercel cron job — runs every Monday at 09:00 UTC
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET

    if (!cronSecret) {
      console.warn('[cron/digest] CRON_SECRET env var is not configured — skipping digest')
      return NextResponse.json({ skipped: true }, { status: 200 })
    }

    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

    // Fetch all users with digest enabled
    const { data: users, error: usersError } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('digest_enabled', true)

    if (usersError) {
      console.error('[cron/digest] Failed to fetch users:', usersError.message)
      return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 })
    }

    if (!users || users.length === 0) {
      console.log('[cron/digest] No users with digest enabled')
      return NextResponse.json({ ok: true, processed: 0, skipped: 0 })
    }

    let processed = 0
    let skipped = 0

    const results = await Promise.allSettled(
      users.map(async (user) => {
        const userId = user.id

        // Fetch this week's items and resurface picks in parallel
        const [weekResult, resurfaceResult] = await Promise.all([
          supabaseAdmin
            .from('items')
            .select('id, subject, source_type, created_at')
            .eq('user_id', userId)
            .is('deleted_at', null)
            .eq('status', 'done')
            .gte('created_at', sevenDaysAgo)
            .order('created_at', { ascending: false })
            .limit(5),
          supabaseAdmin
            .from('items')
            .select('id, subject, source_type, created_at')
            .eq('user_id', userId)
            .is('deleted_at', null)
            .eq('status', 'done')
            .lte('created_at', thirtyDaysAgo)
            .eq('pinned', false)
            .order('created_at', { ascending: true })
            .limit(20),
        ])

        const weekItems = weekResult.data ?? []
        // Shuffle candidates and take 2 for variety
        const resurfaceCandidates = resurfaceResult.data ?? []
        for (let i = resurfaceCandidates.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [resurfaceCandidates[i], resurfaceCandidates[j]] = [resurfaceCandidates[j], resurfaceCandidates[i]]
        }
        const resurfaceItems = resurfaceCandidates.slice(0, 2)

        // Skip users with no this-week items
        if (weekItems.length === 0) {
          return { userId, sent: false }
        }

        // Get user email from auth
        const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.getUserById(userId)
        if (authError || !authUser.user?.email) {
          console.error('[cron/digest] Failed to get email for user', userId, authError?.message)
          return { userId, sent: false }
        }

        await sendWeeklyDigestEmail({
          to: authUser.user.email,
          weekItems,
          resurfaceItems,
        })

        console.log('[cron/digest] sent', { userId, weekItems: weekItems.length, resurface: resurfaceItems.length })
        return { userId, sent: true }
      })
    )

    for (const result of results) {
      if (result.status === 'fulfilled') {
        if (result.value.sent) {
          processed++
        } else {
          skipped++
        }
      } else {
        skipped++
        console.error('[cron/digest] User digest failed:', result.reason)
      }
    }

    return NextResponse.json({ ok: true, processed, skipped })
  } catch (err) {
    console.error('[GET /api/cron/digest]', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
