'use client'

import { useState } from 'react'
import { Sparkles, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useBulkSelect } from '@/components/items/BulkSelectProvider'
import { PurposeDialog } from '@/components/envelopes/PurposeDialog'
import { ENVELOPE_MAX_ITEMS, ENVELOPE_MIN_ITEMS } from '@drop-note/shared'

/**
 * Docked cross-category pick (DRO-194). Selection lives in BulkSelectProvider
 * above the dashboard layout, so this renders on every dashboard page once
 * something is selected — independent of which category page is open.
 */
export function EnvelopeTray() {
  const { isBulkMode, selectedIds, deselectAll } = useBulkSelect()
  const [purposeDialogOpen, setPurposeDialogOpen] = useState(false)

  if (!isBulkMode) return null

  const count = selectedIds.size
  const canMakePlan = count >= ENVELOPE_MIN_ITEMS && count <= ENVELOPE_MAX_ITEMS
  const capMessage =
    count < ENVELOPE_MIN_ITEMS
      ? `Select at least ${ENVELOPE_MIN_ITEMS} items to make a plan.`
      : count > ENVELOPE_MAX_ITEMS
        ? `Select up to ${ENVELOPE_MAX_ITEMS} items to make a plan.`
        : null

  return (
    <>
      <div
        role="status"
        className="fixed bottom-6 left-1/2 z-40 flex max-w-[92vw] -translate-x-1/2 flex-wrap items-center gap-2 rounded-[10px] border-stroke border-ink bg-card px-3 py-2 shadow-ink-lg sm:gap-3 sm:px-4 sm:py-2.5"
      >
        <span className="whitespace-nowrap text-sm font-medium text-foreground">
          {count} {count === 1 ? 'item' : 'items'} selected
        </span>
        {capMessage && (
          // Full-width on mobile so it wraps to its own line below the count/actions
          // row instead of being hidden — a disabled button alone doesn't explain
          // the 2-8 cap on touch devices (no hover for the `title`).
          <span className="order-3 w-full text-xs text-muted-foreground sm:order-none sm:w-auto">
            {capMessage}
          </span>
        )}
        <div className="order-2 flex shrink-0 items-center gap-1.5 sm:order-none">
          <Button
            variant="default"
            size="sm"
            disabled={!canMakePlan}
            aria-disabled={!canMakePlan}
            title={canMakePlan ? undefined : capMessage ?? undefined}
            onClick={() => setPurposeDialogOpen(true)}
            className="gap-1.5"
          >
            <Sparkles size={14} />
            Make a plan →
          </Button>
          <Button variant="ghost" size="sm" onClick={deselectAll} aria-label="Clear selection">
            <X size={14} />
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
