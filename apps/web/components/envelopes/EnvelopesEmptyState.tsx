import Link from 'next/link'
import { Mail } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * Neutral placeholder copy (DRO-223) — the final wording depends on Jason's
 * pick in DRO-221. Kept in this one constant so that pick is a one-line
 * change here, not a hunt through JSX.
 */
export const ENVELOPES_EMPTY_STATE_COPY = 'Pick 2–8 saved items on your inbox page, then make a plan.'
export const ENVELOPES_EMPTY_STATE_CTA = 'Make a plan'

export function EnvelopesEmptyState() {
  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border-stroke border-dashed border-ink/55 bg-card px-6 py-16 text-center shadow-ink-lg">
      <span className="flex h-12 w-12 items-center justify-center rounded-full border-stroke border-dashed border-ink/55 bg-card text-muted-foreground">
        <Mail size={20} />
      </span>
      <p className="max-w-sm text-sm text-muted-foreground">{ENVELOPES_EMPTY_STATE_COPY}</p>
      <Button asChild size="sm" className="gap-1.5">
        {/* ?pick=1 drops the user straight into pick mode on /items (DRO-227) */}
        <Link href="/items?pick=1">
          <Mail size={14} />
          {ENVELOPES_EMPTY_STATE_CTA}
        </Link>
      </Button>
    </div>
  )
}
