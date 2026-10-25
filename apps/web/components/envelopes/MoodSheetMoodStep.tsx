'use client'

import { useState } from 'react'
import { Loader2, Shuffle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { ENVELOPE_TEXT_MAX_LENGTH, type EnvelopeIdea } from '@drop-note/shared'

interface MoodSheetMoodStepProps {
  isSubmitting: boolean
  /** The chips to render — either the personalized pool's current random draw, or the 4 static starter ideas. */
  ideas: readonly EnvelopeIdea[]
  /** Only true once a personalized pool (not the starter fallback) is loaded — the starter case shows no Shuffle control, matching its pre-pool appearance. */
  showShuffle: boolean
  onShuffle: () => void
  onSubmitChip: (query: string, seedTerms?: string[]) => void
  onSubmitFreeText: (text: string) => void
  onSurpriseMe: () => void
  onPickManually: () => void
}

/**
 * Step 1 of the Mood Sheet (DRO-301, wired to the idea pool in DRO-309):
 * chips + free text, each of which calls POST /api/envelopes/suggest and
 * hands the response to the review step. `ideas` is supplied by MoodSheet,
 * which fetches GET /api/envelopes/ideas once per sheet open and redraws
 * Shuffle/Surprise me from that same stored pool client-side — no extra
 * network/AI call here.
 */
export function MoodSheetMoodStep({
  isSubmitting,
  ideas,
  showShuffle,
  onShuffle,
  onSubmitChip,
  onSubmitFreeText,
  onSurpriseMe,
  onPickManually,
}: MoodSheetMoodStepProps) {
  const [text, setText] = useState('')
  const trimmed = text.trim()
  const canSubmit = trimmed.length > 0 && trimmed.length <= ENVELOPE_TEXT_MAX_LENGTH && !isSubmitting

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
        {ideas.map((idea, i) => (
          <button
            key={`${idea.label}-${i}`}
            type="button"
            disabled={isSubmitting}
            onClick={() => onSubmitChip(idea.label, idea.seedTerms)}
            className="inline-flex min-h-11 items-center rounded-full border-stroke border-ink bg-card px-4 text-sm font-medium shadow-ink-sm transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
          >
            {idea.label}
            {idea.matchingItemIds.length > 0 && (
              <span className="ml-1.5 font-mono text-[11px] tabular-nums text-muted-foreground">
                {idea.matchingItemIds.length}
              </span>
            )}
          </button>
        ))}
        <button
          type="button"
          disabled={isSubmitting}
          onClick={onSurpriseMe}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-full border-stroke border-ink bg-card px-4 text-sm font-medium shadow-ink-sm transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
        >
          🎲 Surprise me
        </button>
        {showShuffle && (
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onShuffle}
            aria-label="Shuffle suggestions"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full border-stroke border-ink bg-card px-4 text-sm font-medium shadow-ink-sm transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Shuffle size={16} />
            Shuffle
          </button>
        )}
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
