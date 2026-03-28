import type { Metadata } from 'next'
import LoginForm from './login-form'

export const metadata: Metadata = {
  title: 'Sign in — drop-note',
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>
}) {
  return (
    <LoginForm
      deleted={searchParams?.deleted === '1'}
      authError={searchParams?.error === 'auth'}
    />
  )
}
