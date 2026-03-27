import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// POST /api/items/bulk-tag
// Body: { ids: string[], tag: string }
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    let body: { ids?: string[]; tag?: string }
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    const { ids, tag } = body
    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ tagged: 0 })
    }
    if (!tag || typeof tag !== 'string' || !tag.trim()) {
      return NextResponse.json({ error: 'tag is required' }, { status: 400 })
    }

    const tagName = tag.trim()

    // Upsert the tag (case-insensitive lookup first)
    let tagId: string
    const { data: existingTag } = await supabase
      .from('tags')
      .select('id')
      .eq('user_id', user.id)
      .ilike('name', tagName)
      .single()

    if (existingTag) {
      tagId = existingTag.id
    } else {
      const { data: newTag, error } = await supabase
        .from('tags')
        .insert({ name: tagName, user_id: user.id })
        .select('id')
        .single()
      if (!newTag || error) {
        return NextResponse.json({ error: 'Failed to create tag' }, { status: 500 })
      }
      tagId = newTag.id
    }

    // Verify ownership: only insert for items owned by this user
    const { data: ownedItems } = await supabase
      .from('items')
      .select('id')
      .in('id', ids)
      .eq('user_id', user.id)

    if (!ownedItems || ownedItems.length === 0) {
      return NextResponse.json({ tagged: 0 })
    }

    // Insert item_tags ON CONFLICT DO NOTHING
    const rows = ownedItems.map(item => ({ item_id: item.id, tag_id: tagId }))
    await supabase
      .from('item_tags')
      .upsert(rows, { onConflict: 'item_id,tag_id', ignoreDuplicates: true })

    return NextResponse.json({ tagged: ownedItems.length })
  } catch (err) {
    console.error('[POST /api/items/bulk-tag]', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
