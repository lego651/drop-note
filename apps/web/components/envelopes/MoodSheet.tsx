'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { MoodSheetMoodStep } from '@/components/envelopes/MoodSheetMoodStep'
import { MoodSheetReviewStep } from '@/components/envelopes/MoodSheetReviewStep'
import { markEnvelopeEntryPlanMade } from '@/components/envelopes/envelope-entry-storage'
import { toast } from '@/hooks/use-toast'
import type { EnvelopeSuggestItem, EnvelopeSuggestResponse } from '@/components/envelopes/envelope-suggest-types'

interface MoodSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** "Pick them myself" — opens the existing manual multi-select flow unchanged.
   *  `prefillIds`, when given, pre-selects those items (the insufficient-matches fallback). */
  onPickManually: (prefillIds?: string[]) => void
}

type Step =
  | { kind: 'mood' }
  | { kind: 'review'; query: string; items: EnvelopeSuggestItem[]; insufficientMatches: boolean }

/**
 * One-tap envelopes entry (DRO-301, Mood Sheet slice 2 of 3): replaces the
 * floating "Make a plan" button's old direct-to-item-selection tap target.
 * Chip/free-text submits to POST /api/envelopes/suggest (slice 1's contract),
 * then the review step calls the existing POST /api/envelopes/generate
 * unchanged — same request shape as PurposeDialog.tsx.
 */
export function MoodSheet({ open, onOpenChange, onPickManually }: MoodSheetProps) {
  const router = useRouter()
  const [step, setStep] = useState<Step>({ kind: 'mood' })
  const [isSuggesting, setIsSuggesting] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)

  function resetAndClose() {
    setStep({ kind: 'mood' })
    onOpenChange(false)
  }

  async function handleSuggest(query: string, seedTerms?: string[]) {
    if (isSuggesting) return
    setIsSuggesting(true)
    try {
      const res = await fetch('/api/envelopes/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(seedTerms && seedTerms.length > 0 ? { query, seedTerms } : { query }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? 'Could not find matching saves')
      }
      const data: EnvelopeSuggestResponse = await res.json()
      setStep({ kind: 'review', query, items: data.items, insufficientMatches: data.insufficientMatches })
    } catch (err) {
      toast({
        title: 'Could not find matching saves',
        description: err instanceof Error ? err.message : 'Something went wrong.',
        variant: 'destructive',
      })
    } finally {
      setIsSuggesting(false)
    }
  }

  async function handleGenerate(itemIds: string[], query: string) {
    if (isGenerating) return
    setIsGenerating(true)
    try {
      const res = await fetch('/api/envelopes/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemIds, text: query, purposeHint: null }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? 'Failed to create plan')
      }
      const data: { id: string } = await res.json()
      markEnvelopeEntryPlanMade()
      resetAndClose()
      router.push(`/envelopes/${data.id}`)
    } catch (err) {
      toast({
        title: 'Could not make a plan',
        description: err instanceof Error ? err.message : 'Something went wrong.',
        variant: 'destructive',
      })
    } finally {
      setIsGenerating(false)
    }
  }

  function handlePickManuallyFromReview(items: EnvelopeSuggestItem[]) {
    onPickManually(items.map((item) => item.itemId))
    resetAndClose()
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (next) return
        if (isSuggesting || isGenerating) return
        resetAndClose()
      }}
    >
      <SheetContent
        side="bottom"
        className="mx-auto flex max-h-[88dvh] w-full flex-col gap-4 overflow-y-auto rounded-t-xl border-ink bg-card p-5 pb-[calc(20px+env(safe-area-inset-bottom))] shadow-ink-lg sm:max-w-md"
      >
        {step.kind === 'mood' ? (
          <MoodSheetMoodStep
            isSubmitting={isSuggesting}
            onSubmitChip={handleSuggest}
            onSubmitFreeText={(text) => handleSuggest(text)}
            onPickManually={() => {
              onPickManually()
              resetAndClose()
            }}
          />
        ) : (
          <MoodSheetReviewStep
            initialItems={step.items}
            insufficientMatches={step.insufficientMatches}
            isGenerating={isGenerating}
            onBack={() => setStep({ kind: 'mood' })}
            onMakePlan={(itemIds) => handleGenerate(itemIds, step.query)}
            onPickManually={handlePickManuallyFromReview}
          />
        )}
      </SheetContent>
    </Sheet>
  )
}
