'use client'

import { Mail } from 'lucide-react'

interface EnvelopeMakePlanFabProps {
  onClick: () => void
}

/**
 * The idle floating "Make a plan" entry point (DRO-227, option 3). Fixed
 * bottom-right; only rendered by the items page while the entry banner
 * above the search bar is out of view (scrolled past, collapsed to its
 * strip, or permanently stripped) so there's never a second competing
 * cobalt CTA on screen. Morphs into EnvelopeTray once pick mode starts —
 * see docs/design/AIRMAIL.md §7 for the shared recipe.
 */
export function EnvelopeMakePlanFab({ onClick }: EnvelopeMakePlanFabProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="lift fixed bottom-7 right-[calc(28px+env(safe-area-inset-right))] z-40 flex h-14 items-center gap-2.5 rounded-full border-stroke border-ink bg-primary pl-[18px] pr-[22px] text-[15px] font-bold text-primary-foreground shadow-ink-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(var(--content-bg))] active:translate-x-px active:translate-y-px active:shadow-ink-sm max-[390px]:bottom-[calc(18px+env(safe-area-inset-bottom))] max-[390px]:right-3.5"
    >
      <Mail size={20} />
      Make a plan
    </button>
  )
}
