import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { deleteItems } from '@/lib/items'
import { log, setLogUser, withRouteLogging } from '@/lib/observability/logger'

// DELETE /api/items
// Body: { ids: string[] }
async function handleDELETE(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    setLogUser(user.id)

    let body: { ids?: string[] }
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    const { ids } = body
    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ deleted: 0 })
    }
    if (ids.length > 100) {
      return NextResponse.json({ error: 'Cannot delete more than 100 items at once' }, { status: 400 })
    }
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    const invalidId = ids.find((id) => typeof id !== 'string' || !UUID_RE.test(id))
    if (invalidId !== undefined) {
      return NextResponse.json({ error: 'All ids must be valid UUIDs' }, { status: 400 })
    }

    // Fetch user's tier once
    const { data: userData } = await supabaseAdmin
      .from('users')
      .select('tier')
      .eq('id', user.id)
      .single()

    const tier = (userData?.tier ?? 'free') as 'free' | 'pro' | 'power'

    // Delete items in bulk; IDs not owned by user are silently skipped (WHERE user_id handles it)
    const { deleted } = await deleteItems(ids, user.id, tier)

    return NextResponse.json({ deleted })
  } catch (err) {
    log.error('items.delete_failed', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const DELETE = withRouteLogging('DELETE /api/items', handleDELETE)
