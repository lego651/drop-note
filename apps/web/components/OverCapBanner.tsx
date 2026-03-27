import Link from 'next/link'
import { TIER_ITEM_LIMITS } from '@drop-note/shared'
import type { Tier } from '@drop-note/shared'

interface OverCapBannerProps {
  itemCount: number
  tier: Tier
}

export function OverCapBanner({ itemCount, tier }: OverCapBannerProps) {
  const limit = TIER_ITEM_LIMITS[tier]
  const excess = itemCount - limit

  return (
    <div className="w-full border-b border-destructive bg-destructive/10 px-4 py-3 text-sm text-destructive-foreground">
      <div className="mx-auto flex max-w-screen-xl items-center justify-between gap-4">
        <p>
          Your account has <strong>{itemCount} items</strong> but your{' '}
          <strong className="capitalize">{tier}</strong> plan allows{' '}
          <strong>{limit}</strong>. New emails will be rejected until you delete{' '}
          <strong>
            {excess} item{excess !== 1 ? 's' : ''}
          </strong>{' '}
          or upgrade.
        </p>
        <div className="flex shrink-0 gap-2">
          <Link
            href="/pricing"
            className="rounded-md bg-destructive px-3 py-1.5 text-xs font-medium text-destructive-foreground hover:bg-destructive/90 transition-colors"
          >
            Upgrade
          </Link>
          <Link
            href="/items"
            className="rounded-md border border-destructive px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10 transition-colors"
          >
            Delete items
          </Link>
        </div>
      </div>
    </div>
  )
}
