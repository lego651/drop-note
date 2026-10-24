'use client'

import { useState } from 'react'
import { Loader2, Plus, RefreshCw, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { ENVELOPE_MAX_ITEMS, ENVELOPE_MIN_ITEMS } from '@drop-note/shared'
import { ItemSearchPicker, type ItemSearchResult } from '@/components/envelopes/ItemSearchPicker'
import type { EnvelopeSuggestItem } from '@/components/envelopes/envelope-suggest-types'

interface MoodSheetReviewStepProps {
  initialItems: EnvelopeSuggestItem[]
  insufficientMatches: boolean
  isGenerating: boolean
  onBack: () => void
  onMakePlan: (itemIds: string[]) => void
  onPickManually: (items: EnvelopeSuggestItem[]) => void
}

type Overlay = { kind: 'swap'; index: number } | { kind: 'add' } | null

/**
 * Step 2 of the Mood Sheet (DRO-301) — the AI's picks, each with its `reason`
 * one-liner, plus Swap/Remove/Add-another and the insufficient-matches
 * fallback into the existing manual multi-select flow.
 */
export function MoodSheetReviewStep({
  initialItems,
  insufficientMatches,
  isGenerating,
  onBack,
  onMakePlan,
  onPickManually,
}: MoodSheetReviewStepProps) {
  const [reviewItems, setReviewItems] = useState<EnvelopeSuggestItem[]>(initialItems)
  const [overlay, setOverlay] = useState<Overlay>(null)
  // The server's insufficientMatches flag describes the initial suggest
  // response, not the live list — once the user edits it (swap/remove/add),
  // only the current count matters, or fixing it (e.g. adding a save) could
  // never clear the fallback and re-enable "Make my plan".
  const [hasEdited, setHasEdited] = useState(false)

  const tooFew = hasEdited ? reviewItems.length < ENVELOPE_MIN_ITEMS : insufficientMatches || reviewItems.length < ENVELOPE_MIN_ITEMS
  const canMakePlan = !tooFew && reviewItems.length <= ENVELOPE_MAX_ITEMS && !isGenerating

  function handleRemove(id: string) {
    setHasEdited(true)
    setReviewItems((prev) => prev.filter((item) => item.id !== id))
  }

  function handleSwapSelect(item: ItemSearchResult) {
    if (overlay?.kind !== 'swap') return
    const index = overlay.index
    setHasEdited(true)
    setReviewItems((prev) =>
      prev.map((existing, i) => (i === index ? { id: item.id, subject: item.subject, reason: 'Added by you' } : existing)),
    )
    setOverlay(null)
  }

  function handleAddSelect(item: ItemSearchResult) {
    setHasEdited(true)
    setReviewItems((prev) => [...prev, { id: item.id, subject: item.subject, reason: 'Added by you' }])
    setOverlay(null)
  }

  if (overlay) {
    return (
      <ItemSearchPicker
        title={overlay.kind === 'swap' ? 'Swap this save' : 'Add another save'}
        excludeIds={reviewItems.map((item) => item.id)}
        onSelect={overlay.kind === 'swap' ? handleSwapSelect : handleAddSelect}
        onCancel={() => setOverlay(null)}
      />
    )
  }

  return (
    <>
      <SheetHeader>
        <SheetTitle>Here&rsquo;s what I&rsquo;d use</SheetTitle>
      </SheetHeader>

      <ul className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
        {reviewItems.map((item, index) => (
          <li
            key={item.id}
            className="flex items-start gap-2 rounded-[10px] border-stroke border-ink bg-card p-3 shadow-ink-sm"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">{item.subject ?? 'Untitled save'}</p>
              <p className="text-xs text-muted-foreground">{item.reason}</p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-11 w-11"
                onClick={() => setOverlay({ kind: 'swap', index })}
                aria-label={`Swap ${item.subject ?? 'this save'}`}
              >
                <RefreshCw size={16} />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-11 w-11"
                onClick={() => handleRemove(item.id)}
                aria-label={`Remove ${item.subject ?? 'this save'}`}
              >
                <X size={16} />
              </Button>
            </div>
          </li>
        ))}
      </ul>

      {reviewItems.length < ENVELOPE_MAX_ITEMS && (
        <Button type="button" variant="outline" className="h-11 gap-1.5" onClick={() => setOverlay({ kind: 'add' })}>
          <Plus size={14} />
          Add another save
        </Button>
      )}

      {tooFew && (
        <div className="rounded-[10px] border-stroke border-ink bg-accent p-3 text-sm text-foreground">
          <p className="mb-2">Not enough yet. Pick some yourself?</p>
          <Button type="button" variant="outline" className="h-11" onClick={() => onPickManually(reviewItems)}>
            Pick them myself
          </Button>
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <Button type="button" variant="ghost" className="h-11" onClick={onBack} disabled={isGenerating}>
          Back
        </Button>
        <Button
          type="button"
          className="h-11 gap-1.5"
          disabled={!canMakePlan}
          onClick={() => onMakePlan(reviewItems.map((item) => item.id))}
        >
          {isGenerating && <Loader2 size={16} className="animate-spin" />}
          Make my plan
        </Button>
      </div>
    </>
  )
}
