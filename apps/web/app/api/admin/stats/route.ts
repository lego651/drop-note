import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/auth/require-admin'

export async function GET() {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const todayISO = todayStart.toISOString()

  const [
    { count: totalUsers },
    { count: newUsersToday },
    { count: itemsIngestedToday },
    { count: failedItems },
    { count: totalActiveItems },
  ] = await Promise.all([
    supabaseAdmin.from('users').select('*', { count: 'exact', head: true }),
    supabaseAdmin
      .from('users')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', todayISO),
    supabaseAdmin
      .from('items')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', todayISO),
    supabaseAdmin
      .from('items')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'failed'),
    supabaseAdmin
      .from('items')
      .select('*', { count: 'exact', head: true })
      .is('deleted_at', null),
  ])

  return NextResponse.json({
    totalUsers: totalUsers ?? 0,
    newUsersToday: newUsersToday ?? 0,
    itemsIngestedToday: itemsIngestedToday ?? 0,
    failedItems: failedItems ?? 0,
    totalActiveItems: totalActiveItems ?? 0,
  })
}
