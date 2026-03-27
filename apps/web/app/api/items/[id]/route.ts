import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { deleteItem } from '@/lib/items'

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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
  const { data: existing } = await supabaseAdmin
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
    await supabaseAdmin
      .from('items')
      .update(updates)
      .eq('id', params.id)
      .eq('user_id', user.id)
  }

  // Handle tags replacement
  if (tags !== undefined && Array.isArray(tags)) {
    const tagIds: string[] = []
    for (const tagName of tags) {
      const name = String(tagName).trim()
      if (!name) continue

      // Try to find existing tag (case-insensitive)
      const { data: existingTag } = await supabaseAdmin
        .from('tags')
        .select('id')
        .eq('user_id', user.id)
        .ilike('name', name)
        .single()

      if (existingTag) {
        tagIds.push(existingTag.id)
      } else {
        const { data: newTag } = await supabaseAdmin
          .from('tags')
          .insert({ name, user_id: user.id })
          .select('id')
          .single()
        if (newTag) tagIds.push(newTag.id)
      }
    }

    // Replace item_tags
    await supabaseAdmin.from('item_tags').delete().eq('item_id', params.id)
    if (tagIds.length > 0) {
      await supabaseAdmin.from('item_tags').insert(
        tagIds.map(tag_id => ({ item_id: params.id, tag_id }))
      )
    }
  }

  // Return updated item
  const { data: item } = await supabaseAdmin
    .from('items')
    .select('*, item_tags(tags(id, name))')
    .eq('id', params.id)
    .single()

  return NextResponse.json(item)
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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
}
