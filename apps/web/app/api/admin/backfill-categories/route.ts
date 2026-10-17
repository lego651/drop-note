import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { setLogUser, withRouteLogging } from '@/lib/observability/logger'
import { runCategoriesBackfill } from '@/lib/backfill-categories'

// POST /api/admin/backfill-categories
// Body: { dryRun: boolean, userId?: string }
// Assigns a category to every pre-DRO-103 item (category_id IS NULL, category_locked
// false) via the same AI path previewResort/applyResort use. dryRun writes nothing and
// returns the proposed mapping; a real run writes category_id in batches. See
// lib/backfill-categories.ts for the implementation.
async function handlePOST(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  setLogUser(user.id)

  const { data: caller } = await supabaseAdmin
    .from('users')
    .select('is_admin')
    .eq('id', user.id)
    .single()

  if (!caller?.is_admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: { dryRun?: unknown; userId?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (typeof body.dryRun !== 'boolean') {
    return NextResponse.json({ error: 'dryRun (boolean) is required' }, { status: 400 })
  }
  if (body.userId !== undefined && typeof body.userId !== 'string') {
    return NextResponse.json({ error: 'userId must be a string' }, { status: 400 })
  }

  const result = await runCategoriesBackfill({ dryRun: body.dryRun, userId: body.userId })

  return NextResponse.json({ ok: true, ...result })
}

export const POST = withRouteLogging('POST /api/admin/backfill-categories', handlePOST)
