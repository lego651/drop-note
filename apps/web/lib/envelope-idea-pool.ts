import type { SupabaseClient } from '@supabase/supabase-js'
import {
  buildEnvelopeIdeaPoolSystemPrompt,
  buildEnvelopeIdeaPoolUserPrompt,
  enforceEnvelopeIdeaPoolItemIds,
  parseEnvelopeIdeaPool,
  ENVELOPE_IDEA_POOL_SIZE,
  ENVELOPE_IDEA_POOL_STALE_MS,
  ENVELOPE_STARTER_IDEAS,
  type AIProvider,
  type EnvelopeIdea,
  type EnvelopeIdeaPoolSignals,
} from '@drop-note/shared'
import { incrementCounter } from '@/lib/counters'
import { log } from './observability/logger'

// Separate from envelope_gen/envelope_suggest (DRO-193/DRO-300) — browsing/
// opening the Mood Sheet must never eat into either of those budgets. Set
// well above the ~1/day legitimate use (regeneration is gated by
// isIdeaPoolStale below) so it only bites a bug or a burst of retries, not a
// normal user.
export const ENVELOPE_IDEA_POOL_GEN_RATE_LIMIT_PER_HOUR = 10

// Below this many active items there usually isn't enough signal (category/
// tag counts, recent subjects) for a personalized pool to beat the 4 static
// starter chips — and it isn't worth spending an AI call to find out.
export const ENVELOPE_IDEA_POOL_MIN_ITEMS = 5

// Bounds how many of the user's own items get scanned for category/tag
// counts + recent subjects — keeps the signal query (and the resulting
// prompt) flat regardless of library size, same spirit as the suggest
// endpoint's ~40-candidate cap (DRO-300).
export const RECENT_ITEMS_SCAN_LIMIT = 150
// Of the scanned items, how many of the most recent subjects go into the
// prompt verbatim (per the board spec: "~30 recent item subjects").
export const RECENT_SUBJECTS_FOR_PROMPT = 30
// How many category/tag names (by count, descending) go into the prompt.
const TOP_SIGNAL_COUNT = 10

type ItemsClient = Pick<SupabaseClient, 'from'>

type ScannedItem = {
  id: string
  subject: string | null
  category_id: string | null
  categories: { name: string } | { name: string }[] | null
}

/**
 * Category/tag counts + recent subjects for idea pool generation (DRO-302).
 * Stored fields only (subject, category, tags), same boundary as the
 * envelope generation pipeline — never a live fetch. Bounded to the most
 * recent RECENT_ITEMS_SCAN_LIMIT active items so cost stays flat as a
 * user's library grows.
 */
export async function fetchIdeaPoolSignals(
  supabase: ItemsClient,
  userId: string,
): Promise<EnvelopeIdeaPoolSignals> {
  const { data: items, error } = await supabase
    .from('items')
    .select('id, subject, category_id, categories(name)')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .eq('type', 'email_body')
    .order('created_at', { ascending: false })
    .limit(RECENT_ITEMS_SCAN_LIMIT)

  if (error) {
    log.warn('envelope_idea_pool.fetch_signals_items_failed', { userId }, error)
    return { categoryCounts: [], tagCounts: [], recentItems: [] }
  }

  const scanned = (items ?? []) as unknown as ScannedItem[]

  const categoryCountsByName = new Map<string, number>()
  for (const item of scanned) {
    const category = Array.isArray(item.categories) ? item.categories[0] : item.categories
    if (!category?.name) continue
    categoryCountsByName.set(category.name, (categoryCountsByName.get(category.name) ?? 0) + 1)
  }
  const categoryCounts = [...categoryCountsByName.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, TOP_SIGNAL_COUNT)

  const itemIds = scanned.map((item) => item.id)
  let tagCounts: Array<{ name: string; count: number }> = []
  if (itemIds.length > 0) {
    const { data: itemTags, error: tagsError } = await supabase
      .from('item_tags')
      .select('tags(name)')
      .in('item_id', itemIds)

    if (tagsError) {
      log.warn('envelope_idea_pool.fetch_signals_tags_failed', { userId }, tagsError)
    } else {
      const tagCountsByName = new Map<string, number>()
      for (const row of (itemTags ?? []) as unknown as Array<{ tags: { name: string } | { name: string }[] | null }>) {
        const tag = Array.isArray(row.tags) ? row.tags[0] : row.tags
        if (!tag?.name) continue
        tagCountsByName.set(tag.name, (tagCountsByName.get(tag.name) ?? 0) + 1)
      }
      tagCounts = [...tagCountsByName.entries()]
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, TOP_SIGNAL_COUNT)
    }
  }

  const recentItems = scanned.slice(0, RECENT_SUBJECTS_FOR_PROMPT).map((item) => ({ id: item.id, subject: item.subject }))

  return { categoryCounts, tagCounts, recentItems }
}

/** How many of the user's own active items exist — the thin-account check (ENVELOPE_IDEA_POOL_MIN_ITEMS). */
export async function countActiveItems(supabase: ItemsClient, userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('items')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('deleted_at', null)
    .eq('type', 'email_body')

  if (error) {
    log.warn('envelope_idea_pool.count_active_items_failed', { userId }, error)
    return 0
  }
  return count ?? 0
}

export function isIdeaPoolStale(generatedAt: string, now: () => number = Date.now): boolean {
  return now() - new Date(generatedAt).getTime() >= ENVELOPE_IDEA_POOL_STALE_MS
}

export type GenerateIdeaPoolResult =
  | { status: 'done'; ideas: EnvelopeIdea[] }
  | { status: 'failed'; errorMessage: string }

/**
 * Builds the prompt, calls the AI provider, validates the response against
 * the idea pool schema, and drops any matchingItemIds the model cited
 * outside the recent items it was actually given. Never throws — a
 * provider/network/validation failure resolves to `{ status: 'failed' }` so
 * the caller can fall back to the starter chips or a stale pool rather than
 * blocking the Mood Sheet on this call (per the board spec).
 */
export async function generateIdeaPool(
  provider: AIProvider,
  signals: EnvelopeIdeaPoolSignals,
): Promise<GenerateIdeaPoolResult> {
  const systemPrompt = buildEnvelopeIdeaPoolSystemPrompt()
  const userPrompt = buildEnvelopeIdeaPoolUserPrompt(signals)

  let raw: string
  try {
    raw = await provider.generateStructured(systemPrompt, userPrompt)
  } catch (err) {
    return { status: 'failed', errorMessage: err instanceof Error ? err.message : 'AI provider request failed' }
  }

  let parsedJson: unknown
  try {
    parsedJson = JSON.parse(raw)
  } catch {
    return { status: 'failed', errorMessage: 'Response was not valid JSON' }
  }

  const result = parseEnvelopeIdeaPool(parsedJson)
  if (!result.success) return { status: 'failed', errorMessage: result.error }

  const allowedItemIds = new Set(signals.recentItems.map((item) => item.id))
  const { ideas } = enforceEnvelopeIdeaPoolItemIds(result.data, allowedItemIds)
  return { status: 'done', ideas: ideas.slice(0, ENVELOPE_IDEA_POOL_SIZE) }
}

export type ResolvedIdeaPool = {
  ideas: EnvelopeIdea[]
  source: 'pool' | 'starter'
  generatedAt: string | null
}

/**
 * Best-effort rate-limit claim for a generation attempt. Fails open (like
 * the generate/suggest routes' own counters) — a counter outage must not
 * block the Mood Sheet from opening.
 */
async function claimIdeaPoolGeneration(userId: string): Promise<boolean> {
  try {
    const count = await incrementCounter(`envelope_idea_pool_gen:${userId}`, 3600, {
      limit: ENVELOPE_IDEA_POOL_GEN_RATE_LIMIT_PER_HOUR,
    })
    return count !== -1
  } catch (err) {
    log.error('envelope_idea_pool.rate_limit_counter_failed', err, { userId, action: 'allowed_through' })
    return true
  }
}

/**
 * Resolves what the Mood Sheet should show on open (DRO-302): the stored
 * pool if it's still fresh; otherwise a lazy regeneration (gated by a thin-
 * account check and a rate-limit claim); otherwise the last stored pool even
 * if stale (better than the generic starter chips); otherwise the 4 static
 * starter chips. Never blocks on a failed/rate-limited regeneration — it
 * just falls through to the next-best option, per the board spec ("don't
 * block the sheet on pool generation").
 */
export async function resolveIdeaPoolForSheet(
  supabase: ItemsClient,
  provider: AIProvider,
  userId: string,
  now: () => number = Date.now,
): Promise<ResolvedIdeaPool> {
  const { data: row, error } = await supabase
    .from('envelope_idea_pools')
    .select('ideas, generated_at')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    log.warn('envelope_idea_pool.fetch_pool_failed', { userId }, error)
  }

  const existingParsed = row ? parseEnvelopeIdeaPool(row.ideas) : null
  const existingIdeas = existingParsed?.success ? existingParsed.data.ideas : null
  const stale = !row || !existingIdeas || isIdeaPoolStale(row.generated_at, now)

  if (!stale && existingIdeas && row) {
    return { ideas: existingIdeas, source: 'pool', generatedAt: row.generated_at }
  }

  const itemCount = await countActiveItems(supabase, userId)
  if (itemCount >= ENVELOPE_IDEA_POOL_MIN_ITEMS && (await claimIdeaPoolGeneration(userId))) {
    const signals = await fetchIdeaPoolSignals(supabase, userId)
    const result = await generateIdeaPool(provider, signals)
    if (result.status === 'done') {
      const generatedAt = new Date(now()).toISOString()
      const { error: upsertError } = await supabase
        .from('envelope_idea_pools')
        .upsert({ user_id: userId, ideas: result.ideas, generated_at: generatedAt })
      if (upsertError) {
        log.error('envelope_idea_pool.upsert_failed', upsertError, { userId })
      } else {
        return { ideas: result.ideas, source: 'pool', generatedAt }
      }
    } else {
      log.warn('envelope_idea_pool.generation_failed', { userId, error: result.errorMessage })
    }
  }

  if (existingIdeas && row) {
    return { ideas: existingIdeas, source: 'pool', generatedAt: row.generated_at }
  }
  return { ideas: [...ENVELOPE_STARTER_IDEAS], source: 'starter', generatedAt: null }
}
