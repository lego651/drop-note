import { createClient } from '@supabase/supabase-js'
import type { Database } from '@drop-note/shared'
import { stripe } from './stripe'

const supabaseAdmin = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

/**
 * Returns the Stripe customer ID for a user, creating one if it doesn't exist.
 * Concurrency-safe: uses an atomic UPDATE WHERE stripe_customer_id IS NULL as the gate.
 * If two requests race, only one writes — the loser re-reads and returns the winner's value.
 */
export async function getOrCreateStripeCustomer(userId: string): Promise<string> {
  // Fast path: customer already exists
  const { data: user } = await supabaseAdmin
    .from('users')
    .select('stripe_customer_id')
    .eq('id', userId)
    .single()

  if (user?.stripe_customer_id) {
    return user.stripe_customer_id
  }

  // Create a new Stripe customer
  const customer = await stripe.customers.create({
    metadata: { supabase_user_id: userId },
  })

  // Atomic conditional write: only succeeds if stripe_customer_id is still NULL
  const { data: updated } = await supabaseAdmin
    .from('users')
    .update({ stripe_customer_id: customer.id })
    .eq('id', userId)
    .is('stripe_customer_id', null)
    .select('stripe_customer_id')
    .maybeSingle()

  if (updated?.stripe_customer_id) {
    // We won the race
    return updated.stripe_customer_id
  }

  // Another concurrent caller already wrote — discard our Stripe customer and re-read
  // Log so we can track orphaned customers in production
  console.warn('[stripe-customer] Race: orphaned Stripe customer created:', customer.id, 'for user:', userId)

  const { data: current } = await supabaseAdmin
    .from('users')
    .select('stripe_customer_id')
    .eq('id', userId)
    .single()

  if (!current?.stripe_customer_id) {
    throw new Error(`[stripe-customer] Failed to retrieve stripe_customer_id for user ${userId}`)
  }

  return current.stripe_customer_id
}
