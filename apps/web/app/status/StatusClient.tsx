'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Lock, Loader2, RefreshCw, LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function StatusLogin() {
  const router = useRouter()
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setPending(true)
    setError(null)
    try {
      const res = await fetch('/api/status/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code }),
      })
      if (res.ok) {
        router.refresh()
        return
      }
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      setError(body.error ?? 'Something went wrong')
    } catch {
      setError('Network error — try again')
    } finally {
      setPending(false)
    }
  }

  return (
    <main className="min-h-screen bg-canvas bg-dot-grid flex items-center justify-center px-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-xl border-stroke border-ink bg-card p-6 shadow-ink-lg space-y-4">
        <div className="flex items-center gap-2">
          <Lock className="size-5 text-muted-foreground" aria-hidden />
          <h1 className="text-lg font-semibold">drop-note status</h1>
        </div>
        <p className="text-sm text-muted-foreground">Enter the access code to view system health.</p>
        <div className="space-y-2">
          <Label htmlFor="code">Access code</Label>
          <Input
            id="code"
            type="password"
            autoComplete="current-password"
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive-text">
            {error}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={pending || code.length === 0}>
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
          Unlock
        </Button>
      </form>
    </main>
  )
}

export function StatusActions() {
  const router = useRouter()
  const [running, setRunning] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  async function runNow() {
    setRunning(true)
    setMessage(null)
    try {
      const res = await fetch('/api/health/run', { method: 'POST' })
      setMessage(res.ok ? 'Checks finished' : `Run failed (${res.status})`)
      startTransition(() => router.refresh())
    } catch {
      setMessage('Network error')
    } finally {
      setRunning(false)
    }
  }

  async function logout() {
    await fetch('/api/status/logout', { method: 'POST' })
    router.refresh()
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {message && <span className="text-xs text-muted-foreground">{message}</span>}
      <Button variant="outline" size="sm" onClick={runNow} disabled={running}>
        {running ? <Loader2 className="animate-spin" aria-hidden /> : <RefreshCw aria-hidden />}
        Run checks now
      </Button>
      <Button variant="ghost" size="sm" onClick={logout}>
        <LogOut aria-hidden />
        Lock
      </Button>
    </div>
  )
}
