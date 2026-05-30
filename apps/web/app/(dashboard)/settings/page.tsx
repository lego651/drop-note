import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { format } from 'date-fns'
import { colorForTagHsl } from '@/lib/design-tokens'
import { SettingsClient } from './SettingsClient'

export const metadata = { title: 'Settings — drop-note' }

export default async function SettingsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [profileResult, itemsCountResult] = await Promise.all([
    supabaseAdmin
      .from('users')
      .select('created_at, digest_enabled')
      .eq('id', user.id)
      .single(),
    supabaseAdmin
      .from('items')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .is('deleted_at', null),
  ])

  const profile = profileResult.data
  const memberSince = profile?.created_at
    ? format(new Date(profile.created_at), 'MMMM d, yyyy')
    : '—'

  const name = (user.user_metadata?.full_name as string | undefined) ?? ''
  // colorForTagHsl returns raw HSL numbers e.g. "214 89% 52%" for use in hsl(... / 0.12) syntax
  const avatarColor = colorForTagHsl(user.email ?? name)
  const itemsCount = itemsCountResult.count ?? 0

  return (
    <SettingsClient
      email={user.email ?? ''}
      name={name}
      memberSince={memberSince}
      digestEnabled={profile?.digest_enabled ?? true}
      itemsCount={itemsCount}
      avatarColor={avatarColor}
    />
  )
}
