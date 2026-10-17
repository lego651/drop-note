import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { renameCategory, setCategoryHidden, deleteCategory, getCategoryDeletionCount } from '@/lib/categories'
import { log, setLogUser, withRouteLogging } from '@/lib/observability/logger'

// GET /api/categories/[id] — the item count deleting this category would actually
// reassign (see getCategoryDeletionCount), for the delete confirmation dialog.
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

    const item_count = await getCategoryDeletionCount(user.id, id)
    return NextResponse.json({ item_count })
  } catch (err) {
    log.error('categories.deletion_count_fetch_failed', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PATCH /api/categories/[id]
// Body: { name?: string, hidden?: boolean }
async function handlePATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    setLogUser(user.id)

    let body: { name?: string; hidden?: boolean }
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    if (body.name !== undefined) {
      const result = await renameCategory(user.id, id, body.name)
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: 422 })
    }

    if (body.hidden !== undefined) {
      if (typeof body.hidden !== 'boolean') {
        return NextResponse.json({ error: 'hidden must be a boolean' }, { status: 400 })
      }
      const result = await setCategoryHidden(user.id, id, body.hidden)
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: 422 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    log.error('categories.update_failed', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/categories/[id]
// Re-sorts every item in this category to the closest remaining category (or Other) via
// the AI before deleting it. "Other" itself cannot be deleted.
async function handleDELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    setLogUser(user.id)

    const result = await deleteCategory(user.id, id)
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 422 })

    return NextResponse.json({ ok: true, reassigned: result.reassigned })
  } catch (err) {
    log.error('categories.delete_failed', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const GET = withRouteLogging('GET /api/categories/[id]', handleGET)
export const PATCH = withRouteLogging('PATCH /api/categories/[id]', handlePATCH)
export const DELETE = withRouteLogging('DELETE /api/categories/[id]', handleDELETE)
