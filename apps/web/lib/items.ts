import { isToday, isYesterday, format } from 'date-fns'
import { supabaseAdmin } from '@/lib/supabase/admin'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { SourceType } from '@drop-note/shared'

export type ItemSummary = {
  id: string
  subject: string | null
  sender_email: string
  ai_summary: string | null
  status: string
  error_message: string | null
  pinned: boolean
  created_at: string
  source_type: SourceType | null
  source_url: string | null
  thumbnail_url: string | null
  item_tags?: { tags: { id: string; name: string } | null }[] | null
  category?: { id: string; name: string; position: number; is_other: boolean } | null
  category_id?: string | null
  category_locked?: boolean
}

export type ItemGroup = {
  date: Date
  label: string
  items: ItemSummary[]
}

export function groupItemsByDate(items: ItemSummary[]): ItemGroup[] {
  const groups: Map<string, ItemGroup> = new Map()

  for (const item of items) {
    const date = new Date(item.created_at)
    const dateKey = date.toISOString().slice(0, 10)

    if (!groups.has(dateKey)) {
      let label: string
      if (isToday(date)) label = 'Today'
      else if (isYesterday(date)) label = 'Yesterday'
      else label = format(date, 'dd MMMM yyyy')

      groups.set(dateKey, { date, label, items: [] })
    }
    groups.get(dateKey)!.items.push(item)
  }

  return Array.from(groups.values()).sort((a, b) => b.date.getTime() - a.date.getTime())
}

/** Tag ids linked to the given items, before those items (and their item_tags rows) are hard-deleted. */
async function getTagIdsForItems(
  itemIds: string[],
  db: Pick<SupabaseClient, 'from'>,
): Promise<string[]> {
  if (itemIds.length === 0) return []
  const { data, error } = await db.from('item_tags').select('tag_id').in('item_id', itemIds)
  if (error || !data) return []
  return [...new Set((data as { tag_id: string }[]).map((row) => row.tag_id))]
}

/**
 * Deletes any of the given tags that no longer have a live item_tags link — i.e. the
 * item_id side was cascade-deleted by a hard item delete and nothing else references it.
 * Hard-delete is the only path that can orphan a tag: soft-delete (trash) leaves
 * item_tags rows intact.
 */
async function cleanupOrphanTags(tagIds: string[], db: Pick<SupabaseClient, 'from'>): Promise<void> {
  if (tagIds.length === 0) return
  const { data: stillLinked, error } = await db.from('item_tags').select('tag_id').in('tag_id', tagIds)
  if (error) return

  const linkedIds = new Set((stillLinked as { tag_id: string }[] | null ?? []).map((row) => row.tag_id))
  const orphanIds = tagIds.filter((tagId) => !linkedIds.has(tagId))
  if (orphanIds.length === 0) return

  await db.from('tags').delete().in('id', orphanIds)
}

export async function deleteItem(
  id: string,
  userId: string,
  tier: 'free' | 'pro' | 'power',
  client?: Pick<SupabaseClient, 'from'>,
): Promise<{ ok: boolean; affected: boolean }> {
  const db = client ?? (supabaseAdmin as unknown as Pick<SupabaseClient, 'from'>)

  if (tier === 'free') {
    // Free tier: always hard-delete
    const tagIds = await getTagIdsForItems([id], db)
    const { data, error } = await db
      .from('items')
      .delete()
      .eq('id', id)
      .eq('user_id', userId)
      .select('id')
      .maybeSingle()
    if (error) return { ok: false, affected: false }
    const affected = data !== null
    if (affected) await cleanupOrphanTags(tagIds, db)
    return { ok: true, affected }
  } else {
    // Paid tier: check if item is already in trash — if so, hard-delete permanently
    const { data: existing } = await db
      .from('items')
      .select('deleted_at')
      .eq('id', id)
      .eq('user_id', userId)
      .single()

    if (existing?.deleted_at) {
      // Already in trash — permanent delete
      const tagIds = await getTagIdsForItems([id], db)
      const { data, error } = await db
        .from('items')
        .delete()
        .eq('id', id)
        .eq('user_id', userId)
        .select('id')
        .maybeSingle()
      if (error) return { ok: false, affected: false }
      const affected = data !== null
      if (affected) await cleanupOrphanTags(tagIds, db)
      return { ok: true, affected }
    } else {
      // Soft-delete (move to trash)
      const { data, error } = await db
        .from('items')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id)
        .eq('user_id', userId)
        .select('id')
        .maybeSingle()
      if (error) return { ok: false, affected: false }
      return { ok: true, affected: data !== null }
    }
  }
}

export async function deleteItems(
  ids: string[],
  userId: string,
  tier: 'free' | 'pro' | 'power',
  client?: Pick<SupabaseClient, 'from'>,
): Promise<{ deleted: number }> {
  const db = client ?? (supabaseAdmin as unknown as Pick<SupabaseClient, 'from'>)

  if (tier === 'free') {
    // Free tier: single hard-delete query
    const tagIds = await getTagIdsForItems(ids, db)
    const { data, error } = await db
      .from('items')
      .delete()
      .in('id', ids)
      .eq('user_id', userId)
      .select('id')
    if (error) return { deleted: 0 }
    await cleanupOrphanTags(tagIds, db)
    return { deleted: data?.length ?? 0 }
  } else {
    // Paid tier: split into already-trashed (hard-delete) vs not-yet-trashed (soft-delete)
    const { data: existing, error: fetchErr } = await db
      .from('items')
      .select('id, deleted_at')
      .in('id', ids)
      .eq('user_id', userId)
    if (fetchErr || !existing) return { deleted: 0 }

    const trashed = existing.filter((r) => r.deleted_at !== null).map((r) => r.id)
    const notTrashed = existing.filter((r) => r.deleted_at === null).map((r) => r.id)

    let deleted = 0

    if (trashed.length > 0) {
      const tagIds = await getTagIdsForItems(trashed, db)
      const { data } = await db
        .from('items')
        .delete()
        .in('id', trashed)
        .eq('user_id', userId)
        .select('id')
      deleted += data?.length ?? 0
      await cleanupOrphanTags(tagIds, db)
    }

    if (notTrashed.length > 0) {
      const { data } = await db
        .from('items')
        .update({ deleted_at: new Date().toISOString() })
        .in('id', notTrashed)
        .eq('user_id', userId)
        .select('id')
      deleted += data?.length ?? 0
    }

    return { deleted }
  }
}
