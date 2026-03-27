import { isToday, isYesterday, format } from 'date-fns'
import { supabaseAdmin } from '@/lib/supabase/admin'
import type { SupabaseClient } from '@supabase/supabase-js'

export type ItemSummary = {
  id: string
  subject: string | null
  sender_email: string
  ai_summary: string | null
  status: string
  error_message: string | null
  pinned: boolean
  created_at: string
  source_type: string | null
  source_url: string | null
  thumbnail_url: string | null
  item_tags?: { tags: { id: string; name: string } | null }[] | null
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

export async function deleteItem(
  id: string,
  userId: string,
  tier: 'free' | 'pro' | 'power',
  client?: Pick<SupabaseClient, 'from'>,
): Promise<{ ok: boolean; affected: boolean }> {
  const db = client ?? (supabaseAdmin as unknown as Pick<SupabaseClient, 'from'>)

  if (tier === 'free') {
    // Free tier: always hard-delete
    const { data, error } = await db
      .from('items')
      .delete()
      .eq('id', id)
      .eq('user_id', userId)
      .select('id')
      .maybeSingle()
    if (error) return { ok: false, affected: false }
    return { ok: true, affected: data !== null }
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
      const { data, error } = await db
        .from('items')
        .delete()
        .eq('id', id)
        .eq('user_id', userId)
        .select('id')
        .maybeSingle()
      if (error) return { ok: false, affected: false }
      return { ok: true, affected: data !== null }
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
    const { data, error } = await db
      .from('items')
      .delete()
      .in('id', ids)
      .eq('user_id', userId)
      .select('id')
    if (error) return { deleted: 0 }
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
      const { data } = await db
        .from('items')
        .delete()
        .in('id', trashed)
        .eq('user_id', userId)
        .select('id')
      deleted += data?.length ?? 0
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
