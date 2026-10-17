import { NextRequest, NextResponse } from 'next/server'
import { incrementCounter } from '@/lib/counters'
import { createClient } from '@/lib/supabase/server'
import { log, setLogUser, withRouteLogging } from '@/lib/observability/logger'

// GET /api/items/search?q=<keyword>
async function handleGET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const q = searchParams.get('q') ?? ''
    const trimmed = q.trim()

    if (trimmed.length === 0) {
      return NextResponse.json({ error: 'q is required' }, { status: 400 })
    }
    if (trimmed.length > 200) {
      return NextResponse.json({ error: 'q must be 200 characters or fewer' }, { status: 400 })
    }
    if (trimmed.length < 2) {
      return NextResponse.json([])
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    setLogUser(user.id)

    // Rate limit: 20 requests/min per user
    const key = `search:${user.id}`
    try {
      const count = await incrementCounter(key, 60)
      if (count > 20) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
    } catch (err) {
      log.error('items.search.rate_limit_counter_failed', err, { action: 'skipped_rate_limit' })
      // fail open — continue to search
    }

    const { data: items, error } = await supabase.rpc('search_items', {
      query: trimmed,
    })

    if (error) {
      log.error('items.search.rpc_failed', error)
      return NextResponse.json({ error: 'Search failed' }, { status: 500 })
    }

    // search_items() returns the category fields flattened (SQL RETURNS TABLE can't
    // nest a composite); rebuild the `category: {...} | null` shape ItemSummary and
    // the card/picker components expect.
    const shaped = (items ?? []).map((item: Record<string, unknown>) => {
      const {
        category_id,
        category_name,
        category_position,
        category_is_other,
        ...rest
      } = item
      return {
        ...rest,
        category_id,
        category: category_id
          ? {
              id: category_id,
              name: category_name,
              position: category_position,
              is_other: category_is_other,
            }
          : null,
      }
    })

    return NextResponse.json(shaped)
  } catch (err) {
    log.error('items.search_failed', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const GET = withRouteLogging('GET /api/items/search', handleGET)
