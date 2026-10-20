'use client'

import { useState } from 'react'
import { format } from 'date-fns'
import { Button } from '@/components/ui/button'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

interface InviteCode {
  id: string
  code: string
  used_by: string | null
  used_at: string | null
  created_at: string | null
  created_by: string | null
  used_by_email: string | null
}

interface InviteCodesClientProps {
  initialCodes: InviteCode[]
  initialMode: 'open' | 'invite'
}

export function InviteCodesClient({ initialCodes, initialMode }: InviteCodesClientProps) {
  const [codes, setCodes] = useState(initialCodes)
  const [mode, setMode] = useState(initialMode)
  const [generating, setGenerating] = useState(false)
  const [modeLoading, setModeLoading] = useState(false)

  async function handleGenerate() {
    setGenerating(true)
    const res = await fetch('/api/admin/invite-codes', { method: 'POST' })
    const data = await res.json()
    setGenerating(false)
    if (res.ok) {
      setCodes((prev) => [data.code, ...prev])
    }
  }

  async function handleRevoke(id: string) {
    const res = await fetch(`/api/admin/invite-codes/${id}`, { method: 'DELETE' })
    if (res.ok) {
      setCodes((prev) => prev.filter((c) => c.id !== id))
    } else {
      const data = await res.json().catch(() => ({}))
      alert(data.error ?? 'Failed to revoke invite code')
    }
  }

  async function handleModeChange(newMode: 'open' | 'invite') {
    setModeLoading(true)
    const res = await fetch('/api/admin/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'registration_mode', value: newMode }),
    })
    setModeLoading(false)
    if (res.ok) setMode(newMode)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h1 className="type-display text-[32px] sm:text-[42px]">Invite Codes</h1>
        <Button size="sm" onClick={handleGenerate} disabled={generating}>
          {generating ? 'Generating\u2026' : 'Generate code'}
        </Button>
      </div>

      {/* Registration mode toggle */}
      <div className="rounded-xl border-stroke border-ink bg-card shadow-ink-lg p-4 space-y-2">
        <p className="text-sm font-medium">Registration Mode</p>
        <ToggleGroup
          type="single"
          value={mode}
          onValueChange={(v) => v && handleModeChange(v as 'open' | 'invite')}
          disabled={modeLoading}
          aria-label="Registration mode"
          className="inline-flex max-w-full flex-wrap justify-start gap-1 rounded-[10px] border-stroke border-ink bg-card p-1 shadow-ink-md"
        >
          <ToggleGroupItem
            value="open"
            className="h-auto min-h-8 whitespace-normal text-center rounded-lg px-3 py-1 text-sm leading-tight data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
          >
            Open (first 50 users)
          </ToggleGroupItem>
          <ToggleGroupItem
            value="invite"
            className="h-auto min-h-8 whitespace-normal text-center rounded-lg px-3 py-1 text-sm leading-tight data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
          >
            Invite-only
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {/* Codes table */}
      <div className="rounded-xl border-stroke border-ink bg-card shadow-ink-lg overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <thead className="bg-muted">
            <tr>
              <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground">Code</th>
              <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground">Status</th>
              <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground">Created</th>
              <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {codes.map((c) => (
              <tr key={c.id} className="hover:bg-accent/50">
                <td className="px-4 py-2 font-mono text-xs">{c.code}</td>
                <td className="px-4 py-2 text-muted-foreground">
                  {c.used_by ? (
                    <span>
                      Used by {c.used_by_email ?? c.used_by}
                      {c.used_at && ` on ${format(new Date(c.used_at), 'MMM d, yyyy')}`}
                    </span>
                  ) : (
                    <span className="text-success">Unused</span>
                  )}
                </td>
                <td className="px-4 py-2 text-muted-foreground">
                  {c.created_at ? format(new Date(c.created_at), 'MMM d, yyyy') : '\u2014'}
                </td>
                <td className="px-4 py-2">
                  {!c.used_by && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive-text"
                      onClick={() => handleRevoke(c.id)}
                    >
                      Revoke
                    </Button>
                  )}
                </td>
              </tr>
            ))}
            {codes.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">
                  No invite codes yet. Generate one above.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
