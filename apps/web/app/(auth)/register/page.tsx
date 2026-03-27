import type { Metadata } from 'next'
import { RegisterForm } from './register-form'
import { supabaseAdmin } from '@/lib/supabase/admin'

export const metadata: Metadata = {
  title: 'Register — drop-note',
}

export default async function RegisterPage() {
  // Determine if invite mode is required
  const [{ data: setting }, { count }] = await Promise.all([
    supabaseAdmin.from('site_settings').select('value').eq('key', 'registration_mode').single(),
    supabaseAdmin.from('users').select('*', { count: 'exact', head: true }),
  ])

  const needsCode = setting?.value === 'invite' || (count ?? 0) >= 50

  return <RegisterForm needsCode={needsCode} />
}
