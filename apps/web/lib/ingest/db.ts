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
