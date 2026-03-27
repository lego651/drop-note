/**
 * Maps a Stripe price ID to a tier name using env vars.
 * Returns null if the price ID is not recognized.
 *
 * Used in the webhook handler to determine which tier to assign after a checkout.
 */
export function priceIdToTier(priceId: string): 'pro' | 'power' | null {
  if (!priceId) return null
  if (priceId === process.env.STRIPE_PRO_PRICE_ID) return 'pro'
  if (priceId === process.env.STRIPE_POWER_PRICE_ID) return 'power'
  return null
}
