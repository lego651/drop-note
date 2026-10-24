'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { ENVELOPE_MOOD_STARTER_CHIPS, ENVELOPE_TEXT_MAX_LENGTH } from '@drop-note/shared'

interface MoodSheetMoodStepProps {
  isSubmitting: boolean
  onSubmitChip: (query: string, seedTerms?: string[]) => void
  onSubmitFreeText: (text: string) => void
  onPickManually: () => void
}

/**
 * Step 1 of the Mood Sheet (DRO-301): chips + free text, each of which calls
 * POST /api/envelopes/suggest and hands the response to the review step.
 * Until slice 3's personalized idea pool ships, the chip set is just the 4
 * static starter chips + Surprise me — no match counts or shuffle yet (both
 * need the pool), see ENVELOPE_MOOD_STARTER_CHIPS.
 */
export function MoodSheetMoodStep({
  isSubmitting,
  onSubmitChip,
  onSubmitFreeText,
  onPickManually,
}: MoodSheetMoodStepProps) {
  const [text, setText] = useState('')
  const trimmed = text.trim()
  const canSubmit = trimmed.length > 0 && trimmed.length <= ENVELOPE_TEXT_MAX_LENGTH && !isSubmitting

  function handleSurpriseMe() {
    const pick = ENVELOPE_MOOD_STARTER_CHIPS[Math.floor(Math.random() * ENVELOPE_MOOD_STARTER_CHIPS.length)]
    onSubmitChip(pick.query, pick.seedTerms)
  }

  function handleFreeTextSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    onSubmitFreeText(trimmed)
  }

  return (
    <>
      <SheetHeader>
        <SheetTitle>What do you feel like?</SheetTitle>
      </SheetHeader>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Mood suggestions">
        {ENVELOPE_MOOD_STARTER_CHIPS.map((chip) => (
          <button
            key={chip.id}
            type="button"
            disabled={isSubmitting}
            onClick={() => onSubmitChip(chip.query, chip.seedTerms)}
            className="inline-flex min-h-11 items-center rounded-full border-stroke border-ink bg-card px-4 text-sm font-medium shadow-ink-sm transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
          >
            {chip.label}
          </button>
        ))}
        <button
          type="button"
          disabled={isSubmitting}
          onClick={handleSurpriseMe}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-full border-stroke border-ink bg-card px-4 text-sm font-medium shadow-ink-sm transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
        >
          🎲 Surprise me
        </button>
      </div>

      <form onSubmit={handleFreeTextSubmit} className="flex items-center gap-2">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Or type what you're in the mood for…"
          enterKeyHint="go"
          maxLength={ENVELOPE_TEXT_MAX_LENGTH}
          disabled={isSubmitting}
          className="h-11"
          aria-label="Describe what you feel like"
        />
        <Button type="submit" disabled={!canSubmit} className="h-11 shrink-0" aria-label="Find matching saves">
          {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : 'Go'}
        </Button>
      </form>

      <button
        type="button"
        onClick={onPickManually}
        disabled={isSubmitting}
        className="inline-flex min-h-11 items-center text-sm font-medium text-link underline-offset-4 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
      >
        Pick them myself
      </button>
    </>
  )
}
