import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { format } from 'date-fns'
import { SettingsClient } from './SettingsClient'

export const metadata = { title: 'Settings — drop-note' }

export default async function SettingsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabaseAdmin
    .from('users')
    .select('tier, stripe_customer_id, created_at')
    .eq('id', user.id)
    .single()

  const tier = profile?.tier ?? 'free'
  const memberSince = profile?.created_at
    ? format(new Date(profile.created_at), 'MMMM d, yyyy')
    : '—'

  return (
    <SettingsClient
      email={user.email ?? ''}
      tier={tier}
      memberSince={memberSince}
    />
  )
}
