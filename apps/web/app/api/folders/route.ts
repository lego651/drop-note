import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const MAX_NAME = 40
const MAX_FOLDERS = 100

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data, error } = await supabase.rpc('get_folders_with_counts')
  if (error) return NextResponse.json({ error: 'Failed to load folders' }, { status: 500 })
  return NextResponse.json({ folders: data ?? [] })
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    let body: { name?: string }
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    const name = (body.name ?? '').trim()
    if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 })
    if (name.length > MAX_NAME) {
      return NextResponse.json({ error: `name too long (max ${MAX_NAME})` }, { status: 400 })
    }

    // Case-insensitive duplicate guard
    const { data: dup } = await supabase
      .from('folders')
      .select('id')
      .eq('user_id', user.id)
      .ilike('name', name)
      .maybeSingle()
    if (dup) return NextResponse.json({ error: 'A folder with that name already exists' }, { status: 409 })

    // Folder cap + next position
    const { count } = await supabase
      .from('folders')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
    if ((count ?? 0) >= MAX_FOLDERS) {
      return NextResponse.json({ error: `Folder limit reached (${MAX_FOLDERS})` }, { status: 400 })
    }

    const { data: created, error } = await supabase
      .from('folders')
      .insert({ name, user_id: user.id, position: count ?? 0 })
      .select('id, name, position')
      .single()
    if (error || !created) return NextResponse.json({ error: 'Failed to create folder' }, { status: 500 })

    return NextResponse.json({ folder: created }, { status: 201 })
  } catch (err) {
    console.error('[POST /api/folders]', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
