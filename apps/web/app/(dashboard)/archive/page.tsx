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
  const { data: rawItems } = await supabase
    .from('items')
    .select('id, subject, ai_summary, created_at, source_type, archived_at')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .not('archived_at', 'is', null)
    .order('archived_at', { ascending: false })

  const items: ArchiveItem[] = rawItems ?? []

  return <ArchivePageClient items={items} />
}
