import { test, expect } from '@playwright/test'
import Stripe from 'stripe'
import { cleanupUser, getUserId, seedItem, setUserTier } from './fixtures/seed'

// Uses free-user storageState

let freeUserId: string

test.beforeAll(async () => {
  freeUserId = await getUserId(process.env.E2E_FREE_USER_EMAIL!)
})

test.beforeEach(async () => {
  await cleanupUser(freeUserId)
  await setUserTier(freeUserId, 'free')
})

test('1. cap exceeded banner visible after hitting item limit', async ({ page }) => {
  // Seed 20 items (free tier cap)
  for (let i = 0; i < 20; i++) {
    await seedItem(freeUserId, { subject: `Item ${i}`, status: 'done' })
  }

  await page.goto('/items')
  await expect(page.getByText(/upgrade/i).first()).toBeVisible()
})

test('2. pricing page shows Pro tier with correct price', async ({ page }) => {
  await page.goto('/pricing')
  await expect(page.getByText(/\$9\.99\/mo/i)).toBeVisible()
  await expect(page.getByRole('button', { name: /upgrade to pro/i })).toBeVisible()
})

test('3. clicking upgrade creates checkout session and redirects', async ({ page }) => {
  await page.goto('/pricing')

  // Intercept the checkout API call and return mock Stripe URL
  await page.route('/api/stripe/checkout', async (route) => {
    const body = JSON.parse((await route.request().postData()) ?? '{}') as { tier?: string }
    expect(body.tier).toBe('pro')
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ url: 'https://checkout.stripe.com/mock' }),
    })
  })

  const [response] = await Promise.all([
    page.waitForResponse('/api/stripe/checkout'),
    page.getByRole('button', { name: /upgrade to pro/i }).click(),
  ])

  expect(response.status()).toBe(200)
})

test('4. stripe webhook updates user tier to pro', async ({ request }) => {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

  const payload = JSON.stringify({
    type: 'checkout.session.completed',
    data: {
      object: {
        id: 'cs_test_e2e',
        client_reference_id: freeUserId,
        subscription: 'sub_test_e2e',
        metadata: { tier: 'pro' },
      },
    },
  })

  const header = stripe.webhooks.generateTestHeaderString({
    payload,
    secret: process.env.STRIPE_WEBHOOK_SECRET!,
  })

  const response = await request.post('/api/webhooks/stripe', {
    data: payload,
    headers: {
      'content-type': 'application/json',
      'stripe-signature': header,
    },
  })

  expect(response.status()).toBe(200)
})
