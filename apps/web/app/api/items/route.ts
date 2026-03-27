import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { deleteItem } from '@/lib/items'

// DELETE /api/items
// Body: { ids: string[] }
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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

    // Fetch user's tier once
    const { data: userData } = await supabaseAdmin
      .from('users')
      .select('tier')
      .eq('id', user.id)
      .single()

    const tier = (userData?.tier ?? 'free') as 'free' | 'pro' | 'power'

    // Delete each item; IDs not owned by user are silently skipped (WHERE user_id handles it)
    let deleted = 0
    for (const id of ids) {
      const result = await deleteItem(id, user.id, tier)
      if (result.affected) deleted++
    }

    return NextResponse.json({ deleted })
  } catch (err) {
    console.error('[DELETE /api/items]', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
