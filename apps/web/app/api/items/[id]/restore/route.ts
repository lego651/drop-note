import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { log, setLogUser, withRouteLogging } from '@/lib/observability/logger'

// POST /api/items/[id]/restore
async function handlePOST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    setLogUser(user.id)

    // Paid tier required
    const { data: userData } = await supabaseAdmin
      .from('users')
      .select('tier')
      .eq('id', user.id)
      .single()

    const tier = userData?.tier ?? 'free'
    if (tier === 'free') {
      return NextResponse.json({ error: 'Upgrade to a paid plan to restore items' }, { status: 403 })
    }

    const { data: restored, error: restoreError } = await supabase
      .from('items')
      .update({ deleted_at: null })
      .eq('id', params.id)
      .eq('user_id', user.id)
      .not('deleted_at', 'is', null)
      .select('id')
      .maybeSingle()

    if (restoreError) return NextResponse.json({ error: 'Restore failed' }, { status: 500 })
    if (!restored) return NextResponse.json({ error: 'Item not found in trash' }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    log.error('items.restore_failed', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const POST = withRouteLogging('POST /api/items/[id]/restore', handlePOST)
