import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@drop-note/shared'
import { priceIdToTier } from '@drop-note/shared'
import { stripe } from '../../../../lib/stripe'

const supabaseAdmin = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

async function updateUserTier(userId: string, tier: 'free' | 'pro' | 'power') {
  const { error } = await supabaseAdmin
    .from('users')
    .update({ tier })
    .eq('id', userId)

  if (error) {
    throw new Error(`[webhook] Failed to update tier for user ${userId}: ${error.message}`)
  }
}

export async function POST(request: Request) {
  const rawBody = await request.text()
  const sig = request.headers.get('stripe-signature')

  if (!sig) {
    return NextResponse.json({ error: 'Missing stripe-signature' }, { status: 400 })
  }

  let event
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[webhook] Signature verification failed:', message)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object
        const userId = session.client_reference_id
        const subscriptionId = session.subscription as string

        if (!userId || !subscriptionId) {
          console.error('[webhook] checkout.session.completed missing userId or subscriptionId')
          return NextResponse.json({ error: 'Missing required fields' }, { status: 500 })
        }

        // Retrieve subscription with price expansion to get the price ID
        const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
          expand: ['items.data.price'],
        })

        const priceId = subscription.items.data[0]?.price?.id
        const tier = priceId ? priceIdToTier(priceId) : null

        if (!tier) {
          // Unrecognized price in a real completed checkout — this is a bug
          console.error('[webhook] checkout.session.completed: unrecognized priceId:', priceId, 'for user:', userId)
          return NextResponse.json({ error: 'Unrecognized price ID' }, { status: 500 })
        }

        await updateUserTier(userId, tier)
        console.log(`[webhook] checkout.session.completed: user ${userId} → ${tier}`)
        break
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object
        const userId = subscription.metadata?.supabase_user_id

        if (!userId) {
          console.warn('[webhook] customer.subscription.updated: missing supabase_user_id in metadata')
          return NextResponse.json({ received: true })
        }

        const priceId = subscription.items.data[0]?.price?.id
        const tier = priceId ? priceIdToTier(priceId) : null

        if (!tier) {
          // Could be a proration event or unknown price — skip, do NOT reset to free
          console.warn('[webhook] customer.subscription.updated: unknown priceId:', priceId, '— skipping')
          return NextResponse.json({ received: true })
        }

        await updateUserTier(userId, tier)
        console.log(`[webhook] customer.subscription.updated: user ${userId} → ${tier}`)
        break
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object
        const userId = subscription.metadata?.supabase_user_id

        if (!userId) {
          console.warn('[webhook] customer.subscription.deleted: missing supabase_user_id in metadata')
          return NextResponse.json({ received: true })
        }

        await updateUserTier(userId, 'free')
        console.log(`[webhook] customer.subscription.deleted: user ${userId} → free`)
        break
      }

      default:
        // Unknown event type — not a bug, Stripe sends many event types
        break
    }

    return NextResponse.json({ received: true })
  } catch (err) {
    // Infrastructure failure (DB error, Stripe API error) — return 500 so Stripe retries
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[webhook] Infrastructure failure:', message)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
