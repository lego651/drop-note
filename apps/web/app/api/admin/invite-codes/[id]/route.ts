import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/auth/require-admin'

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = params

  // Only delete unused codes
  const { data: code } = await supabaseAdmin
    .from('invite_codes')
    .select('used_by')
    .eq('id', id)
    .single()

  if (code?.used_by) {
    return NextResponse.json({ error: 'Cannot revoke a used code' }, { status: 400 })
  }

  const { error } = await supabaseAdmin.from('invite_codes').delete().eq('id', id)

  if (error) {
    return NextResponse.json({ error: 'Database error' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
