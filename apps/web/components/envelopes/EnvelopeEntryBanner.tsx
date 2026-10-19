'use client'

import { useEffect, useRef, useState } from 'react'
import { ArrowRight, Mail, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useBulkSelect } from '@/components/items/BulkSelectProvider'
import { ENVELOPE_MIN_ITEMS, ENVELOPE_MAX_ITEMS } from '@drop-note/shared'
import { cn } from '@/lib/utils'
import {
  isEnvelopeEntryBannerStripped,
  snoozeEnvelopeEntryBanner,
} from '@/components/envelopes/envelope-entry-storage'

interface EnvelopeEntryBannerProps {
  /**
   * Reports whether the full (non-strip, non-pick-mode) banner card is
   * currently intersecting the viewport, so the floating "Make a plan" FAB
   * (mounted elsewhere on the page) knows when it's safe to show without
   * creating two competing cobalt CTAs (DRO-227).
   */
  onFullCardInViewChange: (inView: boolean) => void
}

/**
 * The envelopes entry point above the items search bar (DRO-227, combining
 * DRO-221's option 2 + option 3). One region, three states driven by
 * pick-mode + the stripped-for-7-days/permanently-stripped localStorage
 * flag: full card -> one-line strip -> step bar once pick mode is entered
 * (from here, the floating FAB, the /envelopes empty state, or "Edit items").
 */
export function EnvelopeEntryBanner({ onFullCardInViewChange }: EnvelopeEntryBannerProps) {
  const { isBulkMode, selectedIds, enterSelectMode, exitSelectMode } = useBulkSelect()
  const [stripped, setStripped] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setStripped(isEnvelopeEntryBannerStripped())
  }, [])

  const showFullCard = !isBulkMode && !stripped

  // Only the full card can hold the "cobalt CTA" role that keeps the FAB
  // hidden — report false whenever it isn't the thing on screen.
  useEffect(() => {
    if (!showFullCard || !cardRef.current || typeof IntersectionObserver === 'undefined') {
      onFullCardInViewChange(false)
      return
    }
    const el = cardRef.current
    const observer = new IntersectionObserver(
      ([entry]) => onFullCardInViewChange(entry.isIntersecting),
      { threshold: 0 },
    )
    observer.observe(el)
    return () => {
      observer.disconnect()
      onFullCardInViewChange(false)
    }
  }, [showFullCard, onFullCardInViewChange])

  function handleNotNow() {
    snoozeEnvelopeEntryBanner()
    setStripped(true)
  }

  if (isBulkMode) {
    const count = selectedIds.size
    const overCap = count > ENVELOPE_MAX_ITEMS
    return (
      <div className="flex min-h-[52px] items-center gap-3 rounded-xl border-stroke border-ink bg-[hsl(var(--primary)/0.08)] py-1 pl-4 pr-1">
        <Mail size={16} className="hidden shrink-0 text-foreground sm:block" />
        <span className="text-sm text-foreground">
          <span className="font-semibold">Step 1 of 2</span>
          <span className="hidden sm:inline">
            {' '}
            · pick {ENVELOPE_MIN_ITEMS}–{ENVELOPE_MAX_ITEMS} items
          </span>
          {' · '}
          {/* Only live text in the bar — a second live region on the tray would double-announce every pick. */}
          <span aria-live="polite" className={cn('font-mono tabular-nums', overCap && 'text-destructive')}>
            {overCap ? `${count} picked · max ${ENVELOPE_MAX_ITEMS}` : `${count} picked`}
          </span>
        </span>
        <Button variant="ghost" size="icon" className="ml-auto h-11 w-11 shrink-0 gap-1.5" onClick={exitSelectMode} aria-label="Cancel picking">
          <X size={16} />
          <span className="hidden sm:inline">Cancel</span>
        </Button>
      </div>
    )
  }

  if (stripped) {
    return (
      <button
        type="button"
        onClick={enterSelectMode}
        className="flex h-11 w-full items-center gap-2 rounded-[10px] border-stroke border-ink bg-[hsl(var(--primary)/0.08)] px-4 text-left text-sm font-semibold text-foreground transition-colors hover:bg-[hsl(var(--primary)/0.12)]"
      >
        <Mail size={16} className="text-primary" />
        Turn saves into a plan
        <ArrowRight size={16} aria-hidden="true" className="ml-auto text-muted-foreground" />
      </button>
    )
  }

  return (
    <div
      ref={cardRef}
      className="flex flex-col items-stretch gap-3 rounded-xl border-stroke border-ink bg-[hsl(var(--primary)/0.08)] p-4 sm:flex-row sm:items-center sm:gap-4 sm:px-5"
    >
      <div className="flex items-center gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-stroke border-dashed border-ink bg-card text-foreground sm:h-10 sm:w-10">
          <Mail size={18} />
        </span>
        <div>
          <p className="font-display text-[17px] font-bold leading-[1.1] text-foreground">
            Turn saves into a plan
          </p>
          <p className="mt-1 max-w-[70ch] text-sm text-foreground">
            Pick {ENVELOPE_MIN_ITEMS}–{ENVELOPE_MAX_ITEMS} saves and say what they&apos;re for. drop-note turns them
            into a checklist, itinerary or notes.
          </p>
          <ol className="mt-2 hidden flex-wrap gap-4 font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground sm:flex">
            <li>1 · PICK ITEMS</li>
            <li>2 · SAY WHAT FOR</li>
            <li>3 · GET A PLAN</li>
          </ol>
        </div>
      </div>
      <div className="flex items-center gap-2 sm:ml-auto sm:shrink-0">
        <Button onClick={enterSelectMode} size="lg" className="flex-1 gap-2 sm:flex-initial">
          <Mail size={16} />
          Pick items to plan
        </Button>
        <Button variant="ghost" size="lg" onClick={handleNotNow}>
          Not now
        </Button>
      </div>
    </div>
  )
}
