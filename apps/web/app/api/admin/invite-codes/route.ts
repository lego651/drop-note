import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

function generateInviteCode(): string {
  const raw = randomUUID().replace(/-/g, '').toUpperCase().slice(0, 12)
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`
}

async function requireAdmin() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabaseAdmin
    .from('users')
    .select('is_admin')
    .eq('id', user.id)
    .single()

  if (!profile?.is_admin) return null
  return user
}

export async function POST() {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const code = generateInviteCode()

  const { data, error } = await supabaseAdmin
    .from('invite_codes')
    .insert({ code, created_by: admin.id })
    .select('id, code, used_by, used_at, created_at, created_by')
    .single()

  if (error || !data) {
    console.error('[admin/invite-codes] insert error:', error?.message)
    return NextResponse.json({ error: 'Database error' }, { status: 500 })
  }

  return NextResponse.json({ code: { ...data, used_by_email: null } }, { status: 201 })
}
