/**
 * DB state-update helpers for the synchronous ingest pipeline (D11, 2026-05-26).
 * Lifted from apps/worker/src/lib/db.ts. Uses the web app's supabaseAdmin.
 */
import { supabaseAdmin } from '../supabase/admin'
import { normalizeTags } from '@drop-note/shared'
import type { SourceType } from '@drop-note/shared'
import { log } from '../observability/logger'

// Bounds how many of the user's existing tag names we send to the AI as reuse
// context — cheap to fetch, but an unbounded list would bloat every prompt.
const EXISTING_TAGS_LIMIT = 150

export async function getExistingTagNames(userId: string): Promise<string[]> {
  const { data, error } = await supabaseAdmin
    .from('tags')
    .select('name')
    .eq('user_id', userId)
    .order('name')
    .limit(EXISTING_TAGS_LIMIT)

  if (error || !data) {
    log.warn('ingest.existing_tags_fetch_failed', { userId }, error ?? undefined)
    return []
  }
  return data.map((row) => row.name)
}

export type UserCategory = { id: string; name: string }

/**
 * The user's current category list, ordered with their "Other" category last — this
 * ordering is the fallback contract that buildCategoryKeywordPrompt/resolveCategory rely
 * on. Hidden categories are dropped from the list offered to the AI (so a hidden category
 * stops collecting new items) except the user's "Other" category, which always stays in
 * the list even if hidden, since it's the only guaranteed fallback.
 */
export async function getCategoriesForUser(userId: string): Promise<UserCategory[]> {
  const { data, error } = await supabaseAdmin
    .from('categories')
    .select('id, name, hidden, is_other')
    .eq('user_id', userId)
    .order('position')

  if (error || !data) {
    log.warn('ingest.categories_fetch_failed', { userId }, error ?? undefined)
    return []
  }

  const visible = data.filter((c) => !c.hidden || c.is_other)
  const sorted = [...visible].sort((a, b) => Number(a.is_other) - Number(b.is_other))
  return sorted.map((c) => ({ id: c.id, name: c.name }))
}

/**
 * Sets an item's category_id to the category matching `categoryName` (by exact name,
 * which must be one of the names in `categories` — see resolveCategory). A no-op if the
 * name doesn't match (defensive — resolveCategory should already guarantee a match) or if
 * the item has since been category_locked (the user manually moved it): the `eq`
 * filter on category_locked makes "never overwrite a user-locked category" hold even
 * under a race with a concurrent manual move, not just at the call site.
 */
export async function setItemCategory(
  itemId: string,
  categoryName: string,
  categories: UserCategory[],
): Promise<void> {
  const match = categories.find((c) => c.name === categoryName)
  if (!match) {
    log.warn('ingest.set_category_no_match', { itemId, categoryName })
    return
  }

  const { error } = await supabaseAdmin
    .from('items')
    .update({ category_id: match.id })
    .eq('id', itemId)
    .eq('category_locked', false)

  if (error) {
    log.warn('ingest.set_category_failed', { itemId }, error)
  }
}

export async function setItemProcessing(itemId: string): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from('items')
    .update({ status: 'processing' })
    .eq('id', itemId)
    .select('id')
    .single()

  if (error || !data) throw new Error(error?.message ?? `Item ${itemId} not found`)
}

export async function setItemDone(
  itemId: string,
  params: {
    aiSummary: string
    storagePath: string | null
    filename: string | null
    sourceType?: SourceType | null
    sourceUrl?: string | null
    thumbnailUrl?: string | null
  },
): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from('items')
    .update({
      status: 'done',
      ai_summary: params.aiSummary,
      storage_path: params.storagePath,
      filename: params.filename,
      ...(params.sourceType !== undefined && { source_type: params.sourceType }),
      ...(params.sourceUrl !== undefined && { source_url: params.sourceUrl }),
      ...(params.thumbnailUrl !== undefined && { thumbnail_url: params.thumbnailUrl }),
    })
    .eq('id', itemId)
    .select('id')
    .single()

  if (error || !data) throw new Error(error?.message ?? `Item ${itemId} not found`)
}

export async function setItemPending(itemId: string, summary: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('items')
    .update({ status: 'pending', ai_summary: summary })
    .eq('id', itemId)

  if (error) throw new Error(error.message)
}

export async function setItemFailed(itemId: string, errorMessage: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('items')
    .update({ status: 'failed', error_message: errorMessage })
    .eq('id', itemId)

  if (error) throw new Error(error.message)
}

export async function createAttachmentItem(params: {
  userId: string
  subject: string
  senderEmail: string
}): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from('items')
    .insert({
      user_id: params.userId,
      subject: params.subject,
      sender_email: params.senderEmail,
      type: 'attachment',
      status: 'pending',
    })
    .select('id')
    .single()

  if (error || !data) throw new Error(error?.message ?? 'Failed to create attachment item')
  return data.id
}

export async function upsertTags(userId: string, itemId: string, tagNames: string[]): Promise<void> {
  const normalized = normalizeTags(tagNames)
  if (normalized.length === 0) return

  // tags has a case-insensitive unique index (tags_user_id_name_lower_idx), but the
  // upsert's onConflict is case-sensitive — so a lowercased AI tag matching an existing
  // "React" would hit the lower() index and fail. Resolve existing tags by lower(name)
  // first and only upsert names the user doesn't have in any casing.
  const { data: existing, error: existingError } = await supabaseAdmin
    .from('tags')
    .select('id, name')
    .eq('user_id', userId)
  if (existingError) {
    log.warn('ingest.existing_tags_lookup_failed', { itemId }, existingError)
  }
  const existingByLower = new Map(
    ((existing as { id: string; name: string }[] | null) ?? []).map((t) => [t.name.toLowerCase(), t.id]),
  )

  const validTagIds: string[] = []
  const toUpsert: string[] = []
  for (const name of normalized) {
    const existingId = existingByLower.get(name.toLowerCase())
    if (existingId) validTagIds.push(existingId)
    else toUpsert.push(name)
  }

  const tagResults = await Promise.all(
    toUpsert.map((name) =>
      supabaseAdmin
        .from('tags')
        .upsert({ user_id: userId, name }, { onConflict: 'user_id,name' })
        .select('id')
        .single(),
    ),
  )

  for (let i = 0; i < tagResults.length; i++) {
    const { data: tag, error: tagError } = tagResults[i]
    if (tagError || !tag) {
      log.warn('ingest.tag_upsert_failed', { itemId }, tagError ?? undefined)
      continue
    }
    validTagIds.push(tag.id)
  }

  if (validTagIds.length === 0) return

  const pairs = validTagIds.map((tagId) => ({ item_id: itemId, tag_id: tagId }))
  const { error: linkError } = await supabaseAdmin
    .from('item_tags')
    .upsert(pairs, { onConflict: 'item_id,tag_id' })

  if (linkError) {
    log.warn('ingest.item_tags_upsert_failed', { itemId }, linkError)
  }
}
