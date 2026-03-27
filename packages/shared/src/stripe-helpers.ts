/**
 * Maps a Stripe price ID to a tier name.
 * Accepts optional explicit price IDs for testability (avoids process.env mocking).
 * Falls back to env vars when not provided.
 */
export function priceIdToTier(
  priceId: string,
  proPriceId: string = process.env.STRIPE_PRO_PRICE_ID ?? '',
  powerPriceId: string = process.env.STRIPE_POWER_PRICE_ID ?? '',
): 'pro' | 'power' | null {
  if (!priceId) return null
  if (priceId === proPriceId) return 'pro'
  if (priceId === powerPriceId) return 'power'
  return null
}
