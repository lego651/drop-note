import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function parseFolderId(request: NextRequest): Promise<string | null> {
  try {
    const body = await request.json()
    return typeof body?.folderId === 'string' ? body.folderId : null
  } catch {
    return null
  }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const folderId = await parseFolderId(request)
    if (!UUID_RE.test(params.id) || !folderId || !UUID_RE.test(folderId)) {
      return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
    }
    // RLS insert policy enforces the user owns BOTH the item and the folder.
    const { error } = await supabase
      .from('item_folders')
      .upsert(
        { item_id: params.id, folder_id: folderId },
        { onConflict: 'item_id,folder_id', ignoreDuplicates: true },
      )
    if (error) return NextResponse.json({ error: 'Failed to add to folder' }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[POST /api/items/:id/folders]', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const folderId = await parseFolderId(request)
    if (!UUID_RE.test(params.id) || !folderId || !UUID_RE.test(folderId)) {
      return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
    }
    const { error } = await supabase
      .from('item_folders')
      .delete()
      .eq('item_id', params.id)
      .eq('folder_id', folderId)
    if (error) return NextResponse.json({ error: 'Failed to remove from folder' }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[DELETE /api/items/:id/folders]', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
