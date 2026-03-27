'use client'

import { useState } from 'react'

const TIERS = ['free', 'pro', 'power'] as const

interface UserTierSelectProps {
  userId: string
  currentTier: string
}

export function UserTierSelect({ userId, currentTier }: UserTierSelectProps) {
  const [tier, setTier] = useState(currentTier)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newTier = e.target.value
    setLoading(true)
    setError('')
    const res = await fetch(`/api/admin/users/${userId}/tier`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tier: newTier }),
    })
    setLoading(false)
    if (res.ok) {
      setTier(newTier)
    } else {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? `Failed (${res.status})`)
    }
  }

  return (
    <div className="flex items-center gap-1">
      <select
        value={tier}
        onChange={handleChange}
        disabled={loading}
        className="rounded border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
      >
        {TIERS.map((t) => (
          <option key={t} value={t}>{t}</option>
        ))}
      </select>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  )
}
