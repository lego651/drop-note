'use client'

import { useState } from 'react'
import { Mail, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useBulkSelect } from '@/components/items/BulkSelectProvider'
import { PurposeDialog } from '@/components/envelopes/PurposeDialog'
import { ENVELOPE_MAX_ITEMS, ENVELOPE_MIN_ITEMS } from '@drop-note/shared'
import { cn } from '@/lib/utils'

/**
 * Docked cross-category pick (DRO-194), restyled as the floating button's
 * morph target (DRO-227, option 3 — see docs/design/AIRMAIL.md §7). Selection
 * lives in BulkSelectProvider above the dashboard layout, so this renders on
 * every dashboard page once something is selected — independent of which
 * category page is open.
 */
export function EnvelopeTray() {
  const { isBulkMode, selectedIds, exitSelectMode } = useBulkSelect()
  const [purposeDialogOpen, setPurposeDialogOpen] = useState(false)

  if (!isBulkMode) return null

  const count = selectedIds.size
  const canMakePlan = count >= ENVELOPE_MIN_ITEMS && count <= ENVELOPE_MAX_ITEMS
  const overCapMessage = count > ENVELOPE_MAX_ITEMS ? `Select up to ${ENVELOPE_MAX_ITEMS} items.` : null

  return (
    <>
      <div
        role="region"
        aria-label="Your envelope"
        className="fixed inset-x-3 bottom-[14px] z-40 rounded-xl border-stroke border-ink bg-card p-3.5 shadow-ink-lg sm:inset-x-auto sm:bottom-7 sm:right-7 sm:w-[340px] sm:p-4"
      >
        <div className="flex items-center justify-between font-semibold text-foreground">
          <span className="flex items-center gap-2">
            <Mail size={16} className="text-foreground" />
            Your envelope
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-11 w-11"
            onClick={exitSelectMode}
            aria-label="Cancel picking"
          >
            <X size={16} />
          </Button>
        </div>

        <div className="my-3 flex gap-1" aria-hidden="true">
          {Array.from({ length: ENVELOPE_MAX_ITEMS }).map((_, i) => {
            const filled = i < Math.min(count, ENVELOPE_MAX_ITEMS)
            const isMinSlot = i < ENVELOPE_MIN_ITEMS
            return (
              <span
                key={i}
                className={cn(
                  'h-2.5 flex-1 rounded-[3px] border-stroke',
                  filled
                    ? 'border-ink bg-primary'
                    : isMinSlot
                      ? 'border-dashed border-ink bg-transparent'
                      : 'border border-border bg-muted',
                )}
              />
            )
          })}
        </div>

        <div className="flex items-center justify-between gap-2 max-[390px]:flex-col max-[390px]:items-stretch">
          {/* The only live region here — the tray's outer role stays "region" (not "status") so it doesn't re-announce every button.
              min-w-0 lets it wrap instead of fighting the button for width (DRO-244); the column layout below 391px gives it a full line. */}
          <span role="status" className={cn('min-w-0 font-mono text-xs', overCapMessage ? 'text-destructive-text' : 'text-muted-foreground')}>
            {overCapMessage ? `${count} of ${ENVELOPE_MIN_ITEMS}–${ENVELOPE_MAX_ITEMS} · remove ${count - ENVELOPE_MAX_ITEMS}` : `${count} of ${ENVELOPE_MIN_ITEMS}–${ENVELOPE_MAX_ITEMS} · tap cards to add`}
          </span>
          <Button
            variant="default"
            size="sm"
            aria-disabled={!canMakePlan}
            title={canMakePlan ? undefined : overCapMessage ?? `Select at least ${ENVELOPE_MIN_ITEMS} items.`}
            onClick={() => {
              if (!canMakePlan) return
              setPurposeDialogOpen(true)
            }}
            className={cn('h-11 shrink-0 gap-1.5 max-[390px]:w-full', !canMakePlan && 'opacity-50 shadow-none')}
          >
            <Mail size={14} />
            Make a plan →
          </Button>
        </div>
      </div>

      <PurposeDialog
        open={purposeDialogOpen}
        onOpenChange={setPurposeDialogOpen}
        itemIds={Array.from(selectedIds)}
      />
    </>
  )
}
