import { NextResponse } from 'next/server'
import { priceIdToTier } from '@drop-note/shared'
import { stripe } from '../../../../lib/stripe'
import { supabaseAdmin } from '../../../../lib/supabase/admin'
import { log, withRouteLogging } from '@/lib/observability/logger'

async function updateUserTier(userId: string, tier: 'free' | 'pro' | 'power') {
  const { data, error } = await supabaseAdmin
    .from('users')
    .update({ tier })
    .eq('id', userId)
    .select('id')
    .maybeSingle()

  if (error) {
    throw new Error(`[webhook] Failed to update tier for user ${userId}: ${error.message}`)
  }
  if (!data) {
    throw new Error(`[webhook] User ${userId} not found — tier update matched 0 rows. Orphaned payment.`)
  }
}

async function handlePOST(request: Request) {
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
    log.warn('stripe.webhook.signature_invalid', { reason: message })
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object
        const userId = session.client_reference_id
        const subscriptionId = session.subscription as string

        if (!userId || !subscriptionId) {
          log.error('stripe.webhook.checkout_missing_ids', new Error('checkout.session.completed missing userId or subscriptionId'))
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
          log.error('stripe.webhook.unknown_price', new Error('unrecognized priceId'), { priceId, userId })
          return NextResponse.json({ error: 'Unrecognized price ID' }, { status: 500 })
        }

        await updateUserTier(userId, tier)
        log.info('stripe.webhook.checkout_completed', { userId, tier })
        break
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object
        const userId = subscription.metadata?.supabase_user_id

        if (!userId) {
          log.warn('stripe.webhook.subscription_updated_missing_user')
          return NextResponse.json({ received: true })
        }

        const priceId = subscription.items.data[0]?.price?.id
        const tier = priceId ? priceIdToTier(priceId) : null

        if (!tier) {
          // Could be a proration event or unknown price — skip, do NOT reset to free
          log.warn('stripe.webhook.subscription_updated_unknown_price', { priceId })
          return NextResponse.json({ received: true })
        }

        await updateUserTier(userId, tier)
        log.info('stripe.webhook.subscription_updated', { userId, tier })
        break
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object
        const userId = subscription.metadata?.supabase_user_id

        if (!userId) {
          log.warn('stripe.webhook.subscription_deleted_missing_user')
          return NextResponse.json({ received: true })
        }

        await updateUserTier(userId, 'free')
        log.info('stripe.webhook.subscription_deleted', { userId, tier: 'free' })
        break
      }

      default:
        // Unknown event type — not a bug, Stripe sends many event types
        break
    }

    return NextResponse.json({ received: true })
  } catch (err) {
    // Infrastructure failure (DB error, Stripe API error) — return 500 so Stripe retries
    log.error('stripe.webhook.infrastructure_failed', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export const POST = withRouteLogging('POST /api/webhooks/stripe', handlePOST)
