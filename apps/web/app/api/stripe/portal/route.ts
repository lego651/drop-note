import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@supabase/supabase-js'
import type { Database } from '@drop-note/shared'
import { createClient } from '../../../../lib/supabase/server'
import { stripe } from '../../../../lib/stripe'

const supabaseAdmin = createServerClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

export async function POST(request: Request) {
  // Auth: require session
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Get stripe_customer_id for the current user
  const { data: userData } = await supabaseAdmin
    .from('users')
    .select('stripe_customer_id')
    .eq('id', user.id)
    .single()

  if (!userData?.stripe_customer_id) {
    return NextResponse.json({ error: 'No subscription found' }, { status: 400 })
  }

  const origin = process.env.NEXT_PUBLIC_APP_URL ?? request.headers.get('origin') ?? 'http://localhost:3000'

  const portalSession = await stripe.billingPortal.sessions.create({
    customer: userData.stripe_customer_id,
    return_url: `${origin}/settings`,
  })

  return NextResponse.json({ url: portalSession.url })
}
