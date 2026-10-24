import type { SupabaseClient } from '@supabase/supabase-js'
import {
  appendValidationRetryNote,
  buildEnvelopeRegenerationContext,
  buildEnvelopeSuggestSystemPrompt,
  buildEnvelopeSuggestUserPrompt,
  buildEnvelopeSystemPrompt,
  buildEnvelopeUserPrompt,
  carryForwardEnvelopeProgress,
  carryForwardUserContent,
  countEnvelopeChecklistProgress,
  enforceEnvelopeCitations,
  filterEnvelopeSuggestPicksToCandidates,
  getEnvelopeTitle,
  parseEnvelopeBody,
  parseEnvelopeSuggestResponse,
  stripEnvelopeProgressFields,
  tokenizeEnvelopeSuggestQuery,
  ENVELOPE_MAX_ITEMS,
  EnvelopeIntentInputSchema,
  type AIProvider,
  type EnvelopeBody,
  type EnvelopeSourceItem,
  type EnvelopeSuggestCandidateItem,
  type EnvelopeSuggestPick,
  type EnvelopeSuggestResponse,
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
  const carried = previousBody ? carryForwardUserContent(withProgress, previousBody) : withProgress
  // Defense in depth: carryForwardUserContent is structural, not AI output, but a future bug in it
  // (e.g. a bad merge key) must never persist a body parseEnvelopeBody can't read back (DRO-232 review round 2).
  const body = parseEnvelopeBody(carried).success ? carried : withProgress
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

// --- Envelopes "suggest" (DRO-300, Mood Sheet slice 1 of 3): Engine B retrieval ---
//
// POST /api/envelopes/suggest picks 2-8 of the caller's own items from a mood chip
// or free-text query instead of requiring a manual multi-select first. This section
// is the SQL pre-filter + AI-pick half of that pipeline; the prompt/schema/citation
// helpers it calls live in packages/shared/src/envelopes.ts.

// Sibling budget to ENVELOPE_GEN_RATE_LIMIT_PER_HOUR, kept separate so browsing mood
// chips can't eat into (or be throttled alongside) the plan-generation limit. Same
// default limit — no usage signal yet to justify a different cap.
export const ENVELOPE_SUGGEST_RATE_LIMIT_PER_HOUR = 20

// Hard cap on candidates sent to the AI provider in one call, so prompt size stays
// flat regardless of library size (DRO-300 spec).
export const ENVELOPE_SUGGEST_CANDIDATE_CAP = 40

// If the precise pre-filter doesn't surface at least as many candidates as the model
// could ever pick from, there's no real choice to offer it — widen (see below).
const MIN_CANDIDATES_BEFORE_WIDEN = ENVELOPE_MAX_ITEMS

type SuggestClient = Pick<SupabaseClient, 'from'>

type RawSuggestItemRow = {
  id: string
  subject: string | null
  ai_summary: string | null
  notes: string | null
  source_type: string | null
  categories: { name: string } | { name: string }[] | null
  item_tags: { tags: { name: string } | null }[] | null
}

// created_at is intentionally not selected — it's only used to order the
// query (PostgREST orders on the underlying column regardless of what's
// projected), never read back into EnvelopeSuggestCandidateItem.
const SUGGEST_ITEM_SELECT = 'id, subject, ai_summary, notes, source_type, categories(name), item_tags(tags(name))'

function mapSuggestRow(row: RawSuggestItemRow): EnvelopeSuggestCandidateItem {
  const category = Array.isArray(row.categories) ? row.categories[0] : row.categories
  return {
    id: row.id,
    subject: row.subject,
    aiSummary: row.ai_summary,
    sourceType: row.source_type,
    notes: row.notes,
    categoryName: category?.name ?? null,
    tagNames: (row.item_tags ?? []).map((it) => it.tags?.name).filter((n): n is string => Boolean(n)),
  }
}

/** Every token is a run of `\p{L}\p{N}` only (tokenizeEnvelopeSuggestQuery) — Unicode letters/digits, never `, ( ) . : * %` or quotes — so these are safe to interpolate into a PostgREST filter string with no escaping. */
function buildTextIlikeOrParts(tokens: string[]): string[] {
  return tokens.flatMap((t) => [`subject.ilike.%${t}%`, `ai_summary.ilike.%${t}%`, `notes.ilike.%${t}%`])
}

async function fetchUserTags(supabase: SuggestClient, userId: string): Promise<{ id: string; name: string }[]> {
  const { data, error } = await supabase.from('tags').select('id, name').eq('user_id', userId)
  if (error || !data) return []
  return data as unknown as { id: string; name: string }[]
}

async function fetchUserCategories(supabase: SuggestClient, userId: string): Promise<{ id: string; name: string }[]> {
  const { data, error } = await supabase.from('categories').select('id, name').eq('user_id', userId)
  if (error || !data) return []
  return data as unknown as { id: string; name: string }[]
}

/**
 * item_tags has no user_id column, but every tagId here was already fetched
 * scoped to this user's own `tags` rows, so the item_ids it returns are this
 * user's own. Capped at the candidate cap — the result only ever feeds an
 * `id.in.(...)` filter on the items query, so there's no point fetching more
 * item ids than could ever end up in the final candidate set, and it keeps a
 * heavily-tagged tag from inlining hundreds of ids into that filter string.
 */
async function fetchItemIdsForTags(supabase: SuggestClient, tagIds: string[]): Promise<string[]> {
  if (tagIds.length === 0) return []
  const { data, error } = await supabase
    .from('item_tags')
    .select('item_id')
    .in('tag_id', tagIds)
    .limit(ENVELOPE_SUGGEST_CANDIDATE_CAP)
  if (error || !data) return []
  return (data as unknown as { item_id: string }[]).map((r) => r.item_id)
}

async function queryItemsByOr(
  supabase: SuggestClient,
  userId: string,
  orParts: string[],
  limit: number,
): Promise<RawSuggestItemRow[]> {
  if (orParts.length === 0) return []
  const { data, error } = await supabase
    .from('items')
    .select(SUGGEST_ITEM_SELECT)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .or(orParts.join(','))
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error || !data) {
    log.error('envelopes.suggest_candidates_query_failed', error ?? new Error('no data'), { userId, stage: 'filtered' })
    return []
  }
  return data as unknown as RawSuggestItemRow[]
}

async function queryRecentItems(supabase: SuggestClient, userId: string, limit: number): Promise<RawSuggestItemRow[]> {
  const { data, error } = await supabase
    .from('items')
    .select(SUGGEST_ITEM_SELECT)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error || !data) {
    log.error('envelopes.suggest_candidates_query_failed', error ?? new Error('no data'), { userId, stage: 'recency' })
    return []
  }
  return data as unknown as RawSuggestItemRow[]
}

/**
 * The SQL pre-filter (DRO-300 Engine B retrieval, step 1-2 of the board-approved
 * spec): narrows the caller's own items (RLS-scoped via the caller's own client,
 * `deleted_at is null`) down to a capped candidate set the AI provider can pick
 * from, so prompt size never grows with library size.
 *
 * Stage 1 (precise): ILIKE match on subject/ai_summary/notes for any query/seedTerms
 * token, OR'd with items whose tag or category name *exactly* equals one of those
 * tokens. If that comes up thinner than the model could ever pick from
 * (MIN_CANDIDATES_BEFORE_WIDEN), stage 2 reruns the same text match but widens tag
 * and category matching from exact-term equality to substring containment (the
 * spec's "tag → category" widen, run as one combined query rather than two
 * separately-checked ones — functionally equivalent and one less DB round trip).
 * If still thin, the final stage ignores content entirely and adds the user's most
 * recent items (the spec's "recency-only"), so the model always has *something* to
 * evaluate when the caller has any items at all. Every stage is additive and
 * deduped by item id — nothing already found is ever dropped by a later stage.
 *
 * Returns [] (never throws) on a query token count of 0 with no items found, or on
 * a DB error — the caller (the route) treats `candidates.length < 2` as
 * `insufficientMatches: true`, which is the right response shape for "this user's
 * library has nothing like what they asked for" either way.
 */
export async function fetchEnvelopeSuggestCandidates(
  supabase: SuggestClient,
  userId: string,
  query: string,
  seedTerms: string[] = [],
): Promise<EnvelopeSuggestCandidateItem[]> {
  const tokens = tokenizeEnvelopeSuggestQuery(query, seedTerms)
  const accumulator = new Map<string, RawSuggestItemRow>()
  const addRows = (rows: RawSuggestItemRow[]) => {
    for (const row of rows) {
      if (!accumulator.has(row.id)) accumulator.set(row.id, row)
    }
  }

  if (tokens.length > 0) {
    const [tags, categories] = await Promise.all([
      fetchUserTags(supabase, userId),
      fetchUserCategories(supabase, userId),
    ])
    const tokenSet = new Set(tokens)

    const exactTagIds = tags.filter((t) => tokenSet.has(t.name.toLowerCase())).map((t) => t.id)
    const exactCategoryIds = categories.filter((c) => tokenSet.has(c.name.toLowerCase())).map((c) => c.id)
    const exactTagItemIds = await fetchItemIdsForTags(supabase, exactTagIds)

    const stage1Parts = [
      ...buildTextIlikeOrParts(tokens),
      ...(exactCategoryIds.length > 0 ? [`category_id.in.(${exactCategoryIds.join(',')})`] : []),
      ...(exactTagItemIds.length > 0 ? [`id.in.(${exactTagItemIds.join(',')})`] : []),
    ]
    addRows(await queryItemsByOr(supabase, userId, stage1Parts, ENVELOPE_SUGGEST_CANDIDATE_CAP))

    if (accumulator.size < MIN_CANDIDATES_BEFORE_WIDEN) {
      const broaderTagIds = tags.filter((t) => tokens.some((tok) => t.name.toLowerCase().includes(tok))).map((t) => t.id)
      const broaderCategoryIds = categories
        .filter((c) => tokens.some((tok) => c.name.toLowerCase().includes(tok)))
        .map((c) => c.id)
      const broaderTagItemIds = await fetchItemIdsForTags(supabase, broaderTagIds)

      const widenParts = [
        ...buildTextIlikeOrParts(tokens),
        ...(broaderCategoryIds.length > 0 ? [`category_id.in.(${broaderCategoryIds.join(',')})`] : []),
        ...(broaderTagItemIds.length > 0 ? [`id.in.(${broaderTagItemIds.join(',')})`] : []),
      ]
      addRows(await queryItemsByOr(supabase, userId, widenParts, ENVELOPE_SUGGEST_CANDIDATE_CAP))
    }
  }

  if (accumulator.size < MIN_CANDIDATES_BEFORE_WIDEN) {
    addRows(await queryRecentItems(supabase, userId, ENVELOPE_SUGGEST_CANDIDATE_CAP))
  }

  return Array.from(accumulator.values()).slice(0, ENVELOPE_SUGGEST_CANDIDATE_CAP).map(mapSuggestRow)
}

export type EnvelopeSuggestionResult =
  | { status: 'ok'; picks: EnvelopeSuggestPick[] }
  | { status: 'failed'; errorMessage: string }

/**
 * Builds the suggest prompt, calls the AI provider, validates the response against
 * EnvelopeSuggestResponseSchema (one retry with the validation error appended on
 * failure, skipped under the same RETRY_TIME_BUDGET_MS rule runEnvelopeGeneration
 * uses — see there), and applies the hallucination guard
 * (filterEnvelopeSuggestPicksToCandidates) before returning — a pick citing an id
 * outside `candidates` must never reach the caller. Never throws; a provider,
 * network, or validation failure all resolve to `{ status: 'failed' }`.
 */
export async function runEnvelopeSuggestion(
  provider: AIProvider,
  candidates: EnvelopeSuggestCandidateItem[],
  query: string,
  now: () => number = Date.now,
): Promise<EnvelopeSuggestionResult> {
  const systemPrompt = buildEnvelopeSuggestSystemPrompt()
  const userPrompt = buildEnvelopeSuggestUserPrompt(candidates, query)
  const allowedItemIds = new Set(candidates.map((c) => c.id))

  async function attempt(prompt: string): Promise<{ ok: true; data: EnvelopeSuggestResponse } | { ok: false; error: string }> {
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

    const result = parseEnvelopeSuggestResponse(parsed)
    if (!result.success) return { ok: false, error: result.error }
    return { ok: true, data: result.data }
  }

  const firstAttemptStartedAt = now()
  let result = await attempt(userPrompt)
  const firstAttemptElapsedMs = now() - firstAttemptStartedAt

  if (!result.ok && firstAttemptElapsedMs >= RETRY_TIME_BUDGET_MS) {
    log.error('envelopes.suggest_failed_no_retry_budget', new Error(result.error), { firstAttemptElapsedMs })
    return { status: 'failed', errorMessage: result.error }
  }

  if (!result.ok) {
    log.warn('envelopes.suggest_retry', { error: result.error })
    result = await attempt(appendValidationRetryNote(userPrompt, result.error))
  }

  if (!result.ok) {
    log.error('envelopes.suggest_failed', new Error(result.error))
    return { status: 'failed', errorMessage: result.error }
  }

  const picks = filterEnvelopeSuggestPicksToCandidates(result.data.items, allowedItemIds).slice(0, ENVELOPE_MAX_ITEMS)
  return { status: 'ok', picks }
}
