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
    const dateKey = format(date, 'yyyy-MM-dd')

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
): Promise<{ ok: boolean }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = (client ?? supabaseAdmin) as any

  if (tier === 'free') {
    // Free tier: always hard-delete
    await db
      .from('items')
      .delete()
      .eq('id', id)
      .eq('user_id', userId)
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
      await db
        .from('items')
        .delete()
        .eq('id', id)
        .eq('user_id', userId)
    } else {
      // Soft-delete (move to trash)
      await db
        .from('items')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id)
        .eq('user_id', userId)
    }
  }
  return { ok: true }
}
