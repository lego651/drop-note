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
//
// `origin: 'user'` (DRO-232) marks a leaf the user typed themselves (via
// addEnvelopeItem/addEnvelopeTableRow/addEnvelopeSection) rather than one the
// AI generated — it's absent on every AI leaf. Like checked/edited, the AI
// provider must never set it (see stripEnvelopeProgressFields), so the model
// can't forge a user-authored line. The `.refine` below is the "accept empty
// sourceItemIds only when origin === 'user'" rule (DRO-232): a leaf claiming
// "from_item" confidence without origin: 'user' must cite at least one item —
// a user leaf never carries a citation at all, so it's exempt.
const EnvelopeLeafSchema = z
  .object({
    text: z.string().min(1),
    sourceItemIds: z.array(z.string()),
    confidence: z.enum(['from_item', 'suggested']),
    missing: z.string().optional(),
    checked: z.boolean().optional(),
    edited: z.boolean().optional(),
    origin: z.enum(['user']).optional(),
  })
  .refine(
    (leaf) => leaf.origin === 'user' || leaf.confidence !== 'from_item' || leaf.sourceItemIds.length > 0,
    { message: 'A leaf with confidence "from_item" must cite at least one source item unless origin is "user"' },
  )
export type EnvelopeLeaf = z.infer<typeof EnvelopeLeafSchema>

/** Builds a fresh user-authored leaf (DRO-232) — no citation, no AI confidence claim. */
export function createUserLeaf(text: string): EnvelopeLeaf {
  return { text, sourceItemIds: [], confidence: 'suggested', origin: 'user' }
}

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

const EnvelopeLeafTextSchema = z.string().trim().min(1).max(ENVELOPE_TEXT_MAX_LENGTH)
const SectionIndexSchema = z.number().int().nonnegative()
const ItemIndexSchema = z.number().int().nonnegative()
const SectionHeadingSchema = z.string().trim().min(1).max(120)

/**
 * The PATCH /api/envelopes/[id] request body (DRO-232 extends the DRO-195
 * toggle/edit actions with explicit structural ops — add/delete/addSection/
 * renameSection — rather than ever accepting a whole-body write from the
 * client). Each variant names exactly the indexes/fields that action needs,
 * so a malformed request is a zod error instead of a runtime index crash.
 */
export const EnvelopePatchRequestSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('toggle'), sectionIndex: SectionIndexSchema, itemIndex: ItemIndexSchema, checked: z.boolean() }),
  z.object({ action: z.literal('edit'), sectionIndex: SectionIndexSchema, itemIndex: ItemIndexSchema, text: EnvelopeLeafTextSchema }),
  z.object({ action: z.literal('addItem'), sectionIndex: SectionIndexSchema, text: EnvelopeLeafTextSchema }),
  z.object({ action: z.literal('addRow'), sectionIndex: SectionIndexSchema, cells: z.array(EnvelopeLeafTextSchema).min(1) }),
  z.object({ action: z.literal('deleteItem'), sectionIndex: SectionIndexSchema, itemIndex: ItemIndexSchema }),
  z.object({
    action: z.literal('addSection'),
    blockType: z.enum(['checklist', 'list', 'notes']),
    heading: SectionHeadingSchema.optional(),
    text: EnvelopeLeafTextSchema,
  }),
  z.object({ action: z.literal('renameSection'), sectionIndex: SectionIndexSchema, heading: SectionHeadingSchema }),
])
export type EnvelopePatchRequest = z.infer<typeof EnvelopePatchRequestSchema>

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

/**
 * Appends a new user-authored leaf (createUserLeaf) to the end of a
 * checklist/list/notes section's items (DRO-232 — "Add a line to any
 * section"). Returns null if sectionIndex is out of range or the section is
 * a table block (use addEnvelopeTableRow for those).
 */
export function addEnvelopeItem(body: EnvelopeBody, sectionIndex: number, text: string): EnvelopeBody | null {
  const section = body.sections[sectionIndex]
  if (!section || section.type === 'table') return null

  const sections = body.sections.map((block, i) =>
    i !== sectionIndex || block.type === 'table' ? block : { ...block, items: [...block.items, createUserLeaf(text)] },
  )
  return { sections }
}

/**
 * Appends a new row of user-authored leaves to a table block (DRO-232), one
 * per column, in column order. Returns null if sectionIndex is out of range,
 * the section isn't a table, or `cellTexts` doesn't have exactly one entry
 * per column — mirrors the row/column-count invariant parseEnvelopeBody
 * enforces on AI-generated table rows.
 */
export function addEnvelopeTableRow(body: EnvelopeBody, sectionIndex: number, cellTexts: string[]): EnvelopeBody | null {
  const section = body.sections[sectionIndex]
  if (!section || section.type !== 'table') return null
  if (cellTexts.length !== section.columns.length) return null

  const newRow = cellTexts.map((text) => createUserLeaf(text))
  const sections = body.sections.map((block, i) =>
    i !== sectionIndex || block.type !== 'table' ? block : { ...block, rows: [...block.rows, newRow] },
  )
  return { sections }
}

/**
 * Removes the leaf at `itemIndex` from a section (DRO-232 — "Delete a line",
 * user-added or AI-generated alike). For a table block, `itemIndex`
 * addresses a whole row (there's no single-cell delete). Returns null if
 * either index is out of range, or if the delete would leave the plan
 * unreadable: every block schema requires at least one item/row
 * (`parseEnvelopeBody` would then reject the stored body), so deleting the
 * last line of a section drops that section entirely instead of leaving an
 * empty `items`/`rows` array, and deleting the very last line anywhere in
 * the plan (the only section has exactly one line left) is rejected outright
 * rather than leaving zero sections.
 */
export function deleteEnvelopeItem(body: EnvelopeBody, sectionIndex: number, itemIndex: number): EnvelopeBody | null {
  const section = body.sections[sectionIndex]
  if (!section) return null

  const lineCount = section.type === 'table' ? section.rows.length : section.items.length
  const targetExists = section.type === 'table' ? Boolean(section.rows[itemIndex]) : Boolean(section.items[itemIndex])
  if (!targetExists) return null

  const sectionBecomesEmpty = lineCount === 1
  if (sectionBecomesEmpty) {
    if (body.sections.length === 1) return null
    return { sections: body.sections.filter((_, i) => i !== sectionIndex) }
  }

  if (section.type === 'table') {
    const sections = body.sections.map((block, i) =>
      i !== sectionIndex || block.type !== 'table'
        ? block
        : { ...block, rows: block.rows.filter((_, r) => r !== itemIndex) },
    )
    return { sections }
  }

  const sections = body.sections.map((block, i) =>
    i !== sectionIndex || block.type === 'table'
      ? block
      : { ...block, items: block.items.filter((_, j) => j !== itemIndex) },
  )
  return { sections }
}

/**
 * Appends a brand-new section to the end of the plan (DRO-232 — "Add a new
 * section"). Always includes exactly one starting user-authored leaf — the
 * block schemas require at least one item, and the client always collects
 * the section's first line as part of creating it, so there's never a
 * window where an empty section would need to round-trip through
 * parseEnvelopeBody. A notes block never carries a heading (schema is
 * `.strict()` about this), so `heading` is dropped entirely for that type.
 */
export function addEnvelopeSection(
  body: EnvelopeBody,
  blockType: 'checklist' | 'list' | 'notes',
  heading: string | undefined,
  firstItemText: string,
): EnvelopeBody {
  const firstItem = createUserLeaf(firstItemText)
  const newSection: EnvelopeBlock =
    blockType === 'notes' ? { type: 'notes', items: [firstItem] } : { type: blockType, heading, items: [firstItem] }
  return { sections: [...body.sections, newSection] }
}

/**
 * Renames a checklist/list/table section's heading (DRO-232, optional).
 * Returns null if sectionIndex is out of range or the section is a notes
 * block — notes blocks never carry a heading (schema `.strict()`).
 */
export function renameEnvelopeSection(body: EnvelopeBody, sectionIndex: number, heading: string): EnvelopeBody | null {
  const section = body.sections[sectionIndex]
  if (!section || section.type === 'notes') return null

  const sections = body.sections.map((block, i) => (i !== sectionIndex ? block : { ...block, heading }))
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
 * Strips any `checked`/`edited`/`origin` the AI provider may have set on a
 * freshly parsed body (DRO-195, extended for `origin` in DRO-232). The
 * schema comments on EnvelopeLeafSchema say these fields are never set by
 * the model, but that's only a convention the schema doesn't enforce — a
 * model response could still include them, which would let the AI claim a
 * line "done", already edited, or (DRO-232) user-authored, without the user
 * actually doing any of that. `origin: 'user'` is load-bearing for the "no
 * citation pill, no suggested marker" treatment and for what regeneration
 * carries forward (carryForwardUserContent) — a model forging it could hide
 * ungrounded content from the citation-enforcement UI entirely. Call this on
 * every fresh generation/regeneration result before it's stored or merged
 * with carryForwardEnvelopeProgress/carryForwardUserContent below.
 */
export function stripEnvelopeProgressFields(body: EnvelopeBody): EnvelopeBody {
  function strip(leaf: EnvelopeLeaf): EnvelopeLeaf {
    if (leaf.checked === undefined && leaf.edited === undefined && leaf.origin === undefined) return leaf
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

/** The heading a carried-forward user leaf lands under when no fresh section shares its old section's heading (DRO-232). */
const USER_ADDITIONS_HEADING = 'Your additions'

/**
 * Key for grouping carried-forward table rows. Two previous tables sharing a
 * heading but not columns (or both headingless with different columns) must
 * stay separate buckets — merging them under one heading-only key would let
 * a later bucket's rows get re-appended to a fresh table whose columns match
 * only the *first* bucket, producing a row with the wrong cell count and an
 * unparseable body (DRO-232 review round 2).
 */
function tableRowsKey(heading: string | null, columns: readonly string[]): string {
  return JSON.stringify([heading, columns])
}

/**
 * Carries the user's own hand-added lines and sections forward across a
 * regenerate (DRO-232), so rewriting a plan never throws away content the
 * AI never saw and so can't reproduce on its own — unlike
 * carryForwardEnvelopeProgress above, which only re-applies checked/edited
 * flags onto AI leaves the fresh generation still produced.
 *
 * For every `origin === 'user'` leaf in `previousBody` — including ones
 * inside a notes block — tries to append it to the freshBody section with
 * the same heading (checklist/list only — a headingless section or a notes
 * block has no stable key to match on and is treated as headingless, i.e.
 * only matches another headingless checklist/list section). A user-added
 * table row (every cell has `origin: 'user'`) tries to land in a fresh table
 * section with the same heading and the exact same columns; otherwise it's
 * flattened into one leaf (cells joined with " — ") like any other leftover.
 * Anything left over — including an entire section the user created from
 * scratch, since every one of its leaves shares that section's
 * now-unmatched heading — is collected into one trailing "Your additions"
 * checklist section.
 */
export function carryForwardUserContent(freshBody: EnvelopeBody, previousBody: EnvelopeBody): EnvelopeBody {
  const byHeading = new Map<string | null, EnvelopeLeaf[]>()
  const tableRowsByHeading = new Map<string, { columns: string[]; rows: EnvelopeLeaf[][] }>()

  for (const block of previousBody.sections) {
    if (block.type === 'table') {
      const heading = block.heading ?? null
      const userRows = block.rows.filter((row) => row.every((leaf) => leaf.origin === 'user'))
      if (userRows.length === 0) continue
      const key = tableRowsKey(heading, block.columns)
      const entry = tableRowsByHeading.get(key) ?? { columns: block.columns, rows: [] }
      entry.rows.push(...userRows)
      tableRowsByHeading.set(key, entry)
      continue
    }

    if (block.type !== 'checklist' && block.type !== 'list' && block.type !== 'notes') continue
    const heading = block.type === 'notes' ? null : block.heading ?? null
    for (const leaf of block.items) {
      if (leaf.origin !== 'user') continue
      const bucket = byHeading.get(heading) ?? []
      bucket.push(leaf)
      byHeading.set(heading, bucket)
    }
  }
  if (byHeading.size === 0 && tableRowsByHeading.size === 0) return freshBody

  const sections: EnvelopeBlock[] = freshBody.sections.map((block) => {
    if (block.type === 'table') {
      const heading = block.heading ?? null
      const key = tableRowsKey(heading, block.columns)
      const entry = tableRowsByHeading.get(key)
      if (!entry) return block
      tableRowsByHeading.delete(key)
      return { ...block, rows: [...block.rows, ...entry.rows] }
    }
    if (block.type !== 'checklist' && block.type !== 'list') return block
    const heading = block.heading ?? null
    const carried = byHeading.get(heading)
    if (!carried) return block
    byHeading.delete(heading)
    return { ...block, items: [...block.items, ...carried] }
  })

  const leftoverTableLines = Array.from(tableRowsByHeading.values()).flatMap((entry) =>
    entry.rows.map((row) => createUserLeaf(row.map((cell) => cell.text).join(' — '))),
  )
  const leftover = [...Array.from(byHeading.values()).flat(), ...leftoverTableLines]
  if (leftover.length > 0) {
    sections.push({ type: 'checklist', heading: USER_ADDITIONS_HEADING, items: leftover })
  }

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

// --- Envelopes "suggest" (DRO-300, Mood Sheet slice 1 of 3): Engine B retrieval ----
//
// POST /api/envelopes/suggest picks 2-8 of the caller's own items to pre-fill an
// envelope from a mood chip or free-text query, instead of requiring a manual
// multi-select. The route's own SQL pre-filter (apps/web/lib/envelopes.ts) narrows
// the caller's library down to a capped candidate set; the schema/prompt/citation
// helpers below are the provider-facing half of that pipeline, mirroring the
// generation pipeline above (buildEnvelopeSystemPrompt / enforceEnvelopeCitations).

/**
 * POST /api/envelopes/suggest request body — `query` has the same 1-500 char
 * bound as EnvelopeIntentInputSchema's `text`. `seedTerms` is bounded too (a
 * mood chip only ever carries a handful of short keywords) —
 * tokenizeEnvelopeSuggestQuery would cap the *tokens* it derives from this at
 * 20 regardless, but an unbounded array/string length here would still mean
 * an unnecessarily large request body.
 */
export const EnvelopeSuggestRequestSchema = z.object({
  query: z.string().trim().min(1).max(ENVELOPE_TEXT_MAX_LENGTH),
  seedTerms: z.array(z.string().max(100)).max(20).optional(),
})
export type EnvelopeSuggestRequest = z.infer<typeof EnvelopeSuggestRequestSchema>

/** A row from the route's SQL pre-filter — stored fields only, never a live fetch (same boundary as EnvelopeSourceItem). */
export interface EnvelopeSuggestCandidateItem {
  id: string
  subject: string | null
  aiSummary: string | null
  sourceType: string | null
  notes: string | null
  categoryName: string | null
  tagNames: string[]
}

const EnvelopeSuggestPickSchema = z.object({
  itemId: z.string().min(1),
  reason: z.string().trim().min(1).max(200),
})
export type EnvelopeSuggestPick = z.infer<typeof EnvelopeSuggestPickSchema>

/** The raw shape the AI provider must return — validated before any candidate-membership check. */
export const EnvelopeSuggestResponseSchema = z.object({
  items: z.array(EnvelopeSuggestPickSchema),
})
export type EnvelopeSuggestResponse = z.infer<typeof EnvelopeSuggestResponseSchema>

export type ParseEnvelopeSuggestResponseResult =
  | { success: true; data: EnvelopeSuggestResponse }
  | { success: false; error: string }

export function parseEnvelopeSuggestResponse(raw: unknown): ParseEnvelopeSuggestResponseResult {
  const result = EnvelopeSuggestResponseSchema.safeParse(raw)
  if (!result.success) return { success: false, error: result.error.message }
  return { success: true, data: result.data }
}

/**
 * Splits free text into lowercase alphanumeric tokens for the SQL pre-filter's
 * ILIKE/tag/category matching. Deliberately strips everything but `[a-z0-9]`
 * (rather than just trusting the caller) so a token can always be interpolated
 * into an `ilike`/`in` PostgREST filter string without any escaping concerns —
 * commas, percent signs, parens etc. never survive tokenization. Tokens under 2
 * chars are dropped as too noisy to usefully pre-filter on, and the result is
 * capped at 20 tokens so a long paste can't blow up the filter string.
 */
export function tokenizeEnvelopeSuggestQuery(query: string, seedTerms: readonly string[] = []): string[] {
  const combined = [query, ...seedTerms].join(' ').toLowerCase()
  const seen = new Set<string>()
  const tokens: string[] = []
  for (const raw of combined.split(/[^a-z0-9]+/)) {
    if (raw.length < 2 || seen.has(raw)) continue
    seen.add(raw)
    tokens.push(raw)
    if (tokens.length >= 20) break
  }
  return tokens
}

/**
 * Server-side hallucination guard (load-bearing, not optional — same spirit as
 * enforceEnvelopeCitations): drops any pick whose itemId isn't in the SQL-filtered
 * candidate set the model was given, and dedupes repeat picks of the same id. A
 * model must never be able to surface an item outside the caller's own candidate
 * set, however it got there (hallucination, or echoing a stale/foreign id).
 */
export function filterEnvelopeSuggestPicksToCandidates(
  picks: readonly EnvelopeSuggestPick[],
  allowedItemIds: ReadonlySet<string> | readonly string[],
): EnvelopeSuggestPick[] {
  const allowed = allowedItemIds instanceof Set ? allowedItemIds : new Set(allowedItemIds)
  const seen = new Set<string>()
  const kept: EnvelopeSuggestPick[] = []
  for (const pick of picks) {
    if (!allowed.has(pick.itemId) || seen.has(pick.itemId)) continue
    seen.add(pick.itemId)
    kept.push(pick)
  }
  return kept
}

/** The fixed instruction block sent as the system message for a suggest request. */
export function buildEnvelopeSuggestSystemPrompt(): string {
  return `You help pick saved items that match what a user is looking for.

You will be given a candidate list of the user's saved items (id, subject, summary, source type, category, tags, notes) and a short request describing what they want.

Respond ONLY with a JSON object of this exact shape:
{ "items": [ { "itemId": "...", "reason": "short string" }, ... ] }

Pick between ${ENVELOPE_MIN_ITEMS} and ${ENVELOPE_MAX_ITEMS} candidate items that genuinely match the request, best match first. "reason" is a short phrase (a few words) naming why that item was picked, e.g. "mentions Costco".

Only use item ids that appear in the candidate list below. Never invent an item id. If fewer than ${ENVELOPE_MIN_ITEMS} candidates genuinely match, return only the ones that do (even zero or one) — never pad the list with unrelated items just to reach the minimum.`
}

/** The per-request user message: the candidate items and the free-text/chip query. */
export function buildEnvelopeSuggestUserPrompt(candidates: readonly EnvelopeSuggestCandidateItem[], query: string): string {
  const itemsBlock = candidates
    .map((item, i) => {
      const lines = [
        `Item ${i + 1} (id: ${item.id})`,
        item.subject ? `  subject: ${item.subject}` : null,
        item.categoryName ? `  category: ${item.categoryName}` : null,
        item.tagNames.length > 0 ? `  tags: ${item.tagNames.join(', ')}` : null,
        item.sourceType ? `  source type: ${item.sourceType}` : null,
        item.aiSummary ? `  summary: ${item.aiSummary}` : null,
        item.notes ? `  user notes: ${item.notes}` : null,
      ].filter((line): line is string => line !== null)
      return lines.join('\n')
    })
    .join('\n\n')

  return [
    'Candidate items:',
    itemsBlock,
    '',
    `The user's request: "${query}"`,
  ].join('\n')
}
