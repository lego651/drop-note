'use client'

import { useRef, useState } from 'react'
import type { EnvelopeBody, EnvelopeLeaf } from '@drop-note/shared'
import { countEnvelopeChecklistProgress, updateEnvelopeLeaf } from '@drop-note/shared'
import { EnvelopeLeafRow, type CitationLabels } from './EnvelopeLeafRow'
import { toast } from '@/hooks/use-toast'

interface EnvelopeBodyViewProps {
  envelopeId: string
  body: EnvelopeBody
  citationLabels: CitationLabels
}

type LeafPatchPayload = { action: 'toggle'; checked: boolean } | { action: 'edit'; text: string }

/**
 * Renders checklist + notes blocks (this slice); list renders like a checklist
 * without the checkbox bullet. Table is schema-valid but not rendered yet
 * (DRO-196).
 *
 * Ticking a checklist item or editing a leaf's text (DRO-195) is optimistic:
 * local state updates immediately, then PATCHes /api/envelopes/[id]. PATCHes
 * are serialized through `patchQueueRef` (one in flight at a time) so a burst
 * of rapid ticks can't race each other's read-modify-write on the server, and
 * a failed PATCH rolls back only the one leaf it touched (via `previousLeaf`)
 * rather than the whole body snapshot, so it doesn't clobber other leaves
 * that may have optimistically changed (and possibly already saved) while
 * this one was in flight — same pattern as CategoryNav's inline rename, with
 * the serialize/per-leaf-rollback refinement DRO-195's review called for.
 *
 * The parent page passes `key={envelope.updated_at}` (see page.tsx) so this
 * component fully remounts — and resyncs `useState(initialBody)` — whenever
 * the stored body changes server-side, e.g. after Regenerate.
 */
export function EnvelopeBodyView({ envelopeId, body: initialBody, citationLabels }: EnvelopeBodyViewProps) {
  const [body, setBody] = useState(initialBody)
  const patchQueueRef = useRef<Promise<void>>(Promise.resolve())

  function persistLeafUpdate(
    sectionIndex: number,
    itemIndex: number,
    computeNext: (leaf: EnvelopeLeaf) => { nextLeaf: EnvelopeLeaf; payload: LeafPatchPayload },
  ) {
    let previousLeaf: EnvelopeLeaf | undefined
    let payload: LeafPatchPayload | undefined

    setBody((current) => {
      const section = current.sections[sectionIndex]
      if (!section || section.type === 'table') return current
      const leaf = section.items[itemIndex]
      if (!leaf) return current
      previousLeaf = leaf
      const computed = computeNext(leaf)
      payload = computed.payload
      return updateEnvelopeLeaf(current, sectionIndex, itemIndex, () => computed.nextLeaf) ?? current
    })

    const task = async () => {
      if (!previousLeaf || !payload) return
      try {
        const res = await fetch(`/api/envelopes/${envelopeId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sectionIndex, itemIndex, ...payload }),
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.error ?? 'Failed to save')
        }
      } catch (err) {
        const restoreLeaf = previousLeaf
        setBody((current) => updateEnvelopeLeaf(current, sectionIndex, itemIndex, () => restoreLeaf) ?? current)
        toast({
          title: payload?.action === 'toggle' ? "Couldn't update that item" : "Couldn't save your edit",
          description: err instanceof Error ? err.message : undefined,
          variant: 'destructive',
        })
      }
    }

    // Chain onto the queue rather than firing immediately, so this PATCH only
    // starts once every earlier one has settled — the server does a
    // read-modify-write on the whole `body` column, so two in-flight PATCHes
    // for the same envelope would otherwise race and the second write could
    // silently discard the first leaf's change.
    patchQueueRef.current = patchQueueRef.current.then(task)
  }

  function handleToggle(sectionIndex: number, itemIndex: number) {
    persistLeafUpdate(sectionIndex, itemIndex, (leaf) => {
      const checked = !leaf.checked
      return { nextLeaf: { ...leaf, checked }, payload: { action: 'toggle', checked } }
    })
  }

  function handleEditText(sectionIndex: number, itemIndex: number, text: string) {
    persistLeafUpdate(sectionIndex, itemIndex, (leaf) => ({
      nextLeaf: { ...leaf, text, edited: true },
      payload: { action: 'edit', text },
    }))
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
