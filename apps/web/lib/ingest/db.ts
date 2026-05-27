/**
 * DB state-update helpers for the synchronous ingest pipeline (D11, 2026-05-26).
 * Lifted from apps/worker/src/lib/db.ts. Uses the web app's supabaseAdmin.
 */
import { supabaseAdmin } from '../supabase/admin'
import { normalizeTags } from '@drop-note/shared'
import type { SourceType } from '@drop-note/shared'

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

  const tagResults = await Promise.all(
    normalized.map((name) =>
      supabaseAdmin
        .from('tags')
        .upsert({ user_id: userId, name }, { onConflict: 'user_id,name' })
        .select('id')
        .single(),
    ),
  )

  const validTagIds: string[] = []
  for (let i = 0; i < tagResults.length; i++) {
    const { data: tag, error: tagError } = tagResults[i]
    if (tagError || !tag) {
      console.warn(`[ingest:db] Failed to upsert tag "${normalized[i]}":`, tagError?.message)
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
    console.warn(`[ingest:db] Failed to upsert item_tags for item ${itemId}:`, linkError.message)
  }
}
