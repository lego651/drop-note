import { supabaseAdmin } from '@/lib/supabase/admin'
import { InviteCodesClient } from './InviteCodesClient'

export const metadata = { title: 'Invite Codes — Admin' }

export default async function AdminInviteCodesPage() {
  const [{ data: codes }, { data: setting }] = await Promise.all([
    supabaseAdmin
      .from('invite_codes')
      .select('id, code, used_by, used_at, created_at, created_by')
      .order('created_at', { ascending: false }),
    supabaseAdmin
      .from('site_settings')
      .select('value')
      .eq('key', 'registration_mode')
      .single(),
  ])

  // For used codes, fetch the email of who used them
  const usedByIds = (codes ?? [])
    .filter((c) => c.used_by)
    .map((c) => c.used_by as string)

  const userEmailMap = new Map<string, string>()
  if (usedByIds.length > 0) {
    const { data: users } = await supabaseAdmin
      .from('users')
      .select('id, email')
      .in('id', usedByIds)
    for (const u of users ?? []) {
      if (u.email) userEmailMap.set(u.id, u.email)
    }
  }

  const enrichedCodes = (codes ?? []).map((c) => ({
    ...c,
    used_by_email: c.used_by ? (userEmailMap.get(c.used_by) ?? c.used_by) : null,
  }))

  return (
    <InviteCodesClient
      initialCodes={enrichedCodes}
      initialMode={(setting?.value ?? 'open') as 'open' | 'invite'}
    />
  )
}
