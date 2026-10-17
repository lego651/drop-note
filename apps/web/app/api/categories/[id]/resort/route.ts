import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { previewResort, applyResort } from '@/lib/categories'
import { log, setLogUser, withRouteLogging } from '@/lib/observability/logger'

// GET /api/categories/[id]/resort — preview which unlocked items the AI would now sort
// into this category. Never moves anything.
async function handleGET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    setLogUser(user.id)

    const result = await previewResort(user.id, id)
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 422 })

    return NextResponse.json({ candidates: result.candidates })
  } catch (err) {
    log.error('categories.resort_preview_failed', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/categories/[id]/resort — applies a previewed re-sort.
// Body: { itemIds: string[] }
async function handlePOST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    setLogUser(user.id)

    let body: { itemIds?: string[] }
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    if (!Array.isArray(body.itemIds)) {
      return NextResponse.json({ error: 'itemIds must be an array' }, { status: 400 })
    }

    const result = await applyResort(user.id, id, body.itemIds)
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 422 })

    return NextResponse.json({ moved: result.moved })
  } catch (err) {
    log.error('categories.resort_apply_failed', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const GET = withRouteLogging('GET /api/categories/[id]/resort', handleGET)
export const POST = withRouteLogging('POST /api/categories/[id]/resort', handlePOST)
