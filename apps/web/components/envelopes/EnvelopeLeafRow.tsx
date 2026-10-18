import Link from 'next/link'
import { Check, Minus } from 'lucide-react'
import type { EnvelopeLeaf } from '@drop-note/shared'
import { cn } from '@/lib/utils'

export type CitationLabels = Record<string, string>

interface EnvelopeLeafRowProps {
  leaf: EnvelopeLeaf
  citationLabels: CitationLabels
  /** Checklist items get a check-style bullet; list/notes get a dash. */
  bulletVariant?: 'check' | 'dash'
}

export function EnvelopeLeafRow({ leaf, citationLabels, bulletVariant = 'dash' }: EnvelopeLeafRowProps) {
  return (
    <li className="flex items-start gap-2.5 py-1.5">
      <span
        aria-hidden="true"
        className={cn(
          'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-stroke border-ink',
          leaf.confidence === 'suggested' && 'border-dashed',
        )}
      >
        {bulletVariant === 'check' ? <Check size={10} /> : <Minus size={10} />}
      </span>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-sm text-foreground">{leaf.text}</span>
        {leaf.sourceItemIds.map((itemId) => (
          <Link
            key={itemId}
            href={`/items/${itemId}`}
            className="inline-flex items-center rounded-full border-stroke border-ink bg-card px-2 py-0.5 text-[11px] font-medium text-foreground hover:bg-muted"
          >
            {citationLabels[itemId] ?? 'Source'}
          </Link>
        ))}
        {leaf.missing && (
          <span className="inline-flex items-center rounded-full border-stroke border-dashed border-ink/55 bg-card px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
            Missing: {leaf.missing}
          </span>
        )}
      </div>
    </li>
  )
}
