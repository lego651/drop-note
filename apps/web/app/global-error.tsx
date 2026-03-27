'use client'

import { useEffect } from 'react'
import * as Sentry from '@sentry/nextjs'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <html lang="en">
      <body>
        <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', padding: '1rem', textAlign: 'center', flexDirection: 'column', gap: '1rem', fontFamily: 'sans-serif' }}>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Critical error</h1>
          <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>Something went wrong at the application level.</p>
          <button
            onClick={reset}
            style={{ padding: '0.5rem 1rem', borderRadius: '0.375rem', background: '#111827', color: '#fff', fontSize: '0.875rem', cursor: 'pointer', border: 'none' }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  )
}
