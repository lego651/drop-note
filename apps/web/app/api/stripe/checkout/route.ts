import { NextResponse } from 'next/server'
import { createClient } from '../../../../lib/supabase/server'
import { stripe } from '../../../../lib/stripe'
import { getOrCreateStripeCustomer } from '../../../../lib/stripe-customer'

const VALID_PRICE_IDS = new Set([
  process.env.STRIPE_PRO_PRICE_ID,
  process.env.STRIPE_POWER_PRICE_ID,
])

export async function POST(request: Request) {
  // Auth: require session
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Parse and validate request body
  let body: { priceId?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { priceId } = body

  if (!priceId || !VALID_PRICE_IDS.has(priceId)) {
    return NextResponse.json({ error: 'Invalid price' }, { status: 400 })
  }

  const origin = process.env.NEXT_PUBLIC_APP_URL ?? request.headers.get('origin') ?? 'http://localhost:3000'

  const stripeCustomerId = await getOrCreateStripeCustomer(user.id)

  const session = await stripe.checkout.sessions.create({
    customer: stripeCustomerId,
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    client_reference_id: user.id,
    success_url: `${origin}/pricing?checkout=success`,
    cancel_url: `${origin}/pricing`,
    subscription_data: {
      metadata: { supabase_user_id: user.id },
    },
  })

  return NextResponse.json({ url: session.url })
}
