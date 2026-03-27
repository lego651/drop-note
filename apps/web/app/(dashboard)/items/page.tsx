import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ItemsPageClient } from '@/components/items/ItemsPageClient'
import type { Tier } from '@drop-note/shared'

export const metadata = { title: 'Items — drop-note' }

interface ItemsPageProps {
  searchParams?: {
    page?: string
    tag?: string
    year?: string
    month?: string
    q?: string
  }
}

export default async function ItemsPage({ searchParams }: ItemsPageProps) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const params = await Promise.resolve(searchParams ?? {})

  const { data: userData } = await supabase
    .from('users')
    .select('tier')
    .eq('id', user.id)
    .single()
  const userTier = (userData?.tier ?? 'free') as Tier

  const tagId = params.tag
  const year = params.year
  const month = params.month
  const q = params.q
  const page = Math.max(1, parseInt(params.page ?? '1') || 1)
  const offset = (page - 1) * 25

  // Handle tag filter — get matching item IDs first
  let tagFilterIds: string[] | null = null
  if (tagId) {
    const { data: taggedItemIds } = await supabase
      .from('item_tags')
      .select('item_id')
      .eq('tag_id', tagId)
    tagFilterIds = taggedItemIds?.map((r) => r.item_id) ?? []
  }

  // If tag filter returned no items, short-circuit
  if (tagFilterIds !== null && tagFilterIds.length === 0) {
    return (
      <ItemsPageClient
        items={[]}
        totalCount={0}
        page={page}
        initialQuery={q ?? ''}
        userTier={userTier}
      />
    )
  }

  let query = supabase
    .from('items')
    .select(
      'id, subject, sender_email, ai_summary, status, error_message, pinned, created_at, item_tags(tags(id, name))',
      { count: 'exact' },
    )
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .eq('type', 'email_body')
    .order('pinned', { ascending: false })
    .order('created_at', { ascending: false })

  if (tagFilterIds !== null) {
    query = query.in('id', tagFilterIds)
  }

  if (year && month) {
    const y = parseInt(year, 10)
    const m = parseInt(month, 10)
    if (!isNaN(y) && !isNaN(m) && m >= 1 && m <= 12) {
      const start = new Date(y, m - 1, 1)
      const end = new Date(y, m, 1)
      query = query
        .gte('created_at', start.toISOString())
        .lt('created_at', end.toISOString())
    }
  }

  const { data: items, count } = await query.range(offset, offset + 24)

  return (
    <ItemsPageClient
      items={items ?? []}
      totalCount={count ?? 0}
      page={page}
      initialQuery={q ?? ''}
      userTier={userTier}
    />
  )
}
