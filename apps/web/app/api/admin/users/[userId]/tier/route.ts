import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '../../../../../../lib/supabase/server'
import { supabaseAdmin } from '../../../../../../lib/supabase/admin'
import { log, setLogUser, withRouteLogging } from '@/lib/observability/logger'

const VALID_TIERS = ['free', 'pro', 'power'] as const
type ValidTier = typeof VALID_TIERS[number]

async function handlePATCH(
  request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  // Auth: require session
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  setLogUser(user.id)

  // Admin check
  const { data: caller } = await supabaseAdmin
    .from('users')
    .select('is_admin')
    .eq('id', user.id)
    .single()

  if (!caller?.is_admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Validate request body
  let body: { tier?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.tier || !VALID_TIERS.includes(body.tier as ValidTier)) {
    return NextResponse.json({ error: 'Invalid tier. Must be one of: free, pro, power' }, { status: 400 })
  }

  const tier = body.tier as ValidTier
  const { userId } = await params

  // Update tier — direct DB override, no Stripe side effects
  const { data, error } = await supabaseAdmin
    .from('users')
    .update({ tier })
    .eq('id', userId)
    .select('id, tier')
    .maybeSingle()

  if (error) {
    log.error('admin.users.tier_update_failed', error)
    return NextResponse.json({ error: 'Database error' }, { status: 500 })
  }

  if (!data) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  return NextResponse.json({ ok: true, userId: data.id, tier: data.tier })
}

export const PATCH = withRouteLogging('PATCH /api/admin/users/[userId]/tier', handlePATCH)
