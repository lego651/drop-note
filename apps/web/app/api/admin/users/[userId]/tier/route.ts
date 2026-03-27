import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@drop-note/shared'
import { createClient as createServerClient } from '../../../../../../lib/supabase/server'

const supabaseAdmin = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

const VALID_TIERS = ['free', 'pro', 'power'] as const
type ValidTier = typeof VALID_TIERS[number]

export async function PATCH(
  request: Request,
  { params }: { params: { userId: string } }
) {
  // Auth: require session
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

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
  const { userId } = params

  // Update tier — direct DB override, no Stripe side effects
  const { error } = await supabaseAdmin
    .from('users')
    .update({ tier })
    .eq('id', userId)

  if (error) {
    console.error('[admin] Failed to update tier:', error.message)
    return NextResponse.json({ error: 'Database error' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, userId, tier })
}
