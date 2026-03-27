import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

// DELETE /api/items/trash
// Hard-deletes all trashed items (deleted_at IS NOT NULL) for the current user.
// Requires auth (401) and a paid tier (403).
export async function DELETE() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Paid tier required
  const { data: userData } = await supabaseAdmin
    .from('users')
    .select('tier')
    .eq('id', user.id)
    .single()

  const tier = userData?.tier ?? 'free'
  if (tier === 'free') {
    return NextResponse.json(
      { error: 'Upgrade to a paid plan to manage trash' },
      { status: 403 }
    )
  }

  const { data: deleted, error } = await supabaseAdmin
    .from('items')
    .delete()
    .eq('user_id', user.id)
    .not('deleted_at', 'is', null)
    .select('id')

  if (error) {
    return NextResponse.json({ error: 'Failed to empty trash' }, { status: 500 })
  }

  return NextResponse.json({ deleted: deleted?.length ?? 0 })
}
