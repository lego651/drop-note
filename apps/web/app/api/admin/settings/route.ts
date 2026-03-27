import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/auth/require-admin'

export async function PATCH(request: Request) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let body: { key?: string; value?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.key || !body.value) {
    return NextResponse.json({ error: 'key and value are required' }, { status: 400 })
  }

  const ALLOWED_SETTINGS: Record<string, (v: string) => boolean> = {
    registration_mode: (v) => v === 'open' || v === 'invite',
    open_slots: (v) => /^\d+$/.test(v) && parseInt(v, 10) >= 0,
  }

  if (!ALLOWED_SETTINGS[body.key]) {
    return NextResponse.json({ error: 'Unknown setting key' }, { status: 400 })
  }
  if (!ALLOWED_SETTINGS[body.key](body.value)) {
    return NextResponse.json({ error: 'Invalid value for setting' }, { status: 400 })
  }

  const { error } = await supabaseAdmin
    .from('site_settings')
    .update({ value: body.value })
    .eq('key', body.key)

  if (error) {
    return NextResponse.json({ error: 'Database error' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
