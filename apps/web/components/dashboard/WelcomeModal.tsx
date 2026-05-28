'use client'

import { useState, useEffect } from 'react'
import { Mail, Copy, CheckCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'

const WELCOMED_KEY = 'drop-note:welcomed'
const DROP_ADDRESS = process.env.NEXT_PUBLIC_DROP_ADDRESS ?? 'drop@dropnote.me'

export function WelcomeModal() {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    try {
      if (!localStorage.getItem(WELCOMED_KEY)) {
        setOpen(true)
      }
    } catch {
      // localStorage unavailable — skip modal
    }
  }, [])

  function dismiss() {
    try {
      localStorage.setItem(WELCOMED_KEY, 'true')
    } catch {
      // localStorage unavailable
    }
    setOpen(false)
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(DROP_ADDRESS)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) dismiss() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Welcome to drop-note</DialogTitle>
          <DialogDescription>
            Send anything to your drop address. AI tags it. Find it here.
          </DialogDescription>
        </DialogHeader>

        {/* Steps */}
        <div className="flex items-center justify-center gap-3 py-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[10px] font-medium text-foreground">
              1
            </span>
            Send anything to your drop address
          </span>
          <span className="text-border">→</span>
          <span className="flex items-center gap-1.5">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[10px] font-medium text-foreground">
              2
            </span>
            AI summarizes and tags it
          </span>
          <span className="text-border">→</span>
          <span className="flex items-center gap-1.5">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[10px] font-medium text-foreground">
              3
            </span>
            Find it in your dashboard
          </span>
        </div>

        {/* Drop address box */}
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

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="default" className="gap-2" asChild>
            <a href={`mailto:${DROP_ADDRESS}?subject=Test drop`}>
              <Mail size={14} />
              Send yourself a test email
            </a>
          </Button>
          <Button variant="outline" onClick={dismiss}>
            Got it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
