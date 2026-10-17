'use client'

import { useState } from 'react'
import { Mail, Check } from 'lucide-react'

const DROP_ADDRESS = 'drop@dropnote.me'

export function CopyAddressPill() {
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    navigator.clipboard.writeText(DROP_ADDRESS).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <button
      onClick={handleCopy}
      className="inline-flex min-h-9 items-center gap-2 rounded-full border-stroke border-ink bg-card px-4 py-1.5 text-sm text-foreground shadow-ink-md transition-colors hover:bg-accent hover:text-accent-foreground active:translate-x-px active:translate-y-px active:shadow-ink-sm cursor-pointer"
      title="Click to copy drop address"
    >
      <Mail className="h-3.5 w-3.5" />
      <span>
        Send anything to{' '}
        <span className="font-mono font-semibold text-foreground">{DROP_ADDRESS}</span>
      </span>
      {copied && (
        <span className="ml-1 inline-flex items-center gap-1 text-xs text-success">
          <Check className="h-3 w-3" />
          Copied!
        </span>
      )}
    </button>
  )
}
