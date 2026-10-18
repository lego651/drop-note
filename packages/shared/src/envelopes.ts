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
const EnvelopeLeafSchema = z.object({
  text: z.string().min(1),
  sourceItemIds: z.array(z.string()),
  confidence: z.enum(['from_item', 'suggested']),
  missing: z.string().optional(),
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

/** Parses + validates a raw (already JSON.parse'd) AI response against the envelope body shape. */
export function parseEnvelopeBody(raw: unknown): ParseEnvelopeBodyResult {
  const result = EnvelopeBodySchema.safeParse(raw)
  if (result.success) return { success: true, data: result.data }
  return { success: false, error: result.error.message }
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
    if (kept.length === leaf.sourceItemIds.length) return leaf
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
- Notes: { "type": "notes", "items": [ <leaf>, ... ] } — never include "heading" on a notes block.

Every <leaf> is: { "text": "string", "sourceItemIds": ["..."], "confidence": "from_item" | "suggested", "missing": "optional string" }
- "sourceItemIds" lists the id(s) (from the items given below) that this line is based on. Use [] if it isn't based on a specific item.
- "confidence" is "from_item" only when the line is directly supported by the content of a cited item; otherwise use "suggested".
- "missing" is an optional short note naming information the user would need to supply (e.g. a date, a quantity) that isn't in the cited items.

Use a "checklist" or "list" block when the request maps naturally onto one. If the request is open-ended, conversational, or doesn't fit a checklist/list/table (e.g. "what do you think of these" or "summarize these"), respond with a single "notes" block instead — do NOT force a checklist shape onto content that doesn't fit one.

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
