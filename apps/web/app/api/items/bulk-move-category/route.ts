import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { moveItems } from '@/lib/categories'
import { log, setLogUser, withRouteLogging } from '@/lib/observability/logger'

// POST /api/items/bulk-move-category
// Body: { ids: string[], categoryId: string }
// Manual move — sets category_locked so the AI never re-categorizes these items again.
async function handlePOST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    setLogUser(user.id)

    let body: { ids?: string[]; categoryId?: string }
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    const { ids, categoryId } = body
    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ moved: 0 })
    }
    if (ids.length > 100) {
      return NextResponse.json({ error: 'Cannot move more than 100 items at once' }, { status: 400 })
    }
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    const invalidId = ids.find((id) => typeof id !== 'string' || !UUID_RE.test(id))
    if (invalidId !== undefined) {
      return NextResponse.json({ error: 'All ids must be valid UUIDs' }, { status: 400 })
    }
    if (!categoryId || typeof categoryId !== 'string' || !UUID_RE.test(categoryId)) {
      return NextResponse.json({ error: 'categoryId must be a valid UUID' }, { status: 400 })
    }

    const result = await moveItems(user.id, ids, categoryId)
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 422 })

    return NextResponse.json({ moved: result.moved })
  } catch (err) {
    log.error('items.bulk_move_category_failed', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const POST = withRouteLogging('POST /api/items/bulk-move-category', handlePOST)
