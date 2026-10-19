'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { ENVELOPE_PURPOSE_CHIPS, ENVELOPE_TEXT_MAX_LENGTH, type PurposeHint } from '@drop-note/shared'
import { markEnvelopeEntryPlanMade } from '@/components/envelopes/envelope-entry-storage'

interface PurposeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  itemIds: string[]
}

/**
 * The envelope "purpose step" (DRO-193): 4 chips pre-fill the editable text
 * box with a natural-language sentence — the chip is a prompt seed, not a
 * separate field. Submitting calls /api/envelopes/generate and navigates to
 * the resulting /envelopes/[id] page.
 */
export function PurposeDialog({ open, onOpenChange, itemIds }: PurposeDialogProps) {
  const router = useRouter()
  const [text, setText] = useState('')
  const [purposeHint, setPurposeHint] = useState<PurposeHint | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const trimmed = text.trim()
  const canSubmit = trimmed.length > 0 && trimmed.length <= ENVELOPE_TEXT_MAX_LENGTH && !isSubmitting

  function handleChipClick(hint: PurposeHint, prefill: string) {
    setPurposeHint(hint)
    setText(prefill)
  }

  function resetAndClose() {
    setText('')
    setPurposeHint(null)
    onOpenChange(false)
  }

  async function handleSubmit() {
    if (!canSubmit) return
    setIsSubmitting(true)
    try {
      const res = await fetch('/api/envelopes/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemIds, text: trimmed, purposeHint }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? 'Failed to create plan')
      }
      const data: { id: string } = await res.json()
      // First successful plan permanently retires the entry banner to its strip (DRO-227).
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
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!isSubmitting) { if (!next) resetAndClose(); else onOpenChange(next) } }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Make a plan</DialogTitle>
          <DialogDescription>
            Turn {itemIds.length} selected {itemIds.length === 1 ? 'item' : 'items'} into a checklist, list, or notes.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-2">
          {ENVELOPE_PURPOSE_CHIPS.map((chip) => (
            <button
              key={chip.hint}
              type="button"
              onClick={() => handleChipClick(chip.hint, chip.prefill)}
              disabled={isSubmitting}
              className={cn(
                'rounded-[10px] border-stroke border-ink bg-card px-3 py-2.5 text-left text-sm font-medium shadow-ink-sm transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50',
                purposeHint === chip.hint && 'bg-primary text-primary-foreground',
              )}
            >
              {chip.label}
            </button>
          ))}
        </div>

        <div className="space-y-1.5">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Describe what you want to make from these…"
            maxLength={ENVELOPE_TEXT_MAX_LENGTH}
            rows={3}
            disabled={isSubmitting}
            autoFocus
          />
          <p className="text-right text-xs text-muted-foreground">
            {trimmed.length}/{ENVELOPE_TEXT_MAX_LENGTH}
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={resetAndClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {isSubmitting ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Making plan…
              </>
            ) : (
              'Make plan'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
