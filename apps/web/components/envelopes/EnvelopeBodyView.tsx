'use client'

import { useState } from 'react'
import type { EnvelopeBody } from '@drop-note/shared'
import { countEnvelopeChecklistProgress, updateEnvelopeLeaf } from '@drop-note/shared'
import { EnvelopeLeafRow, type CitationLabels } from './EnvelopeLeafRow'
import { toast } from '@/hooks/use-toast'

interface EnvelopeBodyViewProps {
  envelopeId: string
  body: EnvelopeBody
  citationLabels: CitationLabels
}

type LeafPatchPayload = { action: 'toggle' } | { action: 'edit'; text: string }

/**
 * Renders checklist + notes blocks (this slice); list renders like a checklist
 * without the checkbox bullet. Table is schema-valid but not rendered yet
 * (DRO-196).
 *
 * Ticking a checklist item or editing a leaf's text (DRO-195) is optimistic:
 * local state updates immediately, then PATCHes /api/envelopes/[id], rolling
 * back + toasting on failure — same pattern as CategoryNav's inline rename.
 */
export function EnvelopeBodyView({ envelopeId, body: initialBody, citationLabels }: EnvelopeBodyViewProps) {
  const [body, setBody] = useState(initialBody)

  async function persistLeafUpdate(
    sectionIndex: number,
    itemIndex: number,
    patchPayload: LeafPatchPayload,
    nextBody: EnvelopeBody,
  ) {
    const previousBody = body
    setBody(nextBody)
    try {
      const res = await fetch(`/api/envelopes/${envelopeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sectionIndex, itemIndex, ...patchPayload }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? 'Failed to save')
      }
    } catch (err) {
      setBody(previousBody)
      toast({
        title: patchPayload.action === 'toggle' ? "Couldn't update that item" : "Couldn't save your edit",
        description: err instanceof Error ? err.message : undefined,
        variant: 'destructive',
      })
    }
  }

  function handleToggle(sectionIndex: number, itemIndex: number) {
    const next = updateEnvelopeLeaf(body, sectionIndex, itemIndex, (leaf) => ({ ...leaf, checked: !leaf.checked }))
    if (!next) return
    void persistLeafUpdate(sectionIndex, itemIndex, { action: 'toggle' }, next)
  }

  function handleEditText(sectionIndex: number, itemIndex: number, text: string) {
    const next = updateEnvelopeLeaf(body, sectionIndex, itemIndex, (leaf) => ({ ...leaf, text, edited: true }))
    if (!next) return
    void persistLeafUpdate(sectionIndex, itemIndex, { action: 'edit', text }, next)
  }

  const progress = countEnvelopeChecklistProgress(body)

  return (
    <div className="space-y-6">
      {progress.total > 0 && (
        <p className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
          {progress.checked}/{progress.total} done
        </p>
      )}
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
                  onToggle={block.type === 'checklist' ? () => handleToggle(i, j) : undefined}
                  onEditText={(text) => handleEditText(i, j, text)}
                />
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
