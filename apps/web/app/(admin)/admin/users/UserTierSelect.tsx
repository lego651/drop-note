'use client'

import { useState } from 'react'
import { NativeSelect } from '@/components/ui/native-select'

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
    <div className="flex items-center gap-2">
      <NativeSelect
        value={tier}
        onChange={handleChange}
        disabled={loading}
        className="h-8 px-2 text-base md:text-xs"
      >
        {TIERS.map((t) => (
          <option key={t} value={t}>{t}</option>
        ))}
      </NativeSelect>
      {error && <span className="text-xs text-destructive-text">{error}</span>}
    </div>
  )
}
