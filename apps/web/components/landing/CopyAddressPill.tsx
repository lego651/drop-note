'use client'

import { useState } from 'react'
import { Mail } from 'lucide-react'

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
      className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/50 px-4 py-1.5 text-sm text-muted-foreground hover:bg-muted transition-colors cursor-pointer"
      title="Click to copy drop address"
    >
      <Mail className="h-3.5 w-3.5" />
      <span>
        Send anything to{' '}
        <span className="font-mono font-semibold text-foreground">{DROP_ADDRESS}</span>
      </span>
      {copied && (
        <span className="ml-1 text-xs text-green-600 dark:text-green-400">Copied!</span>
      )}
    </button>
  )
}
