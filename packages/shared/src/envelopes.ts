// packages/shared/src/envelopes.ts
//
// Envelopes v1 slice 1 (DRO-193): zod schema for the AI-generated envelope body,
// the prompt builder, and the server-side citation enforcement that strips any
// sourceItemIds the model cites that don't actually belong to this envelope.
//
// Deliberately exports a parse wrapper (parseEnvelopeBody) rather than the zod
// schema's raw safeParse so callers in apps/web never need to import zod
// themselves — only packages/shared depends on it directly.

import { z } from 'zod'

export const PURPOSE_HINTS = ['weekend_plan', 'shopping_list', 'day_route', 'next_steps'] as const
export type PurposeHint = (typeof PURPOSE_HINTS)[number]

export const ENVELOPE_TEXT_MAX_LENGTH = 500
export const ENVELOPE_MIN_ITEMS = 2
export const ENVELOPE_MAX_ITEMS = 8

/** The 4 purpose chips (AIRMAIL purpose step, DRO-193): each pre-fills the free-text box. */
export const ENVELOPE_PURPOSE_CHIPS: ReadonlyArray<{ hint: PurposeHint; label: string; prefill: string }> = [
  { hint: 'weekend_plan', label: 'Weekend plan', prefill: 'Make a weekend plan from these' },
  { hint: 'shopping_list', label: 'Shopping list', prefill: 'Make a shopping list from these' },
  { hint: 'day_route', label: 'Day route', prefill: 'Plan a day route from these' },
  { hint: 'next_steps', label: 'Next steps', prefill: 'What are my next steps for these' },
]

const PurposeHintSchema = z.enum(PURPOSE_HINTS)

export const EnvelopeIntentInputSchema = z.object({
  text: z.string().trim().min(1).max(ENVELOPE_TEXT_MAX_LENGTH),
  purposeHint: PurposeHintSchema.nullable(),
})
export type EnvelopeIntentInput = z.infer<typeof EnvelopeIntentInputSchema>

// Every leaf item in every block shape carries the same citation contract, so
// citation enforcement (see enforceEnvelopeCitations below) can walk all block
// types uniformly.
//
// `checked` and `edited` (DRO-195) are never set by the AI provider — they're
// added/flipped only by updateEnvelopeLeaf, once a leaf already exists in a
// stored envelope. They default to false/absent on a freshly generated body.
const EnvelopeLeafSchema = z.object({
  text: z.string().min(1),
  sourceItemIds: z.array(z.string()),
  confidence: z.enum(['from_item', 'suggested']),
  missing: z.string().optional(),
  checked: z.boolean().optional(),
  edited: z.boolean().optional(),
})
export type EnvelopeLeaf = z.infer<typeof EnvelopeLeafSchema>

const ChecklistBlockSchema = z.object({
  type: z.literal('checklist'),
  heading: z.string().optional(),
  items: z.array(EnvelopeLeafSchema).min(1),
})

const ListBlockSchema = z.object({
  type: z.literal('list'),
  heading: z.string().optional(),
  items: z.array(EnvelopeLeafSchema).min(1),
})

// Full table rendering is DRO-196 — this arm only needs to parse so the model
// isn't forced into checklist/notes shapes it doesn't fit; the envelope page
// doesn't render it yet.
const TableBlockSchema = z.object({
  type: z.literal('table'),
  heading: z.string().optional(),
  columns: z.array(z.string()).min(1),
  rows: z.array(z.array(EnvelopeLeafSchema).min(1)).min(1),
})

// The free-text fallback shape: never has a heading (see buildEnvelopeSystemPrompt).
// .strict() so a stray "heading" key is a validation failure, not silently dropped.
const NotesBlockSchema = z
  .object({
    type: z.literal('notes'),
    items: z.array(EnvelopeLeafSchema).min(1),
  })
  .strict()

export const EnvelopeBlockSchema = z.discriminatedUnion('type', [
  ChecklistBlockSchema,
  ListBlockSchema,
  TableBlockSchema,
  NotesBlockSchema,
])
export type EnvelopeBlock = z.infer<typeof EnvelopeBlockSchema>
export type ChecklistBlock = z.infer<typeof ChecklistBlockSchema>
export type ListBlock = z.infer<typeof ListBlockSchema>
export type TableBlock = z.infer<typeof TableBlockSchema>
export type NotesBlock = z.infer<typeof NotesBlockSchema>

export const EnvelopeBodySchema = z.object({
  sections: z.array(EnvelopeBlockSchema).min(1),
})
export type EnvelopeBody = z.infer<typeof EnvelopeBodySchema>

export type ParseEnvelopeBodyResult =
  | { success: true; data: EnvelopeBody }
  | { success: false; error: string }

/**
 * Parses + validates a raw (already JSON.parse'd) AI response against the
 * envelope body shape. Also rejects a table block whose row doesn't have
 * exactly one cell per column — the zod union can't express that
 * cross-field check (a `.refine()` on a union member isn't a plain
 * `ZodObject` anymore, which `discriminatedUnion` requires), so it's
 * enforced here instead, before a misaligned row ever reaches the renderer.
 */
export function parseEnvelopeBody(raw: unknown): ParseEnvelopeBodyResult {
  const result = EnvelopeBodySchema.safeParse(raw)
  if (!result.success) return { success: false, error: result.error.message }

  for (const block of result.data.sections) {
    if (block.type === 'table' && block.rows.some((row) => row.length !== block.columns.length)) {
      return { success: false, error: 'table row cell count must match column count' }
    }
  }

  return { success: true, data: result.data }
}

/**
 * Server-side citation enforcement (load-bearing, not optional — DRO-193).
 * Any sourceItemIds the model cites that aren't in `allowedItemIds` (this
 * envelope's own items) are stripped, and that leaf's confidence is
 * force-downgraded to "suggested" — even if the model claimed "from_item".
 * Returns `stripped: true` if anything was altered, so the caller can mark
 * the envelope "partial" instead of "done".
 */
export function enforceEnvelopeCitations(
  body: EnvelopeBody,
  allowedItemIds: ReadonlySet<string> | readonly string[],
): { body: EnvelopeBody; stripped: boolean } {
  const allowed = allowedItemIds instanceof Set ? allowedItemIds : new Set(allowedItemIds)
  let stripped = false

  function fixLeaf(leaf: EnvelopeLeaf): EnvelopeLeaf {
    const kept = leaf.sourceItemIds.filter((id) => allowed.has(id))
    // "from_item" with no surviving citation is just as untrustworthy as a
    // leaf whose citations got stripped — a model claiming "grounded" while
    // citing nothing must not pass through as verified.
    const uncitedButClaimedFromItem = leaf.confidence === 'from_item' && kept.length === 0
    if (kept.length === leaf.sourceItemIds.length && !uncitedButClaimedFromItem) return leaf
    stripped = true
    return { ...leaf, sourceItemIds: kept, confidence: 'suggested' }
  }

  const sections: EnvelopeBlock[] = body.sections.map((block) => {
    if (block.type === 'table') {
      return { ...block, rows: block.rows.map((row) => row.map(fixLeaf)) }
    }
    return { ...block, items: block.items.map(fixLeaf) }
  })

  return { body: { sections }, stripped }
}

/**
 * Applies `updater` to a single leaf addressed by section/item index
 * (DRO-195: tick/edit persistence). Returns null if either index is out of
 * range or the section is a table block — table rows aren't editable yet
 * (DRO-196), so there's no leaf to address at `itemIndex` there.
 */
export function updateEnvelopeLeaf(
  body: EnvelopeBody,
  sectionIndex: number,
  itemIndex: number,
  updater: (leaf: EnvelopeLeaf) => EnvelopeLeaf,
): EnvelopeBody | null {
  const section = body.sections[sectionIndex]
  if (!section || section.type === 'table') return null
  if (!section.items[itemIndex]) return null

  const sections = body.sections.map((block, i) => {
    if (i !== sectionIndex || block.type === 'table') return block
    return { ...block, items: block.items.map((leaf, j) => (j === itemIndex ? updater(leaf) : leaf)) }
  })
  return { sections }
}

/** Checklist tick progress across all checklist blocks (DRO-195) — the "X/Y done" count on the envelope page. List/notes/table leaves don't count: only checklist blocks render a checkbox. */
export function countEnvelopeChecklistProgress(body: EnvelopeBody): { checked: number; total: number } {
  let checked = 0
  let total = 0
  for (const block of body.sections) {
    if (block.type !== 'checklist') continue
    for (const leaf of block.items) {
      total += 1
      if (leaf.checked) checked += 1
    }
  }
  return { checked, total }
}

/**
 * Compact display title for an envelope list/nav row (DRO-223). The quoted
 * free text is shown separately as the intent line (see the envelope detail
 * page and the /envelopes list), so this only surfaces the purpose chip's
 * label — falling back to a generic name when no chip was tapped, rather
 * than repeating a truncated copy of the intent text.
 */
export function getEnvelopeTitle(intentInput: Pick<EnvelopeIntentInput, 'purposeHint'>): string {
  const chip = intentInput.purposeHint
    ? ENVELOPE_PURPOSE_CHIPS.find((c) => c.hint === intentInput.purposeHint)
    : undefined
  return chip?.label ?? 'Plan'
}

/**
 * Appended to the regenerate prompt (DRO-195) so the AI sees what the user
 * already checked off or edited by hand, and is asked to preserve it where
 * it still fits. This is a prompt hint, not a structural merge: a
 * regeneration can reshape sections entirely, so there's nothing stable on
 * the old body to merge field-by-field onto the new one. Untouched leaves
 * are omitted to keep the hint short and signal-only. Table rows are
 * skipped — tables aren't editable yet (DRO-196).
 */
export function buildEnvelopeRegenerationContext(previousBody: EnvelopeBody): string {
  const lines: string[] = []
  for (const block of previousBody.sections) {
    if (block.type === 'table') continue
    for (const leaf of block.items) {
      if (!leaf.checked && !leaf.edited) continue
      const marks = [leaf.checked ? 'checked off' : null, leaf.edited ? 'edited by the user' : null]
        .filter((mark): mark is string => mark !== null)
        .join(', ')
      lines.push(`- "${leaf.text}" (${marks})`)
    }
  }
  if (lines.length === 0) return ''

  return [
    '',
    'The user already has a previous version of this plan and has made these manual changes to it:',
    ...lines,
    'Preserve their checked-off and edited lines where they still fit the request below; otherwise regenerate freely.',
  ].join('\n')
}

/**
 * Strips any `checked`/`edited` the AI provider may have set on a freshly
 * parsed body (DRO-195). The schema comment on EnvelopeLeafSchema says these
 * fields are never set by the model, but that's only a convention the schema
 * doesn't enforce — a model response could still include them, which would
 * let the AI claim a line "done" without the user actually checking it off.
 * Call this on every fresh generation/regeneration result before it's stored
 * or merged with carryForwardEnvelopeProgress below.
 */
export function stripEnvelopeProgressFields(body: EnvelopeBody): EnvelopeBody {
  function strip(leaf: EnvelopeLeaf): EnvelopeLeaf {
    if (leaf.checked === undefined && leaf.edited === undefined) return leaf
    return {
      text: leaf.text,
      sourceItemIds: leaf.sourceItemIds,
      confidence: leaf.confidence,
      missing: leaf.missing,
    }
  }
  const sections: EnvelopeBlock[] = body.sections.map((block) => {
    if (block.type === 'table') return { ...block, rows: block.rows.map((row) => row.map(strip)) }
    return { ...block, items: block.items.map(strip) }
  })
  return { sections }
}

function normalizeLeafTextForProgressMatch(text: string): string {
  return text.trim().replace(/\s+/g, ' ').toLowerCase()
}

/**
 * Carries `checked`/`edited` forward from `previousBody` onto `freshBody`'s
 * leaves after a regenerate (DRO-195), so a regeneration doesn't silently
 * reset the user's progress to 0/N. `freshBody` must already have had any
 * model-supplied checked/edited stripped (stripEnvelopeProgressFields) —
 * this is the only source of truth for those fields on the result.
 *
 * Matches leaves by normalized (trimmed/collapsed/lowercased) text, first
 * -unclaimed-match-wins, since a regeneration can reorder or reshape
 * sections entirely and there's nothing structurally stable to key on
 * otherwise. Table rows are left untouched (not editable yet, DRO-196).
 */
export function carryForwardEnvelopeProgress(freshBody: EnvelopeBody, previousBody: EnvelopeBody): EnvelopeBody {
  const previousLeaves: EnvelopeLeaf[] = []
  for (const block of previousBody.sections) {
    if (block.type === 'table') continue
    for (const leaf of block.items) {
      if (leaf.checked || leaf.edited) previousLeaves.push(leaf)
    }
  }
  if (previousLeaves.length === 0) return freshBody

  const claimed = new Set<number>()
  function claim(leaf: EnvelopeLeaf): EnvelopeLeaf {
    const normalized = normalizeLeafTextForProgressMatch(leaf.text)
    const matchIndex = previousLeaves.findIndex(
      (prev, i) => !claimed.has(i) && normalizeLeafTextForProgressMatch(prev.text) === normalized,
    )
    if (matchIndex === -1) return leaf
    claimed.add(matchIndex)
    const match = previousLeaves[matchIndex]
    return { ...leaf, checked: match.checked, edited: match.edited }
  }

  const sections: EnvelopeBlock[] = freshBody.sections.map((block) => {
    if (block.type === 'table') return block
    return { ...block, items: block.items.map(claim) }
  })
  return { sections }
}

export interface EnvelopeSourceItem {
  id: string
  subject: string | null
  aiSummary: string | null
  sourceUrl: string | null
  sourceType: string | null
  notes: string | null
  categoryName: string | null
}

const PURPOSE_HINT_PROMPT_LINES: Record<PurposeHint, string> = {
  weekend_plan:
    'The "Weekend plan" chip was tapped: when the free text does not say otherwise, favor a checklist organized by day or activity for a weekend.',
  shopping_list:
    'The "Shopping list" chip was tapped: when the free text does not say otherwise, favor a flat checklist of things to buy or get.',
  day_route:
    'The "Day route" chip was tapped: when the free text does not say otherwise, favor a checklist ordered as stops/steps for a single day, in a sensible visiting order.',
  next_steps:
    'The "Next steps" chip was tapped: when the free text does not say otherwise, favor a checklist of concrete follow-up actions the user should take.',
}

/** The fixed instruction block sent as the system message to the AI provider. */
export function buildEnvelopeSystemPrompt(): string {
  return `You are an assistant that turns a handful of saved items into a single useful document for the user.

Respond ONLY with a JSON object of this exact shape:
{ "sections": [ <block>, <block>, ... ] }

Each <block> is EXACTLY ONE of these shapes (pick whichever fits the request best):
- Checklist: { "type": "checklist", "heading": "optional string", "items": [ <leaf>, ... ] }
- List: { "type": "list", "heading": "optional string", "items": [ <leaf>, ... ] }
- Table: { "type": "table", "heading": "optional string", "columns": ["string", ...], "rows": [ [ <leaf>, ... ], ... ] } — each row is an array of leaves with exactly one leaf per column, in the same order as "columns".
- Notes: { "type": "notes", "items": [ <leaf>, ... ] } — never include "heading" on a notes block.

Every <leaf> is: { "text": "string", "sourceItemIds": ["..."], "confidence": "from_item" | "suggested", "missing": "optional string" } — this applies to every leaf everywhere, including each cell inside a table row.
- "sourceItemIds" lists the id(s) (from the items given below) that this line is based on. Use [] if it isn't based on a specific item.
- "confidence" is "from_item" only when the line is directly supported by the content of a cited item; otherwise use "suggested".
- "missing" is an optional short note naming information the user would need to supply (e.g. a date, a quantity) that isn't in the cited items.

Use a "checklist" or "list" block when the request maps naturally onto one. Use a "table" block when the request calls for a side-by-side comparison across several items (e.g. "compare these 3 recipes" or "which of these has the best reviews") — each column is a point of comparison and each row is one of the things being compared. If the request is open-ended, conversational, or doesn't fit a checklist/list/table (e.g. "what do you think of these" or "summarize these"), respond with a single "notes" block instead — do NOT force a checklist shape onto content that doesn't fit one.

Only use items ids that are given to you below. Never invent an item id.`
}

/** The per-request user message: the source items, the purpose hint (if any), and the free text. Free text always wins over the hint when they'd suggest a different shape. */
export function buildEnvelopeUserPrompt(
  items: EnvelopeSourceItem[],
  text: string,
  purposeHint: PurposeHint | null,
): string {
  const itemsBlock = items
    .map((item, i) => {
      const lines = [
        `Item ${i + 1} (id: ${item.id})`,
        item.subject ? `  subject: ${item.subject}` : null,
        item.categoryName ? `  category: ${item.categoryName}` : null,
        item.sourceType ? `  source type: ${item.sourceType}` : null,
        item.sourceUrl ? `  source url: ${item.sourceUrl}` : null,
        item.aiSummary ? `  summary: ${item.aiSummary}` : null,
        item.notes ? `  user notes: ${item.notes}` : null,
      ].filter((line): line is string => line !== null)
      return lines.join('\n')
    })
    .join('\n\n')

  const hintLine = purposeHint ? PURPOSE_HINT_PROMPT_LINES[purposeHint] : null

  return [
    'Items:',
    itemsBlock,
    '',
    hintLine,
    '',
    `The user's request (this always wins over the hint above when they point to a different shape): "${text}"`,
  ]
    .filter((line): line is string => line !== null)
    .join('\n')
}

/** Appended to the user prompt on the one allowed retry after a zod validation failure. */
export function appendValidationRetryNote(userPrompt: string, validationError: string): string {
  return `${userPrompt}\n\nYour previous response did not match the required JSON shape. Validation error: ${validationError}\nRespond again with ONLY a corrected JSON object matching the shape described in the system message.`
}
