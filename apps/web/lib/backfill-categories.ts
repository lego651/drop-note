/**
 * One-time(ish) backfill for DRO-104: assigns a category to every item that predates
 * the categories feature (DRO-103) — `category_id IS NULL AND category_locked = false`.
 * Reuses the exact AI classification path previewResort/applyResort/deleteCategory use
 * (lib/categories.ts + AIProvider.processText), so the result is consistent with how
 * new items get categorized going forward. Existing tags are passed through as keywords
 * input, never modified — this only ever writes `items.category_id`.
 *
 * Safe to re-run: the read query and the write's guard clause both require
 * `category_id IS NULL AND category_locked = false`, so a re-run only ever touches items
 * still untouched by a previous run (or by a user who categorized in the meantime).
 */
import { supabaseAdmin } from '@/lib/supabase/admin'
import { createAIProvider } from '@drop-note/shared'
import type { SupabaseClient } from '@supabase/supabase-js'
import { log } from './observability/logger'
import { getCategories, orderedCategoryNamesForAI, type UserCategory } from './categories'

// Mirrors DELETE_RESORT_CONCURRENCY in lib/categories.ts — caps concurrent AI calls
// across the whole run (not per user) so a large backfill can't exhaust the provider's
// rate limit or pile up timeouts.
export const BACKFILL_CONCURRENCY = 8

type AdminClient = Pick<SupabaseClient, 'from'>

type BackfillCandidate = {
  id: string
  userId: string
  subject: string | null
  aiSummary: string | null
  keywords: string[]
}

type RawItemRow = {
  id: string
  user_id: string
  subject: string | null
  ai_summary: string | null
  item_tags: { tags: { name: string } | null }[] | null
}

export type BackfillResult = {
  dryRun: boolean
  scanned: number
  assigned: number
  fallbackOther: number
  errors: number
  durationMs: number
  /** Per-user, per-category assignment counts. */
  perUser: Record<string, Record<string, number>>
  /** Proposed item -> category mapping. Only populated on a dry run. */
  mapping?: { itemId: string; category: string }[]
}

async function fetchCandidates(db: AdminClient, userId?: string): Promise<BackfillCandidate[]> {
  let query = db
    .from('items')
    .select('id, user_id, subject, ai_summary, item_tags(tags(name))')
    .is('category_id', null)
    .eq('category_locked', false)
    .is('deleted_at', null)
  if (userId) query = query.eq('user_id', userId)

  const { data, error } = await query
  if (error) {
    log.warn('backfill.categories.fetch_failed', { userId: userId ?? null }, error)
    return []
  }

  return ((data as unknown as RawItemRow[] | null) ?? []).map((row) => ({
    id: row.id,
    userId: row.user_id,
    subject: row.subject,
    aiSummary: row.ai_summary,
    keywords: (row.item_tags ?? []).map((it) => it.tags?.name).filter((n): n is string => Boolean(n)),
  }))
}

/** Writes each category's batch of item ids, re-checking the same guard the read used. */
async function writeAssignments(db: AdminClient, assignments: { itemId: string; categoryId: string }[]): Promise<void> {
  const idsByCategory = new Map<string, string[]>()
  for (const { itemId, categoryId } of assignments) {
    const ids = idsByCategory.get(categoryId) ?? []
    ids.push(itemId)
    idsByCategory.set(categoryId, ids)
  }

  for (const [categoryId, itemIds] of idsByCategory) {
    const { error } = await db
      .from('items')
      .update({ category_id: categoryId })
      .in('id', itemIds)
      .is('category_id', null)
      .eq('category_locked', false)
    if (error) {
      log.warn('backfill.categories.write_failed', { categoryId, count: itemIds.length }, error)
    }
  }
}

export async function runCategoriesBackfill(
  opts: { dryRun: boolean; userId?: string },
  client?: AdminClient,
): Promise<BackfillResult> {
  const start = Date.now()
  const db = client ?? (supabaseAdmin as unknown as AdminClient)

  const candidates = await fetchCandidates(db, opts.userId)
  const perUser: Record<string, Record<string, number>> = {}
  const mapping: { itemId: string; category: string }[] = []
  const toWrite: { itemId: string; categoryId: string }[] = []
  let assigned = 0
  let fallbackOther = 0
  let errors = 0

  type WorkItem = { candidate: BackfillCandidate; names: string[]; categories: UserCategory[]; fallback: UserCategory }
  const work: WorkItem[] = []

  const byUser = new Map<string, BackfillCandidate[]>()
  for (const candidate of candidates) {
    const list = byUser.get(candidate.userId) ?? []
    list.push(candidate)
    byUser.set(candidate.userId, list)
  }

  for (const [userId, items] of byUser) {
    const categories = await getCategories(userId, db)
    const fallback = categories.find((c) => c.is_other) ?? categories[categories.length - 1]
    if (!fallback) {
      log.warn('backfill.categories.no_categories', { userId })
      continue
    }
    const names = orderedCategoryNamesForAI(categories)
    for (const candidate of items) {
      work.push({ candidate, names, categories, fallback })
    }
  }

  const provider = createAIProvider()

  for (let i = 0; i < work.length; i += BACKFILL_CONCURRENCY) {
    const batch = work.slice(i, i + BACKFILL_CONCURRENCY)
    await Promise.all(
      batch.map(async ({ candidate, names, categories, fallback }) => {
        const text = `${candidate.subject ?? ''}\n\n${candidate.aiSummary ?? ''}`.trim()
        let chosen = fallback

        if (text && names.length > 0) {
          try {
            const result = await provider.processText(text, candidate.keywords, names)
            chosen = categories.find((c) => c.name === result.category) ?? fallback
          } catch (err) {
            errors += 1
            log.warn(
              'backfill.categories.classify_failed',
              { userId: candidate.userId, itemId: candidate.id },
              err instanceof Error ? err : undefined,
            )
          }
        }

        assigned += 1
        if (chosen.is_other) fallbackOther += 1

        const userCounts = perUser[candidate.userId] ?? {}
        userCounts[chosen.name] = (userCounts[chosen.name] ?? 0) + 1
        perUser[candidate.userId] = userCounts

        if (opts.dryRun) {
          mapping.push({ itemId: candidate.id, category: chosen.name })
        } else {
          toWrite.push({ itemId: candidate.id, categoryId: chosen.id })
        }
      }),
    )
  }

  if (!opts.dryRun && toWrite.length > 0) {
    await writeAssignments(db, toWrite)
  }

  const durationMs = Date.now() - start

  log.info('backfill.categories', {
    dryRun: opts.dryRun,
    scanned: candidates.length,
    assigned,
    fallback_other: fallbackOther,
    errors,
    duration_ms: durationMs,
  })

  return {
    dryRun: opts.dryRun,
    scanned: candidates.length,
    assigned,
    fallbackOther,
    errors,
    durationMs,
    perUser,
    ...(opts.dryRun ? { mapping } : {}),
  }
}
