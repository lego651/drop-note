'use client'

import { useState, useEffect } from 'react'

export function CookieBanner() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!localStorage.getItem('cookie_consent')) {
      setVisible(true)
    }
  }, [])

  function accept() {
    localStorage.setItem('cookie_consent', 'accepted')
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background p-4 flex items-center justify-between gap-4">
      <p className="text-sm text-muted-foreground">
        We use essential cookies to keep you signed in.{' '}
        <a
          href="/privacy"
          className="inline-flex min-h-11 items-center underline sm:inline sm:min-h-0"
        >
          Privacy Policy
        </a>
      </p>
      <button
        onClick={accept}
        className="inline-flex h-11 shrink-0 items-center rounded-md bg-primary px-4 text-sm text-primary-foreground hover:bg-primary/90 sm:h-auto sm:py-1.5"
      >
        Accept
      </button>
    </div>
  )
}
