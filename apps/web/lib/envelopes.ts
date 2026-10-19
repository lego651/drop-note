import type { SupabaseClient } from '@supabase/supabase-js'
import {
  appendValidationRetryNote,
  buildEnvelopeRegenerationContext,
  buildEnvelopeSystemPrompt,
  buildEnvelopeUserPrompt,
  carryForwardEnvelopeProgress,
  carryForwardUserContent,
  countEnvelopeChecklistProgress,
  enforceEnvelopeCitations,
  getEnvelopeTitle,
  parseEnvelopeBody,
  stripEnvelopeProgressFields,
  EnvelopeIntentInputSchema,
  type AIProvider,
  type EnvelopeBody,
  type EnvelopeSourceItem,
  type PurposeHint,
} from '@drop-note/shared'
import { log } from './observability/logger'

// Separate from ingest's `ratelimit:email:{user_id}` key/budget (DRO-193) — a
// burst of envelope generations must never eat into (or be throttled by) the
// email ingestion budget, so this is its own hourly counter.
export const ENVELOPE_GEN_RATE_LIMIT_PER_HOUR = 20

type ItemsClient = Pick<SupabaseClient, 'from'>

/** Stored fields only (DRO-193) — never live-fetches `source_url`. */
export async function fetchEnvelopeSourceItems(
  supabase: ItemsClient,
  userId: string,
  itemIds: string[],
): Promise<EnvelopeSourceItem[]> {
  const { data, error } = await supabase
    .from('items')
    .select('id, subject, ai_summary, source_url, source_type, notes, categories(name)')
    .eq('user_id', userId)
    .in('id', itemIds)

  if (error || !data) {
    // Throw rather than return [] — the caller (the generate route) must not
    // hand the AI provider an empty item list and risk a schema-valid but
    // ungrounded "done" envelope from a transient DB failure.
    log.error('envelopes.fetch_source_items_failed', error ?? new Error('no data'), { userId })
    throw new Error('Failed to load source items for this envelope')
  }

  return (data as unknown as Array<{
    id: string
    subject: string | null
    ai_summary: string | null
    source_url: string | null
    source_type: string | null
    notes: string | null
    categories: { name: string } | { name: string }[] | null
  }>).map((row) => {
    const category = Array.isArray(row.categories) ? row.categories[0] : row.categories
    return {
      id: row.id,
      subject: row.subject,
      aiSummary: row.ai_summary,
      sourceUrl: row.source_url,
      sourceType: row.source_type,
      notes: row.notes,
      categoryName: category?.name ?? null,
    }
  })
}

export type EnvelopeGenerationResult =
  | { status: 'done' | 'partial'; body: EnvelopeBody; errorMessage?: undefined }
  | { status: 'failed'; body?: undefined; errorMessage: string }

// Each AI call aborts after 30s (packages/shared/src/ai-provider.ts). If the
// first attempt alone eats most of that, a full-length retry would push the
// combined AI time toward 60s and leave the route's `maxDuration = 60` with
// no room for the DB writes around it (DRO-197) — so skip the retry rather
// than risk the serverless function getting killed mid-write.
const RETRY_TIME_BUDGET_MS = 20_000

/**
 * Builds the prompt, calls the AI provider, validates the response against the
 * envelope body schema (one retry with the validation error appended on
 * failure, skipped if the first attempt already used most of the time budget
 * — see RETRY_TIME_BUDGET_MS), and applies server-side citation enforcement.
 * Never throws — provider/network failures resolve to `{ status: 'failed' }`
 * like a schema failure would, since both leave the user with nothing to
 * render otherwise.
 *
 * `previousBody` (DRO-195, regenerate-with-edits): when given, its
 * checked/edited leaves are appended to the prompt as a preservation hint
 * (see buildEnvelopeRegenerationContext) — the fresh output still goes
 * through the same citation enforcement below, same as first-time generation.
 * Any checked/edited the model echoed back is stripped (stripEnvelopeProgressFields)
 * and then deterministically re-applied by matching leaf text against
 * `previousBody` (carryForwardEnvelopeProgress), so a regenerate doesn't
 * reset the user's progress even though the hint above is prompt-only.
 * The user's own hand-added lines/sections (DRO-232) are carried forward the
 * same way, structurally rather than by prompt (carryForwardUserContent) —
 * the AI never saw them, so it can't regenerate them on its own.
 */
export async function runEnvelopeGeneration(
  provider: AIProvider,
  items: EnvelopeSourceItem[],
  text: string,
  purposeHint: PurposeHint | null,
  now: () => number = Date.now,
  previousBody?: EnvelopeBody,
): Promise<EnvelopeGenerationResult> {
  const systemPrompt = buildEnvelopeSystemPrompt()
  const baseUserPrompt = buildEnvelopeUserPrompt(items, text, purposeHint)
  const userPrompt = previousBody ? baseUserPrompt + buildEnvelopeRegenerationContext(previousBody) : baseUserPrompt
  const allowedItemIds = new Set(items.map((item) => item.id))

  async function attempt(prompt: string): Promise<{ ok: true; body: EnvelopeBody } | { ok: false; error: string }> {
    let raw: string
    try {
      raw = await provider.generateStructured(systemPrompt, prompt)
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'AI provider request failed' }
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      return { ok: false, error: 'Response was not valid JSON' }
    }

    const result = parseEnvelopeBody(parsed)
    if (!result.success) return { ok: false, error: result.error }
    return { ok: true, body: result.data }
  }

  const firstAttemptStartedAt = now()
  let result = await attempt(userPrompt)
  const firstAttemptElapsedMs = now() - firstAttemptStartedAt

  if (!result.ok && firstAttemptElapsedMs >= RETRY_TIME_BUDGET_MS) {
    log.error('envelopes.generation_failed_no_retry_budget', new Error(result.error), { firstAttemptElapsedMs })
    return { status: 'failed', errorMessage: result.error }
  }

  if (!result.ok) {
    log.warn('envelopes.generation_retry', { error: result.error })
    result = await attempt(appendValidationRetryNote(userPrompt, result.error))
  }

  if (!result.ok) {
    log.error('envelopes.generation_failed', new Error(result.error))
    return { status: 'failed', errorMessage: result.error }
  }

  const { body: citedBody, stripped } = enforceEnvelopeCitations(stripEnvelopeProgressFields(result.body), allowedItemIds)
  if (stripped) {
    log.warn('envelopes.citations_stripped', { itemIds: Array.from(allowedItemIds) })
  }
  const withProgress = previousBody ? carryForwardEnvelopeProgress(citedBody, previousBody) : citedBody
  const body = previousBody ? carryForwardUserContent(withProgress, previousBody) : withProgress
  return { status: stripped ? 'partial' : 'done', body }
}

// --- /envelopes list page (DRO-223) ---------------------------------------

export type EnvelopeListStatus = 'generating' | 'done' | 'partial' | 'failed'

export const ENVELOPE_STATUS_LABEL: Record<EnvelopeListStatus, string> = {
  generating: 'Generating',
  done: 'Done',
  partial: 'Partial',
  failed: 'Failed',
}

export interface EnvelopeListItem {
  id: string
  title: string
  intentText: string
  status: EnvelopeListStatus
  progress: { checked: number; total: number } | null
  createdAt: string
  sourceItemCount: number
}

export interface EnvelopeListRow {
  id: string
  intent_input: unknown
  status: string
  body: unknown
  created_at: string
}

/**
 * Maps a raw `envelopes` row (plus its separately-counted `envelope_items`
 * rows) to the shape the /envelopes list page renders. Title and checklist
 * progress both go through the same @drop-note/shared helpers the detail
 * page and generation pipeline already use, so the list never re-derives
 * either on its own. Returns null if `intent_input` doesn't match the stored
 * schema — shouldn't happen for a row this app wrote itself, but a malformed
 * row must not crash the whole list.
 */
export function buildEnvelopeListItem(row: EnvelopeListRow, sourceItemCount: number): EnvelopeListItem | null {
  const intentResult = EnvelopeIntentInputSchema.safeParse(row.intent_input)
  if (!intentResult.success) return null
  const intentInput = intentResult.data

  let progress: { checked: number; total: number } | null = null
  if (row.body) {
    const parsedBody = parseEnvelopeBody(row.body)
    if (parsedBody.success) {
      const counted = countEnvelopeChecklistProgress(parsedBody.data)
      if (counted.total > 0) progress = counted
    }
  }

  return {
    id: row.id,
    title: getEnvelopeTitle(intentInput),
    intentText: intentInput.text,
    status: row.status as EnvelopeListStatus,
    progress,
    createdAt: row.created_at,
    sourceItemCount,
  }
}
