'use client'

import { useState } from 'react'
import { format } from 'date-fns'
import { Button } from '@/components/ui/button'

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
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Invite Codes</h1>
        <Button size="sm" onClick={handleGenerate} disabled={generating}>
          {generating ? 'Generating\u2026' : 'Generate code'}
        </Button>
      </div>

      {/* Registration mode toggle */}
      <div className="rounded-md border border-border p-4 space-y-2">
        <p className="text-sm font-medium">Registration Mode</p>
        <div className="flex gap-4">
          {(['open', 'invite'] as const).map((m) => (
            <label key={m} className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="registration_mode"
                value={m}
                checked={mode === m}
                onChange={() => handleModeChange(m)}
                disabled={modeLoading}
                className="accent-primary"
              />
              <span className="text-sm capitalize">
                {m === 'open' ? 'Open (first 50 users)' : 'Invite-only'}
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* Codes table */}
      <div className="rounded-md border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left px-4 py-2 font-medium text-muted-foreground">Code</th>
              <th className="text-left px-4 py-2 font-medium text-muted-foreground">Status</th>
              <th className="text-left px-4 py-2 font-medium text-muted-foreground">Created</th>
              <th className="text-left px-4 py-2 font-medium text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {codes.map((c) => (
              <tr key={c.id} className="hover:bg-muted/30">
                <td className="px-4 py-2 font-mono text-xs">{c.code}</td>
                <td className="px-4 py-2 text-muted-foreground">
                  {c.used_by ? (
                    <span>
                      Used by {c.used_by_email ?? c.used_by}
                      {c.used_at && ` on ${format(new Date(c.used_at), 'MMM d, yyyy')}`}
                    </span>
                  ) : (
                    <span className="text-green-600 dark:text-green-400">Unused</span>
                  )}
                </td>
                <td className="px-4 py-2 text-muted-foreground">
                  {c.created_at ? format(new Date(c.created_at), 'MMM d, yyyy') : '\u2014'}
                </td>
                <td className="px-4 py-2">
                  {!c.used_by && (
                    <button
                      onClick={() => handleRevoke(c.id)}
                      className="text-xs text-destructive hover:underline"
                    >
                      Revoke
                    </button>
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
