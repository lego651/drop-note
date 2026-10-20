'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Check, Minus, Pencil, UserPlus, X } from 'lucide-react'
import type { EnvelopeLeaf } from '@drop-note/shared'
import { ENVELOPE_TEXT_MAX_LENGTH } from '@drop-note/shared'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'

export type CitationLabels = Record<string, string>

interface EnvelopeLeafRowProps {
  leaf: EnvelopeLeaf
  citationLabels: CitationLabels
  /** Checklist items get a check-style bullet; list/notes get a dash. */
  bulletVariant?: 'check' | 'dash'
  /** Present only for checklist leaves (DRO-195) — ticking a list/notes leaf isn't a thing. */
  onToggle?: () => void
  /** Present for any editable leaf (checklist/list/notes, DRO-195). */
  onEditText?: (text: string) => void
  /** Present for any deletable leaf (DRO-232) — user-added or AI-generated. */
  onDelete?: () => void
}

export function EnvelopeLeafRow({
  leaf,
  citationLabels,
  bulletVariant = 'dash',
  onToggle,
  onEditText,
  onDelete,
}: EnvelopeLeafRowProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState(leaf.text)

  function startEditing() {
    if (!onEditText) return
    setDraft(leaf.text)
    setIsEditing(true)
  }

  function commit() {
    setIsEditing(false)
    const trimmed = draft.trim()
    if (!onEditText || trimmed.length === 0 || trimmed === leaf.text) return
    onEditText(trimmed)
  }

  function cancel() {
    setDraft(leaf.text)
    setIsEditing(false)
  }

  // A user-added leaf never claims AI confidence (it's always "suggested"
  // internally, see createUserLeaf) but must not show the "suggested" dashed
  // marker — that marker means "AI, unverified", not "not from an item".
  const showSuggestedMarker = leaf.origin !== 'user' && leaf.confidence === 'suggested'

  return (
    <li className="flex items-start gap-2.5 py-1.5">
      {onToggle ? (
        <Checkbox
          checked={leaf.checked ?? false}
          onCheckedChange={onToggle}
          aria-label={leaf.checked ? 'Mark as not done' : 'Mark as done'}
          className={cn(
            'relative mt-0.5',
            "after:absolute after:-inset-x-[14px] after:-inset-y-2 after:content-['']",
            showSuggestedMarker && 'border-dashed',
          )}
        />
      ) : (
        <span
          aria-hidden="true"
          className={cn(
            'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-stroke border-ink',
            showSuggestedMarker && 'border-dashed',
          )}
        >
          {bulletVariant === 'check' ? <Check size={10} /> : <Minus size={10} />}
        </span>
      )}
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
        {isEditing ? (
          <form
            className="flex min-w-0 flex-1 basis-full items-center gap-1"
            onSubmit={(e) => {
              e.preventDefault()
              commit()
            }}
            onBlur={(e) => {
              const next = e.relatedTarget as Node | null
              if (next && e.currentTarget.contains(next)) return
              commit()
            }}
          >
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  // Real browsers already submit the <form> on Enter; this
                  // preventDefault stops that native implicit submission so
                  // commit() below is the only thing that runs — not a
                  // duplicate caused by both firing.
                  e.preventDefault()
                  commit()
                }
                if (e.key === 'Escape') {
                  e.preventDefault()
                  cancel()
                }
              }}
              enterKeyHint="done"
              maxLength={ENVELOPE_TEXT_MAX_LENGTH}
              className="min-w-0 flex-1 rounded-[6px] border-stroke border-ink bg-card px-1.5 py-0.5 text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:text-sm"
            />
            <button
              type="submit"
              onMouseDown={(e) => e.preventDefault()}
              aria-label="Save this line"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] text-primary hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Check size={16} aria-hidden="true" />
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={cancel}
              aria-label="Cancel editing this line"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] text-muted-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X size={16} aria-hidden="true" />
            </button>
          </form>
        ) : (
          <span
            role={onEditText ? 'button' : undefined}
            tabIndex={onEditText ? 0 : undefined}
            onClick={startEditing}
            onKeyDown={(e) => {
              if (!onEditText) return
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                startEditing()
              }
            }}
            className={cn(
              'text-sm text-foreground',
              leaf.checked && 'text-muted-foreground line-through',
              onEditText &&
                'cursor-text rounded-[4px] hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            )}
          >
            {leaf.text}
          </span>
        )}
        {leaf.edited ? (
          <span className="inline-flex items-center gap-1 rounded-full border-stroke border-dashed border-ink/55 bg-card px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
            <Pencil size={9} aria-hidden="true" />
            Edited
          </span>
        ) : leaf.origin === 'user' ? (
          <span className="inline-flex items-center gap-1 rounded-full border-stroke border-ink/55 bg-card px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
            <UserPlus size={9} aria-hidden="true" />
            Added by you
          </span>
        ) : (
          leaf.sourceItemIds.map((itemId) => (
            <Link
              key={itemId}
              href={`/items/${itemId}`}
              className="inline-flex items-center rounded-full border-stroke border-ink bg-card px-2 py-0.5 text-[11px] font-medium text-foreground hover:bg-muted"
            >
              {citationLabels[itemId] ?? 'Source'}
            </Link>
          ))
        )}
        {leaf.missing && (
          <span className="inline-flex items-center rounded-full border-stroke border-dashed border-ink/55 bg-card px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
            Missing: {leaf.missing}
          </span>
        )}
      </div>
      {onDelete && (
        <button
          type="button"
          onClick={onDelete}
          aria-label="Remove this line"
          className={cn(
            'relative mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-muted-foreground',
            "after:absolute after:-inset-x-[14px] after:-inset-y-2 after:content-['']",
            'hover:text-destructive-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          )}
        >
          <X size={12} aria-hidden="true" />
        </button>
      )}
    </li>
  )
}
