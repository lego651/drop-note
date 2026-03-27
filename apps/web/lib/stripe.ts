import Stripe from 'stripe'
import { requireEnv } from '@drop-note/shared'

export const stripe = new Stripe(requireEnv('STRIPE_SECRET_KEY'), {
  apiVersion: '2026-03-25.dahlia',
})
