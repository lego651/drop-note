'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { Plus, X } from 'lucide-react'
import type { EnvelopeBlock, EnvelopeBody, EnvelopeLeaf } from '@drop-note/shared'
import {
  ENVELOPE_TEXT_MAX_LENGTH,
  countEnvelopeChecklistProgress,
  createUserLeaf,
  deleteEnvelopeItem,
  updateEnvelopeLeaf,
} from '@drop-note/shared'
import { EnvelopeLeafRow, type CitationLabels } from './EnvelopeLeafRow'
import { toast } from '@/hooks/use-toast'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { cn } from '@/lib/utils'

interface EnvelopeBodyViewProps {
  envelopeId: string
  body: EnvelopeBody
  citationLabels: CitationLabels
}

type LeafPatchPayload = { action: 'toggle'; checked: boolean } | { action: 'edit'; text: string }
type NewSectionBlockType = 'checklist' | 'list' | 'notes'

/**
 * Renders checklist + list + notes + table blocks, and the extensibility
 * controls on top of them (DRO-232): an inline "+ Add item"/"+ Add row" row
 * at the end of every section, a delete control on every leaf/row, and a
 * "+ Add section" control at the end of the whole plan. List renders like a
 * checklist without the checkbox bullet.
 *
 * Ticking a checklist item, editing a leaf's text, or adding/deleting a
 * line/section (DRO-195, extended DRO-232) is optimistic: local state
 * updates immediately, then PATCHes /api/envelopes/[id]. PATCHes are
 * serialized through `patchQueueRef` (one in flight at a time) so a burst of
 * rapid edits can't race each other's read-modify-write on the server.
 * Toggle/edit roll back only the one leaf they touched (via `previousLeaf`).
 * Add/delete roll back by object reference (the exact leaf/row/section just
 * added) or by re-splicing the exact leaf/row just removed back in — so a
 * failed add/delete can't accidentally undo a different, unrelated
 * optimistic change to the same section that happened to be queued around
 * it, the same "don't clobber a sibling's state" guarantee DRO-195 applies
 * to toggle/edit.
 *
 * The parent page passes `key={envelope.updated_at}` (see page.tsx) so this
 * component fully remounts — and resyncs `useState(initialBody)` — whenever
 * the stored body changes server-side, e.g. after Regenerate.
 */
export function EnvelopeBodyView({ envelopeId, body: initialBody, citationLabels }: EnvelopeBodyViewProps) {
  const [body, setBody] = useState(initialBody)
  const patchQueueRef = useRef<Promise<void>>(Promise.resolve())
  const [isAddingSection, setIsAddingSection] = useState(false)

  function enqueue(task: () => Promise<void>) {
    // Chain onto the queue rather than firing immediately, so this PATCH only
    // starts once every earlier one has settled — the server does a
    // read-modify-write on the whole `body` column, so two in-flight PATCHes
    // for the same envelope would otherwise race and the second write could
    // silently discard the first one's change.
    patchQueueRef.current = patchQueueRef.current.then(task)
  }

  async function sendPatch(payload: Record<string, unknown>): Promise<unknown> {
    const res = await fetch(`/api/envelopes/${envelopeId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error ?? 'Failed to save')
    }
    return res.json()
  }

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

    enqueue(async () => {
      if (!previousLeaf || !payload) return
      try {
        await sendPatch({ sectionIndex, itemIndex, ...payload })
      } catch (err) {
        const restoreLeaf = previousLeaf
        setBody((current) => updateEnvelopeLeaf(current, sectionIndex, itemIndex, () => restoreLeaf) ?? current)
        toast({
          title: payload?.action === 'toggle' ? "Couldn't update that item" : "Couldn't save your edit",
          description: err instanceof Error ? err.message : undefined,
          variant: 'destructive',
        })
      }
    })
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

  function handleAddItem(sectionIndex: number, text: string) {
    const newLeaf = createUserLeaf(text)
    setBody((current) => addEnvelopeItemWithLeaf(current, sectionIndex, newLeaf) ?? current)

    enqueue(async () => {
      try {
        await sendPatch({ action: 'addItem', sectionIndex, text })
      } catch (err) {
        setBody((current) => removeLeafByReference(current, sectionIndex, newLeaf))
        toast({ title: "Couldn't add that line", description: err instanceof Error ? err.message : undefined, variant: 'destructive' })
      }
    })
  }

  function handleAddRow(sectionIndex: number, cellTexts: string[]) {
    const newRow = cellTexts.map((text) => createUserLeaf(text))
    setBody((current) => addEnvelopeRowWithRow(current, sectionIndex, newRow) ?? current)

    enqueue(async () => {
      try {
        await sendPatch({ action: 'addRow', sectionIndex, cells: cellTexts })
      } catch (err) {
        setBody((current) => removeRowByReference(current, sectionIndex, newRow))
        toast({ title: "Couldn't add that row", description: err instanceof Error ? err.message : undefined, variant: 'destructive' })
      }
    })
  }

  function handleDeleteItem(sectionIndex: number, itemIndex: number) {
    const section = body.sections[sectionIndex]
    if (!section) return

    // deleteEnvelopeItem (packages/shared) returns null for the one line/row
    // left anywhere in the plan — removing it would leave zero sections,
    // which parseEnvelopeBody rejects. Check that up front, synchronously,
    // rather than optimistically removing it and then re-inserting it once
    // the (never-sent) PATCH "fails" — that race would double it up.
    if (!deleteEnvelopeItem(body, sectionIndex, itemIndex)) {
      toast({ title: "Can't remove the last line", description: 'A plan needs at least one line.' })
      return
    }

    if (section.type === 'table') {
      const removedRow = section.rows[itemIndex]
      setBody((current) => deleteEnvelopeItem(current, sectionIndex, itemIndex) ?? current)
      enqueue(async () => {
        try {
          await sendPatch({ action: 'deleteItem', sectionIndex, itemIndex })
        } catch (err) {
          if (removedRow) setBody((current) => reinsertEnvelopeTableRow(current, sectionIndex, itemIndex, removedRow))
          toast({ title: "Couldn't remove that row", description: err instanceof Error ? err.message : undefined, variant: 'destructive' })
        }
      })
      return
    }

    const removedLeaf = section.items[itemIndex]
    setBody((current) => deleteEnvelopeItem(current, sectionIndex, itemIndex) ?? current)
    enqueue(async () => {
      try {
        await sendPatch({ action: 'deleteItem', sectionIndex, itemIndex })
      } catch (err) {
        if (removedLeaf) setBody((current) => reinsertEnvelopeItem(current, sectionIndex, itemIndex, removedLeaf))
        toast({ title: "Couldn't remove that line", description: err instanceof Error ? err.message : undefined, variant: 'destructive' })
      }
    })
  }

  function handleAddSection(blockType: NewSectionBlockType, heading: string | undefined, firstItemText: string) {
    const newSection: EnvelopeBlock =
      blockType === 'notes' ? { type: 'notes', items: [createUserLeaf(firstItemText)] } : { type: blockType, heading, items: [createUserLeaf(firstItemText)] }

    setBody((current) => ({ sections: [...current.sections, newSection] }))
    setIsAddingSection(false)

    enqueue(async () => {
      try {
        await sendPatch({ action: 'addSection', blockType, heading, text: firstItemText })
      } catch (err) {
        setBody((current) => ({ sections: current.sections.filter((block) => block !== newSection) }))
        toast({ title: "Couldn't add that section", description: err instanceof Error ? err.message : undefined, variant: 'destructive' })
      }
    })
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
                      <th className="px-4 py-2" aria-hidden="true" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {block.rows.map((row, r) => (
                      <tr key={r} className="hover:bg-accent/50">
                        {row.map((leaf, c) => (
                          <EnvelopeTableCell key={c} leaf={leaf} citationLabels={citationLabels} />
                        ))}
                        <td className="py-3.5 pl-2 pr-[14px] align-top">
                          <button
                            type="button"
                            onClick={() => handleDeleteItem(i, r)}
                            aria-label="Remove this row"
                            className={cn(
                              'relative flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground',
                              // DRO-241: cell is py-3.5 (14px) around the 16px icon, so a
                              // uniform 14px inset gives a 44×44 hit area that stays inside
                              // this cell's own padding box — the right inset lines up with
                              // pr-[14px] exactly, so it can't overflow the table and force a
                              // horizontal scrollbar.
                              "after:absolute after:-inset-[14px] after:content-['']",
                              'hover:text-destructive-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                            )}
                          >
                            <X size={12} aria-hidden="true" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <AddTableRowForm columns={block.columns} onAdd={(cells) => handleAddRow(i, cells)} />
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
                  onDelete={() => handleDeleteItem(i, j)}
                />
              ))}
            </ul>
            <AddItemRow onAdd={(text) => handleAddItem(i, text)} />
          </section>
        )
      })}

      {isAddingSection ? (
        <AddSectionForm onAdd={handleAddSection} onCancel={() => setIsAddingSection(false)} />
      ) : (
        <button
          type="button"
          onClick={() => setIsAddingSection(true)}
          className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border-stroke border-dashed border-ink/40 bg-card py-3 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        >
          <Plus size={15} aria-hidden="true" />
          Add section
        </button>
      )}
    </div>
  )
}

// --- Client-side structural helpers (DRO-232) -------------------------------
//
// These mirror the shared addEnvelopeItem/addEnvelopeTableRow pure functions
// but insert/remove the exact leaf/row *object reference* the caller already
// built, rather than constructing a fresh one from text. That lets a failed
// PATCH's rollback remove precisely the leaf/row this call added — by
// reference, not by index or text match — so it can't accidentally remove a
// different leaf a concurrently-queued (but locally already-applied, since
// setBody runs synchronously on click) add/delete put at the same spot.

function addEnvelopeItemWithLeaf(body: EnvelopeBody, sectionIndex: number, leaf: EnvelopeLeaf): EnvelopeBody | null {
  const section = body.sections[sectionIndex]
  if (!section || section.type === 'table') return null
  return {
    sections: body.sections.map((block, i) =>
      i !== sectionIndex || block.type === 'table' ? block : { ...block, items: [...block.items, leaf] },
    ),
  }
}

function removeLeafByReference(body: EnvelopeBody, sectionIndex: number, leaf: EnvelopeLeaf): EnvelopeBody {
  return {
    sections: body.sections.map((block, i) =>
      i !== sectionIndex || block.type === 'table' ? block : { ...block, items: block.items.filter((item) => item !== leaf) },
    ),
  }
}

function addEnvelopeRowWithRow(body: EnvelopeBody, sectionIndex: number, row: EnvelopeLeaf[]): EnvelopeBody | null {
  const section = body.sections[sectionIndex]
  if (!section || section.type !== 'table') return null
  return {
    sections: body.sections.map((block, i) =>
      i !== sectionIndex || block.type !== 'table' ? block : { ...block, rows: [...block.rows, row] },
    ),
  }
}

function removeRowByReference(body: EnvelopeBody, sectionIndex: number, row: EnvelopeLeaf[]): EnvelopeBody {
  return {
    sections: body.sections.map((block, i) =>
      i !== sectionIndex || block.type !== 'table' ? block : { ...block, rows: block.rows.filter((r) => r !== row) },
    ),
  }
}

function reinsertEnvelopeItem(body: EnvelopeBody, sectionIndex: number, itemIndex: number, leaf: EnvelopeLeaf): EnvelopeBody {
  const section = body.sections[sectionIndex]
  if (!section || section.type === 'table') return body
  return {
    sections: body.sections.map((block, i) => {
      if (i !== sectionIndex || block.type === 'table') return block
      const items = [...block.items]
      items.splice(Math.min(itemIndex, items.length), 0, leaf)
      return { ...block, items }
    }),
  }
}

function reinsertEnvelopeTableRow(body: EnvelopeBody, sectionIndex: number, rowIndex: number, row: EnvelopeLeaf[]): EnvelopeBody {
  const section = body.sections[sectionIndex]
  if (!section || section.type !== 'table') return body
  return {
    sections: body.sections.map((block, i) => {
      if (i !== sectionIndex || block.type !== 'table') return block
      const rows = [...block.rows]
      rows.splice(Math.min(rowIndex, rows.length), 0, row)
      return { ...block, rows }
    }),
  }
}

/**
 * One <td> for a table block (DRO-196). Mirrors EnvelopeLeafRow's citation
 * chip / "suggested" dashed-marker / missing-note treatment so a table cell
 * reads as the same kind of leaf as a checklist/list line, just laid out
 * inline instead of as a bulleted row — there's no per-cell edit affordance
 * (DRO-232 adds whole-row add/delete instead, see the row delete button and
 * AddTableRowForm above/below).
 */
function EnvelopeTableCell({ leaf, citationLabels }: { leaf: EnvelopeLeaf; citationLabels: CitationLabels }) {
  return (
    <td className="px-4 py-2 align-top">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span
          aria-hidden="true"
          className={cn(
            'h-2 w-2 shrink-0 rounded-full border-stroke border-ink',
            leaf.origin !== 'user' && leaf.confidence === 'suggested' && 'border-dashed',
          )}
        />
        <span className="text-sm text-foreground">{leaf.text}</span>
        {leaf.origin === 'user' ? (
          <span className="inline-flex items-center rounded-full border-stroke border-ink/55 bg-card px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
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
    </td>
  )
}

/**
 * The "+ Add item" row at the end of a checklist/list/notes block (DRO-232).
 * Collapsed to a dashed button until clicked; Enter commits and clears the
 * input (staying open, ready for the next line, per the ticket's "keeps the
 * input open for the next one"); Esc collapses back to the button.
 */
function AddItemRow({ onAdd }: { onAdd: (text: string) => void }) {
  const [isOpen, setIsOpen] = useState(false)
  const [value, setValue] = useState('')

  function commit() {
    const trimmed = value.trim()
    if (!trimmed) return
    onAdd(trimmed)
    setValue('')
  }

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="mt-1 flex min-h-11 w-full items-center gap-2.5 rounded-[6px] py-1.5 text-left text-sm text-muted-foreground hover:bg-muted/60"
      >
        <span
          aria-hidden="true"
          className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-stroke border-dashed border-ink/40"
        >
          <Plus size={10} aria-hidden="true" />
        </span>
        Add item
      </button>
    )
  }

  return (
    <li className="flex items-start gap-2.5 py-1.5">
      <span
        aria-hidden="true"
        className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-stroke border-dashed border-ink/40"
      >
        <Plus size={10} aria-hidden="true" />
      </span>
      <Input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            commit()
          }
          if (e.key === 'Escape') {
            e.preventDefault()
            setValue('')
            setIsOpen(false)
          }
        }}
        onBlur={() => {
          if (!value.trim()) setIsOpen(false)
        }}
        placeholder="Add a line…"
        maxLength={ENVELOPE_TEXT_MAX_LENGTH}
        className="h-8 min-w-0 flex-1 text-base md:text-sm"
      />
    </li>
  )
}

/** The trailing "+ Add row" form for a table block (DRO-232) — one inline input per column. */
function AddTableRowForm({ columns, onAdd }: { columns: string[]; onAdd: (cells: string[]) => void }) {
  const [isOpen, setIsOpen] = useState(false)
  const [values, setValues] = useState<string[]>(() => columns.map(() => ''))

  function commit() {
    const trimmed = values.map((v) => v.trim())
    if (trimmed.some((v) => v.length === 0)) return
    onAdd(trimmed)
    setValues(columns.map(() => ''))
  }

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="flex min-h-11 w-full items-center justify-center gap-2 border-t border-border py-2.5 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
      >
        <Plus size={13} aria-hidden="true" />
        Add row
      </button>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-2.5">
      {columns.map((column, c) => (
        <Input
          key={c}
          autoFocus={c === 0}
          value={values[c]}
          onChange={(e) => setValues((prev) => prev.map((v, i) => (i === c ? e.target.value : v)))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              commit()
            }
            if (e.key === 'Escape') {
              e.preventDefault()
              setValues(columns.map(() => ''))
              setIsOpen(false)
            }
          }}
          placeholder={column}
          aria-label={column}
          maxLength={ENVELOPE_TEXT_MAX_LENGTH}
          className="h-8 min-w-[7rem] flex-1 text-base md:text-sm"
        />
      ))}
    </div>
  )
}

/** The trailing "+ Add section" form for the whole plan (DRO-232). */
function AddSectionForm({
  onAdd,
  onCancel,
}: {
  onAdd: (blockType: NewSectionBlockType, heading: string | undefined, firstItemText: string) => void
  onCancel: () => void
}) {
  const [blockType, setBlockType] = useState<NewSectionBlockType>('checklist')
  const [heading, setHeading] = useState('')
  const [text, setText] = useState('')

  function commit() {
    const trimmedText = text.trim()
    if (!trimmedText) return
    onAdd(blockType, heading.trim() || undefined, trimmedText)
  }

  return (
    <div className="space-y-3 rounded-xl border-stroke border-ink bg-card p-4 shadow-ink-lg">
      <div className="flex flex-wrap items-center gap-2">
        <NativeSelect
          value={blockType}
          onChange={(e) => setBlockType(e.target.value as NewSectionBlockType)}
          aria-label="Section type"
          className="shrink-0"
        >
          <option value="checklist">Checklist</option>
          <option value="list">List</option>
          <option value="notes">Notes</option>
        </NativeSelect>
        {blockType !== 'notes' && (
          <Input
            value={heading}
            onChange={(e) => setHeading(e.target.value)}
            placeholder="Section heading (optional)"
            maxLength={120}
            className="min-w-0 flex-1 text-base md:text-sm"
          />
        )}
      </div>
      <Input
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            commit()
          }
          if (e.key === 'Escape') {
            e.preventDefault()
            onCancel()
          }
        }}
        placeholder="First line in this section…"
        maxLength={ENVELOPE_TEXT_MAX_LENGTH}
        className="text-base md:text-sm"
      />
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="min-h-11 rounded-[10px] px-3 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={commit}
          disabled={!text.trim()}
          className="min-h-11 rounded-[10px] border-stroke border-ink bg-primary px-4 text-sm font-medium text-primary-foreground shadow-ink-md hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
        >
          Add section
        </button>
      </div>
    </div>
  )
}
