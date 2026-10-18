'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import type { EnvelopeBody, EnvelopeLeaf } from '@drop-note/shared'
import { countEnvelopeChecklistProgress, updateEnvelopeLeaf } from '@drop-note/shared'
import { EnvelopeLeafRow, type CitationLabels } from './EnvelopeLeafRow'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

interface EnvelopeBodyViewProps {
  envelopeId: string
  body: EnvelopeBody
  citationLabels: CitationLabels
}

type LeafPatchPayload = { action: 'toggle'; checked: boolean } | { action: 'edit'; text: string }

/**
 * Renders checklist + list + notes + table blocks. List renders like a
 * checklist without the checkbox bullet. Table (DRO-196) renders read-only —
 * citations and the from_item/suggested marker still show per cell, but
 * cells aren't editable/tickable: there's no leaf address scheme for "row R,
 * column C" in updateEnvelopeLeaf, so PATCH/edit stays checklist/list/notes-only.
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
            <section key={i} className="overflow-hidden rounded-xl border-stroke border-ink bg-card shadow-ink-lg">
              {block.heading && (
                <h2 className="border-b border-border px-4 py-2.5 text-[15px] font-semibold text-foreground">
                  {block.heading}
                </h2>
              )}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted">
                    <tr>
                      {block.columns.map((column, c) => (
                        <th key={c} className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground">
                          {column}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {block.rows.map((row, r) => (
                      <tr key={r} className="hover:bg-accent/50">
                        {row.map((leaf, c) => (
                          <EnvelopeTableCell key={c} leaf={leaf} citationLabels={citationLabels} />
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
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

/**
 * One <td> for a table block (DRO-196). Mirrors EnvelopeLeafRow's citation
 * chip / "suggested" dashed-marker / missing-note treatment so a table cell
 * reads as the same kind of leaf as a checklist/list line, just laid out
 * inline instead of as a bulleted row — there's no edit affordance here
 * (see the component doc comment above).
 */
function EnvelopeTableCell({ leaf, citationLabels }: { leaf: EnvelopeLeaf; citationLabels: CitationLabels }) {
  return (
    <td className="px-4 py-2 align-top">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span
          aria-hidden="true"
          className={cn(
            'h-2 w-2 shrink-0 rounded-full border-stroke border-ink',
            leaf.confidence === 'suggested' && 'border-dashed',
          )}
        />
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
    </td>
  )
}
