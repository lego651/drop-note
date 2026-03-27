import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

// POST /api/items/[id]/restore
export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
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
    return NextResponse.json({ error: 'Upgrade to a paid plan to restore items' }, { status: 403 })
  }

  await supabaseAdmin
    .from('items')
    .update({ deleted_at: null })
    .eq('id', params.id)
    .eq('user_id', user.id)

  return NextResponse.json({ ok: true })
}
