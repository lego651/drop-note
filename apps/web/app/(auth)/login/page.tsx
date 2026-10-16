import type { Metadata } from 'next'
import LoginForm from './login-form'

export const metadata: Metadata = {
  title: 'Sign in — drop-note',
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  return (
    <LoginForm
      deleted={params?.deleted === '1'}
      authError={params?.error === 'auth'}
    />
  )
}
