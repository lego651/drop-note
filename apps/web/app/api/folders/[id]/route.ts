import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_NAME = 40

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!UUID_RE.test(params.id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

    let body: { name?: string; position?: number }
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    const update: { name?: string; position?: number } = {}
    if (typeof body.name === 'string') {
      const name = body.name.trim()
      if (!name) return NextResponse.json({ error: 'name cannot be empty' }, { status: 400 })
      if (name.length > MAX_NAME) {
        return NextResponse.json({ error: `name too long (max ${MAX_NAME})` }, { status: 400 })
      }
      const { data: dup } = await supabase
        .from('folders')
        .select('id')
        .eq('user_id', user.id)
        .ilike('name', name)
        .neq('id', params.id)
        .maybeSingle()
      if (dup) return NextResponse.json({ error: 'A folder with that name already exists' }, { status: 409 })
      update.name = name
    }
    if (typeof body.position === 'number' && Number.isFinite(body.position)) {
      update.position = Math.trunc(body.position)
    }
    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('folders')
      .update(update)
      .eq('id', params.id)
      .eq('user_id', user.id)
      .select('id, name, position')
      .maybeSingle()
    if (error) return NextResponse.json({ error: 'Failed to update folder' }, { status: 500 })
    if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ folder: data })
  } catch (err) {
    console.error('[PATCH /api/folders/:id]', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!UUID_RE.test(params.id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

    const { error } = await supabase
      .from('folders')
      .delete()
      .eq('id', params.id)
      .eq('user_id', user.id)
    if (error) return NextResponse.json({ error: 'Failed to delete folder' }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[DELETE /api/folders/:id]', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
