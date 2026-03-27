import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { deleteItem } from '@/lib/items'

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    let body: Record<string, unknown>
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    const { ai_summary, notes, tags, pinned } = body as {
      ai_summary?: string
      notes?: string
      tags?: string[]
      pinned?: boolean
    }
    // deleted_at is NOT accepted

    // Verify ownership first
    const { data: existing } = await supabase
      .from('items')
      .select('id')
      .eq('id', params.id)
      .eq('user_id', user.id)
      .single()

    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // Build update object
    const updates: Record<string, unknown> = {}
    if (ai_summary !== undefined) updates.ai_summary = ai_summary
    if (notes !== undefined) updates.notes = notes
    if (pinned !== undefined) updates.pinned = pinned

    if (Object.keys(updates).length > 0) {
      await supabase
        .from('items')
        .update(updates)
        .eq('id', params.id)
        .eq('user_id', user.id)
    }

    // Handle tags replacement
    if (tags !== undefined && Array.isArray(tags)) {
      const tagNames = tags.map(t => String(t).trim().toLowerCase()).filter(Boolean)

      // 1 query: fetch all user's tags
      const { data: existingTags } = await supabase
        .from('tags')
        .select('id, name')
        .eq('user_id', user.id)

      const existingMap = new Map(
        (existingTags ?? []).map(t => [t.name.toLowerCase(), t.id])
      )

      const tagIds: string[] = []
      const newNames: string[] = []
      for (const name of tagNames) {
        if (existingMap.has(name)) {
          tagIds.push(existingMap.get(name)!)
        } else {
          newNames.push(name)
        }
      }

      // 1 query: batch insert new tags
      if (newNames.length > 0) {
        const { data: newTags } = await supabase
          .from('tags')
          .insert(newNames.map(name => ({ name, user_id: user.id })))
          .select('id')
        newTags?.forEach(t => tagIds.push(t.id))
      }

      // 2 queries: replace item_tags
      await supabase.from('item_tags').delete().eq('item_id', params.id)
      if (tagIds.length > 0) {
        await supabase.from('item_tags').insert(
          tagIds.map(tag_id => ({ item_id: params.id, tag_id }))
        )
      }
    }

    // Return updated item
    const { data: item } = await supabase
      .from('items')
      .select('*, item_tags(tags(id, name))')
      .eq('id', params.id)
      .single()

    return NextResponse.json(item)
  } catch (err) {
    console.error('[PATCH /api/items/[id]]', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Get user's tier
    const { data: userData } = await supabaseAdmin
      .from('users')
      .select('tier')
      .eq('id', user.id)
      .single()

    const tier = (userData?.tier ?? 'free') as 'free' | 'pro' | 'power'

    const result = await deleteItem(params.id, user.id, tier)
    return NextResponse.json(result)
  } catch (err) {
    console.error('[DELETE /api/items/[id]]', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
