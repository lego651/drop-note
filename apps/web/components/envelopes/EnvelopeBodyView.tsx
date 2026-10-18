import type { EnvelopeBody } from '@drop-note/shared'
import { EnvelopeLeafRow, type CitationLabels } from './EnvelopeLeafRow'

interface EnvelopeBodyViewProps {
  body: EnvelopeBody
  citationLabels: CitationLabels
}

/** Renders checklist + notes blocks (this slice); list renders like a checklist without the checkbox bullet. Table is schema-valid but not rendered yet (DRO-196). */
export function EnvelopeBodyView({ body, citationLabels }: EnvelopeBodyViewProps) {
  return (
    <div className="space-y-6">
      {body.sections.map((block, i) => {
        if (block.type === 'table') {
          return (
            <p key={i} className="text-sm text-muted-foreground">
              This plan includes a table, which isn&apos;t shown here yet.
            </p>
          )
        }

        const heading = block.type === 'checklist' || block.type === 'list' ? block.heading : undefined

        return (
          <section key={i} className="rounded-xl border-stroke border-ink bg-card p-4 shadow-ink-lg">
            {heading && <h2 className="mb-2 text-[15px] font-semibold text-foreground">{heading}</h2>}
            <ul>
              {block.items.map((leaf, j) => (
                <EnvelopeLeafRow
                  key={j}
                  leaf={leaf}
                  citationLabels={citationLabels}
                  bulletVariant={block.type === 'checklist' ? 'check' : 'dash'}
                />
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
