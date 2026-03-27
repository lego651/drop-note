import { createClient } from '../../lib/supabase/server'
import { UpgradeButton } from '../../components/UpgradeButton'
import { ManageSubscriptionButton } from '../../components/ManageSubscriptionButton'
import Link from 'next/link'

const PRO_PRICE_ID = process.env.STRIPE_PRO_PRICE_ID ?? ''
const POWER_PRICE_ID = process.env.STRIPE_POWER_PRICE_ID ?? ''

const TIERS = [
  {
    name: 'Free',
    price: '$0',
    priceId: null,
    items: '20 items',
    saves: '30 saves/month',
    attachmentSize: '10MB',
    deletion: 'Immediate delete',
    current: (tier: string | null) => !tier || tier === 'free',
  },
  {
    name: 'Pro',
    price: '$9.99/mo',
    priceId: PRO_PRICE_ID,
    items: '100 items',
    saves: 'Unlimited saves',
    attachmentSize: '25MB',
    deletion: '30-day trash',
    current: (tier: string | null) => tier === 'pro',
  },
  {
    name: 'Power',
    price: '$49.99/mo',
    priceId: POWER_PRICE_ID,
    items: '500 items',
    saves: 'Unlimited saves',
    attachmentSize: '50MB',
    deletion: '30-day trash',
    current: (tier: string | null) => tier === 'power',
  },
] as const

export default async function PricingPage({
  searchParams,
}: {
  searchParams: { checkout?: string }
}) {
  // Get current user's tier (if logged in) — graceful if not authenticated
  let userTier: string | null = null
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data } = await supabase.from('users').select('tier').eq('id', user.id).single()
      userTier = data?.tier ?? null
    }
  } catch {
    // Not authenticated — fine, pricing is public
  }

  const checkoutSuccess = searchParams.checkout === 'success'

  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      {checkoutSuccess && (
        <div className="mb-8 rounded-md border border-border bg-muted px-4 py-3 text-sm text-foreground">
          You're all set! Your plan has been upgraded. It may take a few seconds to reflect.
        </div>
      )}

      <div className="mb-10 text-center">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Pricing</h1>
        <p className="mt-2 text-muted-foreground">Simple, transparent pricing. Cancel anytime.</p>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {TIERS.map((tier) => {
          const isCurrent = tier.current(userTier)

          return (
            <div
              key={tier.name}
              className={[
                'flex flex-col rounded-xl border p-6',
                isCurrent ? 'border-primary bg-primary/5' : 'border-border bg-card',
              ].join(' ')}
            >
              <div className="mb-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-foreground">{tier.name}</h2>
                  {isCurrent && (
                    <span className="rounded-full border border-primary px-2 py-0.5 text-xs text-primary">
                      Current plan
                    </span>
                  )}
                </div>
                <p className="mt-1 text-2xl font-bold text-foreground">{tier.price}</p>
              </div>

              <ul className="mb-6 flex-1 space-y-2 text-sm text-muted-foreground">
                <li>✓ {tier.items}</li>
                <li>✓ {tier.saves}</li>
                <li>✓ {tier.attachmentSize} max attachment</li>
                <li>✓ {tier.deletion}</li>
              </ul>

              <div>
                {tier.priceId === null ? (
                  // Free tier
                  userTier && userTier !== 'free' ? (
                    <ManageSubscriptionButton />
                  ) : isCurrent ? (
                    <p className="text-sm text-muted-foreground">Your current plan</p>
                  ) : (
                    <Link
                      href="/auth/login"
                      className="block rounded-md bg-primary px-4 py-2 text-center text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                    >
                      Get started free
                    </Link>
                  )
                ) : isCurrent ? (
                  <p className="text-sm text-muted-foreground">Your current plan</p>
                ) : userTier && (userTier === 'pro' || userTier === 'power') ? (
                  // Paid user switching plans — use portal
                  <ManageSubscriptionButton />
                ) : (
                  // Free user upgrading
                  userTier !== null ? (
                    <UpgradeButton priceId={tier.priceId} label={`Upgrade to ${tier.name}`} />
                  ) : (
                    <Link
                      href={`/auth/login?redirect=/pricing`}
                      className="block rounded-md bg-primary px-4 py-2 text-center text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                    >
                      Get started
                    </Link>
                  )
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
