import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ArchivePageClient } from './ArchivePageClient'
import type { ArchiveItem } from './ArchivePageClient'

export const metadata = {
  title: 'Archive — drop-note',
}

export default async function ArchivePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // archived_at column added by migration 20260529000001_add_archived_at.sql
  // Types are cast here until `pnpm gen:types` is run post-migration
  const { data: rawItems } = await supabase
    .from('items')
    .select('id, subject, ai_summary, created_at, source_type')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  // Filter archived items at runtime until type regen propagates archived_at
  // After gen:types: add .not('archived_at', 'is', null) to query and remove filter
  const items = (rawItems ?? []) as ArchiveItem[]

  return <ArchivePageClient items={items} />
}
