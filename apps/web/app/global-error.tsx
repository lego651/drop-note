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
      <head>
        <style>{`
          body { background: #ffffff; color: #111827; font-family: sans-serif; }
          .ge-sub { color: #6b7280; }
          .ge-btn { background: #111827; color: #ffffff; }
          @media (prefers-color-scheme: dark) {
            body { background: #111827; color: #f9fafb; }
            .ge-sub { color: #9ca3af; }
            .ge-btn { background: #f9fafb; color: #111827; }
          }
        `}</style>
      </head>
      <body>
        <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', padding: '1rem', textAlign: 'center', flexDirection: 'column', gap: '1rem' }}>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Critical error</h1>
          <p className="ge-sub" style={{ fontSize: '0.875rem' }}>Something went wrong at the application level.</p>
          <button
            onClick={reset}
            className="ge-btn"
            style={{ padding: '0.5rem 1rem', borderRadius: '0.375rem', fontSize: '0.875rem', cursor: 'pointer', border: 'none' }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  )
}
