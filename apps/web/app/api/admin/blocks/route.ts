import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/auth/require-admin'

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function isValidIP(ip: string): boolean {
  // IPv4
  const ipv4 = /^(\d{1,3}\.){3}\d{1,3}$/
  // IPv6 (basic check)
  const ipv6 = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/
  return ipv4.test(ip) || ipv6.test(ip)
}

export async function POST(request: Request) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let body: { type?: string; value?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const type = body.type
  const value = body.value?.trim()

  if (type !== 'email' && type !== 'ip') {
    return NextResponse.json({ error: 'type must be email or ip' }, { status: 400 })
  }
  if (!value) {
    return NextResponse.json({ error: 'value is required' }, { status: 400 })
  }
  if (type === 'email' && !isValidEmail(value)) {
    return NextResponse.json({ error: 'Invalid email format' }, { status: 400 })
  }
  if (type === 'ip' && !isValidIP(value)) {
    return NextResponse.json({ error: 'Invalid IP address format' }, { status: 400 })
  }

  // Check for duplicate
  const { data: existing } = await supabaseAdmin
    .from('block_list')
    .select('id')
    .eq('type', type)
    .eq('value', value)
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ error: 'Already blocked' }, { status: 409 })
  }

  const { data: block, error } = await supabaseAdmin
    .from('block_list')
    .insert({ type, value, created_by: admin.id })
    .select('id, type, value, created_at, created_by')
    .single()

  if (error || !block) {
    console.error('[admin/blocks] insert error:', error?.message)
    return NextResponse.json({ error: 'Database error' }, { status: 500 })
  }

  return NextResponse.json({ block }, { status: 201 })
}
