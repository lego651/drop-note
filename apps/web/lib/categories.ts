import { supabaseAdmin } from '@/lib/supabase/admin'
import { createAIProvider } from '@drop-note/shared'
import type { SupabaseClient } from '@supabase/supabase-js'
import { log } from './observability/logger'
import { CATEGORY_CAP, CATEGORY_NAME_MAX_LENGTH } from './category-display'

export { CATEGORY_CAP, CATEGORY_NAME_MAX_LENGTH }
// Bounds how many of a category's items get an AI re-sort call, in both deleteCategory and
// previewResort: cheap for the handful of custom categories users will actually delete, but
// classifying an unbounded number of items would turn one click into hundreds of AI calls.
// In deleteCategory, anything beyond this limit skips the AI entirely and goes straight to
// the fallback category (every item still gets moved — nothing is left uncategorized).
export const RESORT_SCAN_LIMIT = 200
// Within that limit, caps how many of those AI calls run at once — e.g. deleting "Tech"
// with 200 items fires at most this many concurrent requests, not 200, so one delete can't
// exhaust the AI provider's rate limit or time out the request.
export const DELETE_RESORT_CONCURRENCY = 8

type AdminClient = Pick<SupabaseClient, 'from'>

export type UserCategory = {
  id: string
  name: string
  position: number
  hidden: boolean
  is_default: boolean
  is_other: boolean
}

export type CategoryResult<T = unknown> =
  | ({ ok: true } & T)
  | { ok: false; error: string }

/** All of the user's categories, ordered by position (the order the UI/AI should see). */
export async function getCategories(userId: string, client?: AdminClient): Promise<UserCategory[]> {
  const db = client ?? (supabaseAdmin as unknown as AdminClient)
  const { data, error } = await db
    .from('categories')
    .select('id, name, position, hidden, is_default, is_other')
    .eq('user_id', userId)
    .order('position')

  if (error || !data) {
    log.warn('categories.list_failed', { userId }, error ?? undefined)
    return []
  }
  return data as UserCategory[]
}

/**
 * Category names for the AI prompt: hidden categories are dropped (so a hidden category
 * stops collecting new items) except the user's "Other" category, which always stays —
 * it's the only guaranteed fallback. "Other" is always last, per the
 * buildCategoryKeywordPrompt/resolveCategory fallback contract in @drop-note/shared.
 */
export function orderedCategoryNamesForAI(categories: UserCategory[]): string[] {
  const visible = categories.filter((c) => !c.hidden || c.is_other)
  const sorted = [...visible].sort((a, b) => Number(a.is_other) - Number(b.is_other))
  return sorted.map((c) => c.name)
}

export type CategoryWithCount = UserCategory & { item_count: number }

/**
 * Categories with item counts in the same scope as "All Items": active
 * (not deleted, not archived), email_body items only. Items with
 * category_id = null (pre-backfill) aren't counted under any category.
 * One count query per category — cheap at the 15-category cap, and avoids
 * needing a DB function for a simple per-user GROUP BY.
 */
export async function getCategoriesWithCounts(
  userId: string,
  client?: AdminClient,
): Promise<CategoryWithCount[]> {
  const db = client ?? (supabaseAdmin as unknown as AdminClient)
  // Query directly (rather than via getCategories, which swallows errors and returns [])
  // so a genuine DB failure throws instead of looking like "the user has no categories".
  const { data, error } = await db
    .from('categories')
    .select('id, name, position, hidden, is_default, is_other')
    .eq('user_id', userId)
    .order('position')
  if (error) {
    log.warn('categories.list_with_counts_failed', { userId }, error)
    throw new Error('Failed to load categories')
  }
  const categories = (data ?? []) as UserCategory[]

  const counts = await Promise.all(
    categories.map((c) =>
      db
        .from('items')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('category_id', c.id)
        .is('deleted_at', null)
        .is('archived_at', null)
        .eq('type', 'email_body'),
    ),
  )

  return categories.map((c, i) => ({ ...c, item_count: counts[i].count ?? 0 }))
}

function validateName(name: string): { trimmed: string } | { error: string } {
  const trimmed = name.trim()
  if (!trimmed) return { error: 'Name is required' }
  if (trimmed.length > CATEGORY_NAME_MAX_LENGTH) {
    return { error: `Name must be ${CATEGORY_NAME_MAX_LENGTH} characters or fewer` }
  }
  return { trimmed }
}

export async function createCategory(
  userId: string,
  name: string,
  client?: AdminClient,
): Promise<CategoryResult<{ category: UserCategory }>> {
  const validated = validateName(name)
  if ('error' in validated) return { ok: false, error: validated.error }
  const { trimmed } = validated

  const db = client ?? (supabaseAdmin as unknown as AdminClient)
  const existing = await getCategories(userId, db)

  if (existing.some((c) => c.name.toLowerCase() === trimmed.toLowerCase())) {
    return { ok: false, error: 'A category with this name already exists' }
  }
  if (existing.length >= CATEGORY_CAP) {
    return { ok: false, error: `Category limit of ${CATEGORY_CAP} reached` }
  }

  const position = existing.length > 0 ? Math.max(...existing.map((c) => c.position)) + 1 : 0

  const { data, error } = await db
    .from('categories')
    .insert({ user_id: userId, name: trimmed, position, is_default: false, is_other: false })
    .select('id, name, position, hidden, is_default, is_other')
    .single()

  if (error || !data) {
    log.warn('categories.create_failed', { userId }, error ?? undefined)
    // The cap trigger is a second line of defense behind the length check above.
    const isCapError = typeof error?.message === 'string' && error.message.includes('cap of')
    return { ok: false, error: isCapError ? `Category limit of ${CATEGORY_CAP} reached` : 'Failed to create category' }
  }

  return { ok: true, category: data as UserCategory }
}

export async function renameCategory(
  userId: string,
  categoryId: string,
  name: string,
  client?: AdminClient,
): Promise<CategoryResult> {
  const validated = validateName(name)
  if ('error' in validated) return { ok: false, error: validated.error }
  const { trimmed } = validated

  const db = client ?? (supabaseAdmin as unknown as AdminClient)
  const existing = await getCategories(userId, db)
  const target = existing.find((c) => c.id === categoryId)
  if (!target) return { ok: false, error: 'Category not found' }

  if (existing.some((c) => c.id !== categoryId && c.name.toLowerCase() === trimmed.toLowerCase())) {
    return { ok: false, error: 'A category with this name already exists' }
  }

  const { error } = await db.from('categories').update({ name: trimmed }).eq('id', categoryId).eq('user_id', userId)
  if (error) {
    log.warn('categories.rename_failed', { userId, categoryId }, error)
    return { ok: false, error: 'Failed to rename category' }
  }
  return { ok: true }
}

export async function setCategoryHidden(
  userId: string,
  categoryId: string,
  hidden: boolean,
  client?: AdminClient,
): Promise<CategoryResult> {
  const db = client ?? (supabaseAdmin as unknown as AdminClient)
  const { data, error } = await db
    .from('categories')
    .update({ hidden })
    .eq('id', categoryId)
    .eq('user_id', userId)
    .select('id')
    .maybeSingle()

  if (error) {
    log.warn('categories.set_hidden_failed', { userId, categoryId }, error)
    return { ok: false, error: 'Failed to update category' }
  }
  if (!data) return { ok: false, error: 'Category not found' }
  return { ok: true }
}

/**
 * Deletes a category, re-sorting ALL of its items (including ones the user manually
 * moved there) to the closest remaining category via the AI, or "Other" if nothing fits.
 * AI calls are capped at DELETE_RESORT_CONCURRENCY at a time, and only the first
 * RESORT_SCAN_LIMIT items get an AI call at all — anything beyond that goes straight to
 * the fallback category without one. Every item still gets moved either way; the limit
 * only controls how many get a classification call rather than the fallback.
 *
 * Lock handling: every reassigned item has category_locked cleared, even if it was
 * previously locked. The category the user locked it to is gone, so that lock has nothing
 * left to protect — the AI's reassignment becomes the new (unlocked) classification, same
 * as a freshly-ingested item. If the user wants to lock the new category, they move the
 * item again after the delete, same as any other AI-assigned item.
 */
export async function deleteCategory(
  userId: string,
  categoryId: string,
  client?: AdminClient,
): Promise<CategoryResult<{ reassigned: number }>> {
  const db = client ?? (supabaseAdmin as unknown as AdminClient)
  const categories = await getCategories(userId, db)
  const target = categories.find((c) => c.id === categoryId)
  if (!target) return { ok: false, error: 'Category not found' }
  if (target.is_other) return { ok: false, error: 'The Other category cannot be deleted' }

  const remaining = categories.filter((c) => c.id !== categoryId)
  const names = orderedCategoryNamesForAI(remaining)
  const fallback = remaining.find((c) => c.is_other) ?? remaining[remaining.length - 1]

  const { data: items, error: itemsError } = await db
    .from('items')
    .select('id, subject, ai_summary')
    .eq('user_id', userId)
    .eq('category_id', categoryId)

  if (itemsError) {
    log.warn('categories.delete_items_fetch_failed', { userId, categoryId }, itemsError)
    return { ok: false, error: 'Failed to look up this category\'s items' }
  }

  if (items && items.length > 0 && fallback) {
    const provider = createAIProvider()
    const toClassify = items.slice(0, RESORT_SCAN_LIMIT)
    const overflow = items.slice(RESORT_SCAN_LIMIT)

    for (let i = 0; i < toClassify.length; i += DELETE_RESORT_CONCURRENCY) {
      const batch = toClassify.slice(i, i + DELETE_RESORT_CONCURRENCY)
      await Promise.all(
        batch.map(async (item) => {
          const text = `${item.subject ?? ''}\n\n${item.ai_summary ?? ''}`.trim()
          let newCategoryName = fallback.name
          if (text && names.length > 0) {
            try {
              const result = await provider.processText(text, [], names)
              newCategoryName = result.category || fallback.name
            } catch (err) {
              log.warn('categories.delete_resort_classify_failed', { userId, itemId: item.id }, err instanceof Error ? err : undefined)
            }
          }
          const match = remaining.find((c) => c.name === newCategoryName) ?? fallback
          const { error: updateError } = await db
            .from('items')
            .update({ category_id: match.id, category_locked: false })
            .eq('id', item.id)
            .eq('user_id', userId)
          if (updateError) {
            log.warn('categories.delete_resort_update_failed', { userId, itemId: item.id }, updateError)
          }
        }),
      )
    }

    if (overflow.length > 0) {
      const { error: overflowError } = await db
        .from('items')
        .update({ category_id: fallback.id, category_locked: false })
        .in('id', overflow.map((item) => item.id))
        .eq('user_id', userId)
      if (overflowError) {
        log.warn('categories.delete_resort_overflow_failed', { userId, categoryId }, overflowError)
      }
    }
  }

  const { error: deleteError } = await db.from('categories').delete().eq('id', categoryId).eq('user_id', userId)
  if (deleteError) {
    log.warn('categories.delete_failed', { userId, categoryId }, deleteError)
    return { ok: false, error: 'Failed to delete category' }
  }

  return { ok: true, reassigned: items?.length ?? 0 }
}

/** Moves items into a category. This is the "manual move" path, so it sets the lock. */
export async function moveItems(
  userId: string,
  itemIds: string[],
  categoryId: string,
  client?: AdminClient,
): Promise<CategoryResult<{ moved: number }>> {
  if (itemIds.length === 0) return { ok: true, moved: 0 }

  const db = client ?? (supabaseAdmin as unknown as AdminClient)
  const { data: category } = await db
    .from('categories')
    .select('id')
    .eq('id', categoryId)
    .eq('user_id', userId)
    .maybeSingle()
  if (!category) return { ok: false, error: 'Category not found' }

  const { data, error } = await db
    .from('items')
    .update({ category_id: categoryId, category_locked: true })
    .in('id', itemIds)
    .eq('user_id', userId)
    .select('id')

  if (error) {
    log.warn('categories.move_items_failed', { userId, categoryId }, error)
    return { ok: false, error: 'Failed to move items' }
  }
  return { ok: true, moved: data?.length ?? 0 }
}

export type ResortCandidate = {
  itemId: string
  subject: string | null
  currentCategoryId: string | null
}

/**
 * Previews which of the user's currently-unlocked items would be re-classified into
 * `targetCategoryId` now that it exists, without moving anything. Used for "Re-sort
 * existing items into it?" when a category is created.
 */
export async function previewResort(
  userId: string,
  targetCategoryId: string,
  client?: AdminClient,
): Promise<CategoryResult<{ candidates: ResortCandidate[] }>> {
  const db = client ?? (supabaseAdmin as unknown as AdminClient)
  const categories = await getCategories(userId, db)
  const target = categories.find((c) => c.id === targetCategoryId)
  if (!target) return { ok: false, error: 'Category not found' }

  const names = orderedCategoryNamesForAI(categories)

  const { data: items, error } = await db
    .from('items')
    .select('id, subject, ai_summary, category_id')
    .eq('user_id', userId)
    .eq('category_locked', false)
    .is('deleted_at', null)
    .neq('category_id', targetCategoryId)
    .limit(RESORT_SCAN_LIMIT)

  if (error) {
    log.warn('categories.preview_resort_fetch_failed', { userId, targetCategoryId }, error)
    return { ok: false, error: 'Failed to scan items for re-sort' }
  }
  if (!items || items.length === 0) return { ok: true, candidates: [] }

  const provider = createAIProvider()
  const results = await Promise.all(
    items.map(async (item): Promise<ResortCandidate | null> => {
      const text = `${item.subject ?? ''}\n\n${item.ai_summary ?? ''}`.trim()
      if (!text) return null
      try {
        const result = await provider.processText(text, [], names)
        if (result.category !== target.name) return null
        return { itemId: item.id, subject: item.subject, currentCategoryId: item.category_id }
      } catch (err) {
        log.warn('categories.preview_resort_classify_failed', { userId, itemId: item.id }, err instanceof Error ? err : undefined)
        return null
      }
    }),
  )

  return { ok: true, candidates: results.filter((r): r is ResortCandidate => r !== null) }
}

/**
 * Applies a previously previewed re-sort: moves the given items into `targetCategoryId`.
 * Never touches a locked item, even if it's in `itemIds` — resort is an AI-driven bulk
 * operation, not a manual move, so it must not override a user's sticky choice.
 */
export async function applyResort(
  userId: string,
  targetCategoryId: string,
  itemIds: string[],
  client?: AdminClient,
): Promise<CategoryResult<{ moved: number }>> {
  if (itemIds.length === 0) return { ok: true, moved: 0 }

  const db = client ?? (supabaseAdmin as unknown as AdminClient)
  const { data: category } = await db
    .from('categories')
    .select('id')
    .eq('id', targetCategoryId)
    .eq('user_id', userId)
    .maybeSingle()
  if (!category) return { ok: false, error: 'Category not found' }

  const { data, error } = await db
    .from('items')
    .update({ category_id: targetCategoryId })
    .in('id', itemIds)
    .eq('user_id', userId)
    .eq('category_locked', false)
    .select('id')

  if (error) {
    log.warn('categories.apply_resort_failed', { userId, targetCategoryId }, error)
    return { ok: false, error: 'Failed to apply re-sort' }
  }
  return { ok: true, moved: data?.length ?? 0 }
}
