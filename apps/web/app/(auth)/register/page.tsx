import type { Metadata } from 'next'
import { RegisterForm } from './register-form'
import { supabaseAdmin } from '@/lib/supabase/admin'

export const metadata: Metadata = {
  title: 'Register — drop-note',
}

export default async function RegisterPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  // Determine if invite mode is required
  const [{ data: setting }, { count }] = await Promise.all([
    supabaseAdmin.from('site_settings').select('value').eq('key', 'registration_mode').single(),
    supabaseAdmin.from('users').select('*', { count: 'exact', head: true }),
  ])

  const needsCode = setting?.value === 'invite' || (count ?? 0) >= 50
  const errorParam = typeof params?.error === 'string' ? params.error : undefined

  return <RegisterForm needsCode={needsCode} errorParam={errorParam} />
}
