'use client'

import { useState } from 'react'
import { Mail, Copy, CheckCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'

const DROP_ADDRESS = 'drop@dropnote.com'

export function OnboardingPanel() {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    await navigator.clipboard.writeText(DROP_ADDRESS)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-6">
      <div className="w-full max-w-lg rounded-xl border border-dashed border-border bg-muted/30 p-10 text-center space-y-6">
        {/* Steps */}
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Get started</h2>
          <p className="text-sm text-muted-foreground">
            Email anything to your drop address. AI tags it. Find it here.
          </p>
        </div>

        {/* Visual steps */}
        <div className="flex items-center justify-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[10px] font-medium text-foreground">1</span>
            Email it
          </span>
          <span className="text-border">→</span>
          <span className="flex items-center gap-1.5">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[10px] font-medium text-foreground">2</span>
            AI tags it
          </span>
          <span className="text-border">→</span>
          <span className="flex items-center gap-1.5">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[10px] font-medium text-foreground">3</span>
            Find it here
          </span>
        </div>

        {/* Drop address */}
        <div className="flex items-center gap-2">
          <input
            readOnly
            value={DROP_ADDRESS}
            className="flex-1 rounded-md border border-border bg-background px-3 py-2 font-mono text-sm text-foreground"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopy}
            aria-label="Copy drop address"
            className="shrink-0 gap-1.5"
          >
            {copied ? <CheckCheck size={14} /> : <Copy size={14} />}
            {copied ? 'Copied!' : 'Copy'}
          </Button>
        </div>

        {/* CTA */}
        <a href={`mailto:${DROP_ADDRESS}?subject=Test`}>
          <Button variant="default" className="gap-2">
            <Mail size={14} />
            Send yourself a test email
          </Button>
        </a>
      </div>
    </div>
  )
}
