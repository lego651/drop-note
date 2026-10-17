import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCategories, createCategory } from '@/lib/categories'
import { log, setLogUser, withRouteLogging } from '@/lib/observability/logger'

// GET /api/categories
async function handleGET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    setLogUser(user.id)

    const categories = await getCategories(user.id)
    return NextResponse.json(categories)
  } catch (err) {
    log.error('categories.list_failed', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/categories
// Body: { name: string }
async function handlePOST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    setLogUser(user.id)

    let body: { name?: string }
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    if (typeof body.name !== 'string') {
      return NextResponse.json({ error: 'name is required' }, { status: 400 })
    }

    const result = await createCategory(user.id, body.name)
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 422 })

    return NextResponse.json(result.category, { status: 201 })
  } catch (err) {
    log.error('categories.create_failed', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const GET = withRouteLogging('GET /api/categories', handleGET)
export const POST = withRouteLogging('POST /api/categories', handlePOST)
