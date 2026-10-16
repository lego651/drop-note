import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/auth/require-admin'
import { log, withRouteLogging } from '@/lib/observability/logger'

function generateInviteCode(): string {
  const raw = randomUUID().replace(/-/g, '').toUpperCase().slice(0, 12)
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`
}

async function handlePOST() {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const code = generateInviteCode()

  const { data, error } = await supabaseAdmin
    .from('invite_codes')
    .insert({ code, created_by: admin.id })
    .select('id, code, used_by, used_at, created_at, created_by')
    .single()

  if (error || !data) {
    log.error('admin.invite_codes.insert_failed', error ?? new Error('no row returned'))
    return NextResponse.json({ error: 'Database error' }, { status: 500 })
  }

  return NextResponse.json({ code: { ...data, used_by_email: null } }, { status: 201 })
}

export const POST = withRouteLogging('POST /api/admin/invite-codes', handlePOST)
