import { NextRequest, NextResponse } from 'next/server'
import { Redis } from '@upstash/redis'
import { createClient } from '@/lib/supabase/server'

const redis = Redis.fromEnv()

// GET /api/items/search?q=<keyword>
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q') ?? ''

  if (q.trim().length < 2) {
    return NextResponse.json([])
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Rate limit: 20 requests/min per user
  const key = `search:${user.id}`
  const count = await redis.incr(key)
  if (count === 1) await redis.expire(key, 60)
  if (count > 20) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })

  const { data: items, error } = await supabase.rpc('search_items', {
    query: q.trim(),
    p_user_id: user.id,
  })

  if (error) {
    console.error('[search] RPC error:', error.message)
    return NextResponse.json({ error: 'Search failed' }, { status: 500 })
  }

  return NextResponse.json(items ?? [])
}
